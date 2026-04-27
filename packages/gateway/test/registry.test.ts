import { describe, expect, test } from 'bun:test'
import { ForwardTable } from '../src/registry/forward'
import { NodeRegistry } from '../src/registry/nodes'
import { OperatorRegistry } from '../src/registry/operators'

/** 最小 fake 对象，让 registry / forward-table 拿得到 `ws` 引用做等值比较。 */
function makeFakeWs(label: string): { send: () => void, close: () => void, __label: string } {
  return { send: () => {}, close: () => {}, __label: label }
}

describe('NodeRegistry', () => {
  test('注册 / 读取 / 注销', () => {
    const registry = new NodeRegistry()
    const ws = makeFakeWs('node-1') as unknown as Parameters<NodeRegistry['register']>[0]['ws']
    registry.register({ workerId: 'w1', deviceId: 'd1', ws, pairedAt: 1, meta: {} })
    expect(registry.has('w1')).toBe(true)
    expect(registry.get('w1')?.deviceId).toBe('d1')
    expect(registry.size()).toBe(1)

    const removed = registry.unregisterByWs(ws)
    expect(removed?.workerId).toBe('w1')
    expect(registry.has('w1')).toBe(false)
    expect(registry.size()).toBe(0)
  })

  test('重复 workerId 注册会返回 replaced（老 entry）', () => {
    const registry = new NodeRegistry()
    const wsA = makeFakeWs('a') as unknown as Parameters<NodeRegistry['register']>[0]['ws']
    const wsB = makeFakeWs('b') as unknown as Parameters<NodeRegistry['register']>[0]['ws']
    registry.register({ workerId: 'w', deviceId: 'dA', ws: wsA, pairedAt: 1, meta: {} })
    const result = registry.register({
      workerId: 'w',
      deviceId: 'dB',
      ws: wsB,
      pairedAt: 2,
      meta: {},
    })
    expect(result.replaced?.deviceId).toBe('dA')
    expect(registry.get('w')?.deviceId).toBe('dB')
  })

  test('旧 ws 断线时 unregisterByWs 不会误删新连接', () => {
    const registry = new NodeRegistry()
    const wsA = makeFakeWs('a') as unknown as Parameters<NodeRegistry['register']>[0]['ws']
    const wsB = makeFakeWs('b') as unknown as Parameters<NodeRegistry['register']>[0]['ws']
    registry.register({ workerId: 'w', deviceId: 'dA', ws: wsA, pairedAt: 1, meta: {} })
    registry.register({ workerId: 'w', deviceId: 'dB', ws: wsB, pairedAt: 2, meta: {} })
    // 老 ws close 回调：
    const removed = registry.unregisterByWs(wsA)
    expect(removed).toBeUndefined()
    expect(registry.get('w')?.deviceId).toBe('dB')
  })
})

describe('OperatorRegistry', () => {
  test('多个 operator 可并存，按 ws 去重', () => {
    const ops = new OperatorRegistry()
    const wsA = makeFakeWs('a') as unknown as Parameters<OperatorRegistry['register']>[0]['ws']
    const wsB = makeFakeWs('b') as unknown as Parameters<OperatorRegistry['register']>[0]['ws']
    ops.register({ agentId: 'op-1', deviceId: 'd1', ws: wsA, connectedAt: 1 })
    ops.register({ agentId: 'op-2', deviceId: 'd2', ws: wsB, connectedAt: 2 })
    expect(ops.size()).toBe(2)
    ops.unregister(wsA)
    expect(ops.size()).toBe(1)
  })
})

describe('ForwardTable', () => {
  test('allocate + consume 正常路径', () => {
    const table = new ForwardTable({ idFactory: () => 'uuid-1', timeoutMs: 0 })
    const ws = makeFakeWs('op') as unknown as Parameters<ForwardTable['allocate']>[0]['operatorWs']
    const entry = table.allocate({
      operatorRequestId: 'op-req-1',
      operatorWs: ws,
      workerId: 'w1',
      method: 'chat.send',
    })
    expect(entry.gatewayRequestId).toBe('uuid-1')
    const popped = table.consume('uuid-1')
    expect(popped?.operatorRequestId).toBe('op-req-1')
    // 二次 consume 应该是 undefined
    expect(table.consume('uuid-1')).toBeUndefined()
  })

  test('cancelByWorker 仅影响指定 workerId', () => {
    const expired: Array<[string, string]> = []
    let seq = 0
    const table = new ForwardTable({
      idFactory: () => `uuid-${++seq}`,
      timeoutMs: 0,
      onExpire: (entry, reason) => expired.push([entry.workerId, reason]),
    })
    const ws = makeFakeWs('op') as unknown as Parameters<ForwardTable['allocate']>[0]['operatorWs']
    table.allocate({
      operatorRequestId: 'r1',
      operatorWs: ws,
      workerId: 'w1',
      method: 'chat.send',
    })
    table.allocate({
      operatorRequestId: 'r2',
      operatorWs: ws,
      workerId: 'w2',
      method: 'chat.send',
    })
    table.cancelByWorker('w1')
    expect(expired).toEqual([['w1', 'node_gone']])
    expect(table.size()).toBe(1)
  })

  test('cancelByOperator 清掉全部该 operator 的 pending', () => {
    const expired: string[] = []
    let seq = 0
    const table = new ForwardTable({
      idFactory: () => `uuid-${++seq}`,
      timeoutMs: 0,
      onExpire: entry => expired.push(entry.method),
    })
    const wsA = makeFakeWs('opA') as unknown as Parameters<ForwardTable['allocate']>[0]['operatorWs']
    const wsB = makeFakeWs('opB') as unknown as Parameters<ForwardTable['allocate']>[0]['operatorWs']
    table.allocate({
      operatorRequestId: 'r1',
      operatorWs: wsA,
      workerId: 'w',
      method: 'chat.send',
    })
    table.allocate({
      operatorRequestId: 'r2',
      operatorWs: wsA,
      workerId: 'w',
      method: 'config.get',
    })
    table.allocate({
      operatorRequestId: 'r3',
      operatorWs: wsB,
      workerId: 'w',
      method: 'logs.tail',
    })
    table.cancelByOperator(wsA)
    expect(expired.sort()).toEqual(['chat.send', 'config.get'])
    expect(table.size()).toBe(1)
  })
})
