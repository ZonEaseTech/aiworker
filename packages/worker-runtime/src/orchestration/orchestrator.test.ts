import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { namespaceSoulAppCapabilityId, parseSoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  getWorker,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createHostRuntime } from './orchestrator'

const FREEFORM_APP_ID = 'aiworker-freeform'
const FREEFORM_DEFAULT = namespaceSoulAppCapabilityId(FREEFORM_APP_ID, 'default')
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
  workbench: {
    entry: 'dist/web/workbench/index.html',
    type: 'micro-app',
  },
})

describe('Host runtime boundary', () => {
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

  function host() {
    return createHostRuntime({
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
      soulId: 'hr',
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
      capabilityId: 'candidate-screen',
      title: 'Legacy candidate screen',
      at,
    })
  }

  it('bootstraps official apps, rejects legacy Souls, creates app-scoped workers, and rejects duplicate ids', async () => {
    seedLegacyHrWorker()

    const runtime = host()
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
      soulId: 'hr',
    })).rejects.toMatchObject({ code: 'SOUL_NOT_AVAILABLE', status: 400 })

    const created = await runtime.createSoulWorker({
      id: 'freeform-worker',
      metadata: { owner: 'operator' },
      name: 'Freeform',
      soulId: FREEFORM_APP_ID,
    })

    expect(created.worker).toMatchObject({
      id: 'freeform-worker',
      name: 'Freeform',
      soulId: FREEFORM_APP_ID,
    })
    expect(created.worker.metadataJson).toMatchObject({
      defaultCapabilities: expect.any(Array),
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
      soulId: FREEFORM_APP_ID,
    })).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })

  it('passes descriptor engine assets into descriptor-path worker projections', async () => {
    const appRoot = path.join(dir, 'souls', FREEFORM_APP_ID)
    await mkdir(path.join(appRoot, 'dist', 'engine-assets', 'workspace'), { recursive: true })
    await mkdir(path.join(appRoot, 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
    await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
    await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '[mcp_servers.ats]\ncommand = "uvx"\n')
    await writeFile(path.join(appRoot, 'dist', 'soul.descriptor.json'), `${JSON.stringify(freeformDescriptor, null, 2)}\n`)

    const runtime = host()
    await runtime.installAppFromPath(appRoot)
    runtime.enableApp(FREEFORM_APP_ID)
    const created = await runtime.createSoulWorker({
      defaultEngineId: 'codex',
      id: 'freeform-mcp-worker',
      name: 'Freeform MCP',
      soulId: FREEFORM_APP_ID,
    })
    const workspace = await created.runtime.createWorkspace({ name: 'MCP Workspace', type: 'workspace' })

    await expect(readFile(path.join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).resolves.toContain('mcp_servers.ats')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('"kind": "mcp-client"')
  })

  it('validates worker capability ownership', async () => {
    const runtime = host()
    await runtime.bootstrapOfficialSoulApps()
    const created = await runtime.createSoulWorker({
      id: 'freeform-worker',
      name: 'Freeform',
      soulId: FREEFORM_APP_ID,
    })

    const capability = runtime.requireCapabilityForWorker(created.worker.id, FREEFORM_DEFAULT)
    expect(capability).toMatchObject({
      id: FREEFORM_DEFAULT,
      soulId: FREEFORM_APP_ID,
    })

    expect(() => runtime.requireCapabilityForWorker(created.worker.id, 'other-soul.release-gate'))
      .toThrow('does not belong to worker')
  })

  it('validates that a worker Soul App is enabled before new work', async () => {
    const runtime = host()
    await runtime.bootstrapOfficialSoulApps()
    const created = await runtime.createSoulWorker({
      id: 'archive-app-worker',
      name: 'Archive App Worker',
      soulId: FREEFORM_APP_ID,
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
})
