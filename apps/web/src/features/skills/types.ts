export type SkillSource = 'brain' | 'executor' | 'local'

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

export type DiffStatus = 'added-brain' | 'added-executor' | 'modified' | 'identical'

export interface DiffEntry {
  name: string
  status: DiffStatus
  brainHash?: string
  executorHash?: string
}

export interface DiffResponse {
  diff: DiffEntry[]
  total: number
}

export type ConflictResolution = 'pending' | 'brain' | 'executor' | 'manual'

export interface Conflict {
  id: number
  skillName: string
  brainHash: string
  executorHash: string
  resolution: ConflictResolution
  createdAt: string
}

export interface ConflictsListResponse {
  conflicts: Conflict[]
  total: number
}

export type SyncDirection = 'bidirectional' | 'brain-to-executor' | 'executor-to-brain'

export interface SyncResponse {
  status: 'started' | 'completed'
  synced: number
  conflicts: number
}
