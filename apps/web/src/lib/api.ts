export interface ApiError {
  status: number
  body: unknown
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const contentType = res.headers.get('content-type') ?? ''
  const parsed = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null)

  if (!res.ok) {
    const err: ApiError = { status: res.status, body: parsed }
    throw err
  }

  return parsed as T
}

export function apiGet<T>(path: string) {
  return request<T>('GET', path)
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>('POST', path, body)
}

export function apiPut<T>(path: string, body?: unknown) {
  return request<T>('PUT', path, body)
}

export function apiDelete<T>(path: string) {
  return request<T>('DELETE', path)
}

// Shared backend response shapes used across multiple features.

export interface ServiceHealthDto {
  status: 'ok' | 'degraded' | 'down'
  name?: string
  lastChecked?: string
  error?: string
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  services: {
    brain: ServiceHealthDto
    executor: ServiceHealthDto
  }
}

export interface ConfigResponse {
  brain: {
    apiUrl: string
    homePath: string
  }
  executor: {
    baseUrl: string
    model: string
    apiKeySet: boolean
  }
}

export type AgentTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface AgentTask {
  id: string
  prompt: string
  status: AgentTaskStatus
  conversationId?: string
  createdAt: string
  finishedAt?: string
  result?: Record<string, unknown>
  error?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface MessageDto {
  id: number
  conversationId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  createdAt: string
}

export interface ToolCallDto {
  id: number
  conversationId: string | null
  toolName: string
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  durationMs: number | null
  createdAt: string
}

export interface ListTasksResponse {
  tasks: AgentTask[]
  nextCursor?: string
}

export interface TaskDetailResponse {
  task: AgentTask
  messages: MessageDto[]
  toolCalls: ToolCallDto[]
}
