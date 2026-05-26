export interface ServiceStatus {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  lastChecked: string
}

export interface SkillMeta {
  id: string
  name: string
  description: string
  version: string
  capabilities: string[]
}

export interface MemoryEntry {
  id: string
  content: string
  embedding?: number[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ExecutionEvent {
  id: string
  type: 'started' | 'progress' | 'completed' | 'failed'
  skillId: string
  payload: Record<string, unknown>
  timestamp: string
}
