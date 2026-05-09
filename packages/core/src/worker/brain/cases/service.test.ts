import type { WorkerConfig } from '@zonease/aiworker-shared'

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { agentTasks, closeWorkerDb, conversations, getWorkerDb, initWorkerDb, messages, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { recordBrainJournalEvent } from '../journal'
import { BrainCaseService } from './service'

const NOW = '2026-05-09T06:10:00.000Z'

describe('BrainCaseService (FEAT-057)', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-brain-case-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('projects a successful Journal trace into an operator-facing Case File', () => {
    seedTask('task-case-ok', 'ship the worker case surface', 'succeeded')
    seedConversation('conv-case-ok', 'task-case-ok')
    seedAssistantMessage('conv-case-ok', 'Implemented and verified the case surface.')
    recordBrainJournalEvent({
      at: NOW,
      conversationId: 'conv-case-ok',
      kind: 'decision.capability',
      taskId: 'task-case-ok',
      payload: {
        loadedMemoryIds: ['mem-release'],
        loadedSkillIds: ['skill-review'],
      },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T06:10:01.000Z',
      conversationId: 'conv-case-ok',
      kind: 'gate.quality',
      taskId: 'task-case-ok',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'quality gate passed' },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T06:10:02.000Z',
      conversationId: 'conv-case-ok',
      kind: 'brain_engine.review',
      taskId: 'task-case-ok',
      payload: {
        action: 'pass',
        mode: 'observe-only',
        reason: 'evidence is sufficient',
        status: 'reviewed',
        lessonCandidates: [
          {
            kind: 'architecture-decision',
            summary: 'Case File should remain a projection over Brain Journal.',
            evidenceRefs: ['brain_journal_events:2'],
            confidence: 0.8,
            risk: 'low',
          },
        ],
      },
    })

    const file = new BrainCaseService({
      config: workerConfig('codex'),
      workerId: 'w-case',
    }).getCaseFile('task-case-ok')

    expect(file).not.toBeNull()
    expect(file?.workerId).toBe('w-case')
    expect(file?.reviewDecision.status).toBe('ready_to_ship')
    expect(file?.reviewDecision.summary).toContain('ready to ship')
    expect(file?.evidence).toMatchObject({
      messageCount: 1,
      toolEventCount: 0,
      loadedMemoryIds: ['mem-release'],
      loadedSkillIds: ['skill-review'],
    })
    expect(file?.risk.authorityMode).toBe('unmanaged_ambient')
    expect(file?.lessons.candidateCount).toBe(1)
    expect(file?.lessons.candidates[0]).toMatchObject({
      confidence: 0.8,
      risk: 'low',
      summary: 'Case File should remain a projection over Brain Journal.',
    })
    expect(file?.rawJournalRef).toBe('brain_journal:task-case-ok')
  })

  it('maps failed and high-risk cases to operator decisions without claiming enforcement', () => {
    seedTask('task-case-risk', 'delete production database', 'succeeded')
    seedConversation('conv-case-risk', 'task-case-risk')
    recordBrainJournalEvent({
      kind: 'authority.preflight',
      taskId: 'task-case-risk',
      payload: {
        authorityMode: 'unmanaged_ambient',
        enforceable: false,
        operatorMode: 'ambient',
        recommendation: 'switch to plan-only',
        risk: 'high',
        signals: [{ type: 'database', reason: 'task mentions database' }],
        warning: 'High-risk task under unmanaged ambient executor authority.',
      },
    })
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-case-risk',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'quality passed' },
    })

    const file = new BrainCaseService({ config: workerConfig('claude-code') }).getCaseFile('task-case-risk')

    expect(file?.reviewDecision.status).toBe('needs_review')
    expect(file?.reviewDecision.action).toBe('warn')
    expect(file?.risk).toMatchObject({
      enforceable: false,
      recommendation: 'switch to plan-only',
      risk: 'high',
      warning: 'High-risk task under unmanaged ambient executor authority.',
    })
    expect(file?.risk.signals).toEqual([{ type: 'database', reason: 'task mentions database' }])
  })

  it('does not mark pure heuristic observe-only pass as ready to ship', () => {
    seedTask('task-case-heuristic', 'simple response', 'succeeded')
    seedConversation('conv-case-heuristic', 'task-case-heuristic')
    seedAssistantMessage('conv-case-heuristic', 'Heuristic-only answer.')
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-case-heuristic',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'heuristic quality gate passed' },
    })

    const file = new BrainCaseService({ config: workerConfig('codex') }).getCaseFile('task-case-heuristic')

    expect(file?.reviewDecision.status).toBe('needs_review')
    expect(file?.reviewDecision.summary).toContain('heuristic quality gate passed')
  })

  it('keeps Case outcome and evidence scoped to its task in a shared conversation', () => {
    getWorkerDb().insert(agentTasks).values([
      {
        id: 'task-case-first',
        prompt: 'first task',
        status: 'failed',
        conversationId: 'conv-case-shared',
        createdAt: '2026-05-09T06:00:00.000Z',
        finishedAt: '2026-05-09T06:00:10.000Z',
        error: 'executor failed',
      },
      {
        id: 'task-case-second',
        prompt: 'second task',
        status: 'succeeded',
        conversationId: 'conv-case-shared',
        createdAt: '2026-05-09T06:01:00.000Z',
        finishedAt: '2026-05-09T06:01:10.000Z',
        result: { assistantMessageId: 4 },
      },
    ]).run()
    getWorkerDb().insert(conversations).values({
      id: 'conv-case-shared',
      channel: 'web',
      chatId: 'task:shared',
      status: 'open',
      startedAt: NOW,
      lastActiveAt: NOW,
    }).run()
    getWorkerDb().insert(messages).values([
      { conversationId: 'conv-case-shared', role: 'user', content: 'first task', createdAt: '2026-05-09T06:00:01.000Z' },
      { conversationId: 'conv-case-shared', role: 'assistant', content: 'first failed partial', createdAt: '2026-05-09T06:00:09.000Z' },
      { conversationId: 'conv-case-shared', role: 'user', content: 'second task', createdAt: '2026-05-09T06:01:01.000Z' },
      { conversationId: 'conv-case-shared', role: 'assistant', content: 'second final answer', createdAt: '2026-05-09T06:01:09.000Z' },
    ]).run()
    recordBrainJournalEvent({
      at: '2026-05-09T06:00:09.000Z',
      conversationId: 'conv-case-shared',
      kind: 'task.failed',
      taskId: 'task-case-first',
      payload: { error: 'executor failed' },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T06:01:09.000Z',
      conversationId: 'conv-case-shared',
      kind: 'brain_engine.review',
      taskId: 'task-case-second',
      payload: { action: 'pass', mode: 'observe-only', reason: 'second reviewed', status: 'reviewed' },
    })

    const first = new BrainCaseService({ config: workerConfig('codex') }).getCaseFile('task-case-first')
    const second = new BrainCaseService({ config: workerConfig('codex') }).getCaseFile('task-case-second')

    expect(first?.reviewDecision.status).toBe('needs_rerun')
    expect(first?.outcome.assistantPreview).toBe('first failed partial')
    expect(first?.evidence.journalEventCount).toBe(1)
    expect(first?.reviewDecision.reasons.map(reason => reason.reason)).toEqual(['executor failed'])
    expect(second?.reviewDecision.status).toBe('ready_to_ship')
    expect(second?.outcome.assistantPreview).toBe('second final answer')
    expect(second?.evidence.journalEventCount).toBe(1)
    expect(second?.reviewDecision.reasons.map(reason => reason.reason)).toEqual(['second reviewed'])
  })

  it('lists recent cases in descending task order', () => {
    seedTask('task-old', 'old case', 'succeeded', '2026-05-09T06:00:00.000Z')
    seedTask('task-new', 'new case', 'failed', '2026-05-09T06:20:00.000Z', 'executor failed')
    recordBrainJournalEvent({
      kind: 'task.failed',
      taskId: 'task-new',
      payload: { error: 'executor failed' },
    })

    const cases = new BrainCaseService({ config: workerConfig('http') }).listCases({ limit: 2 })

    expect(cases.map(item => item.taskId)).toEqual(['task-new', 'task-old'])
    expect(cases[0]?.reviewDecision.status).toBe('needs_rerun')
    expect(cases[1]?.reviewDecision.status).toBe('needs_review')
  })
})

function workerConfig(engine: 'codex' | 'claude-code' | 'http') {
  return {
    brainRetrieval: 'first-match',
    brainWriteTarget: '',
    brains: [],
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
    executor: { engine, variant: 'default' },
  } as WorkerConfig
}

function seedTask(
  id: string,
  prompt: string,
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled',
  createdAt = NOW,
  error?: string,
): void {
  getWorkerDb().insert(agentTasks).values({
    id,
    prompt,
    status,
    createdAt,
    ...(status === 'queued' || status === 'running' ? {} : { finishedAt: '2026-05-09T06:11:00.000Z' }),
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

function seedAssistantMessage(conversationId: string, content: string): void {
  getWorkerDb().insert(messages).values({
    conversationId,
    role: 'assistant',
    content,
    createdAt: NOW,
  }).run()
}
