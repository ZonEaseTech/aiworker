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
  APPROVAL_REQUESTED: 'approval.requested',
  ENROLLMENT_OTP: 'enrollment.otp',
  ENROLLMENT_APPROVED: 'enrollment.approved',
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
 * PLAN-014 F2 — orchestrator 在 toolPolicy=ask 命中时上行此事件，operator
 * 看到后通过 `approval.grant` 决定 allow/deny。`expiresAt` 是 worker 本地的
 * 毫秒时间戳；超过即视作 deny。
 */
export const approvalRequestedPayloadSchema = workerIdField.extend({
  taskId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  params: z.record(z.unknown()),
  expiresAt: z.number().int(),
})
export type ApprovalRequestedPayload = z.infer<typeof approvalRequestedPayloadSchema>

/**
 * PLAN-019 — gateway 在 mode='otp' enroll 第一帧后立即推 `enrollment.otp` 给
 * 发起 connect 的 worker（载到该 socket 上），worker 把 OTP 显示给运维让其在
 * dashboard / aim CLI 走 `enroll.approve`。`expiresAt` 由 gateway 维护，过期
 * 视为 reject。
 */
export const enrollmentOtpPayloadSchema = workerIdField.extend({
  otp: z.string().min(1),
  expiresAt: z.number().int(),
})
export type EnrollmentOtpPayload = z.infer<typeof enrollmentOtpPayloadSchema>

/**
 * PLAN-019 — operator 调 `enroll.approve` 后 gateway 把对应 worker 升级成
 * 正式连接，并在同一个 socket 上推送本事件，把 fleet 颁发的 `deviceToken`
 * 交还给 worker 持久化。
 */
export const enrollmentApprovedPayloadSchema = workerIdField.extend({
  deviceToken: z.string().min(1),
})
export type EnrollmentApprovedPayload = z.infer<typeof enrollmentApprovedPayloadSchema>

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
  [EVENTS.APPROVAL_REQUESTED]: typeof approvalRequestedPayloadSchema
  [EVENTS.ENROLLMENT_OTP]: typeof enrollmentOtpPayloadSchema
  [EVENTS.ENROLLMENT_APPROVED]: typeof enrollmentApprovedPayloadSchema
} = {
  [EVENTS.WORKER_ONLINE]: workerOnlinePayloadSchema,
  [EVENTS.WORKER_OFFLINE]: workerOfflinePayloadSchema,
  [EVENTS.CHAT_MESSAGE]: chatMessagePayloadSchema,
  [EVENTS.AGENT_THINKING]: agentThinkingPayloadSchema,
  [EVENTS.AGENT_TOOL_CALL]: agentToolCallPayloadSchema,
  [EVENTS.AGENT_DONE]: agentDonePayloadSchema,
  [EVENTS.CONFIG_CHANGED]: configChangedPayloadSchema,
  [EVENTS.LOGS_LINE]: logsLinePayloadSchema,
  [EVENTS.APPROVAL_REQUESTED]: approvalRequestedPayloadSchema,
  [EVENTS.ENROLLMENT_OTP]: enrollmentOtpPayloadSchema,
  [EVENTS.ENROLLMENT_APPROVED]: enrollmentApprovedPayloadSchema,
}

/** 判断一个字符串是否是本包已知的事件名。 */
export function isKnownEvent(name: string): name is EventName {
  return Object.prototype.hasOwnProperty.call(EVENT_PAYLOADS, name)
}
