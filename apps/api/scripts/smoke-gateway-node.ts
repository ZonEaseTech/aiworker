/**
 * PLAN-013 S4 — gateway-client smoke。
 *
 * 本 smoke 独立于 apps/gateway（S2 仍在并行）。流程：
 *
 *   1. 起一个极简 mock gateway（Bun.serve websocket） —— 它要做的事情就是
 *      accept node connect → 发一条 `request` method=chat.send → 收集
 *      response 与后续 event 帧。
 *   2. 构造一个 stub runtime：真 WorkerEventBus + 假 orchestrator.ingest
 *      （收到 envelope 就通过 bus 模拟 orchestrator.text → orchestrator.finished
 *      两条事件，触发 subscriber 外发 event frame）。不跑真 Brain/Executor。
 *   3. `startGatewayNode()` 拉起 gateway-client，连接 mock gateway。
 *   4. 等待 mock gateway 收到 `response ok=true` + 至少一条 event（agent.done）。
 *   5. 干净关停。
 *
 * 退出码 0 = 所有断言通过；非 0 = 断言失败。
 *
 * 用法：bun apps/api/scripts/smoke-gateway-node.ts
 */
import type { ConnectFrame, Frame, RequestFrame } from '@aiworker/gateway-proto'
import type { Envelope } from '@aiworker/shared'
import type { OrchestratorLike } from '../src/worker/gateway-client'

import { Buffer } from 'node:buffer'
import process from 'node:process'

import { encodeFrame, EVENTS, parseFrame } from '@aiworker/gateway-proto'

import { WorkerEventBus } from '../src/worker/events/bus'
import { startGatewayNode } from '../src/worker/gateway-client'

interface MockGatewayHandle {
  url: string
  /** 已经从 node 收到的帧（按到达顺序）。 */
  received: Frame[]
  /** resolve 时返回 node 的 connect 帧；超时则 reject。 */
  awaitConnect: (timeoutMs: number) => Promise<ConnectFrame>
  /** resolve 时返回与 request id 对应的 response；超时则 reject。 */
  awaitResponse: (requestId: string, timeoutMs: number) => Promise<Frame>
  awaitEvent: (predicate: (f: Frame) => boolean, timeoutMs: number) => Promise<Frame>
  sendRequest: (req: RequestFrame) => void
  stop: () => Promise<void>
}

function log(msg: string): void {
  console.log(`[smoke-gateway-node] ${msg}`)
}

function startMockGateway(): Promise<MockGatewayHandle> {
  return new Promise((resolve) => {
    const received: Frame[] = []
    const listeners: Array<(frame: Frame) => void> = []
    let currentWs: { send: (data: string) => void, close: () => void } | null = null

    const server = Bun.serve({
      port: 0,
      fetch(req, srv) {
        if (srv.upgrade(req))
          return
        return new Response('mock-gateway', { status: 200 })
      },
      websocket: {
        message(ws, message) {
          const raw = typeof message === 'string' ? message : Buffer.from(message).toString('utf8')
          const parsed = parseFrame(raw)
          if (!parsed.ok) {
            log(`drop malformed frame from node: ${parsed.error}`)
            return
          }
          received.push(parsed.frame)
          for (const l of listeners)
            l(parsed.frame)
        },
        open(ws) {
          currentWs = {
            send: (data: string) => ws.send(data),
            close: () => ws.close(),
          }
        },
        close() {
          currentWs = null
        },
      },
    })

    const url = `ws://127.0.0.1:${server.port}`

    function awaitFrame(predicate: (f: Frame) => boolean, timeoutMs: number): Promise<Frame> {
      return new Promise((resolveFrame, rejectFrame) => {
        for (const f of received) {
          if (predicate(f)) {
            resolveFrame(f)
            return
          }
        }
        const timer = setTimeout(() => {
          const idx = listeners.indexOf(onFrame)
          if (idx !== -1)
            listeners.splice(idx, 1)
          rejectFrame(new Error(`timed out after ${timeoutMs}ms waiting for matching frame; received ${received.length} frames: ${JSON.stringify(received.slice(-5))}`))
        }, timeoutMs)
        function onFrame(f: Frame): void {
          if (!predicate(f))
            return
          clearTimeout(timer)
          const idx = listeners.indexOf(onFrame)
          if (idx !== -1)
            listeners.splice(idx, 1)
          resolveFrame(f)
        }
        listeners.push(onFrame)
      })
    }

    resolve({
      url,
      received,
      async awaitConnect(timeoutMs) {
        const f = await awaitFrame(x => x.type === 'connect', timeoutMs)
        return f as ConnectFrame
      },
      awaitResponse(id, timeoutMs) {
        return awaitFrame(f => f.type === 'response' && f.id === id, timeoutMs)
      },
      awaitEvent(predicate, timeoutMs) {
        return awaitFrame(f => f.type === 'event' && predicate(f), timeoutMs)
      },
      sendRequest(req) {
        if (!currentWs)
          throw new Error('mock-gateway: no node connected yet')
        currentWs.send(encodeFrame(req))
      },
      async stop() {
        if (currentWs) {
          try {
            currentWs.close()
          }
          catch {}
        }
        server.stop(true)
      },
    })
  })
}

/**
 * Stub orchestrator：收到 envelope 就模拟一次 run——
 * 先外发 orchestrator.text delta，再外发 orchestrator.finished，让
 * subscriber 把它们映射成 agent.thinking + agent.done event 帧。
 */
function buildStubRuntime(bus: WorkerEventBus): { bus: WorkerEventBus, orchestrator: OrchestratorLike } {
  const orchestrator: OrchestratorLike = {
    async ingest(envelope: Envelope) {
      // 模拟异步执行：给调用方一次机会先 ACK，再打出事件。
      setTimeout(() => {
        const conversationId = envelope.chatId
        bus.emit('orchestrator.text', { conversationId, delta: 'hi' })
        bus.emit('orchestrator.finished', { conversationId })
      }, 10)
    },
  }
  return { bus, orchestrator }
}

async function runSmoke(): Promise<void> {
  log('starting mock gateway')
  const gw = await startMockGateway()
  log(`mock gateway listening on ${gw.url}`)

  const workerId = 'w_smoke_s4'
  const bus = new WorkerEventBus()
  const runtime = buildStubRuntime(bus)

  log('starting gateway-client (node)')
  const node = startGatewayNode({
    url: gw.url,
    token: 'smoke-token',
    workerId,
    deviceId: 'dev_smoke_s4',
    reconnect: false,
    getRuntime: () => runtime,
  })

  try {
    log('awaiting connect frame from node')
    const connect = await gw.awaitConnect(5_000)
    if (connect.role !== 'node')
      throw new Error(`connect role=${connect.role}, expected 'node'`)
    if (connect.agentId !== workerId)
      throw new Error(`connect agentId=${connect.agentId}, expected ${workerId}`)
    log(`  ok — node connected as agentId=${connect.agentId} deviceId=${connect.deviceId}`)

    const requestId = `req_${Date.now()}`
    log(`sending chat.send request id=${requestId}`)
    gw.sendRequest({
      type: 'request',
      id: requestId,
      method: 'chat.send',
      params: { workerId, content: 'hello' },
    })

    log('awaiting response')
    const resp = await gw.awaitResponse(requestId, 5_000)
    if (resp.type !== 'response' || resp.id !== requestId)
      throw new Error(`unexpected response shape: ${JSON.stringify(resp)}`)
    if (resp.ok !== true)
      throw new Error(`response ok=${resp.ok}, expected true; body=${JSON.stringify(resp)}`)
    log(`  ok — response id=${resp.id} ok=true result=${JSON.stringify(resp.result)}`)

    log(`awaiting at least one '${EVENTS.AGENT_DONE}' event frame`)
    const evt = await gw.awaitEvent(
      f => f.type === 'event' && f.name === EVENTS.AGENT_DONE,
      5_000,
    )
    if (evt.type !== 'event')
      throw new Error(`expected event frame, got ${evt.type}`)
    log(`  ok — event name=${evt.name} payload=${JSON.stringify(evt.payload)}`)

    log('all assertions passed — PLAN-013 S4 gateway-node smoke PASS')
  }
  finally {
    log('stopping node')
    try {
      await node.stop()
    }
    catch (err) {
      log(`node.stop threw: ${String(err)}`)
    }
    log('stopping mock gateway')
    try {
      await gw.stop()
    }
    catch (err) {
      log(`gw.stop threw: ${String(err)}`)
    }
  }
}

runSmoke().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error(`[smoke-gateway-node][FAIL] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
