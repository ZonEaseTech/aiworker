import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hrSoulAppManifest } from '@zonease/aiworker-shared'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  appendSessionEvent,
  artifacts,
  closeWorkerDb,
  createEngineInvocation,
  createLesson,
  createReview,
  createSession,
  createTurn,
  createWorkspace,
  engineInvocations,
  files,
  getSoulApp,
  getWorkerDb,
  initWorkerDb,
  lessons,
  listArtifacts,
  listEngineInvocations,
  listFiles,
  listLessons,
  listReviews,
  listSessionEvents,
  listSessions,
  listSoulApps,
  listTurns,
  listWorkers,
  listWorkspaces,
  registerArtifact,
  reviews,
  runWorkerMigrations,
  sessionEvents,
  sessions,
  setSetting,
  settings,
  soulApps,
  turns,
  updateSoulAppLifecycle,
  upsertFile,
  upsertSoulApp,
  upsertWorker,
  workers,
  workspaces,
} from './index'

describe('greenfield local worker session schema', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-worker-db-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function explain(query: string): string {
    const rows = getWorkerDb().all<{ detail: string }>(sql.raw(`EXPLAIN QUERY PLAN ${query}`))
    return rows.map(r => r.detail).join('\n')
  }

  it('creates only the session workspace tables plus security primitives', () => {
    const rows = getWorkerDb().all<{ name: string }>(
      sql.raw('SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name'),
    ).map(row => row.name)

    expect(rows).toEqual([
      '__drizzle_migrations',
      'artifacts',
      'engine_invocations',
      'files',
      'lessons',
      'reviews',
      'session_events',
      'sessions',
      'settings',
      'soul_app_audit_events',
      'soul_app_storage_records',
      'soul_apps',
      'sqlite_sequence',
      'turns',
      'worker_config',
      'worker_identity',
      'worker_secrets',
      'workers',
      'workspaces',
    ])
  })

  it('persists Host Soul App registry lifecycle state', () => {
    const installed = upsertSoulApp({
      id: hrSoulAppManifest.id,
      name: hrSoulAppManifest.name,
      version: hrSoulAppManifest.version,
      protocol: hrSoulAppManifest.protocol,
      soulId: hrSoulAppManifest.soul.id,
      sourceKind: 'inline',
      sourceRef: 'test:inline',
      manifestDigest: 'digest-1',
      manifestJson: hrSoulAppManifest,
      at: '2026-05-12T22:22:00.000Z',
    })

    expect(installed.status).toBe('installed')
    expect(installed.healthStatus).toBe('unknown')
    expect(getSoulApp(hrSoulAppManifest.id)?.manifestJson.id).toBe(hrSoulAppManifest.id)
    expect(listSoulApps()).toHaveLength(1)

    const enabled = updateSoulAppLifecycle({
      id: hrSoulAppManifest.id,
      status: 'enabled',
      healthStatus: 'pass',
      healthMessage: 'Static manifest validation passed.',
      lastHealthcheckAt: '2026-05-12T22:23:00.000Z',
      at: '2026-05-12T22:23:00.000Z',
    })
    expect(enabled.enabledAt).toBe('2026-05-12T22:23:00.000Z')
    expect(enabled.healthStatus).toBe('pass')

    const disabled = updateSoulAppLifecycle({
      id: hrSoulAppManifest.id,
      status: 'disabled',
      at: '2026-05-12T22:24:00.000Z',
    })
    expect(disabled.status).toBe('disabled')
    expect(disabled.disabledAt).toBe('2026-05-12T22:24:00.000Z')
  })

  it('persists the worker -> workspace -> session -> turn -> artifact loop', () => {
    const worker = upsertWorker({
      id: 'worker-hr',
      soulId: 'hr',
      name: 'HR',
      defaultEngineId: 'codex',
      at: '2026-05-09T01:00:00.000Z',
    })
    expect(worker.soulId).toBe('hr')

    const workspace = createWorkspace({
      id: 'workspace-1',
      workerId: worker.id,
      name: 'Hiring workspace',
      rootPath: '/tmp/hiring',
      at: '2026-05-09T01:01:00.000Z',
    })
    expect(listWorkspaces(worker.id)).toEqual([workspace])

    const session = createSession({
      id: 'session-1',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Screen candidate',
      context: 'Review the candidate packet.',
      at: '2026-05-09T01:02:00.000Z',
    })
    expect(listSessions(workspace.id)).toEqual([session])

    const turn = createTurn({
      id: 'turn-1',
      sessionId: session.id,
      seq: 1,
      input: 'Prepare the screen.',
      status: 'running',
      at: '2026-05-09T01:03:00.000Z',
    })
    expect(listTurns(session.id)).toEqual([turn])

    const invocation = createEngineInvocation({
      id: 'inv-1',
      sessionId: session.id,
      turnId: turn.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      prompt: 'Prompt',
      status: 'running',
      at: '2026-05-09T01:04:00.000Z',
    })
    expect(listEngineInvocations(session.id)).toEqual([invocation])
    appendSessionEvent({
      sessionId: session.id,
      turnId: turn.id,
      invocationId: invocation.id,
      seq: 1,
      type: 'status',
      payloadJson: { status: 'running' },
      at: '2026-05-09T01:04:01.000Z',
    })
    expect(listSessionEvents(session.id)).toHaveLength(1)

    const file = upsertFile({
      id: 'file-1',
      workspaceId: workspace.id,
      path: 'artifacts/session-1/candidate.md',
      source: 'session',
      size: 128,
      at: '2026-05-09T01:05:00.000Z',
    })
    expect(listFiles(workspace.id)).toEqual([file])

    const artifact = registerArtifact({
      id: 'artifact-1',
      workspaceId: workspace.id,
      sessionId: session.id,
      turnId: turn.id,
      invocationId: invocation.id,
      path: file.path,
      title: 'Candidate review',
      metadataJson: { fileId: file.id },
      at: '2026-05-09T01:06:00.000Z',
    })
    expect(listArtifacts(workspace.id)).toEqual([artifact])
    const review = createReview({
      id: 'review-1',
      workspaceId: workspace.id,
      sessionId: session.id,
      turnId: turn.id,
      artifactId: artifact.id,
      verdict: 'warn',
      findingsJson: [{ message: 'Needs source evidence' }],
      at: '2026-05-09T01:07:00.000Z',
    })
    expect(listReviews(workspace.id)).toEqual([review])
    const lesson = createLesson({
      id: 'lesson-1',
      workspaceId: workspace.id,
      sourceReviewId: review.id,
      statement: 'Always cite the candidate packet source.',
      evidenceJson: [{ reviewId: review.id }],
      at: '2026-05-09T01:08:00.000Z',
    })

    expect(lesson.status).toBe('proposed')
    expect(listLessons(workspace.id)).toEqual([lesson])
    expect(setSetting('engine.default', { engine: 'codex' }).valueJson).toEqual({ engine: 'codex' })
  })

  it('allows multiple workers to bind the same Soul while isolating workspaces by worker', () => {
    const recruiting = upsertWorker({
      id: 'worker-hr-recruiting',
      soulId: 'hr',
      name: 'HR Recruiting',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:00:00.000Z',
    })
    const talentPool = upsertWorker({
      id: 'worker-hr-talent-pool',
      soulId: 'hr',
      name: 'HR Talent Pool',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:01:00.000Z',
    })

    const recruitingWorkspace = createWorkspace({
      id: 'workspace-recruiting',
      workerId: recruiting.id,
      name: 'Open roles',
      rootPath: '/tmp/hr-recruiting',
      at: '2026-05-09T02:02:00.000Z',
    })
    const talentWorkspace = createWorkspace({
      id: 'workspace-talent-pool',
      workerId: talentPool.id,
      name: 'Talent pool',
      rootPath: '/tmp/hr-talent-pool',
      at: '2026-05-09T02:03:00.000Z',
    })

    expect(recruiting.soulId).toBe(talentPool.soulId)
    expect(recruiting.id).not.toBe(talentPool.id)
    expect(listWorkspaces(recruiting.id)).toEqual([recruitingWorkspace])
    expect(listWorkspaces(talentPool.id)).toEqual([talentWorkspace])
  })

  it('repairs legacy unique worker Soul index during migration', () => {
    getWorkerDb().run(sql.raw('DROP INDEX IF EXISTS workers_soul_idx'))
    getWorkerDb().run(sql.raw('CREATE UNIQUE INDEX workers_soul_idx ON workers (soul_id)'))

    runWorkerMigrations()

    const indexes = getWorkerDb().all<{ name: string, unique: number }>(sql.raw('PRAGMA index_list("workers")'))
    expect(indexes.find(index => index.name === 'workers_soul_idx')?.unique).toBe(0)

    upsertWorker({
      id: 'worker-hr-legacy-a',
      soulId: 'hr',
      name: 'HR Legacy A',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:10:00.000Z',
    })
    upsertWorker({
      id: 'worker-hr-legacy-b',
      soulId: 'hr',
      name: 'HR Legacy B',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:11:00.000Z',
    })

    expect(listWorkers().filter(worker => worker.soulId === 'hr').map(worker => worker.id)).toContain('worker-hr-legacy-b')
  })

  it('keeps indexes aligned with the session workspace query paths', () => {
    expect(explain(`SELECT * FROM workers WHERE status = 'active' ORDER BY updated_at DESC LIMIT 20`)).toContain('workers_status_updated_at_idx')
    expect(explain(`SELECT * FROM workspaces WHERE worker_id = 'worker-hr' ORDER BY updated_at DESC LIMIT 20`)).toContain('workspaces_worker_updated_at_idx')
    expect(explain(`SELECT * FROM sessions WHERE workspace_id = 'workspace-1' ORDER BY updated_at DESC LIMIT 20`)).toContain('sessions_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM turns WHERE session_id = 'session-1' ORDER BY seq ASC LIMIT 200`)).toContain('turns_session_seq')
    expect(explain(`SELECT * FROM engine_invocations WHERE status = 'running' ORDER BY updated_at DESC LIMIT 20`)).toContain('engine_invocations_status_updated_at_idx')
    expect(explain(`SELECT * FROM session_events WHERE session_id = 'session-1' ORDER BY seq ASC LIMIT 200`)).toContain('session_events_session_seq')
    expect(explain(`SELECT * FROM files WHERE workspace_id = 'workspace-1' ORDER BY updated_at DESC LIMIT 50`)).toContain('files_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM artifacts WHERE status = 'available' ORDER BY updated_at DESC LIMIT 50`)).toContain('artifacts_status_updated_at_idx')
    expect(explain(`SELECT * FROM reviews WHERE workspace_id = 'workspace-1' ORDER BY created_at DESC LIMIT 50`)).toContain('reviews_workspace_created_at_idx')
    expect(explain(`SELECT * FROM lessons WHERE status = 'proposed' ORDER BY updated_at DESC LIMIT 50`)).toContain('lessons_status_updated_at_idx')
    expect(explain(`SELECT * FROM soul_apps WHERE status = 'enabled' ORDER BY updated_at DESC LIMIT 50`)).toContain('soul_apps_status_updated_at_idx')
  })

  it('exports the schema objects used by downstream packages', () => {
    expect(workers).toBeDefined()
    expect(workspaces).toBeDefined()
    expect(sessions).toBeDefined()
    expect(turns).toBeDefined()
    expect(engineInvocations).toBeDefined()
    expect(sessionEvents).toBeDefined()
    expect(files).toBeDefined()
    expect(artifacts).toBeDefined()
    expect(reviews).toBeDefined()
    expect(lessons).toBeDefined()
    expect(soulApps).toBeDefined()
    expect(settings).toBeDefined()
  })
})
