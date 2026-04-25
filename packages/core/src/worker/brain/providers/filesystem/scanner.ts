import type { FilesystemMemory, FilesystemSkill } from './types'

import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

async function computeHash(content: string | Uint8Array): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(content)
  return hasher.digest('hex')
}

function parseFrontmatter(raw: string): { metadata: Record<string, unknown>, content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { metadata: {}, content: raw }
  }
  try {
    const metadata = parseYaml(match[1] ?? '') as Record<string, unknown>
    return { metadata: metadata ?? {}, content: match[2] ?? '' }
  }
  catch {
    return { metadata: {}, content: raw }
  }
}

function parseSkillMetadata(raw: string, filePath: string): Omit<FilesystemSkill, 'hash'> | null {
  const ext = filePath.split('.').pop()?.toLowerCase()

  if (ext === 'yaml' || ext === 'yml') {
    try {
      const data = parseYaml(raw) as Record<string, unknown>
      return {
        name: String(data.name ?? ''),
        description: String(data.description ?? ''),
        version: String(data.version ?? '0.0.0'),
        capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [],
        filePath,
      }
    }
    catch {
      return null
    }
  }

  if (ext === 'md') {
    const { metadata, content } = parseFrontmatter(raw)
    return {
      name: String(metadata.name ?? filePath.split('/').pop()?.replace(/\.md$/, '') ?? ''),
      description: String(metadata.description ?? content.split('\n')[0] ?? ''),
      version: String(metadata.version ?? '0.0.0'),
      capabilities: Array.isArray(metadata.capabilities) ? metadata.capabilities.map(String) : [],
      filePath,
    }
  }

  return null
}

/**
 * Scans `<home>/skills/**` for `.md` or `.yaml` files, parses
 * agentskills.io-style frontmatter, and returns structured skill records.
 * Returns `[]` when the directory does not exist — callers rely on this
 * as a "no skills configured" signal.
 */
export async function scanSkills(home: string): Promise<FilesystemSkill[]> {
  const skillsDir = join(home, 'skills')

  try {
    const fs = await import('node:fs/promises')
    await fs.access(skillsDir)

    const glob = new Bun.Glob('**/*.{yaml,yml,md}')
    const skills: FilesystemSkill[] = []

    for await (const path of glob.scan({ cwd: skillsDir })) {
      const fullPath = join(skillsDir, path)
      try {
        const file = Bun.file(fullPath)
        const raw = await file.text()
        const parsed = parseSkillMetadata(raw, fullPath)
        if (parsed) {
          const hash = await computeHash(raw)
          skills.push({ ...parsed, hash })
        }
      }
      catch {
        // Skip unreadable files
      }
    }

    return skills
  }
  catch {
    return []
  }
}

/**
 * Scans `<home>/memories/**` for `.md` files, parses frontmatter, returns
 * structured memory records. Returns `[]` when the directory does not exist.
 */
export async function scanMemories(home: string): Promise<FilesystemMemory[]> {
  const memoriesDir = join(home, 'memories')

  try {
    const fs = await import('node:fs/promises')
    await fs.access(memoriesDir)

    const glob = new Bun.Glob('**/*.md')
    const memories: FilesystemMemory[] = []

    for await (const path of glob.scan({ cwd: memoriesDir })) {
      const fullPath = join(memoriesDir, path)
      try {
        const file = Bun.file(fullPath)
        const raw = await file.text()
        const hash = await computeHash(raw)
        const { metadata, content } = parseFrontmatter(raw)

        const fileName = path.replace(/\.md$/, '')

        memories.push({
          id: String(metadata.id ?? fileName),
          title: String(metadata.title ?? fileName),
          content,
          metadata,
          filePath: fullPath,
          hash,
          createdAt: metadata.createdAt ? String(metadata.createdAt) : undefined,
          updatedAt: metadata.updatedAt ? String(metadata.updatedAt) : undefined,
        })
      }
      catch {
        // Skip unreadable files
      }
    }

    return memories
  }
  catch {
    return []
  }
}
