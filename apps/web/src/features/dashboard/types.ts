export type ServiceStatus = 'ok' | 'degraded' | 'down'

export interface ServiceHealth {
  status: ServiceStatus
  latency?: number
  error?: string
}

export interface HealthResponse {
  status: ServiceStatus
  services: {
    hermes: ServiceHealth
    openclaw: ServiceHealth
  }
}

export interface SkillSummary {
  id: string
  name: string
  source: 'hermes' | 'openclaw' | 'local'
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
  lastHour: number
  byTool: { name: string, count: number }[]
}

export interface ConflictSummary {
  id: number
  skillName: string
  resolution: 'pending' | 'hermes' | 'openclaw' | 'manual'
}

export interface ConflictsListResponse {
  conflicts: ConflictSummary[]
  total: number
}
