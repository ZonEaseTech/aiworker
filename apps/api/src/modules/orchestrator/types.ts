import { z } from 'zod'

/**
 * Orchestrator event types published through the shared event bus.
 *
 * - `orchestrator.task.started`   — payload `{ taskId, conversationId }`
 * - `orchestrator.task.message`   — payload `{ taskId, conversationId, message: MessageDTO }`
 * - `orchestrator.task.tool_call` — payload `{ taskId, conversationId, call: ToolCallDTO }`
 * - `orchestrator.task.finished`  — payload `{ taskId, result }`
 * - `orchestrator.task.failed`    — payload `{ taskId, error }`
 * - `orchestrator.task.cancelled` — payload `{ taskId }`
 */
export const ORCHESTRATOR_EVENT = {
  TaskStarted: 'orchestrator.task.started',
  TaskMessage: 'orchestrator.task.message',
  TaskToolCall: 'orchestrator.task.tool_call',
  TaskFinished: 'orchestrator.task.finished',
  TaskFailed: 'orchestrator.task.failed',
  TaskCancelled: 'orchestrator.task.cancelled',
} as const

export const agentTaskStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

export const agentTaskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  status: agentTaskStatusSchema,
  conversationId: z.string().optional(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
})

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
})

export const messageDtoSchema = z.object({
  id: z.number(),
  conversationId: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCalls: z.array(toolCallSchema).optional(),
  toolCallId: z.string().optional(),
  createdAt: z.string(),
})

export const toolCallDtoSchema = z.object({
  id: z.number(),
  conversationId: z.string().nullable(),
  toolName: z.string(),
  params: z.record(z.unknown()).nullable(),
  result: z.record(z.unknown()).nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string(),
})

export const submitTaskBodySchema = z.object({
  prompt: z.string().min(1),
  autoWriteback: z.boolean().optional().default(true),
})

export const submitTaskResponseSchema = z.object({
  id: z.string(),
  status: agentTaskStatusSchema,
  createdAt: z.string(),
})

export const listTasksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
})

export const listTasksResponseSchema = z.object({
  tasks: z.array(agentTaskSchema),
  nextCursor: z.string().optional(),
})

export const taskDetailResponseSchema = z.object({
  task: agentTaskSchema,
  messages: z.array(messageDtoSchema),
  toolCalls: z.array(toolCallDtoSchema),
})

export const taskIdParamSchema = z.object({
  id: z.string(),
})

export type AgentTaskDTO = z.infer<typeof agentTaskSchema>
export type MessageDTO = z.infer<typeof messageDtoSchema>
export type ToolCallDTO = z.infer<typeof toolCallDtoSchema>
export type SubmitTaskBody = z.infer<typeof submitTaskBodySchema>
export type SubmitTaskResponse = z.infer<typeof submitTaskResponseSchema>
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>
export type ListTasksResponse = z.infer<typeof listTasksResponseSchema>
export type TaskDetailResponse = z.infer<typeof taskDetailResponseSchema>
