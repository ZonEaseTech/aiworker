import type { HandlerResult, LocalHandler } from '../context'
import { workerSummarySchema } from '@zonease/aiworker-gateway-proto'
import { z } from 'zod'

const presenceResultSchema = z.object({
  now: z.number().int(),
  online: z.array(workerSummarySchema),
})

/**
 * `system.presence`：operator 询问当前 online 的 node 列表 + 服务端时钟。
 *
 * - 结果按 proto 的 `workerSummarySchema` 形态返回：`online=true` 恒成立，
 *   `lastSeenAt` 取 node 进入 registry 的毫秒戳（连接建立时间）。
 * - 故意读取 `persistence` 去补 `displayName` / `baseUrl`：运维视角在 aim
 *   CLI 里直接看到人类可读的名字比只看 workerId 有用；这条查询也是读内存
 *   命中（SQLite 走 WAL，单行 select 极快）。
 */
export const handleSystemPresence: LocalHandler = (ctx): HandlerResult => {
  const now = Date.now()
  const online = ctx.nodes.list().map((node) => {
    const registered = ctx.persistence.getRegisteredWorker(node.workerId)
    return {
      workerId: node.workerId,
      displayName: registered?.displayName,
      online: true,
      deviceId: node.deviceId,
      baseUrl: registered?.baseUrl,
      lastSeenAt: node.pairedAt,
    }
  })
  const parsed = presenceResultSchema.safeParse({ now, online })
  if (!parsed.success) {
    return {
      ok: false,
      code: 'internal_error',
      message: `system.presence 构造的 result 不符合 schema: ${parsed.error.message}`,
    }
  }
  return { ok: true, result: parsed.data }
}
