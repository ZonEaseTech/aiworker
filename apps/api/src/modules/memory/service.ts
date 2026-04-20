import type { MemoryEntry, MemoryIndex, WriteFeedbackInput, WriteMemoryInput } from './types'

import { join } from 'node:path'

import { scanMemories } from '../../adapters/hermes/fs-scanner'
import { config } from '../../config'
import { parseMemoryIndex, writeMemoryFile } from './writer'

function toMemoryEntry(m: { id: string, title: string, content: string, metadata: Record<string, unknown>, filePath: string, hash: string, createdAt?: string, updatedAt?: string }): MemoryEntry {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    metadata: m.metadata,
    filePath: m.filePath,
    hash: m.hash,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

export async function listMemories(): Promise<{ memories: MemoryEntry[], total: number }> {
  const raw = await scanMemories(config.HERMES_HOME)
  const memories = raw.map(toMemoryEntry)
  return { memories, total: memories.length }
}

export async function getMemory(id: string): Promise<MemoryEntry | null> {
  const raw = await scanMemories(config.HERMES_HOME)
  const found = raw.find(m => m.id === id)
  return found ? toMemoryEntry(found) : null
}

export async function searchMemories(query: string): Promise<{ results: Array<MemoryEntry & { score: number }>, query: string }> {
  const raw = await scanMemories(config.HERMES_HOME)
  const lower = query.toLowerCase()
  const results = raw
    .filter(m =>
      m.content.toLowerCase().includes(lower)
      || m.title.toLowerCase().includes(lower)
      || (m.metadata.name && String(m.metadata.name).toLowerCase().includes(lower))
      || (m.metadata.description && String(m.metadata.description).toLowerCase().includes(lower)),
    )
    .map(m => ({ ...toMemoryEntry(m), score: 1.0 }))

  return { results, query }
}

export async function getMemoryIndex(): Promise<MemoryIndex> {
  const indexPath = join(config.HERMES_HOME, 'memories', 'MEMORY.md')
  const file = Bun.file(indexPath)
  const exists = await file.exists()

  if (!exists) {
    return { entries: [] }
  }

  const raw = await file.text()
  const entries = parseMemoryIndex(raw)
  return { entries }
}

export async function writeMemory(input: WriteMemoryInput): Promise<{ id: string, filePath: string, success: boolean }> {
  const { id, filePath } = await writeMemoryFile(input)
  return { id, filePath, success: true }
}

export async function writeFeedback(input: WriteFeedbackInput): Promise<{ id: string, filePath: string, success: boolean }> {
  const memoryInput: WriteMemoryInput = {
    name: input.title,
    description: input.source ? `Feedback from ${input.source}` : 'Execution feedback',
    type: 'feedback',
    content: input.content,
  }
  return writeMemory(memoryInput)
}
