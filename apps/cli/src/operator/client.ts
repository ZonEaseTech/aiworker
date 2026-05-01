// METHODS 只在 `typeof METHODS` 位置作类型查表使用，因此与其它类型一起按 type-only 引入。
import type {
  ConnectFrame,
  EventFrame,
  MethodDef,
  MethodName,
  METHODS,
  RequestFrame,
  ResponseError,
  ResponseFrame,
} from '@zonease/aiworker-gateway-proto'

import {
  encodeFrame,
  isKnownEvent,
  isKnownMethod,
  parseFrame,
  ROLES,
} from '@zonease/aiworker-gateway-proto'

/**
 * aiworker operator CLI 的 WebSocket 客户端封装。
 *
 * - 基于 Bun 内置的 `WebSocket`（DOM-style API），不依赖 `ws` npm 包。
 * - 连接建立后首帧必须发 `connect`，gateway 会据此完成 operator 身份校验并绑定 deviceId。
 * - `request<M>(method, params)` 类型化：根据 `METHODS[M]` 推导出 params / result 类型。
 * - 入站消息按 `type` 分发：`response` 通过 pending map 完成对应 id 的 promise；
 *   `event` 交给通过 `onEvent(name)` 注册的 handler；其它类型忽略并打 warning。
 * - 超时：每个 request 默认 30s，可以通过第三参覆盖；超时后 pending 会被清除并 reject。
 * - 关闭：`close()` 等待 socket readyState 变为 CLOSED；所有未决 request 被 reject。
 *
 * 自动重连未实现（留给后续阶段）。本次只保证"起一次连接 → 跑若干 request → 干净关闭"。
 */

/** 根据 METHODS 注册表反查 params / result 类型。 */
type MethodParams<M extends MethodName> = (typeof METHODS)[M] extends MethodDef<infer P, unknown> ? P : never
type MethodResult<M extends MethodName> = (typeof METHODS)[M] extends MethodDef<unknown, infer R> ? R : never

export interface ConnectOptions {
  url: string
  deviceId: string
  token: string
  /** 发送 connect 帧时携带的可选元数据（例如 aiworker 版本、hostname）。 */
  meta?: Record<string, string>
  /** 建立连接的超时，默认 10s。 */
  timeoutMs?: number
}

export interface RequestOptions {
  /** 单次 request 超时，默认 30s。 */
  timeoutMs?: number
  /** 关键 feature：允许调用方在超时前主动 abort。AbortSignal.reason 会成为 reject 原因。 */
  signal?: AbortSignal
}

export interface OperatorClient {
  connect: (opts: ConnectOptions) => Promise<void>
  request: <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
    opts?: RequestOptions,
  ) => Promise<MethodResult<M>>
  /** 原始 request：不走 METHODS 注册表，供测试或 gateway 预留方法用。 */
  requestRaw: (method: string, params: unknown, opts?: RequestOptions) => Promise<unknown>
  onEvent: (name: string, handler: (payload: unknown) => void) => () => void
  /** 关闭连接；可选 code / reason 下发给远端。 */
  close: (code?: number, reason?: string) => Promise<void>
  /** 当前连接是否仍可用（socket readyState === OPEN 且未触发 close）。 */
  isOpen: () => boolean
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
  signalCleanup: (() => void) | null
}

class OperatorWsError extends Error {
  constructor(message: string, public readonly code = 'operator_ws_error') {
    super(message)
    this.name = 'OperatorWsError'
  }
}

/**
 * 构造一个新的 aiworker operator WS 客户端。生命周期：
 *   const c = createOperatorClient()
 *   await c.connect({ url, deviceId, token })
 *   const res = await c.request('system.presence', {})
 *   await c.close()
 */
export function createOperatorClient(): OperatorClient {
  let ws: WebSocket | null = null
  let opened = false
  let closed = false
  const pending = new Map<string, PendingRequest>()
  const eventHandlers = new Map<string, Set<(payload: unknown) => void>>()

  function rejectAllPending(reason: unknown): void {
    for (const [, p] of pending) {
      if (p.timer)
        clearTimeout(p.timer)
      p.signalCleanup?.()
      p.reject(reason)
    }
    pending.clear()
  }

  function handleResponse(frame: ResponseFrame): void {
    const p = pending.get(frame.id)
    if (!p) {
      // 可能是已超时被清理的 request 迟到回包；忽略。
      return
    }
    pending.delete(frame.id)
    if (p.timer)
      clearTimeout(p.timer)
    p.signalCleanup?.()
    if (frame.ok) {
      p.resolve(frame.result)
    }
    else {
      const err = frame.error
      p.reject(new OperatorWsError(`${err.code}: ${err.message}`, err.code))
    }
  }

  function handleEvent(frame: EventFrame): void {
    const handlers = eventHandlers.get(frame.name)
    if (!handlers || handlers.size === 0)
      return
    // 事件 payload 的强类型校验交给调用方（EVENT_PAYLOADS[name].parse）——
    // 客户端这里只负责派发，避免未知事件被 drop。
    for (const h of handlers) {
      try {
        h(frame.payload)
      }
      catch {
        // handler 抛错不影响其它 handler / 不杀连接。调用方自己决定日志。
      }
    }
  }

  function onMessage(raw: string): void {
    const res = parseFrame(raw)
    if (!res.ok) {
      // 无法解析的帧忽略（已经不是我们认识的协议）。
      return
    }
    const frame = res.frame
    if (frame.type === 'response') {
      handleResponse(frame)
    }
    else if (frame.type === 'event') {
      handleEvent(frame)
    }
    // 'connect' / 'request' 不应由 gateway 主动推给 operator；忽略。
  }

  async function connect(opts: ConnectOptions): Promise<void> {
    if (opened)
      throw new OperatorWsError('aiworker client 已经连接', 'already_connected')

    const timeoutMs = opts.timeoutMs ?? 10_000

    await new Promise<void>((resolve, reject) => {
      let settled = false
      let sock: WebSocket
      try {
        sock = new WebSocket(opts.url)
      }
      catch (err) {
        reject(new OperatorWsError(
          `WebSocket 构造失败 (${opts.url}): ${err instanceof Error ? err.message : String(err)}`,
          'ws_construct_failed',
        ))
        return
      }
      ws = sock

      const timer = setTimeout(() => {
        if (settled)
          return
        settled = true
        try {
          sock.close()
        }
        catch {
          // 忽略关闭阶段的异常。
        }
        reject(new OperatorWsError(`连接 gateway 超时 (>${timeoutMs}ms): ${opts.url}`, 'connect_timeout'))
      }, timeoutMs)

      sock.onopen = () => {
        // open 之后立刻发 connect 帧，完成 operator 身份握手。
        const frame: ConnectFrame = {
          type: 'connect',
          role: ROLES.OPERATOR,
          agentId: opts.deviceId,
          deviceId: opts.deviceId,
          auth: { token: opts.token },
          ...(opts.meta ? { meta: opts.meta } : {}),
        }
        try {
          sock.send(encodeFrame(frame))
        }
        catch (err) {
          if (settled)
            return
          settled = true
          clearTimeout(timer)
          reject(new OperatorWsError(
            `发送 connect 帧失败: ${err instanceof Error ? err.message : String(err)}`,
            'connect_send_failed',
          ))
          return
        }
        // 注：本版本不要求 gateway 对 connect 帧返回 ack；我们把 onopen + 发送成功
        // 视作"连接建立"。真实 gateway 如果握手失败会在短时间内 close。
        if (!settled) {
          settled = true
          clearTimeout(timer)
          opened = true
          resolve()
        }
      }

      sock.onmessage = (ev: MessageEvent) => {
        // Bun 的 WebSocket 消息 payload 可能是 string 或 Buffer/Uint8Array；统一按 string 处理。
        const data = typeof ev.data === 'string'
          ? ev.data
          : ev.data instanceof ArrayBuffer
            ? new TextDecoder().decode(ev.data)
            : String(ev.data)
        onMessage(data)
      }

      sock.onerror = (ev: Event) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        const msg = (ev as unknown as { message?: string }).message ?? 'unknown'
        reject(new OperatorWsError(`WS 连接错误: ${msg}`, 'ws_error'))
      }

      sock.onclose = (ev: CloseEvent) => {
        closed = true
        opened = false
        rejectAllPending(new OperatorWsError(
          `WS 已关闭 (code=${ev.code}, reason=${ev.reason || 'n/a'})`,
          'ws_closed',
        ))
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new OperatorWsError(`WS 在握手阶段被关闭 (code=${ev.code})`, 'ws_closed_early'))
        }
      }
    })
  }

  function assertOpen(): void {
    if (!opened || closed || ws === null || ws.readyState !== WebSocket.OPEN)
      throw new OperatorWsError('aiworker client 未连接或已关闭', 'not_connected')
  }

  async function sendRequest(method: string, params: unknown, opts?: RequestOptions): Promise<unknown> {
    assertOpen()
    const id = crypto.randomUUID()
    const frame: RequestFrame = {
      type: 'request',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }

    return await new Promise<unknown>((resolve, reject) => {
      const timeoutMs = opts?.timeoutMs ?? 30_000
      let timer: ReturnType<typeof setTimeout> | null = null
      let signalCleanup: (() => void) | null = null

      const entry: PendingRequest = {
        resolve,
        reject,
        timer: null,
        signalCleanup: null,
      }

      timer = setTimeout(() => {
        pending.delete(id)
        signalCleanup?.()
        reject(new OperatorWsError(
          `request ${method} 超时 (>${timeoutMs}ms)`,
          'request_timeout',
        ))
      }, timeoutMs)
      entry.timer = timer

      if (opts?.signal) {
        const sig = opts.signal
        if (sig.aborted) {
          pending.delete(id)
          clearTimeout(timer)
          reject(sig.reason ?? new OperatorWsError(`request ${method} 被 abort`, 'aborted'))
          return
        }
        const onAbort = () => {
          pending.delete(id)
          if (timer)
            clearTimeout(timer)
          reject(sig.reason ?? new OperatorWsError(`request ${method} 被 abort`, 'aborted'))
        }
        sig.addEventListener('abort', onAbort, { once: true })
        signalCleanup = () => sig.removeEventListener('abort', onAbort)
        entry.signalCleanup = signalCleanup
      }

      pending.set(id, entry)

      try {
        ws?.send(encodeFrame(frame))
      }
      catch (err) {
        pending.delete(id)
        if (timer)
          clearTimeout(timer)
        signalCleanup?.()
        reject(new OperatorWsError(
          `request ${method} 发送失败: ${err instanceof Error ? err.message : String(err)}`,
          'send_failed',
        ))
      }
    })
  }

  async function request<M extends MethodName>(
    method: M,
    params: MethodParams<M>,
    opts?: RequestOptions,
  ): Promise<MethodResult<M>> {
    if (!isKnownMethod(method))
      throw new OperatorWsError(`method ${method} 未在 @zonease/aiworker-gateway-proto 注册`, 'unknown_method')
    return (await sendRequest(method, params, opts)) as MethodResult<M>
  }

  function onEvent(name: string, handler: (payload: unknown) => void): () => void {
    if (!isKnownEvent(name)) {
      // 允许订阅未知事件（未来 gateway 可能先于本仓库扩展事件集合），但至少提示。
      // 保留订阅能力：不抛错，仅 noop-friendly。
    }
    let set = eventHandlers.get(name)
    if (!set) {
      set = new Set()
      eventHandlers.set(name, set)
    }
    set.add(handler)
    return () => {
      const s = eventHandlers.get(name)
      if (!s)
        return
      s.delete(handler)
      if (s.size === 0)
        eventHandlers.delete(name)
    }
  }

  async function close(code?: number, reason?: string): Promise<void> {
    if (!ws || closed)
      return
    await new Promise<void>((resolve) => {
      const sock = ws
      if (!sock) {
        resolve()
        return
      }
      if (sock.readyState === WebSocket.CLOSED) {
        closed = true
        opened = false
        resolve()
        return
      }
      const prev = sock.onclose
      sock.onclose = (ev: CloseEvent) => {
        if (typeof prev === 'function')
          prev.call(sock, ev)
        resolve()
      }
      try {
        sock.close(code, reason)
      }
      catch {
        // 忽略关闭阶段的异常；onclose 仍会触发。
      }
    })
  }

  function isOpen(): boolean {
    return opened && !closed && ws !== null && ws.readyState === WebSocket.OPEN
  }

  return {
    connect,
    request,
    requestRaw: sendRequest,
    onEvent,
    close,
    isOpen,
  }
}

export { OperatorWsError }
export type { ResponseError }
