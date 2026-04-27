import type { ResponseFrame } from '@zonease/aiworker-gateway-proto'
import type { AnyWs } from '../../registry/types'
import type { GatewayContext, HandlerResult, LocalHandler } from '../context'
import { Buffer } from 'node:buffer'
import { encodeFrame } from '@zonease/aiworker-gateway-proto'
import { z } from 'zod'

/**
 * `token.rotate` 在 proto 里是 `operator-to-gateway`,但实际上需要 gateway 协作:
 *
 *   1. gateway 把请求转发给目标 node(让 worker mint 新 token);
 *   2. node 回来后 gateway 立刻把新 token 重加密写入 fleet.db;
 *   3. 把新 token 明文返回 operator 一次(之后只存密文)。
 *
 * 实现思路:复用 `ForwardTable`,但把 `operatorWs` 替换成 `InterceptWs`——它的
 * `send()` 会截获 dispatchNodeResponse / onExpire 回来的 frame,解析后:
 *   - ok=true + deviceToken 合法 → 更新 fleet.db + resolve(ok=true);
 *   - 非法 / ok=false → resolve(错误码透传);
 *   - `node_gone` / `timeout`(来自 onExpire 注入的错误 frame)→ 原样透传。
 *
 * 这样无需改 dispatch / forward 内部实现。
 */

const rotateParamsSchema = z.object({ workerId: z.string().min(1) })

export const handleTokenRotate: LocalHandler = async (ctx, params): Promise<HandlerResult> => {
  const parsed = rotateParamsSchema.safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_params',
      message: 'token.rotate 缺少 workerId',
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
  const { workerId } = parsed.data
  const existing = ctx.persistence.getRegisteredWorker(workerId)
  if (!existing) {
    return { ok: false, code: 'not_found', message: `worker ${workerId} 不在 fleet 中` }
  }
  const node = ctx.nodes.get(workerId)
  if (!node) {
    return { ok: false, code: 'node_offline', message: `worker ${workerId} 未连接到 gateway` }
  }

  return await new Promise<HandlerResult>((resolve) => {
    const interceptor = new InterceptWs(resolve, ctx, workerId)
    const pending = ctx.forwards.allocate({
      operatorRequestId: `internal:token-rotate:${workerId}:${Date.now()}`,
      operatorWs: interceptor as unknown as AnyWs,
      workerId,
      method: 'token.rotate',
    })
    try {
      node.ws.send(encodeFrame({
        type: 'request',
        id: pending.gatewayRequestId,
        method: 'token.rotate',
        params: { workerId },
      }))
    }
    catch (err) {
      ctx.forwards.consume(pending.gatewayRequestId)
      resolve({
        ok: false,
        code: 'forward_failed',
        message: `token.rotate 发往 worker 失败: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  })
}

/**
 * 拦截 ws 伪实现:`send()` 解析 response frame → 更新 fleet.db → resolve。
 * 不实现任何真实 WS 行为,只服务于 handleTokenRotate。
 */
class InterceptWs {
  constructor(
    private readonly resolve: (r: HandlerResult) => void,
    private readonly ctx: GatewayContext,
    private readonly workerId: string,
  ) {}

  send(raw: string | Uint8Array | ArrayBuffer): void {
    const text = typeof raw === 'string'
      ? raw
      : raw instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(raw)).toString('utf8')
        : Buffer.from(raw).toString('utf8')
    let parsed: ResponseFrame
    try {
      parsed = JSON.parse(text) as ResponseFrame
    }
    catch (err) {
      this.resolve({
        ok: false,
        code: 'internal_error',
        message: `token.rotate: 无法解析 node 响应: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }
    if (parsed.type !== 'response') {
      this.resolve({ ok: false, code: 'internal_error', message: 'token.rotate: 非 response frame' })
      return
    }
    if (!parsed.ok) {
      this.resolve({
        ok: false,
        code: parsed.error.code,
        message: parsed.error.message,
        details: parsed.error.details,
      })
      return
    }
    const result = parsed.result as { deviceToken?: unknown } | undefined
    const newToken = result?.deviceToken
    if (typeof newToken !== 'string' || newToken.length === 0) {
      this.resolve({
        ok: false,
        code: 'invalid_worker_response',
        message: 'token.rotate: node 返回的 deviceToken 缺失或非字符串',
      })
      return
    }
    const updated = this.ctx.persistence.updateEncryptedToken(
      { workerId: this.workerId, newToken },
      this.ctx.masterKeyHex!,
    )
    if (!updated) {
      this.resolve({
        ok: false,
        code: 'not_found',
        message: `worker ${this.workerId} 在 token.rotate 回调期间已被删除`,
      })
      return
    }
    this.ctx.persistence.recordAudit({
      actor: 'gateway',
      action: 'gateway.token.rotated',
      workerId: this.workerId,
      detail: { lastFour: newToken.slice(-4) },
    })
    this.resolve({ ok: true, result: { deviceToken: newToken } })
  }

  close(): void { /* no-op */ }

  // WS 回调层检查 operatorWs === ws 时用到的引用比较,无需额外方法。
}
