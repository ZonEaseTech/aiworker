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
  // BUG-008: self-enrolled workers (PLAN-018) persist baseUrl='' because
  // they have no inbound HTTP address. Allow empty / missing here.
  baseUrl: z.string().optional(),
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

// ---- enroll.* (PLAN-019) ----

/**
 * 一条 pending OTP enrollment 的快照：worker 已经发起 mode='otp' 的
 * connect.enroll 帧，gateway 给它分配了 OTP 并把它挂在等待队列里，正等
 * operator 调 enroll.approve / enroll.reject 决定去留。
 */
export const pendingEnrollmentSchema = z.object({
  otp: z.string().min(1),
  workerId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  submittedAt: z.number().int(),
  expiresAt: z.number().int(),
})
export type PendingEnrollment = z.infer<typeof pendingEnrollmentSchema>

const enrollListMethod = defineMethod({
  method: 'enroll.list',
  description: '列出 gateway 当前所有 pending OTP enrollment 请求。',
  params: z.object({}).optional().default({}),
  result: z.object({
    pending: z.array(pendingEnrollmentSchema),
  }),
  routing: 'operator-to-gateway',
})

const enrollApproveMethod = defineMethod({
  method: 'enroll.approve',
  description: '批准某条 pending OTP enrollment：fleet.db 落 row + 推 enrollment.approved 事件给等待中的 worker。',
  params: z.object({ otp: z.string().min(1) }),
  result: z.object({
    workerId: z.string().min(1),
    deviceToken: z.string().min(1),
  }),
  routing: 'operator-to-gateway',
})

const enrollRejectMethod = defineMethod({
  method: 'enroll.reject',
  description: '拒绝某条 pending OTP：close 4403 给 worker，audit gateway.enrollment.rejected。',
  params: z.object({ otp: z.string().min(1) }),
  result: z.object({ rejected: z.boolean() }),
  routing: 'operator-to-gateway',
})

// ---- audit.* ----

/**
 * fleet.db `audit_events` 表的对外快照（FEAT-034 Phase 2）。
 *
 * - `id` / `at` / `actor` / `action` / `workerId` 直接来自表；
 * - `detail` 是落库时的 JSON blob，前端展示时可逐字段渲染或折叠原始 JSON；
 * - 列表端默认按 `id` 倒序（最新在前），分页用游标 `before=<id>`。
 */
export const auditEventSchema = z.object({
  id: z.number().int().positive(),
  at: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  workerId: z.string().min(1).nullable(),
  detail: z.record(z.unknown()).nullable(),
})
export type AuditEventRecord = z.infer<typeof auditEventSchema>

const auditListMethod = defineMethod({
  method: 'audit.list',
  description: 'fleet.db audit_events 浏览：按 id 倒序分页，可按 action 前缀 / workerId 过滤。',
  params: z.object({
    /** 一次返回的最大行数。默认 50，硬上限 200 以避免 fleet 长期运行后大窗口拖慢 fleet UI。 */
    limit: z.number().int().positive().max(200).optional(),
    /** 分页游标：仅返回 `id < before` 的行。客户端把上一页最后一条 id 回填即可。 */
    before: z.number().int().positive().optional(),
    /** action 前缀过滤（exact / prefix 由 server 决定，这里取 prefix）。 */
    action: z.string().min(1).optional(),
    /** worker 维度过滤；不传返回全部。 */
    workerId: z.string().min(1).optional(),
  }).optional().default({}),
  result: z.object({
    events: z.array(auditEventSchema),
    /** 是否还有更早的页（即至少存在一条 `id < events[最末].id`）。 */
    hasMore: z.boolean(),
  }),
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

/**
 * 与 ChannelType 保持同步——proto 层做最小防线，避免跨包导入。
 */
const workerChannelEnum = z.enum(['web', 'line', 'telegram', 'lark', 'whatsapp'])

// ---- secrets.* ----

const secretKeySchema = z.string().regex(/^[\w.-]{1,128}$/)

const secretsListMethod = defineMethod({
  method: 'secrets.list',
  description: '列出目标 worker vault 里的 secret key，不返回 secret value。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ keys: z.array(z.string()) }),
  routing: 'operator-to-node',
})

const secretsPutMethod = defineMethod({
  method: 'secrets.put',
  description: '写入或覆盖目标 worker 的一个 secret value。',
  params: z.object({
    workerId: z.string().min(1),
    key: secretKeySchema,
    value: z.string().min(1),
  }),
  result: z.object({ ok: z.literal(true) }),
  routing: 'operator-to-node',
})

const secretsDeleteMethod = defineMethod({
  method: 'secrets.delete',
  description: '删除目标 worker 的一个 secret key。',
  params: z.object({
    workerId: z.string().min(1),
    key: secretKeySchema,
  }),
  result: z.object({ ok: z.literal(true) }),
  routing: 'operator-to-node',
})

// ---- engines / probes ----

const enginesListMethod = defineMethod({
  method: 'engines.list',
  description: '读取目标 worker 的 executor engine availability 列表。',
  params: z.object({
    workerId: z.string().min(1),
    refresh: z.boolean().optional(),
  }),
  result: z.object({ engines: z.array(z.unknown()) }),
  routing: 'operator-to-node',
})

const brainTestMethod = defineMethod({
  method: 'brain.test',
  description: '在目标 worker 上执行 brain health probe。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainAdmissionStatusEnum = z.enum(['pending', 'approved', 'rejected', 'applied', 'failed'])
const brainArtifactStatusEnum = z.enum(['active', 'archived', 'removed'])
const brainArtifactSensitivityEnum = z.enum(['public', 'internal', 'confidential', 'secret'])
const brainSecretBodyPolicyEnum = z.enum(['block', 'redact', 'raw'])

const brainSummaryMethod = defineMethod({
  method: 'brain.summary',
  description: '读取目标 worker 的 Brain summary aggregate。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainAdmissionListMethod = defineMethod({
  method: 'brain.admission.list',
  description: '列出目标 worker 的 Brain admission proposals。',
  params: z.object({
    workerId: z.string().min(1),
    status: brainAdmissionStatusEnum.optional(),
    kind: z.string().min(1).optional(),
    scopeId: z.string().min(1).optional(),
    soulId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    showSensitive: z.boolean().optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainAdmissionShowMethod = defineMethod({
  method: 'brain.admission.show',
  description: '读取目标 worker 的单条 Brain admission proposal。',
  params: z.object({
    workerId: z.string().min(1),
    id: z.string().min(1),
    showSensitive: z.boolean().optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainAdmissionDecisionParams = z.object({
  workerId: z.string().min(1),
  id: z.string().min(1),
  decidedBy: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000).optional(),
})

const brainAdmissionApproveMethod = defineMethod({
  method: 'brain.admission.approve',
  description: '批准目标 worker 的 pending Brain admission proposal。',
  params: brainAdmissionDecisionParams,
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainAdmissionRejectMethod = defineMethod({
  method: 'brain.admission.reject',
  description: '拒绝目标 worker 的 pending Brain admission proposal。',
  params: brainAdmissionDecisionParams,
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainAdmissionApplyMethod = defineMethod({
  method: 'brain.admission.apply',
  description: '执行目标 worker 的 approved Brain admission proposal。',
  params: z.object({
    workerId: z.string().min(1),
    id: z.string().min(1),
    decidedBy: z.string().min(1).max(200),
    commit: z.boolean().optional(),
    allowSecretBody: brainSecretBodyPolicyEnum.optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainArtifactsListMethod = defineMethod({
  method: 'brain.artifacts.list',
  description: '列出目标 worker 的 Brain artifact registry。',
  params: z.object({
    workerId: z.string().min(1),
    scopeId: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    status: brainArtifactStatusEnum.optional(),
    minSensitivity: brainArtifactSensitivityEnum.optional(),
    limit: z.number().int().min(1).max(500).optional(),
    showSensitive: z.boolean().optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const brainArtifactsShowMethod = defineMethod({
  method: 'brain.artifacts.show',
  description: '读取目标 worker 的单条 Brain artifact。',
  params: z.object({
    workerId: z.string().min(1),
    id: z.string().min(1),
    showSensitive: z.boolean().optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const executorTestMethod = defineMethod({
  method: 'executor.test',
  description: '在目标 worker 上执行 executor health / tiny probe。',
  params: z.object({
    workerId: z.string().min(1),
    probe: z.boolean().optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

const channelTestMethod = defineMethod({
  method: 'channel.test',
  description: '在目标 worker 上执行 channel binding probe。',
  params: z.object({
    workerId: z.string().min(1),
    channel: workerChannelEnum,
    body: z.object({
      chatId: z.string().optional(),
      text: z.string().optional(),
    }).optional(),
  }),
  result: z.unknown(),
  routing: 'operator-to-node',
})

// ---- orchestrator.* ----

const orchestratorTasksListMethod = defineMethod({
  method: 'orchestrator.tasks.list',
  description: '列出目标 worker 的最近 orchestrator task。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ tasks: z.array(z.unknown()) }),
  routing: 'operator-to-node',
})

const orchestratorTasksCreateMethod = defineMethod({
  method: 'orchestrator.tasks.create',
  description: '在目标 worker 上创建一个 orchestrator task。',
  params: z.object({
    workerId: z.string().min(1),
    prompt: z.string().trim().min(1).max(8000),
  }),
  result: z.object({ task: z.unknown() }),
  routing: 'operator-to-node',
})

const orchestratorTaskJournalMethod = defineMethod({
  method: 'orchestrator.tasks.journal',
  description: '查看目标 worker 上某个 task 的 Brain Journal trace。',
  params: z.object({
    workerId: z.string().min(1),
    taskId: z.string().min(1),
  }),
  result: z.object({ journal: z.unknown() }),
  routing: 'operator-to-node',
})

const orchestratorConversationsListMethod = defineMethod({
  method: 'orchestrator.conversations.list',
  description: '列出目标 worker 的最近 conversations。',
  params: z.object({ workerId: z.string().min(1) }),
  result: z.object({ conversations: z.array(z.unknown()) }),
  routing: 'operator-to-node',
})

const orchestratorMessagesListMethod = defineMethod({
  method: 'orchestrator.messages.list',
  description: '列出目标 worker 某 conversation 的 messages。',
  params: z.object({
    workerId: z.string().min(1),
    conversationId: z.string().min(1),
  }),
  result: z.object({ messages: z.array(z.unknown()) }),
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

const cronChannelEnum = workerChannelEnum

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
  'enroll.list': enrollListMethod,
  'enroll.approve': enrollApproveMethod,
  'enroll.reject': enrollRejectMethod,
  'audit.list': auditListMethod,
  'chat.send': chatSendMethod,
  'config.get': configGetMethod,
  'config.put': configPutMethod,
  'token.rotate': tokenRotateMethod,
  'logs.tail': logsTailMethod,
  'system.presence': systemPresenceMethod,
  'approval.list': approvalListMethod,
  'approval.grant': approvalGrantMethod,
  'secrets.list': secretsListMethod,
  'secrets.put': secretsPutMethod,
  'secrets.delete': secretsDeleteMethod,
  'engines.list': enginesListMethod,
  'brain.test': brainTestMethod,
  'brain.summary': brainSummaryMethod,
  'brain.admission.list': brainAdmissionListMethod,
  'brain.admission.show': brainAdmissionShowMethod,
  'brain.admission.approve': brainAdmissionApproveMethod,
  'brain.admission.reject': brainAdmissionRejectMethod,
  'brain.admission.apply': brainAdmissionApplyMethod,
  'brain.artifacts.list': brainArtifactsListMethod,
  'brain.artifacts.show': brainArtifactsShowMethod,
  'executor.test': executorTestMethod,
  'channel.test': channelTestMethod,
  'orchestrator.tasks.list': orchestratorTasksListMethod,
  'orchestrator.tasks.create': orchestratorTasksCreateMethod,
  'orchestrator.tasks.journal': orchestratorTaskJournalMethod,
  'orchestrator.conversations.list': orchestratorConversationsListMethod,
  'orchestrator.messages.list': orchestratorMessagesListMethod,
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
