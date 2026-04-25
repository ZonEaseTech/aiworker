import { z } from 'zod'

/**
 * 方法路由方向：
 * - `operator-to-node`：operator 发起 → gateway 路由到目标 node → node 处理。
 * - `operator-to-gateway`：operator 发起 → gateway 自己处理（不转发给 node）。
 *   例如注册/启动 worker 这类 fleet 级操作。
 */
export type MethodRouting = 'operator-to-node' | 'operator-to-gateway'

/**
 * 方法定义：method 名 + params / result 的 zod schema + 路由方向 + 说明。
 * 下游 gateway/node 在分发 request 时据此校验 params 与 routing。
 */
export interface MethodDef<P, R> {
  method: string
  params: z.ZodType<P>
  result: z.ZodType<R>
  description: string
  routing: MethodRouting
}

/** 辅助构造函数，保持 params / result 的泛型推导。 */
function defineMethod<P, R>(def: MethodDef<P, R>): MethodDef<P, R> {
  return def
}

// ---- workers.* ----

export const workerSummarySchema = z.object({
  workerId: z.string().min(1),
  displayName: z.string().optional(),
  online: z.boolean(),
  deviceId: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  lastSeenAt: z.number().int().nullable().optional(),
})
export type WorkerSummary = z.infer<typeof workerSummarySchema>

const workersListMethod = defineMethod({
  method: 'workers.list',
  description: '列出 fleet 内所有已注册 worker（含 online 状态）。',
  params: z.object({}).optional().default({}),
  result: z.object({ workers: z.array(workerSummarySchema) }),
  routing: 'operator-to-gateway',
})

const workersInfoMethod = defineMethod({
  method: 'workers.info',
  description: '读取某个 worker 的运行时快照（/worker/info 等价物）。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

export const pairRequestSchema = z.object({
  workerBaseUrl: z.string().min(1),
  bootstrapToken: z.string().min(1),
  displayName: z.string().optional(),
})
export type PairRequest = z.infer<typeof pairRequestSchema>

export const pairResultSchema = z.object({
  workerId: z.string().min(1),
  deviceToken: z.string().min(1),
})
export type PairResult = z.infer<typeof pairResultSchema>

const workersPairMethod = defineMethod({
  method: 'workers.pair',
  description: '把一个已启动的 worker 通过 bootstrap token 注册到 fleet。',
  params: pairRequestSchema,
  result: pairResultSchema,
  routing: 'operator-to-gateway',
})

const workersLaunchMethod = defineMethod({
  method: 'workers.launch',
  description: '由 gateway/supervisor 本地拉起一个 worker 容器并完成注册。',
  params: z.object({
    displayName: z.string().optional(),
    image: z.string().optional(),
    env: z.record(z.string()).optional(),
  }),
  result: pairResultSchema,
  routing: 'operator-to-gateway',
})

const workersStopMethod = defineMethod({
  method: 'workers.stop',
  description: '向目标 worker 下发停止指令（不从 fleet 里删除）。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ stopped: z.boolean() }),
  routing: 'operator-to-node',
})

const workersRemoveMethod = defineMethod({
  method: 'workers.remove',
  description: '把 worker 从 fleet 中摘除（存量 deviceToken 作废）。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ removed: z.boolean() }),
  routing: 'operator-to-gateway',
})

// ---- chat.* ----

const chatSendMethod = defineMethod({
  method: 'chat.send',
  description: '向目标 worker 的某会话追加一条用户消息并触发一次 run。',
  params: z.object({
    workerId: z.string().min(1),
    conversationId: z.string().min(1).optional(),
    content: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  }),
  result: z.object({
    conversationId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    accepted: z.boolean(),
  }),
  routing: 'operator-to-node',
})

// ---- config.* ----

const configGetMethod = defineMethod({
  method: 'config.get',
  description: '读取 worker 当前配置（含 version）。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({
    version: z.number().int().nonnegative(),
    config: z.unknown(),
  }),
  routing: 'operator-to-node',
})

const configPutMethod = defineMethod({
  method: 'config.put',
  description: '更新 worker 配置，使用 ifMatch 进行乐观锁。',
  params: z.object({
    workerId: z.string().min(1),
    ifMatch: z.number().int().nonnegative(),
    config: z.unknown(),
  }),
  result: z.object({
    version: z.number().int().nonnegative(),
    appliedAt: z.number().int(),
  }),
  routing: 'operator-to-node',
})

// ---- token.* ----

const tokenRotateMethod = defineMethod({
  method: 'token.rotate',
  description: '为目标 worker 轮换 deviceToken，旧 token 立即失效。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ deviceToken: z.string().min(1) }),
  routing: 'operator-to-gateway',
})

// ---- logs.* ----

const logsTailMethod = defineMethod({
  method: 'logs.tail',
  description: '订阅 worker 的日志尾部（通过后续 logs.line 事件推送）。',
  params: z.object({
    workerId: z.string().min(1),
    follow: z.boolean().optional(),
    lines: z.number().int().positive().max(1000).optional(),
  }),
  result: z.object({ subscribed: z.boolean() }),
  routing: 'operator-to-node',
})

// ---- approval.* ----（PLAN-014 F2）

export const approvalDecisionSchema = z.enum(['allow', 'deny'])
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>

export const pendingApprovalSchema = z.object({
  workerId: z.string().min(1),
  taskId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  params: z.record(z.unknown()),
  expiresAt: z.number().int(),
})
export type PendingApprovalDescriptor = z.infer<typeof pendingApprovalSchema>

const approvalListMethod = defineMethod({
  method: 'approval.list',
  description: '列出目标 worker 当前所有挂起的 per-tool 审批请求。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ approvals: z.array(pendingApprovalSchema) }),
  routing: 'operator-to-node',
})

const approvalGrantMethod = defineMethod({
  method: 'approval.grant',
  description: '解锁某条挂起的 tool 审批：allow 让 orchestrator 继续执行，deny 立即短路。',
  params: z.object({
    workerId: z.string().min(1),
    taskId: z.string().min(1),
    toolCallId: z.string().min(1),
    decision: approvalDecisionSchema,
  }),
  result: z.object({
    granted: z.boolean(),
  }),
  routing: 'operator-to-node',
})

// ---- system.* ----

const systemPresenceMethod = defineMethod({
  method: 'system.presence',
  description: 'operator 心跳 / 询问当前 online 的所有 node 列表。',
  params: z.object({}).optional().default({}),
  result: z.object({
    now: z.number().int(),
    online: z.array(workerSummarySchema),
  }),
  routing: 'operator-to-gateway',
})

// ---- cron.* (PLAN-014 §F4) ----

/**
 * 与 ChannelType 保持同步——proto 层做最小防线，避免跨包导入。
 */
const cronChannelEnum = z.enum(['web', 'line', 'telegram', 'lark', 'whatsapp'])

export const cronJobRecordSchema = z.object({
  id: z.string().min(1),
  expression: z.string().min(1),
  prompt: z.string().min(1),
  channel: cronChannelEnum,
  chatId: z.string().min(1),
  accountId: z.string().min(1),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CronJobRecordProto = z.infer<typeof cronJobRecordSchema>

export const cronJobInputSchema = z.object({
  expression: z.string().min(1),
  prompt: z.string().min(1),
  channel: cronChannelEnum,
  chatId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
})

export const cronJobPatchSchema = z.object({
  expression: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  channel: cronChannelEnum.optional(),
  chatId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
}).refine(p => Object.keys(p).length > 0, { message: '至少提供一个待更新字段' })

const cronListMethod = defineMethod({
  method: 'cron.list',
  description: '列出目标 worker 上所有 cron 任务（含 enabled / lastRunAt / nextRunAt）。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ jobs: z.array(cronJobRecordSchema) }),
  routing: 'operator-to-node',
})

const cronAddMethod = defineMethod({
  method: 'cron.add',
  description: '在目标 worker 上新增一条 cron 任务；非法 expression 直接失败。',
  params: z.object({
    workerId: z.string().min(1),
    job: cronJobInputSchema,
  }),
  result: z.object({ job: cronJobRecordSchema }),
  routing: 'operator-to-node',
})

const cronRemoveMethod = defineMethod({
  method: 'cron.remove',
  description: '删除目标 worker 上的某条 cron 任务。',
  params: z.object({
    workerId: z.string().min(1),
    jobId: z.string().min(1),
  }),
  result: z.object({ removed: z.boolean() }),
  routing: 'operator-to-node',
})

const cronUpdateMethod = defineMethod({
  method: 'cron.update',
  description: '局部更新目标 worker 上某条 cron 任务；改 expression 或 enabled 会重算 nextRunAt。',
  params: z.object({
    workerId: z.string().min(1),
    jobId: z.string().min(1),
    patch: cronJobPatchSchema,
  }),
  result: z.object({ job: cronJobRecordSchema }),
  routing: 'operator-to-node',
})

/**
 * 方法名 → 方法定义的注册表。
 * key 必须与 value.method 一致。
 */
export const METHODS = {
  'workers.list': workersListMethod,
  'workers.info': workersInfoMethod,
  'workers.pair': workersPairMethod,
  'workers.launch': workersLaunchMethod,
  'workers.stop': workersStopMethod,
  'workers.remove': workersRemoveMethod,
  'chat.send': chatSendMethod,
  'config.get': configGetMethod,
  'config.put': configPutMethod,
  'token.rotate': tokenRotateMethod,
  'logs.tail': logsTailMethod,
  'system.presence': systemPresenceMethod,
  'approval.list': approvalListMethod,
  'approval.grant': approvalGrantMethod,
  'cron.list': cronListMethod,
  'cron.add': cronAddMethod,
  'cron.remove': cronRemoveMethod,
  'cron.update': cronUpdateMethod,
} as const

export type MethodName = keyof typeof METHODS

/** 判断一个字符串是否是本包已注册的方法名。 */
export function isKnownMethod(method: string): method is MethodName {
  return Object.prototype.hasOwnProperty.call(METHODS, method)
}

/** 获取方法定义；未注册返回 undefined。 */
export function getMethodDef(method: string): MethodDef<unknown, unknown> | undefined {
  if (!isKnownMethod(method))
    return undefined
  return METHODS[method] as MethodDef<unknown, unknown>
}
