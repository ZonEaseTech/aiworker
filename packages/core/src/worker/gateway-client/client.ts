import type {
  ConnectFrame,
  EnrollmentApprovedPayload,
  EnrollmentOtpPayload,
  Frame,
} from '@zonease/aiworker-gateway-proto'
import type { ResolvedGatewayNodeOptions } from './config'

import {
  encodeFrame,
  enrollmentApprovedPayloadSchema,
  enrollmentOtpPayloadSchema,
  EVENTS,
  parseFrame,
  ROLES,
} from '@zonease/aiworker-gateway-proto'

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
  /**
   * PLAN-019：OTP enroll 模式下，gateway 在握手后会立即推 `enrollment.otp`
   * 事件，client 把 payload 透传给上层（serve.ts 渲染到 stdout 给 deployer）。
   */
  onEnrollmentOtp?: (payload: EnrollmentOtpPayload) => void
  /**
   * PLAN-019：operator 调 `enroll.approve` 后 gateway 推 `enrollment.approved`，
   * client 把 deviceToken 透传给上层。client 内部会在收到此事件时把 enroll
   * 状态翻成"已接入"，后续 reconnect 帧不再带 enroll 块（改为 plain
   * connect with token=apiToken），见 `enrolledViaOtp` 字段。
   */
  onEnrollmentApproved?: (payload: EnrollmentApprovedPayload) => void
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
  /**
   * PLAN-019：OTP enroll 一旦被 operator approve，标记为已接入。后续重连
   * 时 connect 帧不再带 `enroll` 块——改成普通 node connect（auth.token =
   * apiToken），由 gateway 按 fleet.db 中已落 row 验证身份。
   */
  private enrolledViaOtp = false

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
      // PLAN-019：mode='otp' 时 enroll 块只带 apiToken/displayName，不带
      // joinToken；OTP approve 后 `enrolledViaOtp=true`，重连帧不再带 enroll
      // 块，改为普通 node connect（gateway 按 fleet.db 行 + auth.token 验证）。
      const enroll = this.deps.options.enroll
      const enrollBlock = enroll === undefined || this.enrolledViaOtp
        ? undefined
        : enroll.mode === 'otp'
          ? {
              mode: 'otp' as const,
              apiToken: enroll.apiToken,
              ...(enroll.displayName ? { displayName: enroll.displayName } : {}),
            }
          : {
              apiToken: enroll.apiToken,
              joinToken: enroll.joinToken,
              ...(enroll.displayName ? { displayName: enroll.displayName } : {}),
            }
      const connectFrame: ConnectFrame = {
        type: 'connect',
        role: ROLES.NODE,
        agentId: this.deps.options.workerId,
        deviceId: this.deps.options.deviceId,
        auth: { token: this.deps.options.token },
        ...(this.deps.options.displayName
          ? { meta: { displayName: this.deps.options.displayName } }
          : {}),
        ...(enrollBlock ? { enroll: enrollBlock } : {}),
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
      // PLAN-019：enrollment.otp / enrollment.approved 这俩 event 是面向 OTP
      // 流程的内部信令，dispatcher 看不懂；直接在 client 层解码后调专用回调。
      // 其它 event / request / response 仍按既有逻辑透传给 onFrame。
      const frame = parsed.frame
      if (frame.type === 'event' && frame.name === EVENTS.ENROLLMENT_OTP) {
        const payload = enrollmentOtpPayloadSchema.safeParse(frame.payload)
        if (!payload.success) {
          consola.warn(`[gateway-client ${workerId}] enrollment.otp payload invalid: ${payload.error.message}`)
          return
        }
        try {
          this.deps.onEnrollmentOtp?.(payload.data)
        }
        catch (err) {
          consola.error(`[gateway-client ${workerId}] onEnrollmentOtp threw: ${String(err)}`)
        }
        return
      }
      if (frame.type === 'event' && frame.name === EVENTS.ENROLLMENT_APPROVED) {
        const payload = enrollmentApprovedPayloadSchema.safeParse(frame.payload)
        if (!payload.success) {
          consola.warn(`[gateway-client ${workerId}] enrollment.approved payload invalid: ${payload.error.message}`)
          return
        }
        // 标记已接入：下次断线重连不再发 enroll 块，token=apiToken 走普通 connect。
        this.enrolledViaOtp = true
        try {
          this.deps.onEnrollmentApproved?.(payload.data)
        }
        catch (err) {
          consola.error(`[gateway-client ${workerId}] onEnrollmentApproved threw: ${String(err)}`)
        }
        return
      }
      try {
        this.deps.onFrame(frame)
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
