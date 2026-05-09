import type { WorkerRuntime } from '@zonease/aiworker-core'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordBrainJournalEvent } from '@zonease/aiworker-core'
import { agentTasks, closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildReviewRoutes } from './routes'

function stubRuntime(
  rerunTask: (taskId: string, options?: { prompt?: string }) => Promise<{ id: string }> = async () => ({ id: 'run-rerun' }),
): WorkerRuntime {
  return {
    workerId: 'w_reviews_test',
    config: {
      brainRetrieval: 'first-match',
      brainWriteTarget: '',
      brains: [],
      channels: [],
      evolution: { enabled: false, observationRetentionDays: 7 },
      executor: { engine: 'codex', variant: 'default' },
    } as WorkerRuntime['config'],
    brain: {} as WorkerRuntime['brain'],
    executor: {} as WorkerRuntime['executor'],
    channels: {} as WorkerRuntime['channels'],
    bus: {} as WorkerRuntime['bus'],
    orchestrator: { rerunTask } as unknown as WorkerRuntime['orchestrator'],
    cron: {} as WorkerRuntime['cron'],
    workspaces: {} as WorkerRuntime['workspaces'],
    processes: {} as WorkerRuntime['processes'],
    approvals: {} as WorkerRuntime['approvals'],
    dispose: () => undefined,
  }
}

describe('buildReviewRoutes', () => {
  let tmp: string

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-review-routes-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('GET / returns product-facing reviews', async () => {
    seedTask('run-review-api', 'review run API')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'run-review-api',
      payload: { action: 'pass', mode: 'observe-only', reason: 'reviewed', status: 'reviewed' },
    })

    const routes = buildReviewRoutes(() => stubRuntime())
    const res = await routes.fetch(new Request('http://w/?limit=10'))

    expect(res.status).toBe(200)
    const body = await res.json() as { reviews: Array<{ taskId: string, reviewDecision: { status: string } }> }
    expect(body.reviews[0]).toMatchObject({
      reviewDecision: { status: 'ready_to_ship' },
      taskId: 'run-review-api',
    })
  })

  it('POST /:taskId/lessons/promote creates pending promotion proposals', async () => {
    seedTask('run-review-lessons', 'extract review lessons')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'run-review-lessons',
      payload: {
        lessonCandidates: [
          {
            confidence: 0.7,
            evidenceRefs: ['agent_tasks:run-review-lessons'],
            kind: 'repo-fact',
            risk: 'medium',
            summary: 'Promotion creates pending durable-context proposals.',
          },
        ],
      },
    })
    const routes = buildReviewRoutes(() => stubRuntime())
    const res = await routes.fetch(new Request('http://w/run-review-lessons/lessons/promote', {
      body: JSON.stringify({ scopeId: 'repo:aiworker', soulId: 'developer' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as {
      promotion: { proposals: Array<{ status: string, summary: string }> }
      review: { lessons: { proposalIds: string[] } }
    }
    expect(body.promotion.proposals[0]).toMatchObject({
      status: 'pending',
      summary: 'Promotion creates pending durable-context proposals.',
    })
    expect(body.review.lessons.proposalIds).toHaveLength(1)
  })

  it('POST /:taskId/rerun returns a product-facing run key', async () => {
    let received: { taskId: string, prompt?: string } | undefined
    const routes = buildReviewRoutes(() => stubRuntime(async (taskId, options) => {
      received = { taskId, ...(options?.prompt === undefined ? {} : { prompt: options.prompt }) }
      seedTask('run-child', 'child review run')
      return { id: 'run-child' }
    }))
    const res = await routes.fetch(new Request('http://w/run-parent/rerun', {
      body: JSON.stringify({ prompt: 'repair with review evidence' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { run: { id: string }, review: { taskId: string } }
    expect(received).toEqual({ taskId: 'run-parent', prompt: 'repair with review evidence' })
    expect(body.run.id).toBe('run-child')
    expect(body.review.taskId).toBe('run-child')
  })
})

function seedTask(id: string, prompt: string): void {
  getWorkerDb().insert(agentTasks).values({
    createdAt: '2026-05-09T06:20:00.000Z',
    finishedAt: '2026-05-09T06:21:00.000Z',
    id,
    prompt,
    result: { ok: true },
    status: 'succeeded',
  }).run()
}
