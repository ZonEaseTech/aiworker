export type SkillSource = 'hermes' | 'openclaw' | 'local'

export interface Skill {
  id: string
  name: string
  description: string
  version: string
  capabilities: string[]
  source: SkillSource
}

export interface SkillsListResponse {
  skills: Skill[]
  total: number
}

export type DiffStatus = 'added-hermes' | 'added-openclaw' | 'modified' | 'identical'

export interface DiffEntry {
  name: string
  status: DiffStatus
  hermesHash?: string
  openclawHash?: string
}

export interface DiffResponse {
  diff: DiffEntry[]
  total: number
}

export type ConflictResolution = 'pending' | 'hermes' | 'openclaw' | 'manual'

export interface Conflict {
  id: number
  skillName: string
  hermesHash: string
  openclawHash: string
  resolution: ConflictResolution
  createdAt: string
}

export interface ConflictsListResponse {
  conflicts: Conflict[]
  total: number
}

export type SyncDirection = 'bidirectional' | 'hermes-to-openclaw' | 'openclaw-to-hermes'

export interface SyncResponse {
  status: 'started' | 'completed'
  synced: number
  conflicts: number
}
