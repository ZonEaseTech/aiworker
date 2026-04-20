export interface ExecutionLog {
  id: number
  issueId: string
  toolName: string
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  duration: number | null
  createdAt: string
}

export interface ExecutionListResponse {
  executions: ExecutionLog[]
  total: number
}

export interface ExecutionStats {
  total: number
  lastHour: number
  byTool: { name: string, count: number }[]
}

export interface LiveExecutionEvent {
  id: string
  timestamp: string
  type: string
  toolName: string
  duration?: number
  status: 'success' | 'error' | 'running' | 'unknown'
  payload: unknown
}
