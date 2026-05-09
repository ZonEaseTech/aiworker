import type { ResponseFrame } from '@zonease/aiworker-gateway-proto'
import type { Envelope, WorkerInfo } from '@zonease/aiworker-shared'
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

function fakeWorkerInfo(workerId = 'w_test'): WorkerInfo {
  return {
    workerId,
    runtimeVersion: 'test-runtime',
    configVersion: 7,
    brains: [{ id: 'fs-primary', type: 'filesystem', status: 'healthy' }],
    brainSummary: {
      admissions: { bypassRisk: { recentCount: 0, status: 'none' }, byStatus: {} },
      artifacts: { byStatus: {}, total: 0 },
      scopeManifest: { status: 'not-applicable' },
      decisionPipeline: {
        intentClassifier: {
          evaluator: 'heuristic',
          mode: 'observe_only',
          recent: { windowSize: 50, samples: 0, fallbackRate: 0, lastFallbackReason: null, lastFallbackAt: null },
        },
        capabilityRouter: {
          source: 'capability-registry',
          mode: 'observe_only',
          note: 'capability registry advisory; selections are recorded but not enforced',
        },
        qualityGate: {
          evaluator: 'heuristic',
          configuredMode: 'observe',
          recent: { windowSize: 50, samples: 0, fallbackRate: 0, lastFallbackReason: null, lastFallbackAt: null },
        },
        conversationClassifier: {
          enabled: true,
          recent: { windowSize: 50, samples: 0, fallbackRate: 0, lastFallbackReason: null, lastFallbackAt: null, fallbackByReason: {} },
        },
      },
    },
    executor: { type: 'http', model: 'gpt-4o-mini', status: 'healthy' },
    channels: [{ channel: 'web', enabled: true }],
    evolutionEnabled: true,
    startedAt: '2026-04-29T00:00:00.000Z',
  }
}

describe('GatewayDispatcher — chat.send session lifecycle envelope', () => {
  it('returns an omitted conversation id that can be reused unchanged', async () => {
    const ingested: Envelope[] = []
    const orchestrator: OrchestratorLike = {
      ingest: async (envelope) => {
        ingested.push(envelope)
      },
    }
    const { dispatcher, approvals, responses } = makeDispatcher(undefined, orchestrator)

    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-generated-1',
      method: 'chat.send',
      params: { workerId: 'w_test', content: 'first turn' },
    })

    expect(responses).toHaveLength(1)
    const first = responses[0]!
    expect(first.ok).toBe(true)
    const acceptedId = first.ok ? (first.result as { conversationId: string }).conversationId : ''
    expect(acceptedId.startsWith('gw:w_test:')).toBe(true)

    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-generated-2',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: acceptedId, content: 'second turn' },
    })

    expect(responses).toHaveLength(2)
    const second = responses[1]!
    expect(second.ok).toBe(true)
    if (second.ok)
      expect((second.result as { conversationId: string }).conversationId).toBe(acceptedId)
    expect(ingested.map(envelope => envelope.chatId)).toEqual([acceptedId, acceptedId])
    approvals.dispose()
  })

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

  it('can reuse the accepted id returned from an explicit conversation hint', async () => {
    const ingested: Envelope[] = []
    const orchestrator: OrchestratorLike = {
      ingest: async (envelope) => {
        ingested.push(envelope)
      },
    }
    const { dispatcher, approvals, responses } = makeDispatcher(undefined, orchestrator)

    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-explicit-1',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: 'explicit-027', content: 'first turn' },
    })
    const acceptedId = responses[0]?.ok === true
      ? (responses[0].result as { conversationId: string }).conversationId
      : ''
    expect(acceptedId).toBe('gw:conv:explicit-027')

    await dispatcher.handleRequest({
      type: 'request',
      id: 'chat-explicit-2',
      method: 'chat.send',
      params: { workerId: 'w_test', conversationId: acceptedId, content: 'second turn' },
    })

    expect(responses).toHaveLength(2)
    const second = responses[1]!
    expect(second.ok).toBe(true)
    if (second.ok)
      expect((second.result as { conversationId: string }).conversationId).toBe('gw:conv:explicit-027')
    expect(ingested.map(envelope => envelope.chatId)).toEqual(['gw:conv:explicit-027', 'gw:conv:explicit-027'])
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

describe('GatewayDispatcher — workers.info / workers.stop', () => {
  it('workers.info replies with the injected WorkerInfo for the local worker', async () => {
    let called = 0
    const info = fakeWorkerInfo()
    const { dispatcher, approvals, responses } = makeDispatcher({
      workersInfo: async () => {
        called += 1
        return info
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-wi-1',
      method: 'workers.info',
      params: { workerId: 'w_test' },
    })

    expect(called).toBe(1)
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(frame.result).toEqual(info)
    approvals.dispose()
  })

  it('workers.info rejects a workerId mismatch before invoking the handler', async () => {
    let called = 0
    const { dispatcher, approvals, responses } = makeDispatcher({
      workersInfo: async () => {
        called += 1
        return fakeWorkerInfo()
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-wi-2',
      method: 'workers.info',
      params: { workerId: 'w_other' },
    })

    expect(called).toBe(0)
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok)
      expect(frame.error.code).toBe('worker_mismatch')
    approvals.dispose()
  })

  it('workers.info returns method_not_implemented when the handler is absent', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher()

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-wi-3',
      method: 'workers.info',
      params: { workerId: 'w_test' },
    })

    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok) {
      expect(frame.error.code).toBe('method_not_implemented')
      expect(frame.error.message).toBe('workers.info handler not wired')
    }
    approvals.dispose()
  })

  it('workers.stop invokes the injected stop handler and replies stopped=true', async () => {
    let called = 0
    const { dispatcher, approvals, responses } = makeDispatcher({
      workersStop: async () => {
        called += 1
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-ws-1',
      method: 'workers.stop',
      params: { workerId: 'w_test' },
    })

    expect(called).toBe(1)
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(frame.result).toEqual({ stopped: true })
    approvals.dispose()
  })

  it('workers.stop rejects a workerId mismatch before invoking the handler', async () => {
    let called = 0
    const { dispatcher, approvals, responses } = makeDispatcher({
      workersStop: async () => {
        called += 1
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-ws-2',
      method: 'workers.stop',
      params: { workerId: 'w_other' },
    })

    expect(called).toBe(0)
    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok)
      expect(frame.error.code).toBe('worker_mismatch')
    approvals.dispose()
  })

  it('workers.stop returns method_not_implemented when the handler is absent', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher()

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-ws-3',
      method: 'workers.stop',
      params: { workerId: 'w_test' },
    })

    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok) {
      expect(frame.error.code).toBe('method_not_implemented')
      expect(frame.error.message).toBe('workers.stop handler not wired')
    }
    approvals.dispose()
  })
})

describe('GatewayDispatcher — brain bridge methods', () => {
  it('brain.summary replies with the injected summary payload', async () => {
    const { dispatcher, approvals, responses } = makeDispatcher({
      brainSummary: async () => ({ workerId: 'w_test', brainSummary: { artifacts: { total: 0 } } }),
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-brain-summary',
      method: 'brain.summary',
      params: { workerId: 'w_test' },
    })

    expect(responses).toHaveLength(1)
    expect(responses[0]?.ok).toBe(true)
    if (responses[0]?.ok)
      expect(responses[0].result).toEqual({ workerId: 'w_test', brainSummary: { artifacts: { total: 0 } } })
    approvals.dispose()
  })

  it('brain.admission.list forwards filter and reveal options', async () => {
    const seen: unknown[] = []
    const { dispatcher, approvals, responses } = makeDispatcher({
      brainAdmissionList: async (input) => {
        seen.push(input)
        return { count: 0, redacted: true, proposals: [] }
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-admission-list',
      method: 'brain.admission.list',
      params: {
        workerId: 'w_test',
        status: 'pending',
        kind: 'memory-add',
        scopeId: 'scope-1',
        soulId: 'developer',
        limit: 25,
        showSensitive: true,
      },
    })

    expect(seen).toEqual([{
      status: 'pending',
      kind: 'memory-add',
      scopeId: 'scope-1',
      soulId: 'developer',
      limit: 25,
      showSensitive: true,
    }])
    expect(responses[0]?.ok).toBe(true)
    approvals.dispose()
  })

  it('brain.admission.apply forwards commit and secret body policy', async () => {
    const seen: unknown[] = []
    const { dispatcher, approvals, responses } = makeDispatcher({
      brainAdmissionApply: async (input) => {
        seen.push(input)
        return { outcome: { kind: 'dry-run', target: 'memories/x', diff: '' } }
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-admission-apply',
      method: 'brain.admission.apply',
      params: {
        workerId: 'w_test',
        id: 'p-1',
        decidedBy: 'operator',
        commit: true,
        allowSecretBody: 'redact',
      },
    })

    expect(seen).toEqual([{ id: 'p-1', decidedBy: 'operator', commit: true, allowSecretBody: 'redact' }])
    expect(responses[0]?.ok).toBe(true)
    approvals.dispose()
  })

  it('brain.artifacts.show maps coded not-found errors to not_found', async () => {
    const err = new Error('brain artifact "a-missing" not found') as Error & { code: 'not-found' }
    err.code = 'not-found'
    const { dispatcher, approvals, responses } = makeDispatcher({
      brainArtifactsShow: async () => { throw err },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-artifact-show',
      method: 'brain.artifacts.show',
      params: { workerId: 'w_test', id: 'a-missing' },
    })

    expect(responses).toHaveLength(1)
    const frame = responses[0]!
    expect(frame.ok).toBe(false)
    if (!frame.ok)
      expect(frame.error.code).toBe('not_found')
    approvals.dispose()
  })

  it('brain.summary rejects workerId mismatch before invoking the handler', async () => {
    let called = 0
    const { dispatcher, approvals, responses } = makeDispatcher({
      brainSummary: async () => {
        called += 1
        return {}
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-brain-mismatch',
      method: 'brain.summary',
      params: { workerId: 'w_other' },
    })

    expect(called).toBe(0)
    expect(responses[0]?.ok).toBe(false)
    if (responses[0]?.ok === false)
      expect(responses[0].error.code).toBe('worker_mismatch')
    approvals.dispose()
  })
})

describe('GatewayDispatcher — orchestrator task journal', () => {
  it('reviews.list and reviews.show forward review requests to injected handlers', async () => {
    const seen: unknown[] = []
    const { dispatcher, approvals, responses } = makeDispatcher({
      reviewsList: async (input) => {
        seen.push(['list', input])
        return { reviews: [{ taskId: 'task-1' }] }
      },
      reviewsShow: async (input) => {
        seen.push(['show', input])
        return { review: { taskId: input.taskId } }
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-reviews-list',
      method: 'reviews.list',
      params: { workerId: 'w_test', limit: 12 },
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-reviews-show',
      method: 'reviews.show',
      params: { workerId: 'w_test', taskId: 'task-1' },
    })

    expect(seen).toEqual([
      ['list', { limit: 12 }],
      ['show', { taskId: 'task-1' }],
    ])
    expect(responses[0]?.ok).toBe(true)
    expect(responses[1]?.ok).toBe(true)
    approvals.dispose()
  })

  it('reviews.rerun and reviews.lessons.promote forward operator actions', async () => {
    const seen: unknown[] = []
    const { dispatcher, approvals, responses } = makeDispatcher({
      reviewsLessonsPromote: async (input) => {
        seen.push(['lessons', input])
        return { proposals: [{ id: 'p-1' }] }
      },
      reviewsRerun: async (input) => {
        seen.push(['rerun', input])
        return { run: { id: 'task-child' } }
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-reviews-rerun',
      method: 'reviews.rerun',
      params: { workerId: 'w_test', taskId: 'task-1', prompt: 'repair' },
    })
    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-reviews-lessons',
      method: 'reviews.lessons.promote',
      params: { workerId: 'w_test', taskId: 'task-1', scopeId: 'scope-1', soulId: 'developer' },
    })

    expect(seen).toEqual([
      ['rerun', { taskId: 'task-1', prompt: 'repair' }],
      ['lessons', { taskId: 'task-1', scopeId: 'scope-1', soulId: 'developer' }],
    ])
    expect(responses[0]?.ok).toBe(true)
    expect(responses[1]?.ok).toBe(true)
    approvals.dispose()
  })

  it('orchestrator.tasks.journal forwards task id to the injected handler', async () => {
    const seen: unknown[] = []
    const { dispatcher, approvals, responses } = makeDispatcher({
      taskJournal: async (input) => {
        seen.push(input)
        return { journal: { run: { id: input.taskId } } }
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-task-journal',
      method: 'orchestrator.tasks.journal',
      params: { workerId: 'w_test', taskId: 'task-1' },
    })

    expect(seen).toEqual([{ taskId: 'task-1' }])
    expect(responses[0]?.ok).toBe(true)
    if (responses[0]?.ok)
      expect(responses[0].result).toEqual({ journal: { run: { id: 'task-1' } } })
    approvals.dispose()
  })

  it('orchestrator.tasks.rerun forwards task id and optional prompt to the injected handler', async () => {
    const seen: unknown[] = []
    const { dispatcher, approvals, responses } = makeDispatcher({
      taskRerun: async (input) => {
        seen.push(input)
        return { task: { id: 'task-child' } }
      },
    })

    await dispatcher.handleRequest({
      type: 'request',
      id: 'req-task-rerun',
      method: 'orchestrator.tasks.rerun',
      params: { workerId: 'w_test', taskId: 'task-1', prompt: 'try again' },
    })

    expect(seen).toEqual([{ taskId: 'task-1', prompt: 'try again' }])
    expect(responses[0]?.ok).toBe(true)
    if (responses[0]?.ok)
      expect(responses[0].result).toEqual({ task: { id: 'task-child' } })
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
