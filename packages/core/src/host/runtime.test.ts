import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId } from '@zonease/aiworker-shared'
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

import { createHostRuntime } from './runtime'

const HR_APP_ID = 'aiworker-hr'
const HR_CANDIDATE_SCREEN = namespaceSoulAppCapabilityId(HR_APP_ID, 'candidate-screen')

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
      capabilityTemplateId: 'candidate-screen',
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
    expect(bootstrap.legacyMetadataDiscard).toMatchObject({ workersDeleted: 1 })
    expect(getWorker('legacy-hr-worker')).toBeNull()
    expect(runtime.findSoul(HR_APP_ID)?.status).toBe('available')
    expect(runtime.findSoul('hr')).toBeUndefined()

    await expect(runtime.createSoulWorker({
      id: 'legacy-hr',
      name: 'Legacy HR',
      soulId: 'hr',
    })).rejects.toMatchObject({ code: 'SOUL_NOT_AVAILABLE', status: 400 })

    const created = await runtime.createSoulWorker({
      id: 'hr-worker',
      metadata: { owner: 'people-team' },
      name: 'HR Recruiting',
      soulId: HR_APP_ID,
    })

    expect(created.worker).toMatchObject({
      id: 'hr-worker',
      name: 'HR Recruiting',
      soulId: HR_APP_ID,
    })
    expect(created.worker.metadataJson).toMatchObject({
      defaultTemplates: expect.any(Array),
      domain: 'hr-people-ops',
      owner: 'people-team',
      soulAppId: HR_APP_ID,
    })
    expect(created.snapshot.worker.id).toBe('hr-worker')

    const workspace = await created.runtime.createWorkspace({ name: 'Ada Candidate', type: 'candidate' })
    await expect(readFile(path.join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('AIWorker HR profile ledger')
    await expect(readFile(path.join(workspace.rootPath, '.agents', 'skills', 'aiworker-hr-candidate-profile', 'SKILL.md'), 'utf8')).resolves.toContain('Candidate Profile')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('engine-assets/workspace/AGENTS.md')

    await expect(runtime.createSoulWorker({
      id: 'hr-worker',
      name: 'Duplicate HR',
      soulId: HR_APP_ID,
    })).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })

  it('passes manifest engine assets into manifest-path worker projections', async () => {
    const appRoot = path.join(dir, 'apps', HR_APP_ID)
    await mkdir(path.join(appRoot, 'engine-assets', 'workspace'), { recursive: true })
    await mkdir(path.join(appRoot, 'engine-assets', 'mcp-clients', 'codex'), { recursive: true })
    await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
    await writeFile(path.join(appRoot, 'engine-assets', 'mcp-clients', 'codex', 'config.toml'), '[mcp_servers.ats]\ncommand = "uvx"\n')
    await writeFile(path.join(appRoot, 'soul-app.manifest.json'), `${JSON.stringify({
      ...hrSoulAppManifest,
      engineAssets: {
        ...hrSoulAppManifest.engineAssets,
        mcpClients: [{ source: './engine-assets/mcp-clients/codex', target: 'codex' }],
      },
    }, null, 2)}\n`)

    const runtime = host()
    await runtime.installAppFromPath(appRoot)
    runtime.enableApp(HR_APP_ID)
    const created = await runtime.createSoulWorker({
      defaultEngineId: 'codex',
      id: 'hr-mcp-worker',
      name: 'HR MCP',
      soulId: HR_APP_ID,
    })
    const workspace = await created.runtime.createWorkspace({ name: 'MCP Candidate', type: 'candidate' })

    await expect(readFile(path.join(workspace.rootPath, '.codex', 'config.toml'), 'utf8')).resolves.toContain('mcp_servers.ats')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('"kind": "mcp-client"')
  })

  it('validates worker template ownership', async () => {
    const runtime = host()
    await runtime.bootstrapOfficialSoulApps()
    const created = await runtime.createSoulWorker({
      id: 'hr-worker',
      name: 'HR Recruiting',
      soulId: HR_APP_ID,
    })

    const template = runtime.requireCapabilityTemplateForWorker(created.worker.id, HR_CANDIDATE_SCREEN)
    expect(template).toMatchObject({
      id: HR_CANDIDATE_SCREEN,
      soulId: HR_APP_ID,
    })

    expect(() => runtime.requireCapabilityTemplateForWorker(created.worker.id, 'aiworker-qa.release-gate'))
      .toThrow('does not belong to worker')
  })
})
