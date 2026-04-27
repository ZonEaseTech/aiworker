import type { ConsolaInstance } from 'consola'
import type { ConnectRateLimiter, ForwardTable, NodeRegistry, OperatorRegistry, PendingEnrollmentRegistry } from '../registry'
import type { FleetPersistence } from '../registry/persistence'
import type { FleetSupervisor } from '../supervisor/service'

/**
 * 所有方法 handler 拿到的上下文。持有 fleet.db 访问层 + 三个内存 registry
 * + (可选) supervisor。故意保持 plain interface,方便测试注入 stub:
 * - 测试用 `createInMemoryContext()` 生成一份临时内存 DB + 空 registry。
 * - 生产由 `server.ts` 在启动时构造一次,传给 dispatch。
 */
export interface GatewayContext {
  persistence: FleetPersistence
  nodes: NodeRegistry
  operators: OperatorRegistry
  forwards: ForwardTable
  logger: ConsolaInstance
  /** AES-256-GCM 主密钥(hex)。pair / token.rotate handler 用它加解密 token。 */
  masterKeyHex?: string
  /**
   * `AIWORKER_GATEWAY_CAN_LAUNCH=true` 时由 server.ts 注入;否则为 null,
   * `workers.launch` 直接回 `feature_disabled`。
   */
  supervisor?: FleetSupervisor | null
  /** `AIWORKER_MAX_WORKERS` 配额上限(可选)。 */
  maxWorkers?: number
  /**
   * PLAN-019:OTP-attended enrollment 待批队列。S2 引入,server.ts 路径感知
   * 分支(S3)负责往里 submit;`enroll.list/approve/reject` handler 消费它。
   * 测试场景下可缺省,handler 会回 feature_disabled。
   */
  pendingEnrollments?: PendingEnrollmentRegistry
  /**
   * BUG-020：来源 IP 的握手失败计数 / 阻断器。fetch handler 升级前用 isBlocked
   * 判断是否直接 429,handleMessage 在握手成功 / 失败时分别 recordSuccess /
   * recordFailure。测试场景下可缺省—server.ts 的逻辑会跳过限频,与现网行为只在
   * "无 brute-force 防护"这一点上不同。
   */
  connectRateLimiter?: ConnectRateLimiter
  /**
   * PLAN-022 / FEAT-033：fleet bundle 静态资源根目录的绝对路径。CLI 在启动时
   * 解析（npm install 后是 `<cli-bin>/web/fleet`，源码 dev 时是
   * `<repo>/apps/web/dist/fleet`）。未注入 → `/admin/*` 一律 404，但 gateway
   * 仍能启动（`--no-serve-web` 或资源不存在的容错路径）。
   */
  webStaticDir?: string
}

/**
 * 方法 handler 返回的逻辑结果:
 * - `{ ok: true, result }`:成功;dispatch 会编码为 response(ok=true)
 * - `{ ok: false, code, message, details? }`:业务失败;dispatch 编码为 error
 * - handler 抛异常:dispatch 记 log 并回 `internal_error`
 *
 * 选用 sum type 而非 throw 做失败路径,便于单测断言错误码不会被吞。
 */
export type HandlerResult
  = | { ok: true, result: unknown }
    | { ok: false, code: string, message: string, details?: unknown }

export type LocalHandler = (
  ctx: GatewayContext,
  params: unknown,
) => HandlerResult | Promise<HandlerResult>
