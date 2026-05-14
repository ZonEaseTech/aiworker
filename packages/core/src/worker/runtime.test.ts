import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

  function runtimeWithNativeSkills(sourceRoot: string, executor: ConstructorParameters<typeof LocalWorkerRuntime>[0]['executor']) {
    return new LocalWorkerRuntime({
      worker: {
        id: 'worker-hr',
        soulId: 'aiworker-hr',
        name: 'AIWorker HR',
        defaultEngineId: 'codex',
      },
      nativeSkillSource: {
        appId: 'aiworker-hr',
        sourceRoot,
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

  it('bootstraps profile workspace ledger and projects app-owned native skills', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr')
    await mkdir(join(appRoot, 'skills', 'candidate-profile'), { recursive: true })
    await writeFile(join(appRoot, 'skills', 'candidate-profile', 'SKILL.md'), [
      '---',
      'name: candidate-profile',
      'description: Maintain a source-backed candidate profile.',
      '---',
      '',
      '# Candidate Profile',
      '',
      'Use candidate, employee, and alumni lifecycle language.',
      '',
    ].join('\n'))

    const workerRuntime = runtimeWithNativeSkills(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Ada Lovelace Candidate', type: 'people-profile' })

    await expect(readFile(join(workspace.rootPath, 'README.md'), 'utf8')).resolves.toContain('# Ada Lovelace Candidate')
    await expect(stat(join(workspace.rootPath, 'artifacts'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, 'reviews'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, 'evidence', 'descriptors'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, 'evidence', 'raw'))).resolves.toBeTruthy()
    await expect(stat(join(workspace.rootPath, '.aiworker', 'sessions'))).resolves.toBeTruthy()

    const gitignore = await readFile(join(workspace.rootPath, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.aiworker/sessions/')
    expect(gitignore).toContain('.aiworker/native-skill-projections.json')
    expect(gitignore).toContain('.agents/skills/aiworker-*')
    expect(gitignore).toContain('.claude/skills/aiworker-*')
    expect(gitignore).toContain('evidence/raw/')

    await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    await expect(readFile(join(workspace.rootPath, '.claude', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    const projection = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'native-skill-projections.json'), 'utf8')) as {
      appId: string
      skills: Array<{ projectionId: string, sha256: string, skillId: string, source: string, targets: string[] }>
    }
    expect(projection.appId).toBe('aiworker-hr')
    expect(projection.skills).toEqual([
      expect.objectContaining({
        projectionId: 'aiworker-hr-candidate-profile',
        skillId: 'candidate-profile',
      }),
    ])
    expect(projection.skills[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(projection.skills[0]?.targets).toEqual([
      '.agents/skills/aiworker-hr-candidate-profile/SKILL.md',
      '.claude/skills/aiworker-hr-candidate-profile/SKILL.md',
    ])

    if (gitAvailable()) {
      const head = spawnSync('git', ['-C', workspace.rootPath, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' })
      expect(head.status).toBe(0)
      expect(head.stdout.trim()).toMatch(/^[a-f0-9]{40}$/)
    }
  })

  it('keeps a Soul App without native skills valid and usable', async () => {
    const appRoot = join(dir, 'apps', 'aiworker-hr-no-skills')
    await mkdir(appRoot, { recursive: true })
    const workerRuntime = runtimeWithNativeSkills(appRoot, {
      async invoke() {
        return { summary: 'ok' }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'No Skills Profile' })
    const projection = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'native-skill-projections.json'), 'utf8')) as {
      appId: string
      skills: unknown[]
    }

    expect(projection.appId).toBe('aiworker-hr')
    expect(projection.skills).toEqual([])
    await expect(readFile(join(workspace.rootPath, 'README.md'), 'utf8')).resolves.toContain('No approved profile revision yet.')
  })

  it('promotes a reviewed artifact into the canonical profile README', async () => {
    const workerRuntime = runtime({
      async invoke(input) {
        return {
          summary: 'Profile proposal ready',
          artifacts: [
            {
              path: `artifacts/${input.sessionId}/profile-proposal.md`,
              title: 'Profile proposal',
              content: '# Accepted Candidate Profile\n\nEvidence-backed summary.\n',
            },
          ],
        }
      },
    })

    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Profile Promotion Workspace' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'person-profile',
      title: 'Prepare profile',
    })
    const turn = await workerRuntime.startTurn({
      sessionId: session.id,
      input: 'Draft the profile.',
      engineId: 'codex',
    })

    const promotion = await workerRuntime.promoteProfileRevision({
      artifactId: turn.artifacts[0]!.id,
      findingsJson: [{ message: 'Approved from HR review.' }],
      risksJson: [],
      verdict: 'pass',
      workspaceId: workspace.id,
    })

    expect(promotion.review.verdict).toBe('pass')
    expect(promotion.profilePath).toBe('README.md')
    expect(promotion.reviewPath).toBe(`reviews/${promotion.review.id}.md`)
    await expect(readFile(join(workspace.rootPath, 'README.md'), 'utf8')).resolves.toContain('Accepted Candidate Profile')
    await expect(readFile(join(workspace.rootPath, promotion.reviewPath), 'utf8')).resolves.toContain('Approved from HR review.')
    expect(workerRuntime.snapshot().reviews.map(review => review.id)).toContain(promotion.review.id)

    if (gitAvailable()) {
      expect(promotion.git.status).toBe('created')
      const log = spawnSync('git', ['-C', workspace.rootPath, 'log', '--oneline', '--', 'README.md'], { encoding: 'utf8' })
      expect(log.stdout).toContain('profile: approve Profile Promotion Workspace revision')
    }
  })
})

function gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
}
