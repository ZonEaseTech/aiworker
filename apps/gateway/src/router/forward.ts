import type { AnyWs } from '../registry/types'
import type { GatewayContext } from './context'
import { encodeFrame } from '@aiworker/gateway-proto'
import { z } from 'zod'

/**
 * operator-to-node 转发的通用实现。
 *
 * 流程：
 * 1. 从 params 中解析 workerId（所有 operator-to-node 方法的 params 都带
 *    workerId 字段——在 proto 的 method.params schema 里强校验过）。
 * 2. 若 node 不在线，立刻给 operator 回 `NODE_OFFLINE` 错误响应。
 * 3. 否则分配一个 gateway 侧新 request id，把 request 帧以新 id 发给 node，
 *    并把 `{operatorWs, operatorRequestId}` 记入 ForwardTable。
 * 4. node 响应回来后由 `handleNodeResponse`（见 dispatch.ts）根据 gateway 新
 *    id 找回原始 operator 连接 + 原始 id，然后回送。
 *
 * 返回是否实际转发成功：`false` 表示 gateway 已经直接给 operator 回了错误
 * 响应，调用方无需再处理；`true` 表示 pending 已经排队。
 */
export interface ForwardOperatorRequestArgs {
  ctx: GatewayContext
  operatorWs: AnyWs
  operatorRequestId: string
  method: string
  params: unknown
}

export function forwardOperatorRequestToNode(args: ForwardOperatorRequestArgs): boolean {
  const parsed = z.object({ workerId: z.string().min(1) }).safeParse(args.params)
  if (!parsed.success) {
    sendError(args.operatorWs, args.operatorRequestId, {
      code: 'invalid_params',
      message: `${args.method} 缺少 workerId`,
      details: parsed.error.flatten(),
    })
    return false
  }
  const { workerId } = parsed.data
  const node = args.ctx.nodes.get(workerId)
  if (!node) {
    sendError(args.operatorWs, args.operatorRequestId, {
      code: 'node_offline',
      message: `worker ${workerId} 当前未连接到 gateway`,
      details: { workerId },
    })
    return false
  }

  const pending = args.ctx.forwards.allocate({
    operatorRequestId: args.operatorRequestId,
    operatorWs: args.operatorWs,
    workerId,
    method: args.method,
  })

  try {
    node.ws.send(
      encodeFrame({
        type: 'request',
        id: pending.gatewayRequestId,
        method: args.method,
        params: args.params,
      }),
    )
    return true
  }
  catch (err) {
    args.ctx.forwards.consume(pending.gatewayRequestId)
    sendError(args.operatorWs, args.operatorRequestId, {
      code: 'forward_failed',
      message: `转发到 worker ${workerId} 失败: ${err instanceof Error ? err.message : String(err)}`,
      details: { workerId },
    })
    return false
  }
}

/** operator 端友好的错误响应发送。 */
function sendError(
  ws: AnyWs,
  requestId: string,
  err: { code: string, message: string, details?: unknown },
): void {
  const frame = encodeFrame({
    type: 'response',
    id: requestId,
    ok: false,
    error: err,
  })
  try {
    ws.send(frame)
  }
  catch {
    // operator 已经断开——忽略，disconnect 回调里会清理 pending。
  }
}
