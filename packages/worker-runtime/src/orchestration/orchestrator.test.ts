import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  getWorker,
  initWorkerDb,
  listWorkers,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createWorkerOrchestrator } from './orchestrator'

const FREEFORM_APP_ID = 'aiworker-freeform'
const freeformDescriptor = parseSoulDescriptorV1({
  compatibility: { host: '>=1.0.0' },
  configuration: {},
  engine: {
    mcp: {
      targets: {
        codex: { file: 'dist/engine-assets/mcp/codex/config.toml' },
      },
    },
    workspaceAssets: { source: 'dist/engine-assets/workspace' },
  },
  extensions: {},
  external: {},
  health: { ready: true },
  identity: {
    appId: FREEFORM_APP_ID,
    description: 'Open-ended Soul for freeform local work.',
    name: 'AIWorker Freeform',
    soulId: 'freeform',
    version: '0.1.0',
  },
  protocol: 'soul/v1',
})

describe('Worker orchestrator boundary', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(path.join(tmpdir(), 'aiworker-host-runtime-'))
    initWorkerDb(path.join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function orchestrator() {
    return createWorkerOrchestrator({
      registryContext: () => ({
        availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
        enabledConnectorIds: ['ats', 'ci'],
        hostVersion: '0.12.1',
      }),
      now: () => '2026-05-13T17:54:00.000Z',
      workersRoot: path.join(dir, 'workers'),
    })
  }

  function seedLegacyHrWorker() {
    const at = '2026-05-13T17:53:00.000Z'
    upsertWorker({
      id: 'legacy-hr-worker',
      appId: 'hr',
      name: 'Legacy HR',
      defaultEngineId: 'codex',
      at,
    })
    createWorkspace({
      id: 'legacy-hr-workspace',
      workerId: 'legacy-hr-worker',
      name: 'Legacy HR workspace',
      rootPath: path.join(dir, 'workers', 'legacy-hr-worker', 'workspaces', 'legacy-hr-workspace'),
      at,
    })
    createSession({
      id: 'legacy-hr-session',
      workerId: 'legacy-hr-worker',
      workspaceId: 'legacy-hr-workspace',
      title: 'Legacy candidate screen',
      at,
    })
  }

  it('bootstraps official apps, rejects legacy Souls, creates app-scoped workers, and rejects duplicate ids', async () => {
    seedLegacyHrWorker()

    const runtime = orchestrator()
    const bootstrap = await runtime.bootstrapOfficialSoulApps()

    expect(bootstrap.scope).toBe('official')
    expect(bootstrap.status).toBe('pass')
    expect(bootstrap.results.map(result => result.appId)).toEqual([FREEFORM_APP_ID])
    expect(bootstrap.retiredMetadataDiscard).toMatchObject({ workersDeleted: 1 })
    expect(getWorker('legacy-hr-worker')).toBeNull()
    expect(runtime.findSoul(FREEFORM_APP_ID)?.status).toBe('available')
    expect(runtime.findSoul('hr')).toBeUndefined()

    await expect(runtime.createSoulWorker({
      id: 'legacy-hr',
      name: 'Legacy HR',
      appId: 'hr',
    })).rejects.toMatchObject({ code: 'SOUL_NOT_AVAILABLE', status: 400 })

    const created = await runtime.createSoulWorker({
      id: 'freeform-worker',
      metadata: { owner: 'operator' },
      name: 'Freeform',
      appId: FREEFORM_APP_ID,
    })

    expect(created.worker).toMatchObject({
      id: 'freeform-worker',
      name: 'Freeform',
      appId: FREEFORM_APP_ID,
    })
    expect(created.worker.metadataJson).toMatchObject({
      owner: 'operator',
      soulAppId: FREEFORM_APP_ID,
    })
    expect(created.worker.metadataJson).not.toHaveProperty('domain')
    expect(created.snapshot.worker.id).toBe('freeform-worker')

    const workspace = await created.runtime.createWorkspace({ name: 'Open Workspace', type: 'workspace' })
    await expect(readFile(path.join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('AIWorker Freeform Workspace')
    await expect(readFile(path.join(workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'), 'utf8')).resolves.toContain('AIWorker Freeform Session')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('engine-assets/workspace/AGENTS.md')

    await expect(runtime.createSoulWorker({
      id: 'freeform-worker',
      name: 'Duplicate Freeform',
      appId: FREEFORM_APP_ID,
    })).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })

  it('passes descriptor engine assets into descriptor-path worker projections', async () => {
    const appRoot = path.join(dir, 'souls', FREEFORM_APP_ID)
    await mkdir(path.join(appRoot, 'dist', 'engine-assets', 'workspace'), { recursive: true })
    await mkdir(path.join(appRoot, 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
    await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
    await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '[mcp_servers.ats]\ncommand = "uvx"\n')
    await writeFile(path.join(appRoot, 'dist', 'soul.descriptor.json'), `${JSON.stringify(freeformDescriptor, null, 2)}\n`)

    const runtime = orchestrator()
    await runtime.installAppFromPath(appRoot)
    runtime.enableApp(FREEFORM_APP_ID)
    const created = await runtime.createSoulWorker({
      defaultEngineId: 'codex',
      id: 'freeform-mcp-worker',
      name: 'Freeform MCP',
      appId: FREEFORM_APP_ID,
    })
    const workspace = await created.runtime.createWorkspace({ name: 'MCP Workspace', type: 'workspace' })

    await expect(readFile(path.join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).resolves.toContain('mcp_servers.ats')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('"kind": "mcp-client"')
  })

  it('validates that a worker Soul App is enabled before new work', async () => {
    const runtime = orchestrator()
    await runtime.bootstrapOfficialSoulApps()
    const created = await runtime.createSoulWorker({
      id: 'archive-app-worker',
      name: 'Archive App Worker',
      appId: FREEFORM_APP_ID,
    })

    expect(runtime.requireEnabledAppForWorker(created.worker.id)).toMatchObject({
      appId: FREEFORM_APP_ID,
      status: 'enabled',
    })

    runtime.archiveApp(FREEFORM_APP_ID)

    expect(() => runtime.requireEnabledAppForWorker(created.worker.id))
      .toThrow(`Soul App is not enabled: ${FREEFORM_APP_ID}`)
    expect(() => runtime.requireEnabledAppForWorker(created.worker.id))
      .toThrow(expect.objectContaining({ code: 'SOUL_APP_DISABLED', status: 409 }))
  })

  it('rejects creating a second active worker (one active per daemon)', async () => {
    const runtime = orchestrator()
    await runtime.bootstrapOfficialSoulApps()
    const created = await runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'First' })
    expect(created.worker.status).toBe('active')
    await expect(
      runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'Second' }),
    ).rejects.toMatchObject({ code: 'WORKER_ALREADY_ACTIVE', status: 409 })
  })

  it('allows archive-then-recreate (archived worker does not count as active)', async () => {
    const runtime = orchestrator()
    await runtime.bootstrapOfficialSoulApps()
    const first = await runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'First' })
    upsertWorker({ id: first.worker.id, appId: first.worker.appId, name: first.worker.name, status: 'archived' })
    const second = await runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'Second' })
    expect(second.worker.status).toBe('active')
  })

  it('concurrent createSoulWorker yields exactly one active worker (invariant)', async () => {
    // 不变量测试:今天 check+insert 同步即原子,此处钉死"并发也只得一个 active",
    // 防未来在 check 与 insert 间引入 await 时破坏(锁是前向保险,见 async-lock.ts)。
    const runtime = orchestrator()
    await runtime.bootstrapOfficialSoulApps()
    const results = await Promise.allSettled([
      runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'A' }),
      runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'B' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect(listWorkers().filter(w => w.status === 'active')).toHaveLength(1)
  })
})
