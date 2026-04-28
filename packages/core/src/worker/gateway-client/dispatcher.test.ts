import type { ResponseFrame } from '@zonease/aiworker-gateway-proto'
import type { Envelope } from '@zonease/aiworker-shared'
import type { WorkerEventBus } from '../events/bus'
import type { NodeHandlers, OrchestratorLike } from './dispatcher'

import { describe, expect, it } from 'bun:test'
import { ConfigVersionConflictError, InvalidConfigError } from '../management/config'
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

function makeDispatcher(handlers?: NodeHandlers, orchestrator: OrchestratorLike = stubOrchestrator()): CapturedDispatcher {
  const approvals = new ApprovalStore()
  const responses: ResponseFrame[] = []
  const dispatcher = new GatewayDispatcher({
    workerId: 'w_test',
    getRuntime: () => ({
      bus: stubBus(),
      orchestrator,
      approvals,
    }),
    ...(handlers ? { handlers } : {}),
    sendResponse: frame => responses.push(frame),
  })
  return { dispatcher, approvals, responses }
}

describe('GatewayDispatcher — chat.send session lifecycle envelope', () => {
  it('keeps the same gateway conversation hint mapped to the same chat id', async () => {
    const ingested: Envelope[] = []
    const orchestrator: OrchestratorLike = {
      ingest: async (envelope) => {
        ingested.push(envelope)
      },
    }
    const { dispatcher, approvals, responses } = makeDispatcher(undefined, orchestrator)

    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-1',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: 'sticky', content: 'first turn' },
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-2',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: 'sticky', content: 'second turn' },
    })

    expect(responses).toHaveLength(2)
    for (const frame of responses) {
      expect(frame.ok).toBe(true)
      if (frame.ok)
        expect((frame.result as { conversationId: string }).conversationId).toBe('gw:conv:sticky')
    }
    expect(ingested.map(envelope => envelope.chatId)).toEqual(['gw:conv:sticky', 'gw:conv:sticky'])
    expect(ingested.map(envelope => envelope.text)).toEqual(['first turn', 'second turn'])
    expect(ingested.every(envelope => envelope.accountId === 'sys:gateway')).toBe(true)
    expect(ingested.every(envelope => (envelope.raw as Record<string, unknown>).sessionReset === undefined)).toBe(true)
    approvals.dispose()
  })

  it('marks /new and /reset commands as manual session resets on the same chat id', async () => {
    const ingested: Envelope[] = []
    const orchestrator: OrchestratorLike = {
      ingest: async (envelope) => {
        ingested.push(envelope)
      },
    }
    const { dispatcher, approvals, responses } = makeDispatcher(undefined, orchestrator)

    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-new',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: 'sticky', content: '/new start over' },
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-reset',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: 'sticky', content: '/reset' },
    })

    expect(responses).toHaveLength(2)
    for (const frame of responses) {
      expect(frame.ok).toBe(true)
      if (frame.ok)
        expect((frame.result as { conversationId: string }).conversationId).toBe('gw:conv:sticky')
    }

    expect(ingested).toHaveLength(2)
    expect(ingested.map(envelope => envelope.chatId)).toEqual(['gw:conv:sticky', 'gw:conv:sticky'])
    expect(ingested[0]?.text).toBe('start over')
    expect(ingested[0]?.raw).toMatchObject({ source: 'gateway', sessionReset: true, resetCommand: '/new' })
    expect(ingested[1]?.text).toBe('A new session has started. Reply briefly to confirm.')
    expect(ingested[1]?.raw).toMatchObject({ source: 'gateway', sessionReset: true, resetCommand: '/reset' })
    approvals.dispose()
  })
})

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

/**
 * BUG-003 — config.put dispatcher 桥接：保证 handler 注入后不再 method_not_implemented，
 * 且 putConfig 抛的两个边界错（InvalidConfig / VersionConflict）映射到对应 wire code，
 * 而不是统一吞成 internal_error。
 */
describe('GatewayDispatcher — config.put', () => {
  it('returns method_not_implemented when handler is absent', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher()
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-cp-0',
      method: 'config.put',
      params: { workerId: 'w_test', ifMatch: 0, config: {} },
    })
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok)
      expect(frame.error.code).toBe('method_not_implemented')
    approvals.dispose()
  })

  it('replyOk forwards handler result (version + appliedAt + runtimeReload)', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher({
      configPut: async ({ ifMatch }) => ({ version: ifMatch + 1, appliedAt: 1, runtimeReload: 'ok' }),
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-cp-1',
      method: 'config.put',
      params: { workerId: 'w_test', ifMatch: 4, config: { brains: [] } },
    })
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(true)
    if (frame.ok) {
      const result = frame.result as { version: number, runtimeReload: string }
      expect(result.version).toBe(5)
      expect(result.runtimeReload).toBe('ok')
    }
    approvals.dispose()
  })

  it('maps ConfigVersionConflictError to wire code version_conflict (not internal_error)', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher({
      configPut: async () => { throw new ConfigVersionConflictError(2, 7) },
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-cp-2',
      method: 'config.put',
      params: { workerId: 'w_test', ifMatch: 2, config: {} },
    })
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok) {
      expect(frame.error.code).toBe('version_conflict')
      expect(frame.error.details).toMatchObject({ expected: 2, actual: 7 })
    }
    approvals.dispose()
  })

  it('maps InvalidConfigError to wire code invalid_config (not internal_error)', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher({
      configPut: async () => { throw new InvalidConfigError([], 'bad shape') },
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-cp-3',
      method: 'config.put',
      params: { workerId: 'w_test', ifMatch: 0, config: { brains: 'nope' } },
    })
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok)
      expect(frame.error.code).toBe('invalid_config')
    approvals.dispose()
  })
})
