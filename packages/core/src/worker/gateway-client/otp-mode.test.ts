import type {
  ConnectFrame,
  EnrollmentApprovedPayload,
  EnrollmentOtpPayload,
  Frame,
} from '@zonease/aiworker-gateway-proto'
import type { WebSocketCtor, WebSocketLike } from './client'
import type { RuntimeLike } from './dispatcher'

import { encodeFrame, EVENTS } from '@zonease/aiworker-gateway-proto'
import { describe, expect, it } from 'bun:test'

import { WorkerEventBus } from '../events/bus'
import { startGatewayNode } from './index'

/**
 * PLAN-019 / FEAT-026 — OTP enroll 模式下 client 行为：
 *  - connect 帧的 enroll 块只带 `mode='otp' + apiToken (+ displayName)`，
 *    不带 joinToken；
 *  - `enrollment.otp` event 触发 onEnrollmentOtp 回调；
 *  - `enrollment.approved` event 触发 onEnrollmentApproved 回调，并把
 *    client 内 `enrolledViaOtp` 翻成 true（断线重连后帧不再带 enroll 块）。
 */

const WS_OPEN = 1
const WS_CLOSED = 3
const VALID_API_TOKEN = `wtk_${'a'.repeat(43)}`

interface CapturedSocket {
  sent: string[]
  ws: WebSocketLike | null
  /** 已 open 过的 ws 数量——用于断言 reconnect 是否真的拨了第二条连接。 */
  opened: number
}

function makeMockSocketCtor(): { ctor: WebSocketCtor, captured: CapturedSocket } {
  const captured: CapturedSocket = { sent: [], ws: null, opened: 0 }
  class MockWebSocket implements WebSocketLike {
    readyState = WS_OPEN
    onopen: ((ev: unknown) => void) | null = null
    onclose: ((ev: { code: number, reason: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onmessage: ((ev: { data: unknown }) => void) | null = null
    constructor(_url: string) {
      captured.ws = this
      captured.opened += 1
      queueMicrotask(() => this.onopen?.({}))
    }

    send(data: string): void {
      captured.sent.push(data)
    }

    close(code = 1000, reason = 'mock-close'): void {
      this.readyState = WS_CLOSED
      this.onclose?.({ code, reason })
    }
  }
  return { ctor: MockWebSocket as unknown as WebSocketCtor, captured }
}

function decodeFrames(raw: string[]): Frame[] {
  return raw.map(line => JSON.parse(line) as Frame)
}

function stubRuntime(): RuntimeLike {
  return {
    bus: new WorkerEventBus(),
    orchestrator: { ingest: async () => undefined },
  }
}

describe('GatewayClient — OTP enroll 模式', () => {
  it('connect 帧 enroll 块只带 mode=otp + apiToken + displayName，不带 joinToken', async () => {
    const { ctor, captured } = makeMockSocketCtor()
    const runtime = stubRuntime()
    startGatewayNode({
      url: 'ws://mock/enroll-ws',
      token: VALID_API_TOKEN,
      workerId: 'w_otp_test',
      reconnect: false,
      enroll: { mode: 'otp', apiToken: VALID_API_TOKEN, displayName: '工位 A' },
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))

    const frames = decodeFrames(captured.sent)
    expect(frames[0]?.type).toBe('connect')
    const connect = frames[0] as ConnectFrame
    expect(connect.enroll).toBeDefined()
    expect(connect.enroll!.mode).toBe('otp')
    expect(connect.enroll!.apiToken).toBe(VALID_API_TOKEN)
    expect(connect.enroll!.displayName).toBe('工位 A')
    expect(connect.enroll!.joinToken).toBeUndefined()
  })

  it('收 enrollment.otp event → 调 onEnrollmentOtp(payload)', async () => {
    const { ctor, captured } = makeMockSocketCtor()
    const runtime = stubRuntime()
    const otpCalls: EnrollmentOtpPayload[] = []
    startGatewayNode({
      url: 'ws://mock/enroll-ws',
      token: VALID_API_TOKEN,
      workerId: 'w_otp_test',
      reconnect: false,
      enroll: { mode: 'otp', apiToken: VALID_API_TOKEN },
      onEnrollmentOtp: payload => otpCalls.push(payload),
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))

    const expiresAt = Date.now() + 300_000
    captured.ws?.onmessage?.({
      data: encodeFrame({
        type: 'event',
        name: EVENTS.ENROLLMENT_OTP,
        ts: Date.now(),
        payload: { workerId: 'w_otp_test', otp: 'BX7P-K39M', expiresAt },
      }),
    })
    expect(otpCalls).toHaveLength(1)
    expect(otpCalls[0]?.otp).toBe('BX7P-K39M')
    expect(otpCalls[0]?.expiresAt).toBe(expiresAt)
  })

  it('收 enrollment.approved event → 调 onEnrollmentApproved(payload) 并翻 enrolledViaOtp', async () => {
    const { ctor, captured } = makeMockSocketCtor()
    const runtime = stubRuntime()
    const approvedCalls: EnrollmentApprovedPayload[] = []
    startGatewayNode({
      url: 'ws://mock/enroll-ws',
      token: VALID_API_TOKEN,
      workerId: 'w_otp_test',
      reconnect: false,
      enroll: { mode: 'otp', apiToken: VALID_API_TOKEN },
      onEnrollmentApproved: payload => approvedCalls.push(payload),
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))

    captured.ws?.onmessage?.({
      data: encodeFrame({
        type: 'event',
        name: EVENTS.ENROLLMENT_APPROVED,
        ts: Date.now(),
        payload: { workerId: 'w_otp_test', deviceToken: VALID_API_TOKEN },
      }),
    })
    expect(approvedCalls).toHaveLength(1)
    expect(approvedCalls[0]?.deviceToken).toBe(VALID_API_TOKEN)
  })

  it('approved 之后断线重连：第二次 connect 帧不再带 enroll 块（plain node connect）', async () => {
    const { ctor, captured } = makeMockSocketCtor()
    const runtime = stubRuntime()
    const node = startGatewayNode({
      url: 'ws://mock/enroll-ws',
      token: VALID_API_TOKEN,
      workerId: 'w_otp_test',
      // 启用重连：模拟第一次 close 后自动 dial 第二次。
      reconnect: true,
      initialReconnectDelayMs: 1,
      maxReconnectDelayMs: 1,
      enroll: { mode: 'otp', apiToken: VALID_API_TOKEN },
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))

    // 模拟 gateway approve：推 enrollment.approved，标记 enrolledViaOtp。
    captured.ws?.onmessage?.({
      data: encodeFrame({
        type: 'event',
        name: EVENTS.ENROLLMENT_APPROVED,
        ts: Date.now(),
        payload: { workerId: 'w_otp_test', deviceToken: VALID_API_TOKEN },
      }),
    })

    // 断开当前 ws，触发指数退避重连。
    const sentBeforeReconnect = captured.sent.length
    captured.ws?.close(1006, 'transport-drop')
    await new Promise(r => setTimeout(r, 30))

    expect(captured.opened).toBeGreaterThanOrEqual(2)
    // 第二次 connect 帧出现在 sent[sentBeforeReconnect] 处。
    const reconnectFrame = decodeFrames(captured.sent.slice(sentBeforeReconnect))[0]
    expect(reconnectFrame?.type).toBe('connect')
    const connect = reconnectFrame as ConnectFrame
    expect(connect.enroll).toBeUndefined()
    // token 仍是 worker 自己 mint 的 apiToken（OTP 模式 token=apiToken）。
    expect(connect.auth.token).toBe(VALID_API_TOKEN)

    await node.stop()
  })
})
