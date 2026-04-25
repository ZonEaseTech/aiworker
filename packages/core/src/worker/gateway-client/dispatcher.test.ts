import type { ResponseFrame } from '@aiworker/gateway-proto'
import type { WorkerEventBus } from '../events/bus'
import type { OrchestratorLike } from './dispatcher'

import { describe, expect, it } from 'bun:test'
import { ApprovalStore } from '../orchestrator/approvals'
import { GatewayDispatcher } from './dispatcher'

/**
 * PLAN-014 F2 — gateway-client dispatcher 的 approval.* 桥接测试。
 *
 * 复用真 ApprovalStore + 桩 orchestrator/bus，断言：
 *   - approval.list 返回 store 当前所有挂起项
 *   - approval.grant allow 对挂起 promise 解锁，返回 granted=true
 *   - approval.grant 找不到 key 时仍 ok 但 granted=false
 */

function stubOrchestrator(): OrchestratorLike {
  return { ingest: async () => undefined }
}

function stubBus(): WorkerEventBus {
  return {
    emit: () => undefined,
    on: () => () => undefined,
  } as unknown as WorkerEventBus
}

interface CapturedDispatcher {
  dispatcher: GatewayDispatcher
  approvals: ApprovalStore
  responses: ResponseFrame[]
}

function makeDispatcher(): CapturedDispatcher {
  const approvals = new ApprovalStore()
  const responses: ResponseFrame[] = []
  const dispatcher = new GatewayDispatcher({
    workerId: 'w_test',
    getRuntime: () => ({
      bus: stubBus(),
      orchestrator: stubOrchestrator(),
      approvals,
    }),
    sendResponse: frame => responses.push(frame),
  })
  return { dispatcher, approvals, responses }
}

describe('GatewayDispatcher — approval.list / approval.grant', () => {
  it('approval.list returns pending entries from the store', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher()
    void approvals.wait({ taskId: 't-1', toolCallId: 'c-1', toolName: 'fs.write', params: { path: '/x' }, timeoutMs: 5_000 })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-1',
      method: 'approval.list',
      params: { workerId: 'w_test' },
    })
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(true)
    if (frame.ok) {
      const result = frame.result as { approvals: Array<{ taskId: string, toolName: string }> }
      expect(result.approvals).toHaveLength(1)
      expect(result.approvals[0]).toMatchObject({ taskId: 't-1', toolName: 'fs.write' })
    }
    approvals.dispose()
  })

  it('approval.grant resolves the matching pending wait and returns granted=true', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher()
    const pending = approvals.wait({
      taskId: 't-2',
      toolCallId: 'c-2',
      toolName: 'Read',
      params: {},
      timeoutMs: 5_000,
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-2',
      method: 'approval.grant',
      params: { workerId: 'w_test', taskId: 't-2', toolCallId: 'c-2', decision: 'allow' },
    })
    expect(responses).toHaveLength(1)
    expect(responses[0]?.ok).toBe(true)
    const result = (responses[0] as { ok: true, result: unknown }).result as { granted: boolean }
    expect(result.granted).toBe(true)
    await expect(pending).resolves.toBe('allow')
    approvals.dispose()
  })

  it('approval.grant for an unknown key returns granted=false (not an error)', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher()
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-3',
      method: 'approval.grant',
      params: { workerId: 'w_test', taskId: 'nope', toolCallId: 'nope', decision: 'deny' },
    })
    expect(responses).toHaveLength(1)
    expect(responses[0]?.ok).toBe(true)
    const result = (responses[0] as { ok: true, result: unknown }).result as { granted: boolean }
    expect(result.granted).toBe(false)
    approvals.dispose()
  })
})
