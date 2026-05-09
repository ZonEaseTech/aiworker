import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { agentTasks, closeWorkerDb, conversations, getWorkerDb, initWorkerDb, messages, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BrainJournalService, buildGateVerdict, recordBrainJournalEvent } from './service'

const NOW = '2026-05-09T03:30:00.000Z'

describe('BrainJournalService task trace (PLAN-174)', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-brain-journal-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(() => {
    closeWorkerDb()
  })

  it('returns a readable successful task trace with decisions, tool events, and redacted previews', () => {
    seedTask('task-ok', 'Review token sk-test-abcdefghijklmnopqrstuvwxyz and summarize', 'succeeded', { assistantMessageId: 2 })
    seedConversation('conv-ok', 'task-ok')
    getWorkerDb().insert(messages).values([
      {
        conversationId: 'conv-ok',
        role: 'user',
        content: 'Review token sk-test-abcdefghijklmnopqrstuvwxyz and summarize',
        createdAt: NOW,
      },
      {
        conversationId: 'conv-ok',
        role: 'assistant',
        content: 'done',
        createdAt: '2026-05-09T03:30:05.000Z',
      },
    ]).run()
    recordBrainJournalEvent({
      at: NOW,
      conversationId: 'conv-ok',
      kind: 'decision.capability',
      taskId: 'task-ok',
      payload: {
        loadedMemoryIds: ['mem-1'],
        loadedSkillIds: ['skill-1'],
        token: 'secret-token',
      },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T03:30:01.000Z',
      conversationId: 'conv-ok',
      kind: 'tool.use',
      taskId: 'task-ok',
      payload: { id: 'tool-1', name: 'read_file', arguments: { path: 'README.md' } },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T03:30:02.000Z',
      conversationId: 'conv-ok',
      kind: 'gate.quality',
      taskId: 'task-ok',
      payload: { action: 'pass', evaluator: 'heuristic', reason: 'sufficient' },
    })

    const trace = new BrainJournalService({
      config: {
        brainRetrieval: 'first-match',
        brainWriteTarget: '',
        brains: [],
        channels: [],
        evolution: { enabled: false, observationRetentionDays: 7 },
        executor: { engine: 'codex', variant: 'default' },
      },
      workerId: 'w-journal',
    }).getTaskTrace('task-ok')

    expect(trace).not.toBeNull()
    expect(trace?.workerId).toBe('w-journal')
    expect(trace?.executor.authorityMode).toBe('unmanaged_ambient')
    expect(trace?.proofLoop).toMatchObject({ gate: 'recorded', journal: 'recorded', status: 'succeeded' })
    expect(trace?.brainContext).toEqual({ loadedMemoryIds: ['mem-1'], loadedSkillIds: ['skill-1'] })
    expect(trace?.toolEvents).toHaveLength(1)
    expect(trace?.task.prompt).toContain('[REDACTED:')
    expect(trace?.messages[0]?.contentPreview).toContain('[REDACTED:')
    expect(trace?.decisions.capability?.token).toBe('<redacted>')
  })

  it('represents failed task lineage to a rerun without mutating the original attempt', () => {
    seedTask('task-failed', 'fix broken test', 'failed', null, 'test failed')
    seedTask('task-rerun', 'fix broken test with repair context', 'queued')
    seedConversation('conv-failed', 'task-failed')
    recordBrainJournalEvent({
      at: NOW,
      conversationId: 'conv-failed',
      kind: 'task.failed',
      taskId: 'task-failed',
      payload: { childTaskId: 'task-rerun', error: 'test failed', status: 'failed' },
    })

    const trace = new BrainJournalService().getTaskTrace('task-failed')

    expect(trace?.task.status).toBe('failed')
    expect(trace?.lineage.childTaskIds).toEqual(['task-rerun'])
    expect(trace?.lineage.parentTaskIds).toEqual([])
    expect(trace?.proofLoop.status).toBe('failed')
  })

  it('keeps task traces scoped inside a shared conversation', () => {
    getWorkerDb().insert(agentTasks).values([
      {
        id: 'task-one',
        prompt: 'first task',
        status: 'succeeded',
        conversationId: 'conv-shared',
        createdAt: '2026-05-09T03:30:00.000Z',
        finishedAt: '2026-05-09T03:30:10.000Z',
        result: { assistantMessageId: 2 },
      },
      {
        id: 'task-two',
        prompt: 'second task',
        status: 'succeeded',
        conversationId: 'conv-shared',
        createdAt: '2026-05-09T03:31:00.000Z',
        finishedAt: '2026-05-09T03:31:10.000Z',
        result: { assistantMessageId: 4 },
      },
    ]).run()
    getWorkerDb().insert(conversations).values({
      id: 'conv-shared',
      channel: 'web',
      chatId: 'chat-shared',
      status: 'open',
      startedAt: NOW,
      lastActiveAt: NOW,
    }).run()
    getWorkerDb().insert(messages).values([
      { conversationId: 'conv-shared', role: 'user', content: 'first task', createdAt: '2026-05-09T03:30:01.000Z' },
      { conversationId: 'conv-shared', role: 'assistant', content: 'first answer', createdAt: '2026-05-09T03:30:09.000Z' },
      { conversationId: 'conv-shared', role: 'user', content: 'second task', createdAt: '2026-05-09T03:31:01.000Z' },
      { conversationId: 'conv-shared', role: 'assistant', content: 'second answer', createdAt: '2026-05-09T03:31:09.000Z' },
    ]).run()
    recordBrainJournalEvent({
      at: '2026-05-09T03:30:09.000Z',
      conversationId: 'conv-shared',
      kind: 'gate.quality',
      taskId: 'task-one',
      payload: { action: 'warn', evaluator: 'heuristic', reason: 'first gate' },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T03:31:09.000Z',
      conversationId: 'conv-shared',
      kind: 'gate.quality',
      taskId: 'task-two',
      payload: { action: 'pass', evaluator: 'heuristic', reason: 'second gate' },
    })

    const first = new BrainJournalService().getTaskTrace('task-one')
    const second = new BrainJournalService().getTaskTrace('task-two')

    expect(first?.events.map(event => event.payload.reason)).toEqual(['first gate'])
    expect(first?.messages.map(message => message.contentPreview)).toEqual(['first task', 'first answer'])
    expect(first?.gateVerdict.action).toBe('warn')
    expect(second?.events.map(event => event.payload.reason)).toEqual(['second gate'])
    expect(second?.messages.map(message => message.contentPreview)).toEqual(['second task', 'second answer'])
    expect(second?.gateVerdict.action).toBe('pass')
  })
})

describe('buildGateVerdict (PLAN-175)', () => {
  it('normalizes pass, warn, repair, hold, and block-shaped verdicts', () => {
    expect(buildGateVerdict([event(1, 'gate.quality', { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'ok' })]).action).toBe('pass')
    expect(buildGateVerdict([event(2, 'gate.quality', { action: 'warn', evaluator: 'heuristic', mode: 'observe_only', reason: 'warn' })]).action).toBe('warn')
    expect(buildGateVerdict([event(3, 'gate.quality', { action: 'repair', evaluator: 'llm', mode: 'enforced', reason: 'repair needed' })])).toMatchObject({
      action: 'repair',
      mode: 'enforced',
      reasons: [{ source: 'brain-engine-review' }],
    })
    expect(buildGateVerdict([event(4, 'admission.bypass_suspected', { reason: 'assistant claimed memory write' })])).toMatchObject({
      action: 'hold',
      mode: 'enforced',
      reasons: [{ source: 'kernel-invariant' }],
    })
    expect(buildGateVerdict([event(5, 'gate.quality', { action: 'block', evaluator: 'heuristic', mode: 'enforced', reason: 'unsafe' })]).action).toBe('block')
  })

  it('cites Brain Engine review reasons separately from hard invariants and heuristic gates', () => {
    const verdict = buildGateVerdict([
      event(1, 'gate.quality', { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'heuristic passed' }),
      event(2, 'brain_engine.review', { action: 'repair', mode: 'observe-only', reason: 'missing evidence', status: 'reviewed' }),
    ])

    expect(verdict.action).toBe('repair')
    expect(verdict.mode).toBe('observe-only')
    expect(verdict.reasons.map(reason => reason.source)).toEqual(['brain-engine-review', 'heuristic'])
    expect(verdict.evidenceRefs).toEqual(['brain_journal_events:2', 'brain_journal_events:1'])
  })

  it('keeps kernel invariant holds authoritative while preserving review context', () => {
    const verdict = buildGateVerdict([
      event(1, 'brain_engine.review', { action: 'pass', mode: 'observe-only', reason: 'review passed', status: 'reviewed' }),
      event(2, 'admission.bypass_suspected', { reason: 'assistant claimed memory write' }),
    ])

    expect(verdict.action).toBe('hold')
    expect(verdict.mode).toBe('enforced')
    expect(verdict.reasons.map(reason => reason.source)).toEqual(['kernel-invariant', 'brain-engine-review'])
  })

  it('uses reviewed Brain Engine pass when no heuristic gate exists', () => {
    const verdict = buildGateVerdict([
      event(1, 'brain_engine.review', { action: 'pass', mode: 'observe-only', reason: 'review passed', status: 'reviewed' }),
    ])

    expect(verdict.action).toBe('pass')
    expect(verdict.mode).toBe('observe-only')
    expect(verdict.reasons.map(reason => reason.source)).toEqual(['brain-engine-review'])
    expect(verdict.evidenceRefs).toEqual(['brain_journal_events:1'])
  })

  it('warns on high-risk ambient authority without claiming enforcement', () => {
    const verdict = buildGateVerdict([
      event(1, 'authority.preflight', {
        authorityMode: 'unmanaged_ambient',
        enforceable: false,
        operatorMode: 'ambient',
        recommendation: 'prefer-plan-only',
        risk: 'high',
        signals: [{ type: 'database', reason: 'task mentions database' }],
        warning: 'High-risk task under unmanaged ambient executor authority.',
      }),
      event(2, 'gate.quality', { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'quality passed' }),
    ])

    expect(verdict.action).toBe('warn')
    expect(verdict.mode).toBe('observe-only')
    expect(verdict.reasons.map(reason => reason.source)).toEqual(['authority-preflight', 'heuristic'])
  })

  it('keeps high-risk ambient authority visible even when Brain Engine passes without a quality gate', () => {
    const verdict = buildGateVerdict([
      event(1, 'authority.preflight', {
        authorityMode: 'unmanaged_ambient',
        enforceable: false,
        operatorMode: 'ambient',
        recommendation: 'prefer-plan-only',
        risk: 'high',
        signals: [{ type: 'database', reason: 'task mentions database' }],
        warning: 'High-risk task under unmanaged ambient executor authority.',
      }),
      event(2, 'brain_engine.review', { action: 'pass', mode: 'observe-only', reason: 'review passed', status: 'reviewed' }),
    ])

    expect(verdict.action).toBe('warn')
    expect(verdict.mode).toBe('observe-only')
    expect(verdict.reasons.map(reason => reason.source)).toEqual(['authority-preflight', 'brain-engine-review'])
  })
})

function event(id: number, kind: string, payload: Record<string, unknown>) {
  return {
    at: `2026-05-09T03:3${id}:00.000Z`,
    id,
    kind,
    payload,
  }
}

function seedTask(id: string, prompt: string, status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled', result?: Record<string, unknown> | null, error?: string): void {
  getWorkerDb().insert(agentTasks).values({
    id,
    prompt,
    status,
    createdAt: NOW,
    ...(status === 'queued' || status === 'running' ? {} : { finishedAt: '2026-05-09T03:31:00.000Z' }),
    ...(result === undefined || result === null ? {} : { result }),
    ...(error === undefined ? {} : { error }),
  }).run()
}

function seedConversation(id: string, taskId: string): void {
  getWorkerDb().insert(conversations).values({
    id,
    taskId,
    channel: 'web',
    chatId: `task:${taskId}`,
    status: 'open',
    startedAt: NOW,
    lastActiveAt: NOW,
  }).run()
}
