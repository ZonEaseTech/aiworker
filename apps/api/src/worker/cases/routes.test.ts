import type { WorkerRuntime } from '@zonease/aiworker-core'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordBrainJournalEvent } from '@zonease/aiworker-core'
import { agentTasks, closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildCaseRoutes } from './routes'

function stubRuntime(
  rerunTask: (taskId: string, options?: { prompt?: string }) => Promise<{ id: string }> = async () => ({ id: 'task-rerun' }),
): WorkerRuntime {
  return {
    workerId: 'w_cases_test',
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

describe('buildCaseRoutes (FEAT-057)', () => {
  let tmp: string

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-case-routes-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('GET / returns operator-facing Case Files', async () => {
    seedTask('task-case-api', 'review case API')
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-case-api',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'ok' },
    })

    const routes = buildCaseRoutes(() => stubRuntime())
    const res = await routes.fetch(new Request('http://w/?limit=10'))

    expect(res.status).toBe(200)
    const body = await res.json() as { cases: Array<{ taskId: string, reviewDecision: { status: string } }> }
    expect(body.cases).toHaveLength(1)
    expect(body.cases[0]).toMatchObject({
      taskId: 'task-case-api',
      reviewDecision: { status: 'needs_review' },
    })
  })

  it('GET /:taskId returns 404 for missing cases', async () => {
    const routes = buildCaseRoutes(() => stubRuntime())
    const res = await routes.fetch(new Request('http://w/missing'))

    expect(res.status).toBe(404)
  })

  it('POST /:taskId/rerun forwards to bounded orchestrator rerun', async () => {
    let received: { taskId: string, prompt?: string } | undefined
    const routes = buildCaseRoutes(() => stubRuntime(async (taskId, options) => {
      received = { taskId, ...(options?.prompt === undefined ? {} : { prompt: options.prompt }) }
      return { id: 'task-child' }
    }))
    const res = await routes.fetch(new Request('http://w/task-parent/rerun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'repair with evidence' }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { task: { id: string } }
    expect(body.task.id).toBe('task-child')
    expect(received).toEqual({ taskId: 'task-parent', prompt: 'repair with evidence' })
  })

  it('POST /:taskId/lessons/propose creates pending admission proposals', async () => {
    seedTask('task-case-lessons', 'extract case lessons')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'task-case-lessons',
      payload: {
        lessonCandidates: [
          {
            kind: 'repo-fact',
            summary: 'Lessons stay pending until admission approval.',
            evidenceRefs: ['agent_tasks:task-case-lessons'],
            confidence: 0.7,
            risk: 'medium',
          },
        ],
      },
    })
    const routes = buildCaseRoutes(() => stubRuntime())
    const res = await routes.fetch(new Request('http://w/task-case-lessons/lessons/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopeId: 'repo:aiworker', soulId: 'developer' }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { proposals: Array<{ status: string, summary: string }> }
    expect(body.proposals).toHaveLength(1)
    expect(body.proposals[0]).toMatchObject({
      status: 'pending',
      summary: 'Lessons stay pending until admission approval.',
    })
  })
})

function seedTask(id: string, prompt: string): void {
  getWorkerDb().insert(agentTasks).values({
    id,
    prompt,
    status: 'succeeded',
    createdAt: '2026-05-09T06:20:00.000Z',
    finishedAt: '2026-05-09T06:21:00.000Z',
    result: { ok: true },
  }).run()
}
