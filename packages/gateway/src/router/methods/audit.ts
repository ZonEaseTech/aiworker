import type { HandlerResult, LocalHandler } from '../context'
import { auditEventSchema } from '@zonease/aiworker-gateway-proto'
import { z } from 'zod'

/**
 * FEAT-034 Phase 2 — fleet UI 浏览 fleet.db `audit_events`。
 *
 * 与 `enroll.list` / `workers.list` 同口径：operator-to-gateway routing，结果走
 * proto 层的 `auditEventSchema` 二次校验确保字段对齐；过滤条件全在 SQL 侧执行
 * （persistence.listAuditEvents），避免大表 JS 过滤。
 */

const paramsSchema = z.object({
  limit: z.number().int().positive().max(200).optional(),
  before: z.number().int().positive().optional(),
  action: z.string().min(1).optional(),
  workerId: z.string().min(1).optional(),
}).default({})

const resultSchema = z.object({
  events: z.array(auditEventSchema),
  hasMore: z.boolean(),
})

export const handleAuditList: LocalHandler = (ctx, params): HandlerResult => {
  const parsed = paramsSchema.safeParse(params ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_params',
      message: 'audit.list 参数校验失败',
      details: parsed.error.flatten(),
    }
  }
  const { events, hasMore } = ctx.persistence.listAuditEvents({
    ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
    ...(parsed.data.before === undefined ? {} : { before: parsed.data.before }),
    ...(parsed.data.action === undefined ? {} : { actionPrefix: parsed.data.action }),
    ...(parsed.data.workerId === undefined ? {} : { workerId: parsed.data.workerId }),
  })

  // 二次校验：把 server 返回的列表对齐到 proto schema，防止以后表结构演化时
  // 静默走形（与 enroll.list 同套自检模式）。
  const validated = resultSchema.safeParse({ events, hasMore })
  if (!validated.success) {
    return {
      ok: false,
      code: 'internal_error',
      message: `audit.list 返回值不符合 schema: ${validated.error.message}`,
    }
  }
  return { ok: true, result: validated.data }
}
