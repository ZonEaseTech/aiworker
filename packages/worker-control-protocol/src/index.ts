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
  // 配置 micro-app entry：host-web 据此 mount（载体 = micro-app）。契约不绑定 transport
  // 细节，仅给出 entry 引用，未来非 web transport 可复用同一契约。
  configMicroAppEntry: z.string().min(1),
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

export type WorkerHealth = z.infer<typeof workerHealthSchema>
export type WorkerDescribe = z.infer<typeof workerDescribeSchema>
export type WorkerLifecycle = z.infer<typeof workerLifecycleSchema>
export type WorkerAssignmentEnvelope = z.infer<typeof workerAssignmentEnvelopeSchema>

export function parseWorkerDescribe(input: unknown): WorkerDescribe {
  return workerDescribeSchema.parse(input)
}

export function parseWorkerLifecycle(input: unknown): WorkerLifecycle {
  return workerLifecycleSchema.parse(input)
}

export function parseWorkerAssignmentEnvelope(input: unknown): WorkerAssignmentEnvelope {
  return workerAssignmentEnvelopeSchema.parse(input)
}
