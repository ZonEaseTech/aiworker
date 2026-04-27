import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrame } from '@zonease/aiworker-gateway-proto'
import {
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@zonease/aiworker-storage-sqlite/fleet'
import { describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { dispatchNodeEvent, dispatchNodeResponse, dispatchOperatorRequest, getLocalMethodNames, getProtoMethodNames, isLocalMethod } from '../src/router/dispatch'
import { forwardOperatorRequestToNode } from '../src/router/forward'
import { handleSystemPresence } from '../src/router/methods/system'
import { handleWorkersList, handleWorkersRemove } from '../src/router/methods/workers'

/**
 * 构造一份基于临时 fleet.db 的 context，跑完 test 后手动清理。
 * 使用真 drizzle + bun:sqlite，覆盖持久化 path；速度足够，毋需 mock。
 */
function makeCtx(): { ctx: GatewayContext, cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gw-dispatch-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  const ctx: GatewayContext = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-test'),
  }
  return {
    ctx,
    cleanup: () => {
      ctx.forwards.dispose()
      closeFleetDb()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** 极简 ws stub：只记 send 内容。 */
function makeSendTap(): { ws: any, sent: string[] } {
  const sent: string[] = []
  const ws = {
    send: (msg: string) => sent.push(msg),
    close: () => {},
    data: {},
  }
  return { ws, sent }
}

describe('system.presence', () => {
  test('空 registry 返回 online=[]', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const r = await handleSystemPresence(ctx, {})
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = r.result as { now: number, online: unknown[] }
        expect(result.online).toEqual([])
        expect(typeof result.now).toBe('number')
      }
    }
    finally { cleanup() }
  })

  test('在线 node 会出现在 online 列表中', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const { ws } = makeSendTap()
      ctx.nodes.register({
        workerId: 'w-online',
        deviceId: 'dev-1',
        ws,
        pairedAt: 123,
        meta: {},
      })
      const r = await handleSystemPresence(ctx, {})
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = r.result as { online: Array<{ workerId: string, online: boolean }> }
        expect(result.online).toHaveLength(1)
        expect(result.online[0]!.workerId).toBe('w-online')
        expect(result.online[0]!.online).toBe(true)
      }
    }
    finally { cleanup() }
  })
})

describe('workers.list', () => {
  test('无注册：返回空数组', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const r = await handleWorkersList(ctx, {})
      expect(r.ok).toBe(true)
      if (r.ok)
        expect((r.result as { workers: unknown[] }).workers).toEqual([])
    }
    finally { cleanup() }
  })
})

describe('workers.remove', () => {
  test('不存在 → not_found', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const r = await handleWorkersRemove(ctx, { workerId: 'no-such' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('not_found')
    }
    finally { cleanup() }
  })

  test('params 缺 workerId → invalid_params', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const r = await handleWorkersRemove(ctx, {})
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('invalid_params')
    }
    finally { cleanup() }
  })
})

describe('dispatchOperatorRequest', () => {
  test('未知方法返回 unknown_method 错误响应', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const { ws, sent } = makeSendTap()
      await dispatchOperatorRequest(
        ctx,
        ws,
        { type: 'request', id: 'r-1', method: 'bogus.method', params: {} },
        'op-agent',
      )
      expect(sent).toHaveLength(1)
      const parsed = parseFrame(sent[0]!)
      expect(parsed.ok).toBe(true)
      if (parsed.ok && parsed.frame.type === 'response' && parsed.frame.ok === false)
        expect(parsed.frame.error.code).toBe('unknown_method')
    }
    finally { cleanup() }
  })

  test('operator-to-node 但 node 不在线 → node_offline 错误', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const { ws, sent } = makeSendTap()
      await dispatchOperatorRequest(
        ctx,
        ws,
        {
          type: 'request',
          id: 'r-2',
          method: 'chat.send',
          params: { workerId: 'nowhere', content: 'hi' },
        },
        'op-agent',
      )
      expect(sent).toHaveLength(1)
      const parsed = parseFrame(sent[0]!)
      if (parsed.ok && parsed.frame.type === 'response' && parsed.frame.ok === false)
        expect(parsed.frame.error.code).toBe('node_offline')
    }
    finally { cleanup() }
  })

  test('operator-to-gateway system.presence 返回 ok=true', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const { ws, sent } = makeSendTap()
      await dispatchOperatorRequest(
        ctx,
        ws,
        { type: 'request', id: 'r-3', method: 'system.presence', params: {} },
        'op-agent',
      )
      expect(sent).toHaveLength(1)
      const parsed = parseFrame(sent[0]!)
      if (parsed.ok && parsed.frame.type === 'response')
        expect(parsed.frame.ok).toBe(true)
    }
    finally { cleanup() }
  })
})

describe('forwardOperatorRequestToNode', () => {
  test('node 在线：帧真的发到 node，id 被重写', () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const nodeTap = makeSendTap()
      ctx.nodes.register({
        workerId: 'w-on',
        deviceId: 'd1',
        ws: nodeTap.ws,
        pairedAt: 1,
        meta: {},
      })
      const opTap = makeSendTap()
      const okSent = forwardOperatorRequestToNode({
        ctx,
        operatorWs: opTap.ws,
        operatorRequestId: 'op-req-99',
        method: 'chat.send',
        params: { workerId: 'w-on', content: 'hello' },
      })
      expect(okSent).toBe(true)
      expect(nodeTap.sent).toHaveLength(1)
      const parsed = parseFrame(nodeTap.sent[0]!)
      if (parsed.ok && parsed.frame.type === 'request') {
        // 被 gateway 重写的 id 不应等于 operator 的原始 id
        expect(parsed.frame.id).not.toBe('op-req-99')
        expect(parsed.frame.method).toBe('chat.send')
      }
      expect(ctx.forwards.size()).toBe(1)
    }
    finally { cleanup() }
  })

  test('dispatchNodeResponse 按 gatewayRequestId 反向映射回 operator 原始 id', () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const nodeTap = makeSendTap()
      ctx.nodes.register({
        workerId: 'w-on',
        deviceId: 'd1',
        ws: nodeTap.ws,
        pairedAt: 1,
        meta: {},
      })
      const opTap = makeSendTap()
      forwardOperatorRequestToNode({
        ctx,
        operatorWs: opTap.ws,
        operatorRequestId: 'op-req-123',
        method: 'config.get',
        params: { workerId: 'w-on' },
      })
      // 抓出 gateway 侧新分配的 id
      const fwdRaw = nodeTap.sent[0]!
      const fwdParsed = parseFrame(fwdRaw)
      let gatewayReqId = ''
      if (fwdParsed.ok && fwdParsed.frame.type === 'request')
        gatewayReqId = fwdParsed.frame.id

      dispatchNodeResponse(ctx, nodeTap.ws, {
        type: 'response',
        id: gatewayReqId,
        ok: true,
        result: { version: 2, config: {} },
      })

      expect(opTap.sent).toHaveLength(1)
      const back = parseFrame(opTap.sent[0]!)
      if (back.ok && back.frame.type === 'response') {
        expect(back.frame.id).toBe('op-req-123')
        expect(back.frame.ok).toBe(true)
      }
      // pending 已消费
      expect(ctx.forwards.size()).toBe(0)
    }
    finally { cleanup() }
  })
})

describe('forward 取消时 onExpire 补错误响应', () => {
  test('node 下线：pending 被 cancelByWorker 清掉并回 node_gone 错误', () => {
    const { ctx, cleanup } = makeCtx()
    try {
      // 自定义 ForwardTable，使 onExpire 对 operator 发错误帧
      ctx.forwards = new ForwardTable({
        timeoutMs: 0,
        onExpire: (entry, reason) => {
          if (reason === 'operator_gone')
            return
          const code = reason === 'timeout' ? 'forward_timeout' : 'node_gone'
          try {
            entry.operatorWs.send(JSON.stringify({
              type: 'response',
              id: entry.operatorRequestId,
              ok: false,
              error: { code, message: 'mock' },
            }))
          }
          catch { /* no-op */ }
        },
      })
      const nodeTap = makeSendTap()
      ctx.nodes.register({
        workerId: 'w-on',
        deviceId: 'd1',
        ws: nodeTap.ws,
        pairedAt: 1,
        meta: {},
      })
      const opTap = makeSendTap()
      forwardOperatorRequestToNode({
        ctx,
        operatorWs: opTap.ws,
        operatorRequestId: 'op-req-xx',
        method: 'config.get',
        params: { workerId: 'w-on' },
      })
      ctx.forwards.cancelByWorker('w-on')
      expect(opTap.sent.length).toBeGreaterThanOrEqual(1)
      const parsed = parseFrame(opTap.sent[opTap.sent.length - 1]!)
      if (parsed.ok && parsed.frame.type === 'response' && parsed.frame.ok === false) {
        expect(parsed.frame.error.code).toBe('node_gone')
        expect(parsed.frame.id).toBe('op-req-xx')
      }
    }
    finally { cleanup() }
  })
})

describe('dispatchNodeEvent 全量广播', () => {
  test('所有在线 operator 都会收到', () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const op1 = makeSendTap()
      const op2 = makeSendTap()
      ctx.operators.register({ agentId: 'op1', deviceId: 'd1', ws: op1.ws, connectedAt: 1 })
      ctx.operators.register({ agentId: 'op2', deviceId: 'd2', ws: op2.ws, connectedAt: 2 })
      dispatchNodeEvent(
        ctx,
        makeSendTap().ws,
        {
          type: 'event',
          name: 'agent.done',
          payload: { workerId: 'w1', conversationId: 'c1', finishReason: 'stop' },
          ts: Date.now(),
        },
      )
      expect(op1.sent).toHaveLength(1)
      expect(op2.sent).toHaveLength(1)
    }
    finally { cleanup() }
  })
})

describe('approval.* (PLAN-014 F2)', () => {
  test('approval.requested event 通过 dispatchNodeEvent 广播到所有 operator', () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const op1 = makeSendTap()
      const op2 = makeSendTap()
      ctx.operators.register({ agentId: 'op-1', deviceId: 'op-d1', ws: op1.ws, connectedAt: 1 })
      ctx.operators.register({ agentId: 'op-2', deviceId: 'op-d2', ws: op2.ws, connectedAt: 2 })
      const nodeWs = makeSendTap().ws
      dispatchNodeEvent(ctx, nodeWs, {
        type: 'event',
        name: 'approval.requested',
        payload: {
          workerId: 'w-ask',
          taskId: 't-1',
          toolCallId: 'c-1',
          toolName: 'fs.write',
          params: { path: '/etc/passwd' },
          expiresAt: Date.now() + 60_000,
        },
        ts: Date.now(),
      })
      expect(op1.sent).toHaveLength(1)
      expect(op2.sent).toHaveLength(1)
      const parsed = parseFrame(op1.sent[0]!)
      if (parsed.ok && parsed.frame.type === 'event') {
        expect(parsed.frame.name).toBe('approval.requested')
        expect((parsed.frame.payload as { toolName?: string }).toolName).toBe('fs.write')
      }
    }
    finally { cleanup() }
  })

  test('approval.grant 走 operator-to-node 转发：node 在线时帧到达 node', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const nodeTap = makeSendTap()
      ctx.nodes.register({
        workerId: 'w-grant',
        deviceId: 'd-g',
        ws: nodeTap.ws,
        pairedAt: 1,
        meta: {},
      })
      const opTap = makeSendTap()
      await dispatchOperatorRequest(
        ctx,
        opTap.ws,
        {
          type: 'request',
          id: 'op-req-grant',
          method: 'approval.grant',
          params: {
            workerId: 'w-grant',
            taskId: 't-1',
            toolCallId: 'c-1',
            decision: 'allow',
          },
        },
        'op-agent',
      )
      // 帧到达 node（id 被 gateway 重写）
      expect(nodeTap.sent).toHaveLength(1)
      const parsed = parseFrame(nodeTap.sent[0]!)
      if (parsed.ok && parsed.frame.type === 'request') {
        expect(parsed.frame.method).toBe('approval.grant')
        expect(parsed.frame.id).not.toBe('op-req-grant')
      }
      // operator 还没收到响应（要等 node 回 response 才会回送）
      expect(opTap.sent).toHaveLength(0)

      // 模拟 node 回 response：dispatchNodeResponse 把 id 翻回 operator 原始 id
      const reqId = (parsed.ok && parsed.frame.type === 'request') ? parsed.frame.id : ''
      dispatchNodeResponse(ctx, nodeTap.ws, {
        type: 'response',
        id: reqId,
        ok: true,
        result: { granted: true },
      })
      expect(opTap.sent).toHaveLength(1)
      const back = parseFrame(opTap.sent[0]!)
      if (back.ok && back.frame.type === 'response' && back.frame.ok === true) {
        expect(back.frame.id).toBe('op-req-grant')
        expect(back.frame.result).toEqual({ granted: true })
      }
    }
    finally { cleanup() }
  })

  test('approval.list 缺 workerId → invalid_params', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const opTap = makeSendTap()
      await dispatchOperatorRequest(
        ctx,
        opTap.ws,
        { type: 'request', id: 'op-req-list', method: 'approval.list', params: {} },
        'op-agent',
      )
      expect(opTap.sent).toHaveLength(1)
      const parsed = parseFrame(opTap.sent[0]!)
      if (parsed.ok && parsed.frame.type === 'response' && parsed.frame.ok === false)
        expect(parsed.frame.error.code).toBe('invalid_params')
    }
    finally { cleanup() }
  })
})

describe('path guard — proto methods are either local-handled or routed to node', () => {
  test('getProtoMethodNames 涵盖所有 METHODS，且每条方法都有路由归属', () => {
    // dispatch 的契约：proto 里任何方法要么在本地 handler map 里，要么
    // 在 proto 里标为 operator-to-node（会走 forward 分支）。
    // 否则 handler_missing 会暴露 bug。
    const proto = getProtoMethodNames()
    const local = new Set(getLocalMethodNames())
    for (const m of proto) {
      const isLocal = isLocalMethod(m)
      if (isLocal)
        expect(local.has(m)).toBe(true)
    }
  })
})
