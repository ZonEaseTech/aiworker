import type { EventName } from '@zonease/aiworker-gateway-proto'
import { encodeFrame } from '@zonease/aiworker-gateway-proto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetGatewayClientForTests, GatewayClient } from '../gateway-client'

/**
 * FEAT-034 Phase 2 — `getGatewayClient().onEvent()` 必须在多个 React 组件
 * 同时订阅同一 event name 时各自正常分发：
 *
 *   1. 多 subscriber 并存时每条入站 event 都被广播给所有 subscriber；
 *   2. 单个 subscriber unsubscribe 不影响其它 subscriber；
 *   3. handler 抛错不应阻断其它 subscriber 的回调（与生产实现一致：
 *      console.warn 兜底 + try/catch swallow）；
 *   4. event 名不匹配的订阅不会被误触发。
 *
 * 走测试用 stub WebSocket 而非真 ws：fleet UI 是单例 client，跨 React 组件
 * 共享 onEvent，注入的 mock socket 让测试可以稳定回放任意 frame。
 */

interface FakeWebSocket {
  url: string
  onopen: ((ev?: unknown) => void) | null
  onclose: ((ev?: { code?: number, reason?: string }) => void) | null
  onerror: ((ev?: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  readyState: number
  send: (msg: string) => void
  close: () => void
}

function installFakeWs() {
  let last: FakeWebSocket | null = null
  const sentFrames: string[] = []
  function FakeWs(url: string) {
    const socket: FakeWebSocket = {
      url,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      readyState: 0,
      send(msg: string) {
        sentFrames.push(msg)
      },
      close() {
        socket.readyState = 3
        socket.onclose?.({ code: 1000, reason: 'client_close' })
      },
    }
    last = socket
    // 同步触发 open，让 connect 帧被立即 send 出去，简化测试同步性。
    queueMicrotask(() => {
      socket.readyState = 1
      socket.onopen?.()
    })
    return socket
  }
  ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket
    = FakeWs as unknown as typeof WebSocket
  return {
    getLast: () => last,
    sentFrames,
  }
}

afterEach(() => {
  __resetGatewayClientForTests()
})

describe('gatewayClient.onEvent multi-subscriber', () => {
  it('每条入站 event 被广播给所有 subscriber', async () => {
    const { getLast } = installFakeWs()
    const client = new GatewayClient({ url: 'ws://test/ws', requestTimeoutMs: 1000 })
    await waitOpen()

    const sub1 = vi.fn()
    const sub2 = vi.fn()
    const sub3 = vi.fn()
    client.onEvent('worker.online' as EventName, sub1)
    client.onEvent('worker.online' as EventName, sub2)
    client.onEvent('worker.online' as EventName, sub3)

    deliver(getLast(), {
      type: 'event',
      name: 'worker.online',
      payload: { workerId: 'w_1', deviceId: 'd_1', connectedAt: Date.now() },
      ts: Date.now(),
    })

    expect(sub1).toHaveBeenCalledTimes(1)
    expect(sub2).toHaveBeenCalledTimes(1)
    expect(sub3).toHaveBeenCalledTimes(1)
    expect(sub1.mock.calls[0]![0]).toMatchObject({ workerId: 'w_1' })

    await client.close()
  })

  it('单个 subscriber unsubscribe 不影响其它 subscriber', async () => {
    const { getLast } = installFakeWs()
    const client = new GatewayClient({ url: 'ws://test/ws', requestTimeoutMs: 1000 })
    await waitOpen()

    const sub1 = vi.fn()
    const sub2 = vi.fn()
    const off1 = client.onEvent('enrollment.pending' as EventName, sub1)
    client.onEvent('enrollment.pending' as EventName, sub2)
    off1()

    deliver(getLast(), {
      type: 'event',
      name: 'enrollment.pending',
      payload: {
        workerId: 'w_2',
        otp: 'AAAA-BBBB',
        submittedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        reason: 'submitted',
      },
      ts: Date.now(),
    })

    expect(sub1).not.toHaveBeenCalled()
    expect(sub2).toHaveBeenCalledTimes(1)

    await client.close()
  })

  it('一个 handler 抛错不阻断其它 subscriber', async () => {
    const { getLast } = installFakeWs()
    const client = new GatewayClient({ url: 'ws://test/ws', requestTimeoutMs: 1000 })
    await waitOpen()

    // 把 console.warn 屏掉，避免 crashy log 污染测试输出。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const sub1 = vi.fn(() => {
      throw new Error('boom')
    })
    const sub2 = vi.fn()
    const sub3 = vi.fn()
    client.onEvent('config.changed' as EventName, sub1)
    client.onEvent('config.changed' as EventName, sub2)
    client.onEvent('config.changed' as EventName, sub3)

    deliver(getLast(), {
      type: 'event',
      name: 'config.changed',
      payload: { workerId: 'w_3', version: 5, changedAt: Date.now() },
      ts: Date.now(),
    })

    expect(sub1).toHaveBeenCalledTimes(1)
    expect(sub2).toHaveBeenCalledTimes(1)
    expect(sub3).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    await client.close()
  })

  it('event 名不匹配的订阅不会被误触发', async () => {
    const { getLast } = installFakeWs()
    const client = new GatewayClient({ url: 'ws://test/ws', requestTimeoutMs: 1000 })
    await waitOpen()

    const onlineSub = vi.fn()
    const enrollSub = vi.fn()
    client.onEvent('worker.online' as EventName, onlineSub)
    client.onEvent('enrollment.pending' as EventName, enrollSub)

    deliver(getLast(), {
      type: 'event',
      name: 'worker.online',
      payload: { workerId: 'w_4', deviceId: 'd_4', connectedAt: Date.now() },
      ts: Date.now(),
    })

    expect(onlineSub).toHaveBeenCalledTimes(1)
    expect(enrollSub).not.toHaveBeenCalled()

    await client.close()
  })
})

async function waitOpen() {
  // FakeWs.onopen 触发于 microtask；等一帧让 client.handshakeDone=true。
  await Promise.resolve()
  await Promise.resolve()
}

function deliver(ws: FakeWebSocket | null, frame: Parameters<typeof encodeFrame>[0]) {
  if (!ws)
    throw new Error('FakeWs 未初始化')
  ws.onmessage?.({ data: encodeFrame(frame) })
}
