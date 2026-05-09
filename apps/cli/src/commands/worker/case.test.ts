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
  runCaseList,
  runCaseRerun,
  runCaseShow,
  runLessonsPropose,
} = await import('./case')

describe('aiworker case commands (FEAT-057)', () => {
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

  it('case list returns Case File projections', async () => {
    seedTask('task-case-cli', 'show case list')
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-case-cli',
      payload: { action: 'pass', evaluator: 'heuristic', mode: 'observe_only', reason: 'ok' },
    })

    const { result, output } = await captureConsole(() => runCaseList({ limit: 5 }))

    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { cases: Array<{ taskId: string, reviewDecision: { status: string } }> }
    expect(parsed.cases[0]).toMatchObject({
      taskId: 'task-case-cli',
      reviewDecision: { status: 'ready_to_ship' },
    })
  })

  it('case show returns one redacted Case File', async () => {
    seedTask('task-case-show', 'show token sk-test-abcdefghijklmnopqrstuvwxyz')
    recordBrainJournalEvent({
      kind: 'gate.quality',
      taskId: 'task-case-show',
      payload: { action: 'warn', evaluator: 'heuristic', mode: 'observe_only', reason: 'needs review' },
    })

    const { result, output } = await captureConsole(() => runCaseShow('task-case-show'))

    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { case: { workOrder: { prompt: string }, reviewDecision: { status: string } } }
    expect(parsed.case.reviewDecision.status).toBe('needs_review')
    expect(parsed.case.workOrder.prompt).toContain('[REDACTED:')
  })

  it('lessons propose creates pending proposals from case lesson candidates', async () => {
    seedTask('task-case-lesson', 'capture case lesson')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'task-case-lesson',
      payload: {
        lessonCandidates: [
          {
            kind: 'repo-fact',
            summary: 'Case lessons enter admission before Brain memory.',
            evidenceRefs: ['agent_tasks:task-case-lesson'],
            confidence: 0.7,
            risk: 'medium',
          },
        ],
      },
    })

    const { result, output } = await captureConsole(() => runLessonsPropose('task-case-lesson', {
      scopeId: 'repo:aiworker',
      soulId: 'developer',
    }))

    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { proposals: Array<{ status: string, summary: string }>, case: { lessons: { proposalIds: string[] } } }
    expect(parsed.proposals).toHaveLength(1)
    expect(parsed.proposals[0]).toMatchObject({
      status: 'pending',
      summary: 'Case lessons enter admission before Brain memory.',
    })
    expect(parsed.case.lessons.proposalIds).toHaveLength(1)
  })

  it('case rerun delegates to bounded orchestrator rerun', async () => {
    let received: { taskId: string, prompt?: string } | undefined
    rerunImpl = async (taskId, options) => {
      received = { taskId, ...(options?.prompt === undefined ? {} : { prompt: options.prompt }) }
      seedTask('task-child', 'child rerun')
      return { id: 'task-child' }
    }

    const { result, output } = await captureConsole(() => runCaseRerun('task-parent', { prompt: 'repair' }))

    expect(result).toBe(0)
    expect(received).toEqual({ taskId: 'task-parent', prompt: 'repair' })
    const parsed = JSON.parse(output) as { task: { id: string }, case: { taskId: string } }
    expect(parsed.task.id).toBe('task-child')
    expect(parsed.case.taskId).toBe('task-child')
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
