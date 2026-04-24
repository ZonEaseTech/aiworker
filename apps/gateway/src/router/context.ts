import type { ConsolaInstance } from 'consola'
import type { ForwardTable, NodeRegistry, OperatorRegistry } from '../registry'
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
