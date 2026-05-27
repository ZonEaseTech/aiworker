import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  appendSessionEvent,
  bridgeEvents,
  closeWorkerDb,
  createEngineInvocation,
  createSession,
  createTurn,
  createWorkspace,
  discardLegacySoulMetadata,
  engineInvocations,
  files,
  getSession,
  getSoulApp,
  getWorker,
  getWorkerDb,
  initWorkerDb,
  listEngineInvocations,
  listFiles,
  listSessionEvents,
  listSessions,
  listSoulApps,
  listTurns,
  listWorkerOverlayAssets,
  listWorkers,
  listWorkspaces,
  nextEngineInvocationSeq,
  runWorkerMigrations,
  sessions,
  setSetting,
  settings,
  soulApps,
  updateSoulAppLifecycle,
  upsertFile,
  upsertSoulApp,
  upsertWorker,
  upsertWorkerOverlayAssets,
  workerConfig,
  workers,
  workspaces,
} from './index'

const freeformDescriptor = parseSoulDescriptorV1({
  api: null,
  capabilities: [{
    id: 'default',
    name: 'Freeform Session',
    prompt: { ref: 'dist/product/capabilities/default/prompt.md', type: 'packaged-file' },
  }],
  compatibility: { host: '>=1.0.0' },
  configuration: {},
  engine: {
    workspaceAssets: { source: 'dist/engine-assets/workspace' },
  },
  extensions: {},
  external: {},
  health: { ready: true },
  identity: {
    appId: 'aiworker-freeform',
    name: 'AIWorker Freeform',
    soulId: 'freeform',
    version: '0.1.0',
  },
  protocol: 'soul/v1',
  workbench: {
    entry: 'dist/web/workbench/index.html',
    type: 'micro-app',
  },
})

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
      'bridge_events',
      'engine_invocations',
      'files',
      'sessions',
      'settings',
      'soul_apps',
      'sqlite_sequence',
      'worker_config',
      'worker_identity',
      'workers',
      'workspaces',
    ])
  })

  it('persists Host Soul App registry lifecycle state', () => {
    const installed = upsertSoulApp({
      id: freeformDescriptor.identity.appId as string,
      name: freeformDescriptor.identity.name as string,
      version: freeformDescriptor.identity.version as string,
      protocol: freeformDescriptor.protocol,
      soulId: freeformDescriptor.identity.soulId as string,
      sourceKind: 'inline',
      sourceRef: 'test:inline',
      descriptorDigest: 'digest-1',
      descriptorJson: freeformDescriptor,
      at: '2026-05-12T22:22:00.000Z',
    })

    expect(installed.status).toBe('installed')
    expect(installed.healthStatus).toBe('unknown')
    expect(getSoulApp('aiworker-freeform')?.descriptorJson.identity.appId).toBe('aiworker-freeform')
    expect(getSoulApp('aiworker-freeform')?.descriptorDigest).toBe('digest-1')
    expect(listSoulApps()).toHaveLength(1)

    const physicalColumns = getWorkerDb()
      .all<{ name: string }>(sql.raw('PRAGMA table_info("soul_apps")'))
      .map(row => row.name)
    expect(physicalColumns).toEqual(expect.arrayContaining(['manifest_json', 'manifest_digest']))

    const enabled = updateSoulAppLifecycle({
      id: 'aiworker-freeform',
      status: 'enabled',
      healthStatus: 'pass',
      healthMessage: 'Static descriptor validation passed.',
      lastHealthcheckAt: '2026-05-12T22:23:00.000Z',
      at: '2026-05-12T22:23:00.000Z',
    })
    expect(enabled.enabledAt).toBe('2026-05-12T22:23:00.000Z')
    expect(enabled.healthStatus).toBe('pass')

    const disabled = updateSoulAppLifecycle({
      id: 'aiworker-freeform',
      status: 'disabled',
      at: '2026-05-12T22:24:00.000Z',
    })
    expect(disabled.status).toBe('disabled')
    expect(disabled.disabledAt).toBe('2026-05-12T22:24:00.000Z')
  })

  it('persists worker overlay assets as Host metadata with baseline provenance', () => {
    const worker = upsertWorker({ id: 'worker-overlay-1', name: 'Descriptor worker', soulId: 'demo-soul-app' })

    upsertWorkerOverlayAssets(worker.id, [{
      checksum: 'sha256:test',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      metadataJson: { targetPath: '.agents/skills/demo-soul-app-interview-brief/SKILL.md' },
      sourceRef: 'descriptor://engine/skills/interview-brief',
      target: 'codex',
    }])

    const overlay = listWorkerOverlayAssets(worker.id)
    expect(overlay).toHaveLength(1)
    expect(overlay[0]).toMatchObject({
      checksum: 'sha256:test',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      source: 'overlay',
      sourceRef: 'descriptor://engine/skills/interview-brief',
      target: 'codex',
      workerId: worker.id,
    })
    expect(overlay[0]).not.toHaveProperty('content')
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
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: 'aiworker://sessions/session-1/turns/turn-1/input',
      status: 'running',
      at: '2026-05-09T01:04:00.000Z',
    })
    expect(invocation).toMatchObject({
      inputRef: 'aiworker://sessions/session-1/turns/turn-1/input',
      processState: 'not_spawned',
    })
    expect(invocation).not.toHaveProperty('turnId')
    expect(invocation).not.toHaveProperty('prompt')
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

  it('persists session-level engine invocations without turn execution rows', () => {
    const worker = upsertWorker({
      id: 'worker-invocation-only',
      soulId: 'freeform',
      name: 'Freeform',
      defaultEngineId: 'codex',
      at: '2026-05-27T01:00:00.000Z',
    })
    const workspace = createWorkspace({
      id: 'workspace-invocation-only',
      workerId: worker.id,
      name: 'Invocation workspace',
      rootPath: '/tmp/invocation-only',
      at: '2026-05-27T01:01:00.000Z',
    })
    const session = createSession({
      id: 'session-invocation-only',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityTemplateId: 'default',
      title: 'Invocation-only session',
      at: '2026-05-27T01:02:00.000Z',
    })

    const invocation = createEngineInvocation({
      id: 'invocation-only-1',
      sessionId: session.id,
      seq: nextEngineInvocationSeq(session.id),
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: 'aiworker://sessions/session-invocation-only/invocations/invocation-only-1/input',
      status: 'running',
      at: '2026-05-27T01:03:00.000Z',
    })
    appendSessionEvent({
      sessionId: session.id,
      invocationId: invocation.id,
      seq: 1,
      type: 'status',
      payloadJson: { invocationId: invocation.id, status: 'running' },
      at: '2026-05-27T01:03:01.000Z',
    })

    expect(invocation).toMatchObject({
      inputRef: 'aiworker://sessions/session-invocation-only/invocations/invocation-only-1/input',
      processState: 'not_spawned',
    })
    expect(invocation).not.toHaveProperty('turnId')
    expect(invocation).not.toHaveProperty('prompt')
    expect(listTurns(session.id)).toEqual([])
    expect(listEngineInvocations(session.id)).toEqual([invocation])
    expect(listSessionEvents(session.id)[0]).toMatchObject({
      invocationId: invocation.id,
      turnId: null,
    })
  })

  it('filters session events by id in SQL before applying the limit so long sessions keep streaming', () => {
    const worker = upsertWorker({
      id: 'worker-events',
      soulId: 'hr',
      name: 'Events worker',
      defaultEngineId: 'codex',
      at: '2026-05-23T00:00:00.000Z',
    })
    const workspace = createWorkspace({
      id: 'workspace-events',
      workerId: worker.id,
      name: 'Events workspace',
      rootPath: '/tmp/events',
      at: '2026-05-23T00:00:01.000Z',
    })
    const session = createSession({
      id: 'session-events',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Events session',
      at: '2026-05-23T00:00:02.000Z',
    })
    const invocation = createEngineInvocation({
      id: 'events-invocation-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      inputRef: 'aiworker://sessions/session-events/invocations/events-invocation-1/input',
      status: 'running',
      at: '2026-05-23T00:00:03.000Z',
    })

    const ids = Array.from({ length: 5 }, (_, index) => appendSessionEvent({
      invocationId: invocation.id,
      sessionId: session.id,
      seq: index + 1,
      type: 'assistant_delta',
      payloadJson: { index: index + 1 },
      at: `2026-05-23T00:00:${String(10 + index).padStart(2, '0')}.000Z`,
    }).id)

    // `after` returns only newer events, in seq order.
    expect(listSessionEvents(session.id, { after: ids[1] }).map(event => event.id)).toEqual([ids[2]!, ids[3]!, ids[4]!])
    // The limit is applied AFTER the id filter, so a tight window still walks forward past the cursor
    // instead of stalling on the earliest rows (the long-session replay regression).
    expect(listSessionEvents(session.id, { after: ids[1], limit: 2 }).map(event => event.id)).toEqual([ids[2]!, ids[3]!])
    // No cursor returns the full window in seq order.
    expect(listSessionEvents(session.id).map(event => event.id)).toEqual(ids)
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
    expect(explain(`SELECT * FROM engine_invocations WHERE invocation_status = 'running' ORDER BY updated_at DESC LIMIT 20`)).toContain('engine_invocations_status_updated_at_idx')
    expect(explain(`SELECT * FROM bridge_events WHERE invocation_id = 'inv-1' ORDER BY created_at ASC LIMIT 200`)).toContain('bridge_events_invocation_created_at_idx')
    expect(explain(`SELECT * FROM files WHERE workspace_id = 'workspace-1' ORDER BY updated_at DESC LIMIT 50`)).toContain('files_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM soul_apps WHERE status = 'enabled' ORDER BY updated_at DESC LIMIT 50`)).toContain('soul_apps_status_updated_at_idx')
  })

  it('exports the schema objects used by downstream packages', () => {
    expect(workers).toBeDefined()
    expect(workspaces).toBeDefined()
    expect(sessions).toBeDefined()
    expect(engineInvocations).toBeDefined()
    expect(bridgeEvents).toBeDefined()
    expect(files).toBeDefined()
    expect(soulApps).toBeDefined()
    expect(settings).toBeDefined()
    expect(workerConfig).toBeDefined()
  })
})
