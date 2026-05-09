import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { agentTasks, closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

let rerunImpl: (taskId: string, options?: { prompt?: string }) => Promise<{ id: string }> = async () => ({ id: 'task-child' })

mock.module('../../context', () => ({
  buildRuntime: () => ({
    dispose: () => undefined,
    orchestrator: { rerunTask: rerunImpl },
  }),
  loadWorkerContext: async () => ({
    configVersion: 1,
    hydrated: {
      brainRetrieval: 'first-match',
      brainWriteTarget: '',
      brains: [],
      channels: [],
      evolution: { enabled: false, observationRetentionDays: 7 },
      executor: { engine: 'codex', variant: 'default' },
    },
    workerId: 'w_case_cli',
  }),
}))

const { recordBrainJournalEvent } = await import('@zonease/aiworker-core')
const {
  runReviewList,
  runReviewPromoteLessons,
  runReviewRerun,
  runReviewShow,
} = await import('./case')

describe('aiworker review commands', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-cli-case-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    rerunImpl = async () => ({ id: 'task-child' })
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
    const captured: string[] = []
    const original = console.log
    console.log = ((...args: unknown[]) => {
      captured.push(args.map(arg => String(arg)).join(' '))
    }) as typeof console.log
    return fn()
      .then(result => ({ result, output: captured.join('\n') }))
      .finally(() => {
        console.log = original
      })
  }

  it('review list returns product-facing review projections', async () => {
    seedTask('task-review-cli', 'show review list')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'task-review-cli',
      payload: { action: 'pass', mode: 'observe-only', reason: 'reviewed', status: 'reviewed' },
    })

    const { result, output } = await captureConsole(() => runReviewList({ limit: 5 }))

    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { reviews: Array<{ taskId: string, reviewDecision: { status: string } }> }
    expect(parsed.reviews[0]).toMatchObject({
      reviewDecision: { status: 'ready_to_ship' },
      taskId: 'task-review-cli',
    })
  })

  it('review show returns one redacted review', async () => {
    seedTask('task-review-show', 'show token sk-test-abcdefghijklmnopqrstuvwxyz')
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-review-show',
      payload: { action: 'warn', evaluator: 'heuristic', mode: 'observe_only', reason: 'needs review' },
    })

    const { result, output } = await captureConsole(() => runReviewShow('task-review-show'))

    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { review: { workOrder: { prompt: string }, reviewDecision: { status: string } } }
    expect(parsed.review.reviewDecision.status).toBe('needs_review')
    expect(parsed.review.workOrder.prompt).toContain('[REDACTED:')
  })

  it('review promote creates pending proposals from review lesson candidates', async () => {
    seedTask('task-review-promotion', 'promote review lesson')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'task-review-promotion',
      payload: {
        lessonCandidates: [
          {
            confidence: 0.7,
            evidenceRefs: ['agent_tasks:task-review-promotion'],
            kind: 'repo-fact',
            risk: 'medium',
            summary: 'Review promotion stays pending until operator approval.',
          },
        ],
      },
    })

    const { result, output } = await captureConsole(() => runReviewPromoteLessons('task-review-promotion', {
      scopeId: 'repo:aiworker',
      soulId: 'developer',
    }))

    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { promotion: { proposals: Array<{ status: string, summary: string }> }, review: { lessons: { proposalIds: string[] } } }
    expect(parsed.promotion.proposals[0]).toMatchObject({
      status: 'pending',
      summary: 'Review promotion stays pending until operator approval.',
    })
    expect(parsed.review.lessons.proposalIds).toHaveLength(1)
  })

  it('review rerun delegates to bounded orchestrator rerun with product-facing output', async () => {
    let received: { taskId: string, prompt?: string } | undefined
    rerunImpl = async (taskId, options) => {
      received = { taskId, ...(options?.prompt === undefined ? {} : { prompt: options.prompt }) }
      seedTask('task-review-child', 'child review rerun')
      return { id: 'task-review-child' }
    }

    const { result, output } = await captureConsole(() => runReviewRerun('task-review-parent', { prompt: 'repair' }))

    expect(result).toBe(0)
    expect(received).toEqual({ taskId: 'task-review-parent', prompt: 'repair' })
    const parsed = JSON.parse(output) as { run: { id: string }, review: { taskId: string } }
    expect(parsed.run.id).toBe('task-review-child')
    expect(parsed.review.taskId).toBe('task-review-child')
  })
})

function seedTask(id: string, prompt: string): void {
  getWorkerDb().insert(agentTasks).values({
    id,
    prompt,
    status: 'succeeded',
    createdAt: '2026-05-09T06:30:00.000Z',
    finishedAt: '2026-05-09T06:31:00.000Z',
    result: { ok: true },
  }).run()
}
