export type ServiceStatus = 'ok' | 'degraded' | 'down'

export interface ServiceHealth {
  status: ServiceStatus
  name?: string
  lastChecked?: string
  error?: string
}

export interface HealthResponse {
  status: ServiceStatus
  services: {
    brain: ServiceHealth
    executor: ServiceHealth
  }
}

export interface SkillSummary {
  id: string
  name: string
  source: 'brain' | 'executor' | 'local'
}

export interface SkillsListResponse {
  skills: SkillSummary[]
  total: number
}

export interface MemoriesListResponse {
  memories: unknown[]
  total: number
}

export interface ExecutionStatsResponse {
  total: number
  byTool: Record<string, number>
  averageDurationMs: number | null
}

export interface ConflictSummary {
  id: number
  skillName: string
  resolution: 'pending' | 'brain' | 'executor' | 'manual'
}

export interface ConflictsListResponse {
  conflicts: ConflictSummary[]
  total: number
}
