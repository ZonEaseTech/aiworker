export type SyncDirection = 'brain-to-executor' | 'executor-to-brain' | 'bidirectional'

export interface SyncResponse {
  status: 'started' | 'completed'
  synced: number
  conflicts: number
}

export interface DiffEntry {
  name: string
  status: 'added-brain' | 'added-executor' | 'modified' | 'identical'
  brainHash?: string
  executorHash?: string
}

export interface DiffResponse {
  diff: DiffEntry[]
  total: number
}

export interface Conflict {
  id: number
  skillName: string
  brainHash: string
  executorHash: string
  resolution: 'pending' | 'brain' | 'executor' | 'manual'
  createdAt: string
}

export interface ConflictListResponse {
  conflicts: Conflict[]
  total: number
}

export interface SyncEventDto {
  id: number
  type: string
  source: string
  target: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface RecentEventsResponse {
  events: SyncEventDto[]
  total: number
}
