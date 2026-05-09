import type { WorkerConfig } from '@zonease/aiworker-shared'

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { agentTasks, closeWorkerDb, conversations, getWorkerDb, initWorkerDb, messages, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { recordBrainJournalEvent } from '../brain/journal'
import { WorkerReviewService } from './service'

const NOW = '2026-05-09T06:10:00.000Z'

describe('WorkerReviewService (FEAT-057)', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-review-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('projects a successful Journal trace into an operator-facing Worker Review', () => {
    seedTask('task-review-ok', 'ship the worker review surface', 'succeeded')
    seedConversation('conv-review-ok', 'task-review-ok')
    seedAssistantMessage('conv-review-ok', 'Implemented and verified the review surface.')
    recordBrainJournalEvent({
      at: NOW,
      conversationId: 'conv-review-ok',
      kind: 'decision.capability',
      taskId: 'task-review-ok',
      payload: {
        loadedMemoryIds: ['mem-release'],
        loadedSkillIds: ['skill-review'],
      },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T06:10:01.000Z',
      conversationId: 'conv-review-ok',
      kind: 'gate.quality',
      taskId: 'task-review-ok',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'quality gate passed' },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T06:10:02.000Z',
      conversationId: 'conv-review-ok',
      kind: 'brain_engine.review',
      taskId: 'task-review-ok',
      payload: {
        action: 'pass',
        mode: 'observe-only',
        reason: 'evidence is sufficient',
        status: 'reviewed',
        lessonCandidates: [
          {
            kind: 'architecture-decision',
            summary: 'Worker Review should remain a projection over Brain Journal.',
            evidenceRefs: ['brain_journal_events:2'],
            confidence: 0.8,
            risk: 'low',
          },
        ],
      },
    })

    const file = new WorkerReviewService({
      config: workerConfig('codex'),
      workerId: 'w-review',
    }).getReview('task-review-ok')

    expect(file).not.toBeNull()
    expect(file?.workerId).toBe('w-review')
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
      summary: 'Worker Review should remain a projection over Brain Journal.',
    })
    expect(file?.rawJournalRef).toBe('brain_journal:task-review-ok')
  })

  it('maps failed and high-risk reviews to operator decisions without claiming enforcement', () => {
    seedTask('task-review-risk', 'delete production database', 'succeeded')
    seedConversation('conv-review-risk', 'task-review-risk')
    recordBrainJournalEvent({
      kind: 'authority.preflight',
      taskId: 'task-review-risk',
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
      taskId: 'task-review-risk',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'quality passed' },
    })

    const file = new WorkerReviewService({ config: workerConfig('claude-code') }).getReview('task-review-risk')

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
    seedTask('task-review-heuristic', 'simple response', 'succeeded')
    seedConversation('conv-review-heuristic', 'task-review-heuristic')
    seedAssistantMessage('conv-review-heuristic', 'Heuristic-only answer.')
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-review-heuristic',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'heuristic quality gate passed' },
    })

    const file = new WorkerReviewService({ config: workerConfig('codex') }).getReview('task-review-heuristic')

    expect(file?.reviewDecision.status).toBe('needs_review')
    expect(file?.reviewDecision.summary).toContain('heuristic quality gate passed')
  })

  it('keeps Review outcome and evidence scoped to its task in a shared conversation', () => {
    getWorkerDb().insert(agentTasks).values([
      {
        id: 'task-review-first',
        prompt: 'first task',
        status: 'failed',
        conversationId: 'conv-review-shared',
        createdAt: '2026-05-09T06:00:00.000Z',
        finishedAt: '2026-05-09T06:00:10.000Z',
        error: 'executor failed',
      },
      {
        id: 'task-review-second',
        prompt: 'second task',
        status: 'succeeded',
        conversationId: 'conv-review-shared',
        createdAt: '2026-05-09T06:01:00.000Z',
        finishedAt: '2026-05-09T06:01:10.000Z',
        result: { assistantMessageId: 4 },
      },
    ]).run()
    getWorkerDb().insert(conversations).values({
      id: 'conv-review-shared',
      channel: 'web',
      chatId: 'task:shared',
      status: 'open',
      startedAt: NOW,
      lastActiveAt: NOW,
    }).run()
    getWorkerDb().insert(messages).values([
      { conversationId: 'conv-review-shared', role: 'user', content: 'first task', createdAt: '2026-05-09T06:00:01.000Z' },
      { conversationId: 'conv-review-shared', role: 'assistant', content: 'first failed partial', createdAt: '2026-05-09T06:00:09.000Z' },
      { conversationId: 'conv-review-shared', role: 'user', content: 'second task', createdAt: '2026-05-09T06:01:01.000Z' },
      { conversationId: 'conv-review-shared', role: 'assistant', content: 'second final answer', createdAt: '2026-05-09T06:01:09.000Z' },
    ]).run()
    recordBrainJournalEvent({
      at: '2026-05-09T06:00:09.000Z',
      conversationId: 'conv-review-shared',
      kind: 'task.failed',
      taskId: 'task-review-first',
      payload: { error: 'executor failed' },
    })
    recordBrainJournalEvent({
      at: '2026-05-09T06:01:09.000Z',
      conversationId: 'conv-review-shared',
      kind: 'brain_engine.review',
      taskId: 'task-review-second',
      payload: { action: 'pass', mode: 'observe-only', reason: 'second reviewed', status: 'reviewed' },
    })

    const first = new WorkerReviewService({ config: workerConfig('codex') }).getReview('task-review-first')
    const second = new WorkerReviewService({ config: workerConfig('codex') }).getReview('task-review-second')

    expect(first?.reviewDecision.status).toBe('needs_rerun')
    expect(first?.outcome.assistantPreview).toBe('first failed partial')
    expect(first?.evidence.journalEventCount).toBe(1)
    expect(first?.reviewDecision.reasons.map(reason => reason.reason)).toEqual(['executor failed'])
    expect(second?.reviewDecision.status).toBe('ready_to_ship')
    expect(second?.outcome.assistantPreview).toBe('second final answer')
    expect(second?.evidence.journalEventCount).toBe(1)
    expect(second?.reviewDecision.reasons.map(reason => reason.reason)).toEqual(['second reviewed'])
  })

  it('lists recent reviews in descending task order', () => {
    seedTask('task-old', 'old review', 'succeeded', '2026-05-09T06:00:00.000Z')
    seedTask('task-new', 'new review', 'failed', '2026-05-09T06:20:00.000Z', 'executor failed')
    recordBrainJournalEvent({
      kind: 'task.failed',
      taskId: 'task-new',
      payload: { error: 'executor failed' },
    })

    const reviews = new WorkerReviewService({ config: workerConfig('http') }).listReviews({ limit: 2 })

    expect(reviews.map(item => item.taskId)).toEqual(['task-new', 'task-old'])
    expect(reviews[0]?.reviewDecision.status).toBe('needs_rerun')
    expect(reviews[1]?.reviewDecision.status).toBe('needs_review')
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
