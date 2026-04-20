import type { MemoryEntry } from './types'

const mockMemories: MemoryEntry[] = [
  {
    id: 'mem-001',
    content: 'User prefers TypeScript strict mode with noUncheckedIndexedAccess',
    metadata: { category: 'preference', source: 'hermes' },
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'mem-002',
    content: 'Project uses Bun monorepo with workspace protocol',
    metadata: { category: 'context', source: 'hermes' },
    createdAt: '2025-01-16T09:30:00Z',
    updatedAt: '2025-01-16T09:30:00Z',
  },
  {
    id: 'mem-003',
    content: 'OpenClaw gateway runs on port 18789 with REST API',
    metadata: { category: 'infrastructure', source: 'local' },
    createdAt: '2025-01-17T14:00:00Z',
    updatedAt: '2025-01-17T14:00:00Z',
  },
]

export function listMemories() {
  return { memories: mockMemories, total: mockMemories.length }
}

export function searchMemories(query: string) {
  const results = mockMemories
    .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
    .map(m => ({ ...m, score: 0.85 }))
  return { results, query }
}
