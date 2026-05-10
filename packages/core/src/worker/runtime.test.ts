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
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-runtime-'))
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

  function runtime(executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: 'worker-hr',
        soulId: 'hr',
        name: 'HR',
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', 'worker-hr', 'workspaces'),
      now,
      executor,
    })
  }

  function runtimeFor(worker: { id: string, name: string, soulId: string }, executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: worker.id,
        soulId: worker.soulId,
        name: worker.name,
        defaultEngineId: 'codex',
      },
      workspacesRoot: join(dir, 'workers', worker.id, 'workspaces'),
      now,
      executor,
    })
  }

  it('runs the workspace session loop from turn to artifacts, review, and lessons', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return {
          summary: `Finished ${input.turnId}`,
          artifacts: [
            {
              path: `artifacts/${input.sessionId}/candidate.md`,
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
              evidence: [{ turnId: input.turnId }],
            },
          ],
        }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({
      name: 'Hiring Workspace',
    })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Screen candidate',
      context: 'Review the packet.',
      metadata: {
        outputKind: 'candidate-screen',
        skillName: 'Candidate Screen',
      },
    })

    const result = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Prepare the screen.',
      engineId: 'codex',
      engineCommand: 'codex',
      metadata: {
        outputKind: 'candidate-screen',
        skillName: 'Candidate Screen',
      },
    })

    expect(result.turn.status).toBe('succeeded')
    expect(result.invocation.status).toBe('succeeded')
    expect(result.files).toHaveLength(1)
    expect(result.artifacts[0]?.title).toBe('Candidate Review')
    expect(result.review?.verdict).toBe('warn')
    expect(result.lessons[0]?.statement).toContain('source evidence')
    expect(result.events.map(event => event.type)).toEqual(['status', 'status', 'artifact', 'review', 'lesson', 'status'])
    await expect(workerRuntime.files(workspace.id).read('artifacts/'.concat(session.id, '/candidate.md'))).resolves.toContain('Evidence attached')

    const snapshot = workerRuntime.snapshot()
    expect(snapshot.worker.soulId).toBe('hr')
    expect(snapshot.workspaces).toHaveLength(1)
    expect(snapshot.sessions[0]?.capabilityTemplateId).toBe('candidate-screen')
    expect(snapshot.turns[0]?.status).toBe('succeeded')
    expect(snapshot.invocations[0]?.metadataJson).toMatchObject({ outputKind: 'candidate-screen' })
    expect(snapshot.artifacts).toHaveLength(1)
    expect(snapshot.reviews).toHaveLength(1)
    expect(snapshot.lessons).toHaveLength(1)
  })

  it('records failed turns without throwing away the event trail', async () => {
    const workerRuntime = runtime({
      async invoke() {
        throw new Error('executor failed')
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Hiring Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Screen candidate',
    })

    const result = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Start direct session turn.',
      engineId: 'codex',
      engineCommand: 'codex',
    })

    expect(result.turn.status).toBe('failed')
    expect(result.turn.error).toBe('executor failed')
    expect(result.invocation.status).toBe('failed')
    expect(result.events.map(event => event.type)).toEqual(['status', 'status', 'error'])
  })

  it('keeps runtime workspaces isolated when two workers share one Soul', async () => {
    const executor = {
      async invoke() {
        return { summary: 'ok' }
      },
    }
    const recruitingRuntime = runtimeFor({ id: 'worker-hr-recruiting', soulId: 'hr', name: 'HR Recruiting' }, executor)
    const talentRuntime = runtimeFor({ id: 'worker-hr-talent-pool', soulId: 'hr', name: 'HR Talent Pool' }, executor)

    await recruitingRuntime.init()
    await talentRuntime.init()
    const recruitingWorkspace = await recruitingRuntime.createWorkspace({ name: 'Open roles' })
    const talentWorkspace = await talentRuntime.createWorkspace({ name: 'Talent pool' })

    expect(recruitingRuntime.snapshot().worker.soulId).toBe('hr')
    expect(talentRuntime.snapshot().worker.soulId).toBe('hr')
    expect(recruitingRuntime.snapshot().workspaces.map(workspace => workspace.id)).toEqual([recruitingWorkspace.id])
    expect(talentRuntime.snapshot().workspaces.map(workspace => workspace.id)).toEqual([talentWorkspace.id])
  })
})
