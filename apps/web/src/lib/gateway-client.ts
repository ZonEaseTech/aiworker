import type { EventName, Frame, MethodName } from '@zonease/aiworker-gateway-proto'
import { encodeFrame, parseFrame } from '@zonease/aiworker-gateway-proto'

/**
 * 浏览器侧 gateway WS 单例客户端。
 *
 * 作用:
 * - 与 `@zonease/aiworker-gateway` 建立一条持久 WS 连接(默认 `ws(s)://${location.host}/ws`),
 *   在 `connect` 帧里声明 role=`operator` + 一个本地生成的 agentId;
 * - 暴露 `request(method, params)`——每次分配 uuid,把 `request` 帧发给 gateway,
 *   等 `response` 帧按 id 匹配回来,resolve 或 reject;
 * - 暴露 `onEvent(name, handler)`——订阅 gateway 广播的 event 帧;
 * - 断线时自动指数退避重连;重连成功后已订阅的 event 继续生效(已在途的 request
 *   会被 reject,因为 ids 在 gateway 侧重启后是陌生的)。
 *
 * 刻意不依赖 `ws` npm 包——直接用浏览器原生 WebSocket。
 */

/** `GatewayApiError` —— gateway 返回非 ok=true response 时抛出的业务错误。 */
export class GatewayApiError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'GatewayApiError'
    this.code = code
    this.details = details
  }
}

export class GatewayConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatewayConnectionError'
  }
}

type EventHandler = (payload: unknown) => void

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
}

function defaultGatewayUrl(): string {
  if (typeof window === 'undefined')
    return 'ws://127.0.0.1:3000/ws'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

function randomAgentId(): string {
  // crypto.randomUUID 在所有支持 WebSocket 的浏览器都能用;Node/Bun 里也存在。
  return `web-${crypto.randomUUID()}`
}

export interface GatewayClientOptions {
  url?: string
  /** 可选 bearer secret(远程跨网部署需要)。Caddy 回源走 127.0.0.1 时无需填。 */
  token?: string
  /** 请求超时(毫秒),默认 30_000。 */
  requestTimeoutMs?: number
  /** 重连退避基数(毫秒),默认 500;最大 30s。 */
  reconnectBaseMs?: number
}

/**
 * 单例 gateway client。首次 `getGatewayClient()` 时建立连接,之后复用。
 */
export class GatewayClient {
  private readonly url: string
  private readonly token: string
  private readonly requestTimeoutMs: number
  private readonly reconnectBaseMs: number
  private readonly agentId: string
  private readonly deviceId: string
  private ws: WebSocket | null = null
  private handshakeDone = false
  private readonly pending: Map<string, Pending> = new Map()
  private readonly handlers: Map<EventName, Set<EventHandler>> = new Map()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null

  constructor(options: GatewayClientOptions = {}) {
    this.url = options.url ?? defaultGatewayUrl()
    this.token = options.token ?? ''
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.reconnectBaseMs = options.reconnectBaseMs ?? 500
    this.agentId = randomAgentId()
    // deviceId 用于区分同一个 operator 账号的多个 tab——每个 tab 一个。
    this.deviceId = `browser-${crypto.randomUUID()}`
    this.connect()
  }

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.handshakeDone = false
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })
    try {
      this.ws = new WebSocket(this.url)
    }
    catch (err) {
      this.scheduleReconnect()
      console.warn('[gateway-client] new WebSocket failed', err)
      return
    }
    this.ws.onopen = () => {
      const frame = {
        type: 'connect' as const,
        role: 'operator' as const,
        agentId: this.agentId,
        deviceId: this.deviceId,
        auth: { token: this.token },
      }
      try {
        this.ws!.send(encodeFrame(frame))
        this.handshakeDone = true
        this.reconnectAttempt = 0
        this.readyResolve?.()
      }
      catch (err) {
        console.warn('[gateway-client] 发送 connect 帧失败', err)
      }
    }
    this.ws.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : ''
      if (!raw)
        return
      const parsed = parseFrame(raw)
      if (!parsed.ok) {
        console.warn('[gateway-client] 解析 frame 失败', parsed.error)
        return
      }
      this.handleFrame(parsed.frame)
    }
    this.ws.onerror = () => {
      // 真正的 reconnect 由 onclose 处理。
    }
    this.ws.onclose = () => {
      this.handshakeDone = false
      this.rejectAllPending(new GatewayConnectionError('gateway 连接已断开'))
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer)
      return
    this.reconnectAttempt += 1
    const delay = Math.min(30_000, this.reconnectBaseMs * 2 ** Math.min(6, this.reconnectAttempt))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private rejectAllPending(err: unknown): void {
    for (const [, p] of this.pending) {
      if (p.timer)
        clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }

  private handleFrame(frame: Frame): void {
    if (frame.type === 'response') {
      const pending = this.pending.get(frame.id)
      if (!pending)
        return
      this.pending.delete(frame.id)
      if (pending.timer)
        clearTimeout(pending.timer)
      if (frame.ok) {
        pending.resolve(frame.result)
      }
      else {
        pending.reject(new GatewayApiError(frame.error.code, frame.error.message, frame.error.details))
      }
      return
    }
    if (frame.type === 'event') {
      const subs = this.handlers.get(frame.name as EventName)
      if (!subs)
        return
      for (const h of subs) {
        try {
          h(frame.payload)
        }
        catch (err) {
          console.warn(`[gateway-client] event handler for ${frame.name} threw`, err)
        }
      }
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.handshakeDone)
      return
    if (!this.readyPromise)
      this.readyPromise = Promise.resolve()
    await Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new GatewayConnectionError('gateway 连接就绪超时')), this.requestTimeoutMs)
      }),
    ])
  }

  /**
   * 发起一次 request。返回 gateway 侧 result(未经二次校验)。
   * - 非 ok=true 的 response 会抛出 `GatewayApiError`。
   * - 连接断开时抛 `GatewayConnectionError`。
   */
  async request<R = unknown>(method: MethodName | string, params: unknown = {}): Promise<R> {
    await this.ensureReady()
    const id = crypto.randomUUID()
    const encoded = encodeFrame({
      type: 'request',
      id,
      method,
      params,
    })
    return await new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new GatewayApiError('timeout', `${method} 等待 gateway 响应超时 (${this.requestTimeoutMs}ms)`))
      }, this.requestTimeoutMs)
      this.pending.set(id, {
        resolve: (v) => { resolve(v as R) },
        reject,
        timer,
      })
      try {
        this.ws!.send(encoded)
      }
      catch (err) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(new GatewayConnectionError(`gateway 连接不可用: ${err instanceof Error ? err.message : String(err)}`))
      }
    })
  }

  onEvent(name: EventName, handler: EventHandler): () => void {
    let set = this.handlers.get(name)
    if (!set) {
      set = new Set()
      this.handlers.set(name, set)
    }
    set.add(handler)
    return () => {
      const s = this.handlers.get(name)
      if (!s)
        return
      s.delete(handler)
      if (s.size === 0)
        this.handlers.delete(name)
    }
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    try {
      this.ws?.close(1000, 'client_close')
    }
    catch { /* 忽略 */ }
    this.rejectAllPending(new GatewayConnectionError('gateway client closed'))
  }
}

let instance: GatewayClient | null = null

/** 返回单例 GatewayClient。仅在浏览器里使用。 */
export function getGatewayClient(): GatewayClient {
  if (!instance)
    instance = new GatewayClient()
  return instance
}

/** 测试用:重置单例。 */
export function __resetGatewayClientForTests(): void {
  if (instance) {
    void instance.close()
    instance = null
  }
}
