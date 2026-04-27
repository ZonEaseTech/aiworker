import { jsonFetch, WebApiError } from '@/shared/api'

/**
 * worker 视角 API 客户端：所有请求走宿主 worker 自己的 HTTP `/api/worker/*`。
 *
 * Phase 1 仅暴露最小 `getHealth`，证明骨架能闭环：bundle → 取自身 health。
 * 真正的业务方法（config / orchestrator / events）由 FEAT-035 接入。
 */

export interface WorkerHealth {
  mode: string
  workerId: string
  status: string
  configVersion: number
  startedAt: string
  checkedAt: string
}

export async function getWorkerHealth(): Promise<WorkerHealth> {
  return await jsonFetch<WorkerHealth>('/health')
}

export { WebApiError }
