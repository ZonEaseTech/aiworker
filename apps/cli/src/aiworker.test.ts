import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId } from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { preprocessArgv, runCli } from './aiworker'

describe('aiworker local CLI', () => {
  const originalEnv = { ...process.env }
  const originalWrite = process.stdout.write
  let root: string
  let output = ''

  beforeEach(async () => {
    closeWorkerDb()
    output = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    closeWorkerDb()
    process.exitCode = 0
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    process.stdout.write = originalWrite
    await rm(root, { recursive: true, force: true })
  })

  function argv(...args: string[]): string[] {
    return ['/usr/bin/bun', '/repo/apps/cli/src/aiworker.ts', ...args]
  }

  function seedLegacyHrMetadata() {
    closeWorkerDb()
    mkdirSync(path.dirname(process.env.WORKER_DB_PATH!), { recursive: true })
    initWorkerDb(process.env.WORKER_DB_PATH!)
    runWorkerMigrations()
    upsertWorker({
      id: 'legacy-hr-worker',
      soulId: 'hr',
      name: 'Legacy HR',
      defaultEngineId: 'codex',
      at: '2026-05-13T13:04:00.000Z',
    })
    createWorkspace({
      id: 'legacy-hr-workspace',
      workerId: 'legacy-hr-worker',
      name: 'Legacy HR workspace',
      rootPath: path.join(root, 'home', 'workers', 'legacy-hr-worker', 'workspaces', 'legacy-hr-workspace'),
      at: '2026-05-13T13:04:01.000Z',
    })
    createSession({
      id: 'legacy-hr-session',
      workerId: 'legacy-hr-worker',
      workspaceId: 'legacy-hr-workspace',
      capabilityTemplateId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: { capabilityTemplateId: 'candidate-screen', soulName: 'HR' },
      at: '2026-05-13T13:04:02.000Z',
    })
    closeWorkerDb()
  }

  it('preprocesses multi-word local commands', () => {
    expect(preprocessArgv(argv('workspace', 'create', '--name', 'T')).slice(2, 3)).toEqual(['workspace create'])
    expect(preprocessArgv(argv('session', 'start', '--input', 'P')).slice(2, 3)).toEqual(['session start'])
    expect(preprocessArgv(argv('worker', 'create', '--name', 'HR')).slice(2, 3)).toEqual(['worker create'])
  })

  it('initializes host-local daemon state without auto-creating Soul workers', async () => {
    expect(await runCli(argv('init'))).toBe(0)
    const body = JSON.parse(output) as { dbPath: string, home: string, workers: Array<{ soulId: string }>, workersRoot: string }

    expect(body.home).toBe(path.join(root, 'home'))
    expect(body.dbPath).toBe(path.join(root, 'home', 'aiworker.db'))
    expect(body.workersRoot).toBe(path.join(root, 'home', 'workers'))
    expect(body.workers).toEqual([])
    await expect(stat(path.join(root, '.aiworker'))).rejects.toThrow()
  })

  it('creates workspace/session command records and lists artifacts with a mocked engine', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'hr-recruiting', '--name', 'HR Recruiting', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { worker: { id: string, soulId: string } }).worker).toMatchObject({ id: 'hr-recruiting', soulId: 'aiworker-hr' })
    output = ''

    expect(await runCli(argv('worker', 'select', 'hr-recruiting'))).toBe(0)
    expect(output).toContain('selected-worker')
    output = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Hiring', '--worker', 'hr-recruiting'))).toBe(0)
    expect((JSON.parse(output) as { workspace: { id: string } }).workspace.id).toBeTruthy()
    output = ''

    expect(await runCli(argv('commands'))).toBe(0)
    expect(output).toContain('dev')
    expect(output).toContain('app list|show|install|enable|disable|doctor|permissions|bootstrap|create|validate|smoke')
    expect(output).toContain('worker create|list|show|select')
    expect(output).toContain('workspace create|list|show')
    expect(output).toContain('session start|list|show')
    expect(output).not.toContain('run start')
  })

  it('bootstraps official apps and rejects legacy built-in Soul ids', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    const body = JSON.parse(output) as {
      bootstrap: {
        results: Array<{ action: string, appId: string }>
        status: string
      }
      catalog: { souls: Array<{ id: string, status: string }> }
    }
    expect(body.bootstrap.status).toBe('pass')
    expect(body.bootstrap.results.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'installed_enabled'],
      ['aiworker-qa', 'installed_enabled'],
    ])
    expect(body.catalog.souls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'aiworker-hr', status: 'available' }),
      expect.objectContaining({ id: 'aiworker-qa', status: 'available' }),
    ]))
    expect(body.catalog.souls.some(soul => soul.id === 'hr')).toBe(false)
    output = ''

    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    expect((JSON.parse(output) as { bootstrap: { results: Array<{ action: string }> } }).bootstrap.results.map(result => result.action)).toEqual(['refreshed', 'refreshed'])
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'legacy-hr', '--name', 'Legacy HR', '--soul', 'hr'))).toBe(1)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'official-hr', '--name', 'Official HR', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { worker: { soulId: string } }).worker.soulId).toBe('aiworker-hr')
  })

  it('discards legacy HR metadata during official app bootstrap', async () => {
    seedLegacyHrMetadata()

    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    const body = JSON.parse(output) as {
      bootstrap: {
        legacyMetadataDiscard: { workersDeleted: number }
      }
      catalog: { souls: Array<{ id: string }> }
    }
    expect(body.bootstrap.legacyMetadataDiscard).toMatchObject({ workersDeleted: 1 })
    expect(body.catalog.souls.map(soul => soul.id)).toContain('aiworker-hr')
    output = ''

    expect(await runCli(argv('worker', 'show', 'legacy-hr-worker'))).toBe(0)
    expect((JSON.parse(output) as { worker: null }).worker).toBeNull()
  })

  it('installs, enables, lists, and disables local Soul App manifests', async () => {
    const manifestPath = path.join(root, 'aiworker-hr.manifest.json')
    await writeFile(manifestPath, JSON.stringify(hrSoulAppManifest))

    expect(await runCli(argv('app', 'install', manifestPath))).toBe(0)
    expect((JSON.parse(output) as { app: { appId: string, status: string } }).app).toMatchObject({ appId: 'aiworker-hr', status: 'installed' })
    output = ''

    expect(await runCli(argv('app', 'enable', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { app: { healthStatus: string, status: string } }).app).toMatchObject({ healthStatus: 'pass', status: 'enabled' })
    output = ''

    expect(await runCli(argv('soul', 'list'))).toBe(0)
    expect((JSON.parse(output) as { souls: Array<{ id: string, status: string }> }).souls).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'aiworker-hr', status: 'available' })]))
    output = ''

    expect(await runCli(argv('template', 'list', '--soul', 'aiworker-hr'))).toBe(0)
    const capabilityId = namespaceSoulAppCapabilityId('aiworker-hr', 'candidate-screen')
    expect((JSON.parse(output) as { templates: Array<{ id: string }> }).templates.map(template => template.id)).toContain(capabilityId)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'mounted-hr', '--name', 'Mounted HR', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { worker: { metadata: Record<string, unknown>, soulId: string } }).worker.soulId).toBe('aiworker-hr')
    output = ''

    expect(await runCli(argv('app', 'disable', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { app: { status: string } }).app.status).toBe('disabled')
    output = ''

    expect(await runCli(argv('template', 'list', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { templates: unknown[] }).templates).toEqual([])
  })

  it('scaffolds, validates, and smokes a minimal Soul App', async () => {
    const appDir = path.join(root, 'demo-soul-app')

    expect(await runCli(argv('app', 'create', 'demo-soul-app', '--dir', appDir))).toBe(0)
    const scaffold = JSON.parse(output) as { appId: string, files: string[], path: string }
    expect(scaffold).toMatchObject({ appId: 'demo-soul-app', path: appDir })
    expect(scaffold.files).toContain('soul-app.manifest.json')
    expect(scaffold.files).toContain('packs/demo-soul-app/SOUL.md')
    expect(scaffold.files).toContain('src/standalone.ts')
    expect(scaffold.files).toContain('src/host-mounted.ts')
    await expect(stat(path.join(appDir, 'soul-app.manifest.json'))).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'src/index.ts'))).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'src/standalone.ts'))).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'src/host-mounted.ts'))).resolves.toBeTruthy()
    output = ''

    expect(await runCli(argv('app', 'validate', appDir))).toBe(0)
    const validation = JSON.parse(output) as {
      validation: {
        appId: string
        assetIssues: unknown[]
        checkedAssets: string[]
        privateImportIssues: unknown[]
        status: string
      }
    }
    expect(validation.validation).toMatchObject({ appId: 'demo-soul-app', status: 'pass' })
    expect(validation.validation.assetIssues).toEqual([])
    expect(validation.validation.privateImportIssues).toEqual([])
    expect(validation.validation.checkedAssets).toContain('./schemas/brief.schema.json')
    expect(validation.validation.checkedAssets).toContain('./src/standalone.ts')
    expect(validation.validation.checkedAssets).toContain('./src/host-mounted.ts')
    expect(validation.validation.checkedAssets).toContain('./src/index.ts')
    output = ''

    expect(await runCli(argv('app', 'smoke', appDir))).toBe(0)
    const smoke = JSON.parse(output) as { smoke: { appId: string, artifactCount: number, hostedStatus: string, mounted: string, mountedService: string, mountedServiceHttpStatus: number, mountedServiceUrl: string, standalone: string, standaloneHttpStatus: number, standaloneUrl: string, status: string } }
    expect(smoke.smoke).toMatchObject({
      appId: 'demo-soul-app',
      artifactCount: 1,
      hostedStatus: 'enabled',
      mounted: 'pass',
      mountedService: 'pass',
      mountedServiceHttpStatus: 200,
      standalone: 'pass',
      standaloneHttpStatus: 200,
      status: 'pass',
    })
    expect(smoke.smoke.standaloneUrl).toStartWith('http://127.0.0.1:')
    expect(smoke.smoke.mountedServiceUrl).toStartWith('http://127.0.0.1:')
  })

  it('fails Soul App validation when an artifact schema hash does not match the file', async () => {
    const appDir = path.join(root, 'hash-check-app')

    expect(await runCli(argv('app', 'create', 'hash-check-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'schemas/brief.schema.json'), '{"type":"object","properties":{"tampered":{"type":"string"}}}\n')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        assetIssues: Array<{ code: string, path: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.assetIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_hash_mismatch', path: './schemas/brief.schema.json' }),
    ]))
  })

  it('fails Soul App validation on Host private imports', async () => {
    const appDir = path.join(root, 'private-import-app')

    expect(await runCli(argv('app', 'create', 'private-import-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'src/private.ts'), 'import { createLocalWorkerRuntime } from \'@zonease/aiworker-core\'\n')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        privateImportIssues: Array<{ file: string, importPath: string, message: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.privateImportIssues).toEqual([{
      file: 'src/private.ts',
      importPath: '@zonease/aiworker-core',
      message: 'Soul Apps must use @zonease/aiworker-soul-app-sdk instead of Host private packages or sibling Soul Apps.',
    }])
  })

  it('fails Soul App validation on sibling app imports', async () => {
    const appDir = path.join(root, 'sibling-import-app')

    expect(await runCli(argv('app', 'create', 'sibling-import-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'src/private.ts'), 'import { hrReferenceSoulApp } from \'@zonease/aiworker-hr\'\n')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        privateImportIssues: Array<{ file: string, importPath: string, message: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.privateImportIssues).toEqual([{
      file: 'src/private.ts',
      importPath: '@zonease/aiworker-hr',
      message: 'Soul Apps must use @zonease/aiworker-soul-app-sdk instead of Host private packages or sibling Soul Apps.',
    }])
  })
})
