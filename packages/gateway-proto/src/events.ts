import { z } from 'zod'

/**
 * 服务端推送事件名常量。
 * 事件方向：gateway → operator（经由 operator 订阅的 WS 通道）。
 */
export const EVENTS = {
  WORKER_ONLINE: 'worker.online',
  WORKER_OFFLINE: 'worker.offline',
  CHAT_MESSAGE: 'chat.message',
  AGENT_THINKING: 'agent.thinking',
  AGENT_TOOL_CALL: 'agent.tool_call',
  AGENT_DONE: 'agent.done',
  CONFIG_CHANGED: 'config.changed',
  LOGS_LINE: 'logs.line',
} as const

export type EventName = typeof EVENTS[keyof typeof EVENTS]

/** 通用 worker 定位字段：在几乎所有事件 payload 里都会出现。 */
const workerIdField = z.object({
  workerId: z.string().min(1),
})

export const workerOnlinePayloadSchema = workerIdField.extend({
  displayName: z.string().optional(),
  deviceId: z.string().min(1),
  connectedAt: z.number().int(),
})
export type WorkerOnlinePayload = z.infer<typeof workerOnlinePayloadSchema>

export const workerOfflinePayloadSchema = workerIdField.extend({
  deviceId: z.string().min(1),
  reason: z.enum(['disconnected', 'expired', 'kicked']).optional(),
  disconnectedAt: z.number().int(),
})
export type WorkerOfflinePayload = z.infer<typeof workerOfflinePayloadSchema>

export const chatMessagePayloadSchema = workerIdField.extend({
  conversationId: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.number().int(),
})
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>

export const agentThinkingPayloadSchema = workerIdField.extend({
  conversationId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  chunk: z.string().optional(),
})
export type AgentThinkingPayload = z.infer<typeof agentThinkingPayloadSchema>

export const agentToolCallPayloadSchema = workerIdField.extend({
  conversationId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(['pending', 'running', 'success', 'error']),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
})
export type AgentToolCallPayload = z.infer<typeof agentToolCallPayloadSchema>

export const agentDonePayloadSchema = workerIdField.extend({
  conversationId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  finishReason: z.enum(['stop', 'length', 'tool_use', 'error', 'cancelled']),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
})
export type AgentDonePayload = z.infer<typeof agentDonePayloadSchema>

export const configChangedPayloadSchema = workerIdField.extend({
  version: z.number().int().nonnegative(),
  changedAt: z.number().int(),
})
export type ConfigChangedPayload = z.infer<typeof configChangedPayloadSchema>

export const logsLinePayloadSchema = workerIdField.extend({
  stream: z.enum(['stdout', 'stderr']),
  line: z.string(),
  ts: z.number().int(),
})
export type LogsLinePayload = z.infer<typeof logsLinePayloadSchema>

/**
 * 事件名 → payload schema 的注册表。
 * 下游（aim CLI / web console）据此对入站 event 做强校验。
 */
export const EVENT_PAYLOADS: {
  [EVENTS.WORKER_ONLINE]: typeof workerOnlinePayloadSchema
  [EVENTS.WORKER_OFFLINE]: typeof workerOfflinePayloadSchema
  [EVENTS.CHAT_MESSAGE]: typeof chatMessagePayloadSchema
  [EVENTS.AGENT_THINKING]: typeof agentThinkingPayloadSchema
  [EVENTS.AGENT_TOOL_CALL]: typeof agentToolCallPayloadSchema
  [EVENTS.AGENT_DONE]: typeof agentDonePayloadSchema
  [EVENTS.CONFIG_CHANGED]: typeof configChangedPayloadSchema
  [EVENTS.LOGS_LINE]: typeof logsLinePayloadSchema
} = {
  [EVENTS.WORKER_ONLINE]: workerOnlinePayloadSchema,
  [EVENTS.WORKER_OFFLINE]: workerOfflinePayloadSchema,
  [EVENTS.CHAT_MESSAGE]: chatMessagePayloadSchema,
  [EVENTS.AGENT_THINKING]: agentThinkingPayloadSchema,
  [EVENTS.AGENT_TOOL_CALL]: agentToolCallPayloadSchema,
  [EVENTS.AGENT_DONE]: agentDonePayloadSchema,
  [EVENTS.CONFIG_CHANGED]: configChangedPayloadSchema,
  [EVENTS.LOGS_LINE]: logsLinePayloadSchema,
}

/** 判断一个字符串是否是本包已知的事件名。 */
export function isKnownEvent(name: string): name is EventName {
  return Object.prototype.hasOwnProperty.call(EVENT_PAYLOADS, name)
}
