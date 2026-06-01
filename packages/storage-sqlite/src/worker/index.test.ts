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
  createWorkspace,
  discardRetiredSoulMetadata,
  engineInvocations,
  files,
  getSession,
  getSoulApp,
  getWorker,
  getWorkerConfigValue,
  getWorkerDb,
  initWorkerDb,
  listEngineInvocations,
  listFiles,
  listInvocationEvents,
  listSessionEvents,
  listSessions,
  listSoulApps,
  listWorkerConfigValues,
  listWorkerOverlayAssets,
  listWorkers,
  listWorkspaces,
  nextEngineInvocationSeq,
  resolveSingleActiveWorker,
  runWorkerMigrations,
  sessions,
  setSetting,
  settings,
  soulApps,
  updateSoulAppLifecycle,
  upsertFile,
  upsertSoulApp,
  upsertWorker,
  upsertWorkerConfigValue,
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

  it('opens the worker database with a positive busy_timeout so concurrent CLI and daemon writes wait instead of failing immediately', () => {
    const [row] = getWorkerDb().all<{ timeout: number }>(sql.raw('PRAGMA busy_timeout'))
    expect(row?.timeout).toBeGreaterThan(0)
  })

  it('resolveSingleActiveWorker returns none when no active worker exists (fresh or all archived)', () => {
    expect(resolveSingleActiveWorker()).toEqual({ kind: 'none' })
    upsertWorker({ id: 'archived-only', name: 'Archived', appId: 'demo-soul-app', status: 'archived' })
    expect(resolveSingleActiveWorker()).toEqual({ kind: 'none' })
  })

  it('resolveSingleActiveWorker returns the lone active worker, ignoring archived siblings', () => {
    upsertWorker({ id: 'archived-sibling', name: 'Archived', appId: 'demo-soul-app', status: 'archived' })
    upsertWorker({ id: 'the-active', name: 'Active', appId: 'demo-soul-app', status: 'active' })
    const resolution = resolveSingleActiveWorker()
    expect(resolution).toMatchObject({ kind: 'single', worker: { id: 'the-active' } })
  })

  it('resolveSingleActiveWorker reports multiple so callers refuse to guess on a dirty multi-active DB', () => {
    upsertWorker({ id: 'active-a', name: 'A', appId: 'demo-soul-app', status: 'active' })
    upsertWorker({ id: 'active-b', name: 'B', appId: 'demo-soul-app', status: 'active' })
    const resolution = resolveSingleActiveWorker()
    expect(resolution.kind).toBe('multiple')
    expect(
      (resolution as { workers: Array<{ id: string }> }).workers.map(worker => worker.id).sort(),
    ).toEqual(['active-a', 'active-b'])
  })

  it('closes the underlying sqlite connection on closeWorkerDb so a spawned daemon can acquire the worker database lock', () => {
    const handle = getWorkerDb()
    expect(() => handle.all(sql.raw('SELECT 1'))).not.toThrow()
    closeWorkerDb()
    expect(() => handle.all(sql.raw('SELECT 1'))).toThrow()
  })

  it('creates only Worker metadata tables without token-like identity storage', () => {
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
      'workers',
      'workspaces',
    ])

    const sessionColumns = getWorkerDb()
      .all<{ name: string }>(sql.raw('PRAGMA table_info("sessions")'))
      .map(row => row.name)
    expect(sessionColumns).toContain('capability_id')
    expect(sessionColumns).not.toContain('capability_template_id')
    expect(sessionColumns).not.toContain('context')
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

  it('rejects literal secrets inside opaque descriptor extensions and external payloads', () => {
    expect(() =>
      upsertSoulApp({
        id: freeformDescriptor.identity.appId as string,
        name: freeformDescriptor.identity.name as string,
        version: freeformDescriptor.identity.version as string,
        protocol: freeformDescriptor.protocol,
        soulId: freeformDescriptor.identity.soulId as string,
        sourceKind: 'inline',
        sourceRef: 'test:inline',
        descriptorDigest: 'digest-secret-external',
        descriptorJson: {
          ...freeformDescriptor,
          external: {
            businessWorkflow: {
              apiKey: 'literal-secret',
            },
          },
        },
        at: '2026-05-12T22:22:00.000Z',
      }),
    ).toThrow('Literal secrets are not allowed in Worker metadata: soul_apps.descriptorJson.external.businessWorkflow.apiKey')

    expect(() =>
      upsertSoulApp({
        id: freeformDescriptor.identity.appId as string,
        name: freeformDescriptor.identity.name as string,
        version: freeformDescriptor.identity.version as string,
        protocol: freeformDescriptor.protocol,
        soulId: freeformDescriptor.identity.soulId as string,
        sourceKind: 'inline',
        sourceRef: 'test:inline',
        descriptorDigest: 'digest-secret-extension',
        descriptorJson: {
          ...freeformDescriptor,
          extensions: {
            'demo.example/review': {
              token: 'literal-secret',
            },
          },
        },
        at: '2026-05-12T22:22:00.000Z',
      }),
    ).toThrow('Literal secrets are not allowed in Worker metadata: soul_apps.descriptorJson.extensions.demo.example/review.token')
  })

  it('normalizes retired worker lifecycle rows to archived', () => {
    upsertWorker({ id: 'legacy-disabled-worker', name: 'Legacy Disabled Worker', appId: 'demo-soul-app' })
    upsertWorker({ id: 'legacy-paused-worker', name: 'Legacy Paused Worker', appId: 'demo-soul-app' })
    getWorkerDb().run(sql.raw('UPDATE workers SET status = \'disabled\' WHERE id = \'legacy-disabled-worker\''))
    getWorkerDb().run(sql.raw('UPDATE workers SET status = \'paused\' WHERE id = \'legacy-paused-worker\''))

    runWorkerMigrations()

    expect(getWorker('legacy-disabled-worker')?.status).toBe('archived')
    expect(getWorker('legacy-paused-worker')?.status).toBe('archived')
  })

  it('persists worker config envelopes and rejects malformed Worker metadata', () => {
    const worker = upsertWorker({ id: 'worker-config-1', name: 'Config worker', appId: 'demo-soul-app' })

    const saved = upsertWorkerConfigValue({
      workerId: worker.id,
      configKey: 'engine-selection',
      source: 'web',
      configValueJson: {
        checksum: 'sha256:engine-selection',
        enabled: true,
        kind: 'engine-selection',
        options: { profileRef: 'secretref:codex/default-profile' },
        sourceRef: 'descriptor://configuration/default-engine',
        target: 'codex',
        updatedAt: '2026-05-27T00:00:00.000Z',
        updatedBy: 'web',
      },
    })

    expect(saved.configValueJson).toMatchObject({
      enabled: true,
      kind: 'engine-selection',
      target: 'codex',
    })
    expect(getWorkerConfigValue(worker.id, 'engine-selection')).toMatchObject({
      configKey: 'engine-selection',
      source: 'web',
      workerId: worker.id,
    })
    expect(listWorkerConfigValues(worker.id)).toHaveLength(1)
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'malformed',
        configValueJson: {
          enabled: 'yes',
          kind: 'engine-selection',
          target: 'codex',
        },
      }),
    ).toThrow('Invalid Host worker config envelope enabled flag')
    expect(getWorkerConfigValue(worker.id, 'malformed')).toBeNull()

    const minimal = upsertWorkerConfigValue({
      workerId: worker.id,
      configKey: 'workbench-preference',
      source: 'web',
      at: '2026-05-27T00:00:01.000Z',
      configValueJson: {
        enabled: false,
        kind: 'workbench-preference',
        target: 'none',
      },
    })
    expect(minimal.configValueJson).toEqual({
      checksum: null,
      enabled: false,
      kind: 'workbench-preference',
      options: {},
      sourceRef: null,
      target: 'none',
      updatedAt: '2026-05-27T00:00:01.000Z',
      updatedBy: 'web',
    })
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'domain-record',
        configValueJson: {
          candidateId: 'candidate-1',
          enabled: true,
          kind: 'sdk-extension',
          target: 'none',
        },
      }),
    ).toThrow('Invalid Host worker config envelope field')
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'domain-option',
        configValueJson: {
          enabled: true,
          kind: 'sdk-extension',
          options: {
            candidateId: 'candidate-1',
          },
          target: 'none',
        },
      }),
    ).toThrow('Soul-owned config payloads are not allowed in Worker metadata: worker_config.domain-option.configValueJson.options.candidateId')
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'artifact-content-option',
        configValueJson: {
          enabled: true,
          kind: 'entry-file-overlay',
          options: {
            artifactContent: '# Generated report\n',
          },
          target: 'codex',
        },
      }),
    ).toThrow('Soul-owned config payloads are not allowed in Worker metadata: worker_config.artifact-content-option.configValueJson.options.artifactContent')
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'skill-body-option',
        configValueJson: {
          enabled: true,
          kind: 'skill-overlay',
          options: {
            skillBody: '# Skill\nDo domain work.\n',
          },
          target: 'codex',
        },
      }),
    ).toThrow('Soul-owned config payloads are not allowed in Worker metadata: worker_config.skill-body-option.configValueJson.options.skillBody')
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'entry-file-content-option',
        configValueJson: {
          enabled: true,
          kind: 'entry-file-overlay',
          options: {
            entryFileContent: '# User work\n',
          },
          target: 'codex',
        },
      }),
    ).toThrow('Soul-owned config payloads are not allowed in Worker metadata: worker_config.entry-file-content-option.configValueJson.options.entryFileContent')
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'embedded-mcp-file',
        configValueJson: {
          enabled: true,
          kind: 'mcp-overlay',
          options: {
            configToml: '[mcp_servers.local]\ncommand = "node"\n',
          },
          target: 'codex',
        },
      }),
    ).toThrow('Full native MCP files are not allowed in Worker metadata')
    expect(() =>
      upsertWorkerConfigValue({
        workerId: worker.id,
        configKey: 'bad-updater',
        configValueJson: {
          enabled: true,
          kind: 'sdk-extension',
          target: 'none',
          updatedBy: 'ben',
        },
      }),
    ).toThrow('Invalid Host worker config envelope updatedBy')
  })

  it('projects standard worker config overlays into legacy overlay asset rows', () => {
    const worker = upsertWorker({ id: 'worker-config-overlay-1', name: 'Config overlay worker', appId: 'demo-soul-app' })

    upsertWorkerConfigValue({
      workerId: worker.id,
      configKey: 'engine-selection',
      source: 'web',
      configValueJson: {
        enabled: true,
        kind: 'engine-selection',
        target: 'codex',
      },
    })
    upsertWorkerConfigValue({
      workerId: worker.id,
      configKey: 'skill-overlay:freeform-session',
      source: 'web',
      configValueJson: {
        checksum: 'sha256:skill-overlay',
        enabled: true,
        kind: 'skill-overlay',
        options: {
          optionsJson: { mode: 'focused' },
          replaces: 'descriptor://engine/skills/freeform-session',
        },
        sourceRef: 'descriptor://engine/skills/freeform-overlay',
        target: 'codex',
      },
    })
    upsertWorkerConfigValue({
      workerId: worker.id,
      configKey: 'entry-file-overlay:AGENTS.md',
      source: 'web',
      configValueJson: {
        enabled: true,
        kind: 'entry-file-overlay',
        options: {
          targetPath: 'AGENTS.md',
        },
        sourceRef: 'descriptor://engine/workspace/overlays/AGENTS.md',
        target: 'all',
      },
    })
    upsertWorkerConfigValue({
      workerId: worker.id,
      configKey: 'skill-overlay:disabled-baseline',
      source: 'web',
      configValueJson: {
        enabled: false,
        kind: 'skill-overlay',
        options: {
          replaces: 'descriptor://engine/skills/disabled-baseline',
        },
        target: 'all',
      },
    })

    expect(listWorkerOverlayAssets(worker.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checksum: 'sha256:skill-overlay',
        enabled: true,
        id: 'freeform-session',
        kind: 'skill',
        optionsJson: { mode: 'focused' },
        source: 'overlay',
        sourceRef: 'descriptor://engine/skills/freeform-overlay',
        target: 'codex',
      }),
      expect.objectContaining({
        enabled: true,
        id: 'AGENTS.md',
        kind: 'entry-file',
        sourceRef: 'descriptor://engine/workspace/overlays/AGENTS.md',
        target: 'workspace',
      }),
      expect.objectContaining({
        enabled: false,
        id: 'disabled-baseline',
        kind: 'skill',
        sourceRef: 'descriptor://engine/skills/disabled-baseline',
        target: 'codex',
      }),
      expect.objectContaining({
        enabled: false,
        id: 'disabled-baseline',
        kind: 'skill',
        sourceRef: 'descriptor://engine/skills/disabled-baseline',
        target: 'claude-code',
      }),
    ]))
    expect(listWorkerOverlayAssets(worker.id)).toHaveLength(4)
    expect(listWorkerOverlayAssets(worker.id)[0]).not.toHaveProperty('content')
  })

  it('persists the worker -> workspace -> session -> invocation loop without Host review or lesson rows', () => {
    const worker = upsertWorker({
      id: 'worker-demo',
      appId: 'demo-soul',
      name: 'Demo',
      defaultEngineId: 'codex',
      at: '2026-05-09T01:00:00.000Z',
    })
    expect(worker.appId).toBe('demo-soul')

    const workspace = createWorkspace({
      id: 'workspace-1',
      workerId: worker.id,
      name: 'Demo workspace',
      rootPath: '/tmp/demo-workspace',
      at: '2026-05-09T01:01:00.000Z',
    })
    expect(listWorkspaces(worker.id)).toEqual([workspace])

    const session = createSession({
      id: 'session-1',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityId: 'candidate-screen',
      title: 'Screen candidate',
      at: '2026-05-09T01:02:00.000Z',
    })
    expect(listSessions(workspace.id)).toEqual([session])

    const invocation = createEngineInvocation({
      id: 'inv-1',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: 'aiworker://sessions/session-1/invocations/inv-1/input',
      status: 'running',
      at: '2026-05-09T01:04:00.000Z',
    })
    expect(invocation).toMatchObject({
      inputRef: 'aiworker://sessions/session-1/invocations/inv-1/input',
      processState: 'not_spawned',
    })
    expect(invocation).not.toHaveProperty('turnId')
    expect(invocation).not.toHaveProperty('prompt')
    expect(listEngineInvocations(session.id)).toEqual([invocation])
    appendSessionEvent({
      sessionId: session.id,
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
      appId: 'freeform',
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
      capabilityId: 'default',
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
    expect(listEngineInvocations(session.id)).toEqual([invocation])
    expect(listSessionEvents(session.id)[0]).toMatchObject({
      invocationId: invocation.id,
    })
  })

  it('persists canonical normalized bridge event classes in the storage event_type column', () => {
    const worker = upsertWorker({
      id: 'worker-normalized-bridge-events',
      appId: 'freeform',
      name: 'Freeform',
      defaultEngineId: 'codex',
      at: '2026-05-27T01:10:00.000Z',
    })
    const workspace = createWorkspace({
      id: 'workspace-normalized-bridge-events',
      workerId: worker.id,
      name: 'Normalized bridge events workspace',
      rootPath: '/tmp/normalized-bridge-events',
      at: '2026-05-27T01:11:00.000Z',
    })
    const session = createSession({
      id: 'session-normalized-bridge-events',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityId: 'default',
      title: 'Normalized bridge events session',
      at: '2026-05-27T01:12:00.000Z',
    })
    const invocation = createEngineInvocation({
      id: 'invocation-normalized-bridge-events',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      inputRef: 'aiworker://sessions/session-normalized-bridge-events/invocations/invocation-normalized-bridge-events/input',
      status: 'running',
      at: '2026-05-27T01:13:00.000Z',
    })

    for (const [index, type] of (['status', 'assistant_delta', 'tool', 'error', 'log'] as const).entries()) {
      appendSessionEvent({
        sessionId: session.id,
        invocationId: invocation.id,
        seq: index + 1,
        type,
        payloadJson: { message: type },
        at: `2026-05-27T01:13:0${index}.000Z`,
      })
    }

    const eventTypes = getWorkerDb()
      .select({ eventType: bridgeEvents.eventType })
      .from(bridgeEvents)
      .orderBy(bridgeEvents.id)
      .all()
      .map(row => row.eventType)

    expect(eventTypes).toEqual([
      'invocation.progress',
      'invocation.output.delta',
      'invocation.tool.observed',
      'invocation.error',
      'invocation.progress',
    ])
    expect(listSessionEvents(session.id).map(event => event.type)).toEqual([
      'status',
      'assistant_delta',
      'tool',
      'error',
      'log',
    ])
  })

  it('rejects secret-like assignment strings in persisted engine diagnostics', () => {
    const worker = upsertWorker({
      id: 'worker-engine-diagnostics-secret',
      appId: 'freeform',
      name: 'Freeform',
      defaultEngineId: 'codex',
      at: '2026-05-27T02:00:00.000Z',
    })
    const workspace = createWorkspace({
      id: 'workspace-engine-diagnostics-secret',
      workerId: worker.id,
      name: 'Diagnostics workspace',
      rootPath: '/tmp/diagnostics-secret',
      at: '2026-05-27T02:01:00.000Z',
    })
    const session = createSession({
      id: 'session-engine-diagnostics-secret',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityId: 'default',
      title: 'Diagnostics session',
      at: '2026-05-27T02:02:00.000Z',
    })

    expect(() =>
      createEngineInvocation({
        id: 'invocation-diagnostic-secret',
        sessionId: session.id,
        seq: 1,
        engineId: 'codex',
        engineCommand: 'codex',
        error: 'authorization = "literal-secret-value"',
        inputRef: 'aiworker://sessions/session-engine-diagnostics-secret/invocations/invocation-diagnostic-secret/input',
      }),
    ).toThrow('Literal secrets are not allowed in Worker metadata: engine_invocations.error')
    expect(() =>
      createWorkspace({
        id: 'workspace-embedded-mcp-file',
        workerId: worker.id,
        name: 'Embedded MCP workspace',
        rootPath: '/tmp/embedded-mcp-file',
        metadataJson: {
          configToml: '[mcp_servers.local]\ncommand = "node"\n',
        },
      }),
    ).toThrow('Full native MCP files are not allowed in Worker metadata: workspaces.metadataJson.configToml')
    expect(() =>
      upsertWorker({
        id: 'worker-domain-metadata',
        appId: 'demo-soul-app',
        name: 'Domain metadata worker',
        metadataJson: { reviewRecord: { decision: 'approved' } },
      }),
    ).toThrow('Soul-owned payloads are not allowed in Worker metadata: workers.metadataJson.reviewRecord')
    expect(() =>
      createWorkspace({
        id: 'workspace-domain-metadata',
        workerId: worker.id,
        name: 'Domain metadata workspace',
        rootPath: '/tmp/domain-metadata-workspace',
        metadataJson: { artifactContent: '# Generated report\n' },
      }),
    ).toThrow('Soul-owned payloads are not allowed in Worker metadata: workspaces.metadataJson.artifactContent')
    expect(() =>
      createSession({
        id: 'session-domain-metadata',
        workerId: worker.id,
        workspaceId: workspace.id,
        capabilityId: 'default',
        title: 'Domain metadata session',
        metadataJson: { promptText: 'Summarize the business artifact.' },
      }),
    ).toThrow('Soul-owned payloads are not allowed in Worker metadata: sessions.metadataJson.promptText')
    expect(() =>
      createEngineInvocation({
        id: 'invocation-domain-metadata',
        sessionId: session.id,
        seq: 2,
        engineId: 'codex',
        engineCommand: 'codex',
        inputRef: 'aiworker://sessions/session-engine-diagnostics-secret/invocations/invocation-domain-metadata/input',
        metadataJson: { candidateId: 'candidate-1' },
      }),
    ).toThrow('Soul-owned payloads are not allowed in Worker metadata: engine_invocations.metadataJson.candidateId')

    const invocation = createEngineInvocation({
      id: 'invocation-diagnostic-safe',
      sessionId: session.id,
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      error: 'authorization = "[REDACTED]"',
      inputRef: 'aiworker://sessions/session-engine-diagnostics-secret/invocations/invocation-diagnostic-safe/input',
      metadataJson: { authorization: '[REDACTED]' },
      status: 'running',
      summary: 'token=[REDACTED]',
    })
    appendSessionEvent({
      sessionId: session.id,
      invocationId: invocation.id,
      seq: 1,
      type: 'log',
      payloadJson: { message: 'token=[REDACTED]' },
      at: '2026-05-27T02:03:00.000Z',
    })

    expect(() =>
      appendSessionEvent({
        sessionId: session.id,
        invocationId: invocation.id,
        seq: 2,
        type: 'log',
        payloadJson: { message: 'token = "literal-secret-value"' },
        at: '2026-05-27T02:03:01.000Z',
      }),
    ).toThrow('Literal secrets are not allowed in Worker metadata: bridge_events.eventJson.payload.message')

    expect(() =>
      appendSessionEvent({
        sessionId: session.id,
        invocationId: invocation.id,
        seq: 3,
        type: 'log',
        payloadJson: {
          message: '[mcp_servers.local]\ncommand = "node"\n',
        },
        at: '2026-05-27T02:03:02.000Z',
      }),
    ).toThrow('Full native MCP files are not allowed in Worker metadata: bridge_events.eventJson.payload.message')
  })

  it('rejects extended literal secret token shapes in persisted Worker metadata', () => {
    const literals = [
      'ghp_0123456789abcdefghijklmnopqrstuvwxyz',
      'gho_0123456789abcdefghijklmnopqrstuvwxyz',
      'github_pat_0123456789abcdefghijklmnopqrstuvwxyz',
      'AKIAIOSFODNN7EXAMPLE',
      'AIzaSyA1234567890abcdefghijklmnopqrstuvw',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
    ]
    literals.forEach((literal, index) => {
      expect(() =>
        upsertWorker({
          id: `worker-extended-secret-${index}`,
          appId: 'demo-soul-app',
          name: 'Extended secret worker',
          metadataJson: { diagnostic: `engine output: ${literal}` },
        }),
      ).toThrow('Literal secrets are not allowed in Worker metadata: workers.metadataJson.diagnostic')
    })
  })

  it('rejects prefixed secret-key references that embed assignments or literal values', () => {
    // A secret-key value that startsWith('env:') but embeds an assignment used to
    // slip past isSecretReference; the prefix must name a lookup target only.
    expect(() =>
      upsertWorker({
        id: 'worker-prefixed-assignment-secret',
        appId: 'demo-soul-app',
        name: 'Prefixed assignment worker',
        metadataJson: { apiKeyRef: 'env:OPENAI_API_KEY=plaintextvalue' },
      }),
    ).toThrow('Literal secrets are not allowed in Worker metadata: workers.metadataJson.apiKeyRef')
    expect(() =>
      upsertWorker({
        id: 'worker-prefixed-dollar-secret',
        appId: 'demo-soul-app',
        name: 'Prefixed dollar worker',
        metadataJson: { authorization: '$OPENAI_API_KEY=literalplaintext' },
      }),
    ).toThrow('Literal secrets are not allowed in Worker metadata: workers.metadataJson.authorization')

    // Plain prefixed references with no embedded value stay valid.
    expect(() =>
      upsertWorker({
        id: 'worker-prefixed-valid-ref',
        appId: 'demo-soul-app',
        name: 'Prefixed valid worker',
        metadataJson: { apiKeyRef: 'secretref:codex/default-profile' },
      }),
    ).not.toThrow()
  })

  it('filters session events by id in SQL before applying the limit so long sessions keep streaming', () => {
    const worker = upsertWorker({
      id: 'worker-events',
      appId: 'demo-soul',
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
      capabilityId: 'candidate-screen',
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
    const otherInvocation = createEngineInvocation({
      id: 'events-invocation-2',
      sessionId: session.id,
      seq: 2,
      engineId: 'codex',
      inputRef: 'aiworker://sessions/session-events/invocations/events-invocation-2/input',
      status: 'running',
      at: '2026-05-23T00:00:04.000Z',
    })

    const ids = Array.from({ length: 5 }, (_, index) => appendSessionEvent({
      invocationId: invocation.id,
      sessionId: session.id,
      seq: index + 1,
      type: 'assistant_delta',
      payloadJson: { index: index + 1 },
      at: `2026-05-23T00:00:${String(10 + index).padStart(2, '0')}.000Z`,
    }).id)
    const otherId = appendSessionEvent({
      invocationId: otherInvocation.id,
      sessionId: session.id,
      seq: 6,
      type: 'assistant_delta',
      payloadJson: { index: 'other' },
      at: '2026-05-23T00:00:16.000Z',
    }).id

    // `after` returns only newer events, in seq order.
    expect(listSessionEvents(session.id, { after: ids[1] }).map(event => event.id)).toEqual([ids[2]!, ids[3]!, ids[4]!, otherId])
    // The limit is applied AFTER the id filter, so a tight window still walks forward past the cursor
    // instead of stalling on the earliest rows (the long-session replay regression).
    expect(listSessionEvents(session.id, { after: ids[1], limit: 2 }).map(event => event.id)).toEqual([ids[2]!, ids[3]!])
    // No cursor returns the full window in seq order.
    expect(listSessionEvents(session.id).map(event => event.id)).toEqual([...ids, otherId])
    expect(listInvocationEvents(invocation.id, { after: ids[1], limit: 2 }).map(event => event.id)).toEqual([ids[2]!, ids[3]!])
    expect(listInvocationEvents(otherInvocation.id).map(event => event.id)).toEqual([otherId])
  })

  it('discards legacy built-in Soul worker metadata and cascaded local records', () => {
    const worker = upsertWorker({
      id: 'legacy-hr-worker',
      appId: 'hr',
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
      capabilityId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: {
        capabilityId: 'candidate-screen',
        keep: 'value',
        soulName: 'HR',
      },
      at: '2026-05-13T13:04:02.000Z',
    })
    createSession({
      id: 'legacy-hr-custom-session',
      workerId: worker.id,
      workspaceId: workspace.id,
      capabilityId: 'custom-legacy-capability',
      title: 'Custom legacy capability',
      metadataJson: { capabilityId: 'custom-legacy-capability' },
      at: '2026-05-13T13:04:03.000Z',
    })

    const result = discardRetiredSoulMetadata({
      at: '2026-05-13T13:05:00.000Z',
      appIds: ['hr'],
    })

    expect(result).toEqual({
      retiredAppIds: ['hr'],
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
      id: 'worker-demo-primary',
      appId: 'demo-soul',
      name: 'Demo Primary',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:00:00.000Z',
    })
    const talentPool = upsertWorker({
      id: 'worker-demo-secondary',
      appId: 'demo-soul',
      name: 'Demo Secondary',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:01:00.000Z',
    })

    const recruitingWorkspace = createWorkspace({
      id: 'workspace-recruiting',
      workerId: recruiting.id,
      name: 'Open roles',
      rootPath: '/tmp/demo-primary',
      at: '2026-05-09T02:02:00.000Z',
    })
    const talentWorkspace = createWorkspace({
      id: 'workspace-talent-pool',
      workerId: talentPool.id,
      name: 'Talent pool',
      rootPath: '/tmp/demo-secondary',
      at: '2026-05-09T02:03:00.000Z',
    })

    expect(recruiting.appId).toBe(talentPool.appId)
    expect(recruiting.id).not.toBe(talentPool.id)
    expect(listWorkspaces(recruiting.id)).toEqual([recruitingWorkspace])
    expect(listWorkspaces(talentPool.id)).toEqual([talentWorkspace])
  })

  it('repairs legacy unique worker Soul index during migration', () => {
    getWorkerDb().run(sql.raw('DROP INDEX IF EXISTS workers_app_idx'))
    getWorkerDb().run(sql.raw('CREATE UNIQUE INDEX workers_app_idx ON workers (app_id)'))

    runWorkerMigrations()

    const indexes = getWorkerDb().all<{ name: string, unique: number }>(sql.raw('PRAGMA index_list("workers")'))
    expect(indexes.find(index => index.name === 'workers_app_idx')?.unique).toBe(0)

    upsertWorker({
      id: 'worker-hr-legacy-a',
      appId: 'hr',
      name: 'HR Legacy A',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:10:00.000Z',
    })
    upsertWorker({
      id: 'worker-hr-legacy-b',
      appId: 'hr',
      name: 'HR Legacy B',
      defaultEngineId: 'codex',
      at: '2026-05-09T02:11:00.000Z',
    })

    expect(listWorkers().filter(worker => worker.appId === 'hr').map(worker => worker.id)).toContain('worker-hr-legacy-b')
  })

  it('keeps indexes aligned with the session workspace query paths', () => {
    expect(explain(`SELECT * FROM workers WHERE status = 'active' ORDER BY updated_at DESC LIMIT 20`)).toContain('workers_status_updated_at_idx')
    expect(explain(`SELECT * FROM workspaces WHERE worker_id = 'worker-demo' ORDER BY updated_at DESC LIMIT 20`)).toContain('workspaces_worker_updated_at_idx')
    expect(explain(`SELECT * FROM sessions WHERE workspace_id = 'workspace-1' ORDER BY updated_at DESC LIMIT 20`)).toContain('sessions_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM sessions WHERE capability_id = 'default' ORDER BY updated_at DESC LIMIT 20`)).toContain('sessions_capability_updated_at_idx')
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
