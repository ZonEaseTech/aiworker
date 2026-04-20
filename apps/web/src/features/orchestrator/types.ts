import type { AgentTask, AgentTaskStatus, ChatMessage, ToolCall } from '@aiworker/shared'

export type { AgentTask, AgentTaskStatus, ChatMessage, ToolCall }

export interface MessageDTO {
  id: number
  conversationId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  createdAt: string
}

export interface ToolCallDTO {
  id: number
  conversationId: string | null
  toolName: string
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  durationMs: number | null
  createdAt: string
}

export interface SubmitTaskBody {
  prompt: string
  autoWriteback?: boolean
}

export interface SubmitTaskResponse {
  id: string
  status: AgentTaskStatus
  createdAt: string
}

export interface ListTasksResponse {
  tasks: AgentTask[]
  nextCursor?: string
}

export interface TaskDetailResponse {
  task: AgentTask
  messages: MessageDTO[]
  toolCalls: ToolCallDTO[]
}

export const ORCHESTRATOR_EVENTS = {
  TaskStarted: 'orchestrator.task.started',
  TaskMessage: 'orchestrator.task.message',
  TaskToolCall: 'orchestrator.task.tool_call',
  TaskFinished: 'orchestrator.task.finished',
  TaskFailed: 'orchestrator.task.failed',
  TaskCancelled: 'orchestrator.task.cancelled',
} as const

export type OrchestratorEventType = typeof ORCHESTRATOR_EVENTS[keyof typeof ORCHESTRATOR_EVENTS]

export interface TaskMessagePayload {
  taskId: string
  conversationId: string
  message: MessageDTO
}

export interface TaskToolCallPayload {
  taskId: string
  conversationId: string
  call: ToolCallDTO
}

export interface TaskLifecyclePayload {
  taskId: string
  conversationId?: string
  result?: Record<string, unknown>
  error?: string
}
