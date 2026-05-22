import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hrSoulAppManifest } from '@zonease/aiworker-shared'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  appendSessionEvent,
  closeWorkerDb,
  createEngineInvocation,
  createSession,
  createTurn,
  createWorkerEngineInvocation,
  createWorkspace,
  discardLegacySoulMetadata,
  engineInvocations,
  files,
  getSession,
  getSoulApp,
  getWorker,
  getWorkerDb,
  getWorkerEngineInvocation,
  initWorkerDb,
  listEngineInvocations,
  listFiles,
  listSessionEvents,
  listSessions,
  listSoulApps,
  listTurns,
  listWorkerEngineInvocations,
  listWorkerOverlayAssets,
  listWorkers,
  listWorkspaces,
  nextWorkerEngineInvocationSeq,
  runWorkerMigrations,
  sessionEvents,
  sessions,
  setSetting,
  settings,
  soulApps,
  turns,
  updateSoulAppLifecycle,
  updateWorkerEngineInvocation,
  upsertFile,
  upsertSoulApp,
  upsertWorker,
  upsertWorkerOverlayAssets,
  workerEngineInvocations,
  workerOverlayAssets,
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
      'engine_invocations',
      'files',
      'session_events',
      'sessions',
      'settings',
      'soul_apps',
      'sqlite_sequence',
      'turns',
      'worker_config',
      'worker_engine_invocations',
      'worker_identity',
      'worker_overlay_assets',
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

  it('persists worker overlay assets as Host metadata with baseline provenance', () => {
    const worker = upsertWorker({ id: 'worker-overlay-1', name: 'Recruiting worker', soulId: 'aiworker-hr' })

    upsertWorkerOverlayAssets(worker.id, [{
      content: '# Interview brief\n',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      metadataJson: { targetPath: '.agents/skills/aiworker-hr-interview-brief/SKILL.md' },
      target: 'codex',
    }])

    const overlay = listWorkerOverlayAssets(worker.id)
    expect(overlay).toHaveLength(1)
    expect(overlay[0]).toMatchObject({
      content: '# Interview brief\n',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      source: 'overlay',
      target: 'codex',
      workerId: worker.id,
    })
  })

  it('persists worker-scoped native invocation metadata without session rows', () => {
    const worker = upsertWorker({
      id: 'worker-native',
      soulId: 'hr',
      name: 'Native Bridge',
      defaultEngineId: 'codex',
      at: '2026-05-21T05:18:00.000Z',
    })

    expect(nextWorkerEngineInvocationSeq(worker.id)).toBe(1)
    const invocation = createWorkerEngineInvocation({
      id: 'worker-inv-1',
      workerId: worker.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      status: 'running',
      cwd: '/tmp/worker-native',
      inputRef: 'worker://native/inputs/worker-inv-1',
      stdoutRef: 'worker://native/logs/worker-inv-1.stdout.log',
      stderrRef: 'worker://native/logs/worker-inv-1.stderr.log',
      metadataJson: { runtime: 'native' },
      startedAt: '2026-05-21T05:19:00.000Z',
      at: '2026-05-21T05:19:00.000Z',
    })

    expect(invocation).toMatchObject({
      cwd: '/tmp/worker-native',
      engineCommand: 'codex',
      engineId: 'codex',
      id: 'worker-inv-1',
      inputRef: 'worker://native/inputs/worker-inv-1',
      seq: 1,
      status: 'running',
      workerId: worker.id,
    })
    expect(invocation).not.toHaveProperty('workspaceId')
    expect(invocation).not.toHaveProperty('sessionId')
    expect(invocation).not.toHaveProperty('turnId')
    expect(invocation).not.toHaveProperty('prompt')
    expect(invocation).not.toHaveProperty('input')
    expect(listWorkerEngineInvocations(worker.id)).toEqual([invocation])
    expect(getWorkerEngineInvocation(invocation.id)).toEqual(invocation)
    expect(nextWorkerEngineInvocationSeq(worker.id)).toBe(2)

    const finished = updateWorkerEngineInvocation({
      id: invocation.id,
      status: 'succeeded',
      exitCode: 0,
      signal: null,
      metadataJson: { runtime: 'native', stdoutBytes: 42 },
      finishedAt: '2026-05-21T05:20:00.000Z',
      at: '2026-05-21T05:20:00.000Z',
    })

    expect(finished).toMatchObject({
      exitCode: 0,
      finishedAt: '2026-05-21T05:20:00.000Z',
      metadataJson: { runtime: 'native', stdoutBytes: 42 },
      signal: null,
      status: 'succeeded',
    })
  })

  it('persists the worker -> workspace -> session -> turn loop without Host review or lesson rows', () => {
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
    expect(setSetting('engine.default', { engine: 'codex' }).valueJson).toEqual({ engine: 'codex' })
  })

  it('discards legacy built-in Soul worker metadata and cascaded local records', () => {
    const worker = upsertWorker({
      id: 'legacy-hr-worker',
      soulId: 'hr',
      name: 'Legacy HR',
      defaultEngineId: 'codex',
      at: '2026-05-13T13:04:00.000Z',
    })
    const workspace = createWorkspace({
      id: 'legacy-hr-workspace',
      workerId: worker.id,
      name: 'Legacy HR workspace',
      rootPath: '/tmp/legacy-hr',
      at: '2026-05-13T13:04:01.000Z',
    })
    createSession({
      id: 'legacy-hr-session',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: {
        capabilityTemplateId: 'candidate-screen',
        keep: 'value',
        soulName: 'HR',
      },
      at: '2026-05-13T13:04:02.000Z',
    })
    createSession({
      id: 'legacy-hr-custom-session',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityTemplateId: 'custom-legacy-template',
      title: 'Custom legacy template',
      metadataJson: { capabilityTemplateId: 'custom-legacy-template' },
      at: '2026-05-13T13:04:03.000Z',
    })

    const result = discardLegacySoulMetadata({
      at: '2026-05-13T13:05:00.000Z',
      soulIds: ['hr'],
    })

    expect(result).toEqual({
      legacySoulIds: ['hr'],
      workersDeleted: 1,
    })
    expect(getWorker(worker.id)).toBeNull()
    expect(getSession('legacy-hr-session')).toBeNull()
    expect(getSession('legacy-hr-custom-session')).toBeNull()
    expect(listWorkspaces(worker.id)).toEqual([])
    expect(listSessions(workspace.id)).toEqual([])
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
    expect(explain(`SELECT * FROM worker_engine_invocations WHERE worker_id = 'worker-hr' ORDER BY seq DESC LIMIT 20`)).toContain('worker_engine_invocations_worker_seq')
    expect(explain(`SELECT * FROM worker_engine_invocations WHERE status = 'running' ORDER BY updated_at DESC LIMIT 20`)).toContain('worker_engine_invocations_status_updated_at_idx')
    expect(explain(`SELECT * FROM session_events WHERE session_id = 'session-1' ORDER BY seq ASC LIMIT 200`)).toContain('session_events_session_seq')
    expect(explain(`SELECT * FROM files WHERE workspace_id = 'workspace-1' ORDER BY updated_at DESC LIMIT 50`)).toContain('files_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM soul_apps WHERE status = 'enabled' ORDER BY updated_at DESC LIMIT 50`)).toContain('soul_apps_status_updated_at_idx')
  })

  it('exports the schema objects used by downstream packages', () => {
    expect(workers).toBeDefined()
    expect(workspaces).toBeDefined()
    expect(sessions).toBeDefined()
    expect(turns).toBeDefined()
    expect(engineInvocations).toBeDefined()
    expect(workerEngineInvocations).toBeDefined()
    expect(sessionEvents).toBeDefined()
    expect(files).toBeDefined()
    expect(soulApps).toBeDefined()
    expect(settings).toBeDefined()
    expect(workerOverlayAssets).toBeDefined()
  })
})
