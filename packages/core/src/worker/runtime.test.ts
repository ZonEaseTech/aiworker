import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { LocalWorkerRuntime } from './runtime'

describe('LocalWorkerRuntime', () => {
  let dir: string
  let tick: number

  beforeEach(() => {
    closeWorkerDb()
    tick = 0
    dir = mkdtempSync(join(tmpdir(), 'aiworker-local-runtime-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function now(): string {
    tick += 1
    return `2026-05-09T00:00:${String(tick).padStart(2, '0')}.000Z`
  }

  it('runs the workspace loop from case to artifacts, review, and lessons', async () => {
    const runtime = new LocalWorkerRuntime({
      workerId: 'worker-local',
      workspace: {
        id: 'workspace-1',
        name: 'Hiring Workspace',
        rootPath: join(dir, 'workspace'),
      },
      now,
      executor: {
        async run(input) {
          return {
            summary: `Finished ${input.runId}`,
            artifacts: [
              {
                path: 'reports/candidate.md',
                title: 'Candidate Review',
                content: '# Candidate Review\n\nEvidence attached.\n',
              },
            ],
            review: {
              verdict: 'warn',
              findings: [{ message: 'Needs one more source.' }],
            },
            lessons: [
              {
                statement: 'Attach source evidence to every candidate recommendation.',
                evidence: [{ runId: input.runId }],
              },
            ],
          }
        },
      },
    })
    await runtime.init()
    const caseRecord = runtime.createCase({
      body: 'Review the packet.',
      selectedSkillId: 'candidate-screen',
      selectedSoulId: 'hr',
      title: 'Screen candidate',
    })

    const result = await runtime.startRun({ caseId: caseRecord.id, executor: 'codex' })

    expect(result.run.status).toBe('succeeded')
    expect(result.files).toHaveLength(1)
    expect(result.artifacts[0]?.title).toBe('Candidate Review')
    expect(result.review?.verdict).toBe('warn')
    expect(result.lessons[0]?.statement).toContain('source evidence')
    expect(result.events.map(event => event.type)).toEqual(['status', 'artifact', 'review', 'lesson', 'status'])
    await expect(runtime.files.read('reports/candidate.md')).resolves.toContain('Evidence attached')

    const snapshot = runtime.snapshot()
    expect(snapshot.cases[0]?.status).toBe('completed')
    expect(snapshot.cases[0]?.selectedSoulId).toBe('hr')
    expect(snapshot.runs[0]?.metadataJson).toMatchObject({ selectedSkillId: 'candidate-screen', selectedSoulId: 'hr' })
    expect(snapshot.runs).toHaveLength(1)
    expect(snapshot.artifacts).toHaveLength(1)
    expect(snapshot.reviews).toHaveLength(1)
    expect(snapshot.lessons).toHaveLength(1)
  })

  it('records failed runs without throwing away the event trail', async () => {
    const runtime = new LocalWorkerRuntime({
      workerId: 'worker-local',
      workspace: {
        id: 'workspace-1',
        name: 'Hiring Workspace',
        rootPath: join(dir, 'workspace'),
      },
      now,
      executor: {
        async run() {
          throw new Error('executor failed')
        },
      },
    })
    await runtime.init()

    const result = await runtime.startRun({ prompt: 'Run direct case.' })

    expect(result.run.status).toBe('failed')
    expect(result.run.error).toBe('executor failed')
    expect(result.events.map(event => event.type)).toEqual(['status', 'error'])
  })
})
