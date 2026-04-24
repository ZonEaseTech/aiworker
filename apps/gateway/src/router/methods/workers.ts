import type { HandlerResult, LocalHandler } from '../context'
import { workerSummarySchema } from '@aiworker/gateway-proto'
import { z } from 'zod'

/** fleet.db 存 ISO 字符串；proto 里 `lastSeenAt` 要毫秒戳。转换失败时返回 null。 */
function parseIsoToMs(iso: string | undefined): number | null {
  if (!iso)
    return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t))
    return null
  return t
}

/**
 * `workers.list`：列出 fleet.db 中所有已注册 worker。
 *
 * 对每个注册行：
 * - `online` = node registry 中是否存在该 workerId。
 * - `lastSeenAt`：若在线 → 取 node registry 的 pairedAt（最准）；否则尝试解析
 *   fleet.db 的 `lastSeenAt`（ISO 字符串）为毫秒戳。
 */
export const handleWorkersList: LocalHandler = (ctx): HandlerResult => {
  const rows = ctx.persistence.listRegisteredWorkers()
  const workers = rows.map((row) => {
    const online = ctx.nodes.has(row.id)
    const node = online ? ctx.nodes.get(row.id) : undefined
    const lastSeenAt = node
      ? node.pairedAt
      : parseIsoToMs(row.lastSeenAt)
    return {
      workerId: row.id,
      displayName: row.displayName,
      online,
      deviceId: node?.deviceId,
      baseUrl: row.baseUrl,
      lastSeenAt,
    }
  })
  const parsed = z.object({ workers: z.array(workerSummarySchema) }).safeParse({ workers })
  if (!parsed.success) {
    return {
      ok: false,
      code: 'internal_error',
      message: `workers.list 构造的 result 不符合 schema: ${parsed.error.message}`,
    }
  }
  return { ok: true, result: parsed.data }
}

/**
 * `workers.remove`：把 worker 从 fleet.db 里摘除，同时若该 node 在线则强制
 * 踢下线。
 *
 * - 404：fleet.db 没有这个 workerId，返回 `not_found`（与 REST 旧语义一致）。
 * - 成功：删除 row + 若 node 在线则 close(1000, 'removed_from_fleet')。
 */
export const handleWorkersRemove: LocalHandler = (ctx, params): HandlerResult => {
  const parsed = z.object({ workerId: z.string().min(1) }).safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_params',
      message: 'workers.remove 缺少 workerId',
      details: parsed.error.flatten(),
    }
  }
  const { workerId } = parsed.data
  const existing = ctx.persistence.getRegisteredWorker(workerId)
  if (!existing) {
    return { ok: false, code: 'not_found', message: `worker ${workerId} 不在 fleet 中` }
  }

  const online = ctx.nodes.get(workerId)
  const removed = ctx.persistence.removeRegisteredWorker(workerId)
  if (online) {
    // 取消该 workerId 的所有在途 forward（operator 回错误）后再 close 连接。
    ctx.forwards.cancelByWorker(workerId)
    ctx.nodes.unregisterByWs(online.ws)
    try {
      online.ws.close(1000, 'removed_from_fleet')
    }
    catch (err) {
      ctx.logger.warn(`[gateway] workers.remove 关闭在线 node 时报错 (workerId=${workerId})`, err)
    }
  }
  ctx.persistence.recordAudit({
    actor: 'gateway',
    action: 'gateway.worker.removed',
    workerId,
    detail: { displayName: existing.displayName, baseUrl: existing.baseUrl },
  })
  return { ok: true, result: { removed } }
}
