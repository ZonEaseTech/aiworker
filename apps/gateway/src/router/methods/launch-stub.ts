import type { HandlerResult, LocalHandler } from '../context'

/**
 * PLAN-013 S2 阶段：`workers.pair` / `workers.launch` / `token.rotate` 均未接入。
 *
 * - `workers.pair` 需要走 worker 的 bootstrap token 验证 + fleet.db insert，
 *   语义等价旧 dashboard `POST /api/workers/register`，会在 S5 一起搬家。
 * - `workers.launch` 需要 docker supervisor，同样在 S5 从 dashboard 迁移。
 * - `token.rotate` 依赖 pair 产生的 deviceToken，目前无上游；一并 stub。
 *
 * 返回统一的 `not_implemented` 错误码，详情里带回 method 名，方便 aim CLI 直接
 * 给操作员人类可读的报错。
 */
function buildStub(method: string): LocalHandler {
  return (): HandlerResult => ({
    ok: false,
    code: 'not_implemented',
    message: `${method} 在 PLAN-013 S2 尚未实现；将在 S5 迁移 dashboard 能力后接入`,
    details: { method, stage: 'PLAN-013/S2' },
  })
}

export const handleWorkersPair: LocalHandler = buildStub('workers.pair')
export const handleWorkersLaunch: LocalHandler = buildStub('workers.launch')
export const handleTokenRotate: LocalHandler = buildStub('token.rotate')
