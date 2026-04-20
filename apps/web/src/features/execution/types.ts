export interface ExecutionLog {
  id: number
  issueId: string
  toolName: string
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  duration: number | null
  conversationId: string | null
  createdAt: string
}

export interface ExecutionListResponse {
  logs: ExecutionLog[]
  total: number
}

export interface ExecutionStats {
  total: number
  byTool: Record<string, number>
  averageDurationMs: number | null
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
