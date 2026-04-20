import type { HermesMemory, HermesSkill } from './types'

import { homedir } from 'node:os'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

function expandHome(dir: string): string {
  if (dir.startsWith('~'))
    return join(homedir(), dir.slice(1))
  return dir
}

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

function parseSkillMetadata(raw: string, filePath: string): Omit<HermesSkill, 'hash'> | null {
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

export async function scanSkills(hermesHome?: string): Promise<HermesSkill[]> {
  const baseDir = expandHome(hermesHome ?? '~/.hermes')
  const skillsDir = join(baseDir, 'skills')

  try {
    const fs = await import('node:fs/promises')
    await fs.access(skillsDir)

    const glob = new Bun.Glob('**/*.{yaml,yml,md}')
    const skills: HermesSkill[] = []

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
    // Directory doesn't exist or isn't accessible
    return []
  }
}

export async function scanMemories(hermesHome?: string): Promise<HermesMemory[]> {
  const baseDir = expandHome(hermesHome ?? '~/.hermes')
  const memoriesDir = join(baseDir, 'memories')

  try {
    const fs = await import('node:fs/promises')
    await fs.access(memoriesDir)

    const glob = new Bun.Glob('**/*.md')
    const memories: HermesMemory[] = []

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
    // Directory doesn't exist or isn't accessible
    return []
  }
}
