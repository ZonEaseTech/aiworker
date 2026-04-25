import type { WorkerRuntime } from '../runtime'

/**
 * 单 worker 进程在运行期需要共享的可变状态。
 *
 * `runtime` 字段会在 `PUT /api/worker/config` 触发 hot-reload 时被原子替换；
 * 路由层必须始终通过 `() => state.runtime` 闭包懒取，以保证拿到的是最新实例
 * (PLAN-004 §2.2 / PLAN-015 hot-reload 不变量)。
 */
export interface WorkerModeState {
  workerId: string
  runtime: WorkerRuntime
  configVersion: number
  startedAt: string
  /**
   * Current plaintext bearer token that callers of `/api/worker/*` must
   * present. Mutated in place by `POST /api/worker/token/rotate` so the
   * auth middleware picks up the new token on the next request.
   */
  tokenPlaintext: string
}
