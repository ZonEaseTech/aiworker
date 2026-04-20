import type { BrainMemory } from '@aiworker/shared'
import type { MemoryEntry, MemoryIndex, WriteFeedbackInput, WriteMemoryInput } from './types'

import { join } from 'node:path'

import { config } from '../../config'
import { getBrainProvider } from '../../providers'
import { parseMemoryIndex } from './writer'

function toMemoryEntry(m: BrainMemory): MemoryEntry {
  const meta = m.metadata as Record<string, unknown>
  const title = typeof meta.title === 'string' ? meta.title : m.id
  const filePath = typeof meta.filePath === 'string' ? meta.filePath : ''
  const hash = typeof meta.hash === 'string' ? meta.hash : ''
  return {
    id: m.id,
    title,
    content: m.content,
    metadata: meta,
    filePath,
    hash,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

function toBrainWriteInput(input: WriteMemoryInput) {
  return {
    content: input.content,
    metadata: {
      name: input.name,
      description: input.description,
      type: input.type,
    },
  }
}

export async function listMemories(): Promise<{ memories: MemoryEntry[], total: number }> {
  const raw = await getBrainProvider().listMemories()
  const memories = raw.map(toMemoryEntry)
  return { memories, total: memories.length }
}

export async function getMemory(id: string): Promise<MemoryEntry | null> {
  const raw = await getBrainProvider().listMemories()
  const found = raw.find(m => m.id === id)
  return found ? toMemoryEntry(found) : null
}

export async function searchMemories(query: string): Promise<{ results: Array<MemoryEntry & { score: number }>, query: string }> {
  const raw = await getBrainProvider().searchMemories(query)
  const results = raw.map(m => ({ ...toMemoryEntry(m), score: m.score ?? 1 }))
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
  const written = await getBrainProvider().writeMemory(toBrainWriteInput(input))
  const filePath = typeof written.metadata.filePath === 'string' ? written.metadata.filePath : ''
  return { id: written.id, filePath, success: true }
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
