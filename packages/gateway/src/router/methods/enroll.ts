import type { HandlerResult, LocalHandler } from '../context'
import { createHash } from 'node:crypto'
import { encodeFrame, EVENTS, pendingEnrollmentSchema } from '@zonease/aiworker-gateway-proto'
import { z } from 'zod'
import { broadcastEventToOperators } from '../../events/broadcast'

/**
 * PLAN-019：OTP-attended enrollment 的 operator 端方法。
 *
 * - `enroll.list`：列出当前所有待批项（来自 `ctx.pendingEnrollments`）。
 * - `enroll.approve`：取出 entry → 配额 / masterKey 校验 → upsertEnrolledWorker
 *   `addedBy='otp'` → 通过 entry.ws 推 `enrollment.approved` 事件 →
 *   audit `gateway.enrollment.approved`。
 * - `enroll.reject`：取出 entry → close 4403 → audit `gateway.enrollment.rejected`。
 *
 * BUG-009 后 approve handler 也负责把 entry.ws 从 node-pending 升级成
 * 正式 node + 注册 NodeRegistry + 广播 worker.online——这一步原本 S2/S3
 * 互相留 TODO 没接，导致 aim workers list 永远 online=false。
 */

const otpParamSchema = z.object({ otp: z.string().min(1) })

export const handleEnrollList: LocalHandler = (ctx): HandlerResult => {
  if (!ctx.pendingEnrollments) {
    return {
      ok: false,
      code: 'feature_disabled',
      message: 'gateway 未初始化 pending enrollment registry',
    }
  }
  const pending = ctx.pendingEnrollments.list()
  // 走一遍 schema 校验，确保 result 与 proto 对齐。
  const parsed = z.object({ pending: z.array(pendingEnrollmentSchema) }).safeParse({ pending })
  if (!parsed.success) {
    return {
      ok: false,
      code: 'internal_error',
      message: `enroll.list 构造的 result 不符合 schema: ${parsed.error.message}`,
    }
  }
  return { ok: true, result: parsed.data }
}

export const handleEnrollApprove: LocalHandler = (ctx, params): HandlerResult => {
  if (!ctx.pendingEnrollments) {
    return {
      ok: false,
      code: 'feature_disabled',
      message: 'gateway 未初始化 pending enrollment registry',
    }
  }
  const parsed = otpParamSchema.safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_params',
      message: 'enroll.approve 缺少 otp',
      details: parsed.error.flatten(),
    }
  }
  if (!ctx.masterKeyHex) {
    return {
      ok: false,
      code: 'master_key_missing',
      message: 'gateway 未配置 AIWORKER_MASTER_KEY,无法加密 worker token',
    }
  }
  // 配额先查——批准会真实写 fleet.db 行。worker 重批本身不占新名额（已在 fleet 里）。
  if (ctx.maxWorkers !== undefined) {
    const peeked = peekPending(ctx, parsed.data.otp)
    const alreadyRegistered = peeked
      ? ctx.persistence.getRegisteredWorker(peeked.workerId) !== undefined
      : false
    if (!alreadyRegistered) {
      const current = ctx.persistence.countRegisteredWorkers()
      if (current >= ctx.maxWorkers) {
        return {
          ok: false,
          code: 'quota_exceeded',
          message: `fleet 已达 ${ctx.maxWorkers} worker 上限`,
          details: { limit: ctx.maxWorkers, current },
        }
      }
    }
  }

  const entry = ctx.pendingEnrollments.approve(parsed.data.otp)
  if (!entry) {
    return {
      ok: false,
      code: 'not_found',
      message: `OTP ${parsed.data.otp} 不在待批列表中（或已过期 / 已处理）`,
    }
  }

  const upsert = ctx.persistence.upsertEnrolledWorker(
    {
      workerId: entry.workerId,
      // OTP 入网的 worker 没有 inbound HTTP 地址,与 self-enroll 一致 baseUrl=''。
      baseUrl: '',
      apiToken: entry.apiToken,
      displayName: entry.displayName ?? entry.workerId,
      addedBy: 'otp',
    },
    ctx.masterKeyHex,
  )

  // BUG-009：把 node-pending ws 升级到正式 node 注册——之前 S2/S3 互相留 TODO，
  // 谁都没接，approve 后 ws 一直停在 node-pending 状态、NodeRegistry 看不到，
  // 导致 aim workers list 永远 online=false、chat.send 全部 node_offline。
  // 顺序：升级 role → 注册 NodeRegistry（处理可能的 replaced 老连接） →
  // 推 enrollment.approved → 广播 worker.online。
  entry.ws.data.role = 'node'
  entry.ws.data.agentId = entry.workerId
  const { replaced } = ctx.nodes.register({
    workerId: entry.workerId,
    deviceId: entry.ws.data.deviceId ?? entry.workerId,
    ws: entry.ws,
    pairedAt: Date.now(),
    meta: {},
  })
  if (replaced) {
    ctx.forwards.cancelByWorker(entry.workerId)
    try {
      replaced.ws.close(1012, 'replaced_by_enroll_approve')
    }
    catch { /* 老连接关失败不影响新连接 */ }
  }

  // 通过原 ws 把 enrollment.approved 事件推回 worker——worker 拿到 deviceToken
  // 后即可视作 enrollment 完成。BUG-009 之后 ws 已升级为正式 node，无需重连。
  try {
    entry.ws.send(encodeFrame({
      type: 'event',
      name: EVENTS.ENROLLMENT_APPROVED,
      payload: {
        workerId: entry.workerId,
        deviceToken: entry.apiToken,
      },
      ts: Date.now(),
    }))
  }
  catch {
    // worker 已断开——视为放弃 enrollment;fleet 行已经写了,运维通过
    // workers.list 仍可见这条记录。
  }

  // 广播 worker.online 给所有 operator——与常规 connect 路径
  // (apps/gateway/src/server.ts handleMessage line 322) 行为对齐。
  broadcastEventToOperators(ctx.operators, {
    type: 'event',
    name: EVENTS.WORKER_ONLINE,
    payload: {
      workerId: entry.workerId,
      displayName: upsert.row.displayName,
      deviceId: entry.ws.data.deviceId ?? entry.workerId,
      connectedAt: Date.now(),
    },
    ts: Date.now(),
  })

  if (upsert.kind !== 'unchanged') {
    ctx.persistence.recordAudit({
      actor: 'gateway',
      action: 'gateway.enrollment.approved',
      workerId: entry.workerId,
      detail: {
        displayName: upsert.row.displayName,
        deviceId: entry.ws.data.deviceId,
        change: upsert.kind,
      },
    })
  }

  // FEAT-034 Phase 2：把 pending 列表的对应项标为 approved，让 fleet UI 立即
  // 从待批面板移除（worker.online 已在上面广播过，list 收敛由前端处理）。
  broadcastEventToOperators(ctx.operators, {
    type: 'event',
    name: EVENTS.ENROLLMENT_PENDING,
    payload: {
      workerId: entry.workerId,
      ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
      otp: entry.otp,
      submittedAt: entry.submittedAt,
      expiresAt: entry.expiresAt,
      reason: 'approved',
    },
    ts: Date.now(),
  })

  return {
    ok: true,
    result: {
      workerId: entry.workerId,
      deviceToken: entry.apiToken,
    },
  }
}

export const handleEnrollReject: LocalHandler = (ctx, params): HandlerResult => {
  if (!ctx.pendingEnrollments) {
    return {
      ok: false,
      code: 'feature_disabled',
      message: 'gateway 未初始化 pending enrollment registry',
    }
  }
  const parsed = otpParamSchema.safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_params',
      message: 'enroll.reject 缺少 otp',
      details: parsed.error.flatten(),
    }
  }
  const entry = ctx.pendingEnrollments.reject(parsed.data.otp)
  if (!entry) {
    // 未找到等同于"没人能 reject"——不报错,告知调用方 false。
    return { ok: true, result: { rejected: false } }
  }
  try {
    entry.ws.close(4403, 'enroll:rejected')
  }
  catch {
    // ws 已断:audit 仍要写。
  }
  ctx.persistence.recordAudit({
    actor: 'gateway',
    action: 'gateway.enrollment.rejected',
    workerId: entry.workerId,
    detail: {
      displayName: entry.displayName,
      otpHash: hashOtp(entry.otp),
    },
  })
  // FEAT-034 Phase 2：fleet UI 立即更新 pending 列表。
  broadcastEventToOperators(ctx.operators, {
    type: 'event',
    name: EVENTS.ENROLLMENT_PENDING,
    payload: {
      workerId: entry.workerId,
      ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
      otp: entry.otp,
      submittedAt: entry.submittedAt,
      expiresAt: entry.expiresAt,
      reason: 'rejected',
    },
    ts: Date.now(),
  })
  return { ok: true, result: { rejected: true } }
}

/**
 * 不消费队列地"偷看"某条 entry，只在 quota 决策路径上用——它不影响 list / 计时。
 * approve handler 需要先决定是否短路 quota_exceeded 再正式 pop;直接 pop 失败
 * 后再补回是不可逆的(timer 已 clear)。
 */
function peekPending(
  ctx: { pendingEnrollments?: { list: () => Array<{ otp: string, workerId: string }> } },
  otp: string,
): { workerId: string } | undefined {
  const found = ctx.pendingEnrollments?.list().find(e => e.otp === otp)
  return found ? { workerId: found.workerId } : undefined
}

/**
 * 截断的 sha256 十六进制——audit detail 不直接落明文 OTP，避免 fleet.db 拷贝
 * 出去后还能拿来批准已过期 / 已 reject 的请求。`length=16` (8 字节) 足以排查
 * 同名 displayName 的两次请求。
 */
function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex').slice(0, 16)
}
