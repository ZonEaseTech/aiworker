import type { ConnectFrame, Frame } from '@aiworker/gateway-proto'
import type { WebSocketCtor, WebSocketLike } from '../gateway-client/client'
import type { RuntimeLike } from '../gateway-client/dispatcher'

import { describe, expect, it } from 'bun:test'
import { WorkerEventBus } from '../events/bus'

import { startGatewayNode } from '../gateway-client'

/**
 * PLAN-018 / FEAT-024 worker self-enrollment — connect 帧 enroll 块透传单测。
 *
 * 这两条测试守住唯一的 core wire 不变量：`startGatewayNode({ enroll })` 是否
 * 把 enroll 块原样写到 connect 帧里。enroll **触发条件**（env 三件套齐备 +
 * gateway URL 存在）由 `apps/cli/src/commands/serve.ts::runServe` 负责，本文
 * 件不重复测——CLI 路径的 env 解析归 cli 包的测试套件。
 *
 * Mock 方式与 `gateway-client/subscriber-refresh.test.ts` 对齐：自定义最小
 * WebSocketLike，所有 send() 收到 captured.sent 数组里供断言。
 */

const WS_OPEN = 1

interface CapturedSocket {
  sent: string[]
}

function makeMockSocketCtor(): { ctor: WebSocketCtor, captured: CapturedSocket } {
  const captured: CapturedSocket = { sent: [] }
  class MockWebSocket implements WebSocketLike {
    readyState = WS_OPEN
    onopen: ((ev: unknown) => void) | null = null
    onclose: ((ev: { code: number, reason: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onmessage: ((ev: { data: unknown }) => void) | null = null
    constructor(_url: string) {
      // onopen 必须在 GatewayClient 把 ws.onopen 注册之后再触发 — 同步 ctor
      // 阶段 onopen 还是 null。queueMicrotask 让 client 完成 wiring 再回调。
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

function pickConnectFrame(frames: Frame[]): ConnectFrame {
  const frame = frames.find(f => f.type === 'connect')
  if (!frame)
    throw new Error('expected connect frame, none found')
  return frame as ConnectFrame
}

describe('startGatewayNode — enroll 透传 (PLAN-018)', () => {
  it('未传 enroll → connect 帧不带 enroll 块（向后兼容现有 path）', async () => {
    const bus = new WorkerEventBus()
    const runtime: RuntimeLike = {
      bus,
      orchestrator: { ingest: async () => undefined },
    }
    const { ctor, captured } = makeMockSocketCtor()
    const node = startGatewayNode({
      url: 'ws://mock/node',
      token: 'bearer-xyz',
      workerId: 'w_test_no_enroll',
      reconnect: false,
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))
    expect(node.isConnected()).toBe(true)
    const connect = pickConnectFrame(decodeFrames(captured.sent))
    expect(connect.agentId).toBe('w_test_no_enroll')
    expect(connect.auth.token).toBe('bearer-xyz')
    expect(connect.enroll).toBeUndefined()
    await node.stop()
  })

  it('传 enroll → connect 帧 enroll 块字段与入参一致（含 apiToken / displayName）', async () => {
    const bus = new WorkerEventBus()
    const runtime: RuntimeLike = {
      bus,
      orchestrator: { ingest: async () => undefined },
    }
    const { ctor, captured } = makeMockSocketCtor()
    const node = startGatewayNode({
      url: 'ws://mock/node',
      token: '',
      workerId: 'w_test_enroll',
      reconnect: false,
      enroll: {
        joinToken: 'join-secret-abc',
        apiToken: 'wtk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        displayName: 'prod-1',
      },
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))
    expect(node.isConnected()).toBe(true)
    const connect = pickConnectFrame(decodeFrames(captured.sent))
    expect(connect.agentId).toBe('w_test_enroll')
    // enroll 路径下 bearer token 仍为空（gateway authorize 走 enroll 分支）。
    expect(connect.auth.token).toBe('')
    expect(connect.enroll).toEqual({
      joinToken: 'join-secret-abc',
      apiToken: 'wtk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      displayName: 'prod-1',
    })
    await node.stop()
  })

  it('传 enroll 但省略 displayName → connect 帧 enroll.displayName 字段不出现', async () => {
    const bus = new WorkerEventBus()
    const runtime: RuntimeLike = {
      bus,
      orchestrator: { ingest: async () => undefined },
    }
    const { ctor, captured } = makeMockSocketCtor()
    const node = startGatewayNode({
      url: 'ws://mock/node',
      token: '',
      workerId: 'w_test_enroll_no_display',
      reconnect: false,
      enroll: {
        joinToken: 'join-secret-abc',
        apiToken: 'wtk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      getRuntime: () => runtime,
      webSocketCtor: ctor,
    })
    await new Promise(r => setTimeout(r, 5))
    expect(node.isConnected()).toBe(true)
    const connect = pickConnectFrame(decodeFrames(captured.sent))
    expect(connect.enroll).toEqual({
      joinToken: 'join-secret-abc',
      apiToken: 'wtk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })
    expect(connect.enroll?.displayName).toBeUndefined()
    await node.stop()
  })
})
