import type { ConnectFrame, Frame } from '@aiworker/gateway-proto'
import type { ResolvedGatewayNodeOptions } from './config'

import { encodeFrame, parseFrame, ROLES } from '@aiworker/gateway-proto'

import consola from 'consola'

/**
 * 可注入的 WebSocket 构造器（方便测试用 mock）。默认走 global WebSocket
 * （Bun / Node 22+ 原生提供）。
 */
export type WebSocketCtor = new (url: string) => WebSocketLike

/**
 * 我们只依赖标准 WS 的 4 个方法 + 4 个事件。比 `typeof WebSocket` 更窄，
 * 方便 mock。
 */
export interface WebSocketLike {
  readyState: number
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: { code: number, reason: string }) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}

const WS_OPEN = 1

export interface GatewayClientDeps {
  options: ResolvedGatewayNodeOptions
  /** 解析后的入站 frame 交给调用方处理（dispatcher）。 */
  onFrame: (frame: Frame) => void
  /** 每次 WS open 且发出 connect 帧后回调，供 subscriber 重新订阅 bus。 */
  onConnected: () => void
  /** WS 关闭后回调；reason 只做日志用途。 */
  onDisconnected: (reason: string) => void
  /** 测试注入：构造 WebSocket 的工厂。默认用 globalThis.WebSocket。 */
  webSocketCtor?: WebSocketCtor
}

/**
 * 维护一条长连接到 gateway 的 WS：
 * - 连上后立刻发 `connect` 帧（role=node）完成身份握手；
 * - 解析入站 frame，有效的抛给 onFrame；
 * - 断线后根据 options.reconnect 做指数退避重连；
 * - 调用方通过 stop() 优雅关闭，reconnect 会被永久关停。
 */
export class GatewayClient {
  private ws: WebSocketLike | null = null
  private reconnectDelay: number
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private readonly WebSocketCtor: WebSocketCtor

  constructor(private readonly deps: GatewayClientDeps) {
    this.reconnectDelay = deps.options.initialReconnectDelayMs
    const globalCtor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket
    const ctor = deps.webSocketCtor ?? globalCtor
    if (!ctor)
      throw new Error('gateway-client: no WebSocket implementation available (set deps.webSocketCtor)')
    this.WebSocketCtor = ctor
  }

  /** 发起首次连接；调用方应只调一次。 */
  start(): void {
    this.openSocket()
  }

  /**
   * 优雅关停：禁用后续重连，关闭当前 socket。返回 Promise 在 onclose
   * 触发后 resolve（最多 2s 强行 resolve，避免 test hang）。
   */
  async stop(): Promise<void> {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const ws = this.ws
    this.ws = null
    if (!ws)
      return
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 2_000)
      ws.onclose = () => {
        clearTimeout(timer)
        resolve()
      }
      try {
        ws.close(1000, 'node-shutdown')
      }
      catch {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  /** 外发一个 frame；未连通则直接丢弃并 warn（调用方决定是否重试）。 */
  send(frame: Frame): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WS_OPEN) {
      consola.warn(`[gateway-client ${this.deps.options.workerId}] send dropped: socket not open`)
      return
    }
    try {
      ws.send(encodeFrame(frame))
    }
    catch (err) {
      consola.warn(`[gateway-client ${this.deps.options.workerId}] send failed: ${String(err)}`)
    }
  }

  private openSocket(): void {
    const { url, workerId } = this.deps.options
    consola.info(`[gateway-client ${workerId}] connecting to ${url}`)
    let ws: WebSocketLike
    try {
      ws = new this.WebSocketCtor(url)
    }
    catch (err) {
      consola.warn(`[gateway-client ${workerId}] ws ctor threw: ${String(err)}`)
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      // 握手：发 connect 帧。agentId 用 workerId；deviceId 由 options 决定。
      // PLAN-018：若调用方传了 `enroll` 块，原样透传到帧里——gateway 看到
      // enroll 字段 + JOIN_TOKEN 匹配即落 fleet.db；未传则走现有路径
      // （gateway 仅校验 auth.token / loopback bypass）。
      const connectFrame: ConnectFrame = {
        type: 'connect',
        role: ROLES.NODE,
        agentId: this.deps.options.workerId,
        deviceId: this.deps.options.deviceId,
        auth: { token: this.deps.options.token },
        ...(this.deps.options.displayName
          ? { meta: { displayName: this.deps.options.displayName } }
          : {}),
        ...(this.deps.options.enroll
          ? {
              enroll: {
                joinToken: this.deps.options.enroll.joinToken,
                apiToken: this.deps.options.enroll.apiToken,
                ...(this.deps.options.enroll.displayName
                  ? { displayName: this.deps.options.enroll.displayName }
                  : {}),
              },
            }
          : {}),
      }
      try {
        ws.send(encodeFrame(connectFrame))
      }
      catch (err) {
        consola.warn(`[gateway-client ${workerId}] connect frame send failed: ${String(err)}`)
        return
      }
      // 连上一次就把退避归零；下一次断线从 initialReconnectDelayMs 开始
      this.reconnectDelay = this.deps.options.initialReconnectDelayMs
      consola.success(`[gateway-client ${workerId}] connected, node=${this.deps.options.deviceId}`)
      this.deps.onConnected()
    }
    ws.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data)
      const parsed = parseFrame(raw)
      if (!parsed.ok) {
        consola.warn(`[gateway-client ${workerId}] drop malformed frame: ${parsed.error}`)
        return
      }
      try {
        this.deps.onFrame(parsed.frame)
      }
      catch (err) {
        consola.error(`[gateway-client ${workerId}] onFrame threw: ${String(err)}`)
      }
    }
    ws.onerror = (ev) => {
      // 不在 onerror 里重连——统一走 onclose（所有 transport 错误最终都会关掉 socket）
      consola.warn(`[gateway-client ${workerId}] ws error: ${String((ev as { message?: string })?.message ?? ev)}`)
    }
    ws.onclose = (ev) => {
      if (this.ws === ws)
        this.ws = null
      const reason = `code=${ev.code} reason=${ev.reason || 'n/a'}`
      this.deps.onDisconnected(reason)
      if (this.stopped)
        return
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped)
      return
    if (!this.deps.options.reconnect) {
      consola.info(`[gateway-client ${this.deps.options.workerId}] reconnect disabled, giving up`)
      return
    }
    const delay = Math.min(this.reconnectDelay, this.deps.options.maxReconnectDelayMs)
    consola.info(`[gateway-client ${this.deps.options.workerId}] reconnect in ${delay}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
    // 退避：下次翻倍（封顶由 openSocket 里用 Math.min 保证）
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.deps.options.maxReconnectDelayMs)
  }
}
