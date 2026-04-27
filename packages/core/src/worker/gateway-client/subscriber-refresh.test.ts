import type { Frame } from '@zonease/aiworker-gateway-proto'
import type { WebSocketCtor, WebSocketLike } from './client'
import type { RuntimeLike } from './dispatcher'

import { EVENTS } from '@zonease/aiworker-gateway-proto'
import { describe, expect, it } from 'bun:test'

import { WorkerEventBus } from '../events/bus'
import { startGatewayNode } from './index'

/**
 * BUG-004 — runtime hot-reload 后 subscriber 必须重新订阅新 bus。
 *
 * 复现路径：bootstrap → gateway 连上 → emit 老 bus 事件正常上行 → reload 换
 * 新 runtime（新 bus）→ 老 bus emit 不应有任何上行 → 新 bus emit 只在调用过
 * `notifyRuntimeReloaded()` 之后才会重新出现在 sendEvent。
 *
 * Mock 一条最小 WebSocket：onopen 同步触发，所有 send() 收集到数组里供断言；
 * 走完整 startGatewayNode 路径以同时覆盖 onConnected→subscriber.start 与
 * notifyRuntimeReloaded→subscriber.start 的幂等握手。
 */

const WS_OPEN = 1

interface CapturedSocket {
  sent: string[]
  ws: WebSocketLike
}

function makeMockSocketCtor(): { ctor: WebSocketCtor, captured: CapturedSocket } {
  const captured: CapturedSocket = { sent: [], ws: null as unknown as WebSocketLike }
  class MockWebSocket implements WebSocketLike {
    readyState = WS_OPEN
    onopen: ((ev: unknown) => void) | null = null
    onclose: ((ev: { code: number, reason: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onmessage: ((ev: { data: unknown }) => void) | null = null
    constructor(_url: string) {
      captured.ws = this
      // onopen 必须在 GatewayClient 把 ws.onopen 注册之后再触发——同步 ctor 里
      // 此时 onopen 还是 null。queueMicrotask 让 client 完成 wiring 再回调。
      queueMicrotask(() => this.onopen?.({}))
    }

    send(data: string): void {
      captured.sent.push(data)
    }

    close(): void {
      this.readyState = 3
      this.onclose?.({ code: 1000, reason: 'mock-close' })
    }
  }
  return { ctor: MockWebSocket as unknown as WebSocketCtor, captured }
}

function decodeFrames(raw: string[]): Frame[] {
  return raw.map(line => JSON.parse(line) as Frame)
}

function pickEvents(frames: Frame[], name: string): Frame[] {
  return frames.filter(f => f.type === 'event' && f.name === name)
}

describe('GatewayNode — subscriber refresh after runtime reload', () => {
  it('subscriber 在 notifyRuntimeReloaded 之后挂到新 bus，老 bus 不再上行', async () => {
    const oldBus = new WorkerEventBus()
    const newBus = new WorkerEventBus()
    let runtime: RuntimeLike = {
      bus: oldBus,
      orchestrator: { ingest: async () => undefined },
    }

    const { ctor, captured } = makeMockSocketCtor()
    const node = startGatewayNode({
      url: 'ws://mock/node',
      token: 't',
      workerId: 'w_test',
      reconnect: false,
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })

    // 等握手完成（onopen → connect frame → onConnected → subscriber.start）。
    await new Promise(r => setTimeout(r, 5))
    expect(node.isConnected()).toBe(true)
    // 此时 sent 里第一条应是 connect frame。
    const initial = decodeFrames(captured.sent)
    expect(initial[0]?.type).toBe('connect')

    // 老 bus 上 emit：subscriber 应翻译成 AGENT_THINKING 上行。
    captured.sent.length = 0
    oldBus.emit('orchestrator.text', { conversationId: 'c-1', delta: 'hi' })
    let frames = decodeFrames(captured.sent)
    expect(pickEvents(frames, EVENTS.AGENT_THINKING)).toHaveLength(1)

    // 模拟 reloadRuntime：先 swap runtime（新 bus），再调 notifyRuntimeReloaded。
    // 顺序对应 worker.ts 里 state.runtime swap → onRuntimeReloaded() 的契约。
    captured.sent.length = 0
    runtime = {
      bus: newBus,
      orchestrator: { ingest: async () => undefined },
    }
    node.notifyRuntimeReloaded()

    // 老 bus 已经废，再 emit 不应再上行（subscriber 已切到新 bus）。
    oldBus.emit('orchestrator.text', { conversationId: 'c-1', delta: 'STALE' })
    frames = decodeFrames(captured.sent)
    expect(pickEvents(frames, EVENTS.AGENT_THINKING)).toHaveLength(0)

    // 新 bus 上 emit：subscriber 必须捕获并上行。
    newBus.emit('orchestrator.text', { conversationId: 'c-2', delta: 'fresh' })
    newBus.emit('orchestrator.finished', { conversationId: 'c-2' })
    frames = decodeFrames(captured.sent)
    const thinking = pickEvents(frames, EVENTS.AGENT_THINKING)
    const done = pickEvents(frames, EVENTS.AGENT_DONE)
    expect(thinking).toHaveLength(1)
    expect(done).toHaveLength(1)
    const thinkingPayload = (thinking[0] as { payload: Record<string, unknown> }).payload
    expect(thinkingPayload.conversationId).toBe('c-2')
    expect(thinkingPayload.chunk).toBe('fresh')

    // 老 bus 上不应留下任何 listener（subscriber.start 内部会先 stop）。
    captured.sent.length = 0
    oldBus.emit('orchestrator.text', { conversationId: 'c-1', delta: 'leak?' })
    expect(captured.sent).toHaveLength(0)

    await node.stop()
  })

  it('未连接时 notifyRuntimeReloaded 是 no-op（不抛、不挂老 listener）', async () => {
    const bus = new WorkerEventBus()
    const runtime: RuntimeLike = {
      bus,
      orchestrator: { ingest: async () => undefined },
    }

    // 给一个永远不 onopen 的 socket：subscriber 永远没机会被 start。
    class StuckSocket implements WebSocketLike {
      readyState = 0
      onopen: ((ev: unknown) => void) | null = null
      onclose: ((ev: { code: number, reason: string }) => void) | null = null
      onerror: ((ev: unknown) => void) | null = null
      onmessage: ((ev: { data: unknown }) => void) | null = null
      constructor(_url: string) {}
      send(_: string): void {}
      close(): void {
        this.onclose?.({ code: 1000, reason: '' })
      }
    }

    const node = startGatewayNode({
      url: 'ws://mock/stuck',
      token: 't',
      workerId: 'w_stuck',
      reconnect: false,
      getRuntime: () => runtime,
      webSocketCtor: StuckSocket as unknown as WebSocketCtor,
    })
    expect(node.isConnected()).toBe(false)

    // 触发 hook：未连通时应直接返回，不要去摸 bus（避免在还没握手时抢跑）。
    expect(() => node.notifyRuntimeReloaded()).not.toThrow()

    // 即便 emit 也不应有 listener 反应（subscriber 还没 start）。
    let count = 0
    bus.emit('orchestrator.text', { conversationId: 'c', delta: 'x' })
    bus.on(() => count++)
    bus.emit('orchestrator.text', { conversationId: 'c', delta: 'y' })
    expect(count).toBe(1) // 只有我们刚加的 listener 收到

    await node.stop()
  })
})
