import { z } from 'zod'

export const WORKER_CONTROL_PROTOCOL_VERSION = 1 as const

export const workerHealthSchema = z.object({
  ready: z.boolean(),
  detail: z.string().optional(),
}).strict()

export const workerDescribeSchema = z.object({
  workerId: z.string().min(1),
  // id 是 worker 所运行 Soul 的单一 id（descriptor identity 已收口为 id + name）；与
  // assignment.id 同指，区别于上面 worker 自身的 workerId。
  id: z.string().min(1),
  version: z.string().min(1),
  health: workerHealthSchema,
  // Worker 自有 Workbench 的入口。Host 可把员工导向这里,但不得 mount/frame/render。
  workbenchUrl: z.string().min(1),
}).strict()

export const workerLifecycleSchema = z.object({
  workerId: z.string().min(1),
  action: z.enum(['stop', 'decommission']),
}).strict()

// C6：assignment 信封只携带「引用」,不得携带字面密钥。gatewayProfileRef 必须是引用形态
// (env:/secretref:/$…),与 worker-runtime 的 isSafeSecretReference 同源,杜绝把字面 key
// 经控制契约落进 host-control registry / host-web assignment。
const GATEWAY_PROFILE_REF_PREFIXES = ['env:', 'secretref:', '$'] as const
function isReferenceShapedGatewayProfileRef(value: string): boolean {
  const trimmed = value.trim()
  return GATEWAY_PROFILE_REF_PREFIXES.some(prefix => trimmed.startsWith(prefix))
}

export const workerAssignmentEnvelopeSchema = z.object({
  version: z.literal(WORKER_CONTROL_PROTOCOL_VERSION),
  id: z.string().min(1),
  connectors: z.array(z.object({ id: z.string().min(1), authorized: z.boolean() }).strict()),
  permissions: z.array(z.string()),
  gatewayProfileRef: z.string().min(1).refine(isReferenceShapedGatewayProfileRef, {
    message: 'gatewayProfileRef must be a reference (env:/secretref:/$…), not a literal secret',
  }),
}).strict()

export const workerCheckInRequestSchema = z.object({
  provisionToken: z.string().min(1),
  worker: workerDescribeSchema,
}).strict()

export const workerAssignmentReceiptSchema = z.object({
  assignedEmail: z.string().email(),
  assignmentId: z.string().min(1),
  soulReleaseRef: z.string().min(1),
  workerId: z.string().min(1),
  // 不透明 descriptor JSON 字符串(= 由 soulReleaseRef 解析出的 release 的 descriptorJson)。
  // Host 把它当不透明分发产物下发,不解析领域字段。optional 让旧 Host(不填该字段)产出的
  // receipt 仍可解析,因此无需 bump WORKER_CONTROL_PROTOCOL_VERSION。descriptor 不含字面
  // secret——publish 时 assertNoLiteralSecrets 已守。
  soulDescriptor: z.string().min(1).optional(),
}).strict()

export const workerAccessReceiptSchema = z.object({
  mode: z.literal('worker_access'),
  token: z.string().min(1),
}).strict()

export const workerCheckInResponseSchema = z.object({
  access: workerAccessReceiptSchema,
  assignment: workerAssignmentReceiptSchema,
}).strict()

export const workerAccessHelloSchema = z.object({
  assignmentId: z.string().min(1),
  token: z.string().min(1),
  workerId: z.string().min(1),
}).strict()

const workerAccessHeadersSchema = z.record(z.string(), z.string())

export const workerAccessRequestEnvelopeSchema = z.object({
  type: z.literal('request'),
  id: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  headers: workerAccessHeadersSchema,
  bodyText: z.string(),
}).strict()

export const workerAccessResponseEnvelopeSchema = z.object({
  type: z.literal('response'),
  id: z.string().min(1),
  status: z.number().int().min(100).max(599),
  headers: workerAccessHeadersSchema,
  bodyText: z.string(),
}).strict()

export const workerAccessHelloFrameSchema = z.object({
  type: z.literal('hello'),
  assignmentId: z.string().min(1),
  token: z.string().min(1),
  workerId: z.string().min(1),
}).strict()

export const workerAccessPingFrameSchema = z.object({
  type: z.literal('ping'),
  id: z.string().min(1),
}).strict()

export const workerAccessPongFrameSchema = z.object({
  type: z.literal('pong'),
  id: z.string().min(1),
}).strict()

export const workerAccessCloseFrameSchema = z.object({
  type: z.literal('close'),
  id: z.string().min(1),
  reason: z.string().min(1).optional(),
}).strict()

export const workerAccessFrameSchema = z.discriminatedUnion('type', [
  workerAccessHelloFrameSchema,
  workerAccessPingFrameSchema,
  workerAccessPongFrameSchema,
  workerAccessRequestEnvelopeSchema,
  workerAccessResponseEnvelopeSchema,
  workerAccessCloseFrameSchema,
])

export type WorkerHealth = z.infer<typeof workerHealthSchema>
export type WorkerDescribe = z.infer<typeof workerDescribeSchema>
export type WorkerLifecycle = z.infer<typeof workerLifecycleSchema>
export type WorkerAssignmentEnvelope = z.infer<typeof workerAssignmentEnvelopeSchema>
export type WorkerAccessReceipt = z.infer<typeof workerAccessReceiptSchema>
export type WorkerAccessHello = z.infer<typeof workerAccessHelloSchema>
export type WorkerAccessRequestEnvelope = z.infer<typeof workerAccessRequestEnvelopeSchema>
export type WorkerAccessResponseEnvelope = z.infer<typeof workerAccessResponseEnvelopeSchema>
export type WorkerAccessHelloFrame = z.infer<typeof workerAccessHelloFrameSchema>
export type WorkerAccessPingFrame = z.infer<typeof workerAccessPingFrameSchema>
export type WorkerAccessPongFrame = z.infer<typeof workerAccessPongFrameSchema>
export type WorkerAccessCloseFrame = z.infer<typeof workerAccessCloseFrameSchema>
export type WorkerAccessFrame = z.infer<typeof workerAccessFrameSchema>
export type WorkerAssignmentReceipt = z.infer<typeof workerAssignmentReceiptSchema>
export type WorkerCheckInRequest = z.infer<typeof workerCheckInRequestSchema>
export type WorkerCheckInResponse = z.infer<typeof workerCheckInResponseSchema>

export function parseWorkerDescribe(input: unknown): WorkerDescribe {
  return workerDescribeSchema.parse(input)
}

export function parseWorkerLifecycle(input: unknown): WorkerLifecycle {
  return workerLifecycleSchema.parse(input)
}

export function parseWorkerAssignmentEnvelope(input: unknown): WorkerAssignmentEnvelope {
  return workerAssignmentEnvelopeSchema.parse(input)
}

export function parseWorkerCheckInRequest(input: unknown): WorkerCheckInRequest {
  return workerCheckInRequestSchema.parse(input)
}

export function parseWorkerCheckInResponse(input: unknown): WorkerCheckInResponse {
  return workerCheckInResponseSchema.parse(input)
}

export function parseWorkerAssignmentReceipt(input: unknown): WorkerAssignmentReceipt {
  return workerAssignmentReceiptSchema.parse(input)
}

export function parseWorkerAccessReceipt(input: unknown): WorkerAccessReceipt {
  return workerAccessReceiptSchema.parse(input)
}

export function parseWorkerAccessHello(input: unknown): WorkerAccessHello {
  return workerAccessHelloSchema.parse(input)
}

export function parseWorkerAccessRequestEnvelope(input: unknown): WorkerAccessRequestEnvelope {
  return workerAccessRequestEnvelopeSchema.parse(input)
}

export function parseWorkerAccessResponseEnvelope(input: unknown): WorkerAccessResponseEnvelope {
  return workerAccessResponseEnvelopeSchema.parse(input)
}

export function parseWorkerAccessFrame(input: unknown): WorkerAccessFrame {
  return workerAccessFrameSchema.parse(input)
}
