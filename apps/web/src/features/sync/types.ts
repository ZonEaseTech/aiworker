export type SyncDirection = 'hermes-to-openclaw' | 'openclaw-to-hermes' | 'bidirectional'

export interface SyncResponse {
  status: 'started' | 'completed'
  synced: number
  conflicts: number
}

export interface DiffEntry {
  name: string
  status: 'added-hermes' | 'added-openclaw' | 'modified' | 'identical'
  hermesHash?: string
  openclawHash?: string
}

export interface DiffResponse {
  diff: DiffEntry[]
  total: number
}

export interface Conflict {
  id: number
  skillName: string
  hermesHash: string
  openclawHash: string
  resolution: 'pending' | 'hermes' | 'openclaw' | 'manual'
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
