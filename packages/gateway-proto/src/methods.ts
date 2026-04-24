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
