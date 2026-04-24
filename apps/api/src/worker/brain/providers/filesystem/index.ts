import type {
  BrainMemory,
  BrainProvider,
  BrainSkill,
  BrainWatchEvent,
  MemoryFilter,
  ServiceStatus,
  WriteMemoryInput,
} from '@aiworker/shared'

import type { FilesystemMemory, FilesystemSkill, WatchEvent } from './types'

import { existsSync, mkdirSync } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { scanMemories, scanSkills } from './scanner'
import { FilesystemWatcher } from './watcher'

interface FilesystemBrainProviderOptions {
  /** Base directory containing `skills/` + `memories/` + `MEMORY.md`. */
  home: string
}

function mapSkill(skill: FilesystemSkill): BrainSkill {
  return {
    id: skill.filePath,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    tags: skill.capabilities,
  }
}

async function mapMemory(memory: FilesystemMemory, score?: number): Promise<BrainMemory> {
  let createdAt = memory.createdAt
  let updatedAt = memory.updatedAt

  if (!createdAt || !updatedAt) {
    try {
      const stats = await stat(memory.filePath)
      createdAt = createdAt ?? stats.birthtime.toISOString()
      updatedAt = updatedAt ?? stats.mtime.toISOString()
    }
    catch {
      const fallback = new Date(0).toISOString()
      createdAt = createdAt ?? fallback
      updatedAt = updatedAt ?? fallback
    }
  }

  const metadata: Record<string, unknown> = {
    ...memory.metadata,
    title: memory.title,
    filePath: memory.filePath,
    hash: memory.hash,
  }

  const result: BrainMemory = {
    id: memory.id,
    content: memory.content,
    metadata,
    createdAt,
    updatedAt,
  }
  if (score !== undefined)
    result.score = score
  return result
}

function mapWatchEvent(event: WatchEvent): BrainWatchEvent | null {
  const timestamp = new Date(event.timestamp).toISOString()
  const payload: Record<string, unknown> = { path: event.path, kind: event.kind }

  if (event.kind === 'skill') {
    return { type: 'skill:changed', payload, timestamp }
  }

  switch (event.type) {
    case 'add':
      return { type: 'memory:created', payload, timestamp }
    case 'modify':
      return { type: 'memory:updated', payload, timestamp }
    case 'delete':
      return { type: 'memory:deleted', payload, timestamp }
    default:
      return null
  }
}

function applyFilter(memories: BrainMemory[], filter?: MemoryFilter): BrainMemory[] {
  if (!filter)
    return memories

  let result = memories

  if (filter.tags && filter.tags.length > 0) {
    const tags = filter.tags
    result = result.filter((m) => {
      const memoryTags = Array.isArray(m.metadata.tags) ? m.metadata.tags.map(String) : []
      return tags.every(t => memoryTags.includes(t))
    })
  }

  if (filter.since) {
    const since = filter.since
    result = result.filter(m => m.createdAt >= since)
  }

  if (filter.until) {
    const until = filter.until
    result = result.filter(m => m.createdAt <= until)
  }

  if (typeof filter.limit === 'number') {
    result = result.slice(0, filter.limit)
  }

  return result
}

type WriteMetadataType = 'user' | 'feedback' | 'project' | 'reference'

function resolveWriteMetadataType(value: unknown): WriteMetadataType {
  if (value === 'feedback' || value === 'project' || value === 'reference' || value === 'user')
    return value
  return 'user'
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64)
}

async function appendMemoryIndex(dir: string, title: string, filename: string, description: string): Promise<void> {
  const indexPath = join(dir, '..', 'MEMORY.md')
  const entry = `- [${title}](memories/${filename}) — ${description}`
  const file = Bun.file(indexPath)
  if (await file.exists()) {
    const current = await file.text()
    const trimmed = current.trimEnd()
    const updated = trimmed ? `${trimmed}\n${entry}\n` : `${entry}\n`
    await Bun.write(indexPath, updated)
  }
  else {
    await Bun.write(indexPath, `# Memory index\n\n${entry}\n`)
  }
}

/**
 * Reads skills + memories from a local directory that follows the
 * agentskills.io convention (`<home>/skills/<name>/SKILL.md` +
 * `<home>/memories/*.md`). Formerly `HermesProvider` — renamed in PLAN-012
 * once aiworker took ownership of the filesystem layout under
 * `~/.aiworker/workers/<id>/brain/` rather than piggybacking on `~/.hermes/`.
 */
export class FilesystemBrainProvider implements BrainProvider {
  readonly name = 'filesystem'

  private readonly home: string
  private readonly watcher: FilesystemWatcher
  private watcherStarted = false

  constructor(options: FilesystemBrainProviderOptions) {
    this.home = options.home
    this.watcher = new FilesystemWatcher({ home: options.home })
  }

  async health(): Promise<ServiceStatus> {
    const lastChecked = new Date().toISOString()
    try {
      await access(this.home)
      return { name: this.name, status: 'healthy', lastChecked }
    }
    catch {
      return { name: this.name, status: 'down', lastChecked }
    }
  }

  async listSkills(): Promise<BrainSkill[]> {
    const raw = await scanSkills(this.home)
    return raw.map(mapSkill)
  }

  async listMemories(filter?: MemoryFilter): Promise<BrainMemory[]> {
    const raw = await scanMemories(this.home)
    const mapped = await Promise.all(raw.map(m => mapMemory(m)))
    return applyFilter(mapped, filter)
  }

  async searchMemories(query: string): Promise<BrainMemory[]> {
    const raw = await scanMemories(this.home)
    const lower = query.toLowerCase()
    const matched = raw.filter(m =>
      m.content.toLowerCase().includes(lower)
      || m.title.toLowerCase().includes(lower)
      || (m.metadata.name !== undefined && String(m.metadata.name).toLowerCase().includes(lower))
      || (m.metadata.description !== undefined && String(m.metadata.description).toLowerCase().includes(lower)),
    )
    return Promise.all(matched.map(m => mapMemory(m, 1)))
  }

  async writeMemory(input: WriteMemoryInput): Promise<BrainMemory> {
    const metadata = input.metadata ?? {}
    const name = typeof metadata.name === 'string' && metadata.name.length > 0
      ? metadata.name
      : `memory-${Date.now()}`
    const description = typeof metadata.description === 'string' ? metadata.description : ''
    const type = resolveWriteMetadataType(metadata.type)

    const memoriesDir = join(this.home, 'memories')
    if (!existsSync(memoriesDir))
      mkdirSync(memoriesDir, { recursive: true })

    const id = sanitizeFilename(name)
    const filename = `${id}.md`
    const filePath = join(memoriesDir, filename)
    const frontmatter = `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n`
    await Bun.write(filePath, `${frontmatter}${input.content}\n`)
    await appendMemoryIndex(memoriesDir, name, filename, description)

    const now = new Date().toISOString()
    return {
      id,
      content: input.content,
      metadata: {
        ...metadata,
        name,
        description,
        type,
        filePath,
        ...(input.tags ? { tags: input.tags } : {}),
      },
      createdAt: now,
      updatedAt: now,
    }
  }

  watch(handler: (event: BrainWatchEvent) => void): () => void {
    if (!this.watcherStarted) {
      this.watcherStarted = true
      void this.watcher.start()
    }
    return this.watcher.on((event) => {
      const mapped = mapWatchEvent(event)
      if (mapped)
        handler(mapped)
    })
  }
}
