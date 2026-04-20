import type { WriteMemoryInput } from './types'

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { config } from '../../config'

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64)
}

function buildFrontmatter(input: WriteMemoryInput): string {
  const lines = [
    '---',
    `name: ${input.name}`,
    `description: ${input.description}`,
    `type: ${input.type}`,
    '---',
    '',
  ]
  return lines.join('\n')
}

function getMemoriesDir(): string {
  return join(config.HERMES_HOME, 'memories')
}

function ensureMemoriesDir(): string {
  const dir = getMemoriesDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export async function writeMemoryFile(input: WriteMemoryInput): Promise<{ id: string, filePath: string }> {
  const dir = ensureMemoriesDir()
  const id = sanitizeFilename(input.name)
  const filename = `${id}.md`
  const filePath = join(dir, filename)

  const fileContent = `${buildFrontmatter(input)}${input.content}\n`
  await Bun.write(filePath, fileContent)

  await appendToIndex(input.name, filename, input.description)

  return { id, filePath }
}

async function appendToIndex(title: string, filename: string, description: string): Promise<void> {
  const dir = getMemoriesDir()
  const indexPath = join(dir, 'MEMORY.md')
  const entry = `- [${title}](${filename}) — ${description}`

  const file = Bun.file(indexPath)
  const exists = await file.exists()

  if (exists) {
    const current = await file.text()
    const trimmed = current.trimEnd()
    const updated = trimmed ? `${trimmed}\n${entry}\n` : `${entry}\n`
    await Bun.write(indexPath, updated)
  }
  else {
    await Bun.write(indexPath, `${entry}\n`)
  }
}

export function parseMemoryIndex(raw: string): Array<{ title: string, filename: string, description: string }> {
  const entries: Array<{ title: string, filename: string, description: string }> = []
  const lines = raw.split('\n')

  for (const line of lines) {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\) (?:—|--) (.+)$/)
    if (match) {
      entries.push({
        title: match[1]!,
        filename: match[2]!,
        description: match[3]?.trim() ?? '',
      })
    }
  }

  return entries
}
