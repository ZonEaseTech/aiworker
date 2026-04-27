import type { HandlerResult, LocalHandler } from '../context'
import { createHash } from 'node:crypto'
import { encodeFrame, EVENTS, pendingEnrollmentSchema } from '@aiworker/gateway-proto'
import { z } from 'zod'

/**
 * PLAN-019：OTP-attended enrollment 的 operator 端方法。
 *
 * - `enroll.list`：列出当前所有待批项（来自 `ctx.pendingEnrollments`）。
 * - `enroll.approve`：取出 entry → 配额 / masterKey 校验 → upsertEnrolledWorker
 *   `addedBy='otp'` → 通过 entry.ws 推 `enrollment.approved` 事件 →
 *   audit `gateway.enrollment.approved`。
 * - `enroll.reject`：取出 entry → close 4403 → audit `gateway.enrollment.rejected`。
 *
 * 注意：handler 不在这里把 ws 升级注册成 NodeRegistry。S3（server.ts 路径感知
 * connect）会在同一个 entry.ws 上接管：S3 要么扩展本 handler 在 approve 后做
 * 注册，要么靠 worker 在收到 enrollment.approved 后立即重连普通 `/ws`——具体
 * 留 S3 决定。S2 阶段保持"事件 + 持久化"职责单一。
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

  // 通过原 ws 把 enrollment.approved 事件推回 worker——worker 拿到 deviceToken
  // 后即可视作 enrollment 完成,后续如何升级连接由 S3/S4 决定。
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
