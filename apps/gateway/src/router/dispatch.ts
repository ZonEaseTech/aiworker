import type { EventFrame, Frame, RequestFrame, ResponseFrame } from '@aiworker/gateway-proto'
import type { AnyWs } from '../registry/types'
import type { GatewayContext, LocalHandler } from './context'
import { encodeFrame, getMethodDef, METHODS } from '@aiworker/gateway-proto'
import { broadcastEventToOperators } from '../events/broadcast'
import { forwardOperatorRequestToNode } from './forward'
import { handleSystemPresence } from './methods/system'
import { handleTokenRotate } from './methods/token'
import { handleWorkersLaunch, handleWorkersList, handleWorkersPair, handleWorkersRemove } from './methods/workers'

/** 本地方法名 → handler 映射。只覆盖 routing=operator-to-gateway 的。 */
const LOCAL_HANDLERS: Record<string, LocalHandler> = {
  'system.presence': handleSystemPresence,
  'workers.list': handleWorkersList,
  'workers.remove': handleWorkersRemove,
  'workers.pair': handleWorkersPair,
  'workers.launch': handleWorkersLaunch,
  'token.rotate': handleTokenRotate,
}

/**
 * audit 不应该被 presence / workers.list 这类高频只读 tick 淹没。
 * web UI 默认 10s 轮询 workers.list,一天积累 8640 条 audit——无意义。
 */
const AUDIT_METHOD_BLACKLIST = new Set<string>([
  'system.presence',
  'workers.list',
])

/**
 * 处理 operator 侧来的一条 request 帧。
 */
export async function dispatchOperatorRequest(
  ctx: GatewayContext,
  operatorWs: AnyWs,
  frame: RequestFrame,
  agentId: string,
): Promise<void> {
  const def = getMethodDef(frame.method)
  if (!def) {
    sendResponse(operatorWs, {
      type: 'response',
      id: frame.id,
      ok: false,
      error: {
        code: 'unknown_method',
        message: `未注册方法 ${frame.method}`,
        details: { method: frame.method },
      },
    })
    return
  }

  // 参数 schema 校验统一在入口做一次；handler 内部如需更细校验可再 parse。
  const paramResult = def.params.safeParse(frame.params ?? undefined)
  if (!paramResult.success) {
    sendResponse(operatorWs, {
      type: 'response',
      id: frame.id,
      ok: false,
      error: {
        code: 'invalid_params',
        message: `${frame.method} 参数校验失败`,
        details: paramResult.error.flatten(),
      },
    })
    return
  }
  const params = paramResult.data

  if (!AUDIT_METHOD_BLACKLIST.has(frame.method)) {
    ctx.persistence.recordAudit({
      actor: 'gateway',
      action: 'gateway.method.invoked',
      workerId: extractWorkerId(params),
      detail: { method: frame.method, agentId },
    })
  }

  if (def.routing === 'operator-to-gateway') {
    const handler = LOCAL_HANDLERS[frame.method]
    if (!handler) {
      // 方法在 proto 里标为 operator-to-gateway 但这里没挂 handler——属于新增
      // 方法忘记注册的实现 bug，回 500 显式提示。
      sendResponse(operatorWs, {
        type: 'response',
        id: frame.id,
        ok: false,
        error: {
          code: 'handler_missing',
          message: `方法 ${frame.method} 没有本地 handler 绑定`,
          details: { method: frame.method },
        },
      })
      return
    }
    try {
      const result = await handler(ctx, params)
      if (result.ok) {
        sendResponse(operatorWs, {
          type: 'response',
          id: frame.id,
          ok: true,
          result: result.result,
        })
      }
      else {
        sendResponse(operatorWs, {
          type: 'response',
          id: frame.id,
          ok: false,
          error: { code: result.code, message: result.message, details: result.details },
        })
      }
    }
    catch (err) {
      ctx.logger.error(`[gateway] handler ${frame.method} 抛出异常`, err)
      sendResponse(operatorWs, {
        type: 'response',
        id: frame.id,
        ok: false,
        error: {
          code: 'internal_error',
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }
    return
  }

  // operator-to-node：走通用转发
  forwardOperatorRequestToNode({
    ctx,
    operatorWs,
    operatorRequestId: frame.id,
    method: frame.method,
    params,
  })
}

/**
 * 处理 node 回来的 response 帧：根据 gateway 侧分配的 request id 反查 pending，
 * 还原 operator 原始 id 并把响应送回发起 operator。
 */
export function dispatchNodeResponse(
  ctx: GatewayContext,
  _nodeWs: AnyWs,
  frame: ResponseFrame,
): void {
  const pending = ctx.forwards.consume(frame.id)
  if (!pending) {
    ctx.logger.warn(`[gateway] 收到 node response 但找不到匹配的 pending (id=${frame.id})`)
    return
  }
  const out: ResponseFrame = frame.ok
    ? { type: 'response', id: pending.operatorRequestId, ok: true, result: frame.result }
    : { type: 'response', id: pending.operatorRequestId, ok: false, error: frame.error }
  try {
    pending.operatorWs.send(encodeFrame(out))
  }
  catch {
    // operator 已经断线：忽略，close 回调已经清理过 forwards（cancelByOperator）。
  }
}

/**
 * 处理 node 上行的 event 帧：当前策略是全量广播给所有 operator。
 * 校验到 event 帧本身即可，不对 payload 做二次 schema 校验（worker 侧先保证）。
 */
export function dispatchNodeEvent(
  ctx: GatewayContext,
  _nodeWs: AnyWs,
  frame: EventFrame,
): void {
  broadcastEventToOperators(ctx.operators, frame)
}

/**
 * 从 method params 中尝试取出 workerId，找不到返回 null。
 * 用于 audit_events 的 worker_id 列填充——即便 schema 没声明，也兜底。
 */
function extractWorkerId(params: unknown): string | null {
  if (params && typeof params === 'object' && 'workerId' in (params as Record<string, unknown>)) {
    const v = (params as Record<string, unknown>).workerId
    return typeof v === 'string' && v.length > 0 ? v : null
  }
  return null
}

function sendResponse(ws: AnyWs, frame: ResponseFrame): void {
  try {
    ws.send(encodeFrame(frame))
  }
  catch {
    // 连接已断开——忽略。
  }
}

/** 暴露内置的 LOCAL_HANDLERS 键集合，测试用来断言路由正确。 */
export function getLocalMethodNames(): string[] {
  return Object.keys(LOCAL_HANDLERS).sort()
}

/** 暴露 METHODS 的所有方法名（按字母序），供测试对齐用。 */
export function getProtoMethodNames(): string[] {
  return Object.keys(METHODS).sort()
}

/** 工具：按 proto 声明的 routing 判断方法是否应该走本地 handler。 */
export function isLocalMethod(method: string): boolean {
  return getMethodDef(method)?.routing === 'operator-to-gateway'
}

/** 为 Frame 提供 type guard，方便 server.ts 做 discriminated 路由。 */
export function isResponseFrame(frame: Frame): frame is ResponseFrame {
  return frame.type === 'response'
}
