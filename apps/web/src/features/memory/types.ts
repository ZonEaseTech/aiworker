export interface MemoryEntry {
  id: string
  title: string
  content: string
  metadata: Record<string, unknown>
  filePath: string
  hash: string
  createdAt?: string
  updatedAt?: string
}

export interface MemorySearchResult extends MemoryEntry {
  score: number
}

export interface MemoryListResponse {
  memories: MemoryEntry[]
  total: number
}

export interface MemorySearchResponse {
  results: MemorySearchResult[]
  query: string
}

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface WriteMemoryInput {
  name: string
  description: string
  type: MemoryType
  content: string
}

export interface WriteMemoryResponse {
  id: string
  filePath: string
  success: boolean
}

export const MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference']

export function memoryType(entry: MemoryEntry): MemoryType | 'unknown' {
  const raw = entry.metadata?.type
  if (typeof raw === 'string' && (MEMORY_TYPES as string[]).includes(raw))
    return raw as MemoryType
  return 'unknown'
}

export function memoryDescription(entry: MemoryEntry): string {
  const raw = entry.metadata?.description
  return typeof raw === 'string' ? raw : ''
}
