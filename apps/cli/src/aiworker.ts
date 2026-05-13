#!/usr/bin/env bun
import type { LocalWorkerRuntime } from '@zonease/aiworker-core'
import type { SoulAppManifest } from '@zonease/aiworker-shared'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { Buffer } from 'node:buffer'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  bootstrapOfficialSoulApps,
  createLocalWorkerRuntime,
  disableSoulApp,
  enableSoulApp,
  findHostCapabilityTemplate,
  findHostSoul,
  getHostedSoulApp,
  getWorkerEnv,
  installSoulAppFromPath,
  installSoulAppManifest,
  listHostCapabilityTemplatesForSoul,
  listHostedSoulApps,
  listHostSoulCatalog,
  repairOfficialSoulAppLegacyMetadata,
  runSoulAppHealthcheck,
} from '@zonease/aiworker-core'
import {
  parseSoulAppManifestJson,
  soulAppIdSchema,
} from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createLesson,
  getArtifact,
  getReview,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listArtifacts,
  listFiles,
  listLessons,
  listReviews,
  listSessions,
  listSettings,
  listTurns,
  listWorkers,
  listWorkspaces,
  runWorkerMigrations,
  setSetting,
  updateLesson,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import cac from 'cac'
import consola from 'consola'

import packageJson from '../package.json' with { type: 'json' }

interface LocalPaths {
  home: string
  dbPath: string
  workersRoot: string
  pidFile: string
  logFile: string
}

interface RuntimeOptions {
  worker?: string
}

const cli = cac('aiworker')

function localPaths(): LocalPaths {
  const home = process.env.AIWORKER_HOME ?? path.join(homedir(), '.aiworker')
  return {
    home,
    dbPath: process.env.WORKER_DB_PATH ?? path.join(home, 'aiworker.db'),
    workersRoot: path.join(home, 'workers'),
    pidFile: path.join(home, 'aiworker-daemon.pid'),
    logFile: path.join(home, 'aiworker-daemon.log'),
  }
}

async function ensureDb(): Promise<LocalPaths> {
  const paths = localPaths()
  await mkdir(paths.home, { recursive: true })
  await mkdir(path.dirname(paths.dbPath), { recursive: true })
  initWorkerDb(paths.dbPath)
  runWorkerMigrations(getWorkerEnv().WORKER_MIGRATIONS_FOLDER)
  return paths
}

function createWorkerId(soulId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  return `${soulId}-${slug || 'worker'}-${randomUUID().slice(0, 8)}`
}

function selectedWorkerId(): string | null {
  const setting = listSettings().find(setting => setting.key === 'selected-worker')
  const value = setting?.valueJson
  return value && typeof value.workerId === 'string' ? value.workerId : null
}

function createRuntimeForWorker(paths: LocalPaths, worker: WorkerRow): LocalWorkerRuntime {
  const runtime = createLocalWorkerRuntime({
    worker: {
      id: worker.id,
      soulId: worker.soulId,
      name: worker.name,
      defaultEngineId: worker.defaultEngineId,
      metadata: worker.metadataJson,
    },
    workspacesRoot: path.join(paths.workersRoot, worker.id, 'workspaces'),
  })
  return runtime
}

async function ensureRuntime(options: RuntimeOptions = {}): Promise<LocalWorkerRuntime> {
  const paths = await ensureDb()
  const workerId = options.worker ?? selectedWorkerId()
  if (!workerId)
    throw new Error('worker is required; pass --worker or run `aiworker worker select <id>`')
  const worker = getWorker(workerId)
  if (!worker)
    throw new Error(`worker not found: ${workerId}`)
  const runtime = createRuntimeForWorker(paths, worker)
  await runtime.init()
  return runtime
}

async function ensureAllWorkers(): Promise<WorkerRow[]> {
  await ensureDb()
  return listWorkers()
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} is required`)
  return value.trim()
}

function optionalNumber(value: number[] | undefined): number | undefined {
  const item = value?.[0]
  return typeof item === 'number' && Number.isFinite(item) ? item : undefined
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

async function runInit(): Promise<void> {
  const paths = await ensureDb()
  printJson({
    home: paths.home,
    dbPath: paths.dbPath,
    workersRoot: paths.workersRoot,
    workers: listWorkers(),
  })
}

async function runDoctor(): Promise<void> {
  const paths = await ensureDb()
  printJson({
    ok: true,
    home: paths.home,
    dbPath: paths.dbPath,
    apps: listHostedSoulApps(),
    workers: listWorkers(),
    workspaces: listWorkspaces(),
    daemon: daemonStatus(),
    settings: listSettings(),
  })
}

function daemonStatus(): { logFile: string, pid: number | null, running: boolean } {
  const paths = localPaths()
  if (!existsSync(paths.pidFile))
    return { pid: null, running: false, logFile: paths.logFile }
  const pid = Number.parseInt(readFileSync(paths.pidFile, 'utf8'), 10)
  return { pid: Number.isFinite(pid) ? pid : null, running: Number.isFinite(pid) && isProcessAlive(pid), logFile: paths.logFile }
}

async function startDaemon(opts: { host?: string, port?: number } = {}): Promise<void> {
  const paths = localPaths()
  mkdirSync(paths.home, { recursive: true })
  const current = daemonStatus()
  if (current.running)
    throw new Error(`daemon already running: pid=${current.pid}`)
  writeFileSync(paths.logFile, '')
  const logFd = openSync(paths.logFile, 'a')
  const child = spawn(process.execPath, [
    path.resolve(process.argv[1] ?? 'aiworker'),
    'daemon',
    'foreground',
    ...(opts.host ? ['--host', opts.host] : []),
    ...(opts.port ? ['--port', String(opts.port)] : []),
  ], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      AIWORKER_HOME: paths.home,
      WORKER_DB_PATH: paths.dbPath,
    },
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()
  closeSync(logFd)
  if (!child.pid)
    throw new Error('daemon did not return a pid')
  writeFileSync(paths.pidFile, String(child.pid))
  printJson({ started: true, pid: child.pid, logFile: paths.logFile, url: `http://127.0.0.1:${opts.port ?? getWorkerEnv().PORT}` })
}

async function stopDaemon(): Promise<void> {
  const paths = localPaths()
  const status = daemonStatus()
  if (!status.pid || !status.running) {
    rmSync(paths.pidFile, { force: true })
    printJson({ stopped: false, running: false })
    return
  }
  process.kill(status.pid, 'SIGTERM')
  rmSync(paths.pidFile, { force: true })
  printJson({ stopped: true, pid: status.pid })
}

async function daemonForeground(opts: { host?: string, port?: number } = {}): Promise<void> {
  const { bootstrapWorkerApp } = await import('@zonease/aiworker-api/bootstrap')
  const { app, port } = await bootstrapWorkerApp()
  const env = getWorkerEnv()
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: opts.host ?? env.AIWORKER_WORKER_HOST,
    idleTimeout: 255,
    port: opts.port ?? port,
  })
  consola.success(`[aiworker-daemon] listening on http://${server.hostname}:${server.port}`)
  await new Promise<void>((resolve) => {
    const keepAlive = setInterval(() => undefined, 60_000)
    const shutdown = () => {
      clearInterval(keepAlive)
      server.stop()
      resolve()
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}

async function daemonCheck(opts: { host?: string, port?: number } = {}): Promise<void> {
  const env = getWorkerEnv()
  const url = `http://${opts.host ?? env.AIWORKER_WORKER_HOST}:${opts.port ?? env.PORT}/health`
  const res = await fetch(url)
  printJson({ ok: res.ok, status: res.status, body: await res.json().catch(() => null) })
}

async function showLogs(opts: { tail?: number } = {}): Promise<void> {
  const logFile = localPaths().logFile
  if (!existsSync(logFile))
    return
  const text = await readFile(logFile, 'utf8')
  const lines = text.split(/\r?\n/)
  process.stdout.write(`${lines.slice(-(opts.tail ?? 80)).join('\n')}\n`)
}

async function createWorkerCommand(opts: { id?: string, name?: string, soul?: string }): Promise<void> {
  const paths = await ensureDb()
  const soul = requireAvailableSoul(requireText(opts.soul, 'soul'))
  const name = requireText(opts.name, 'name')
  const id = opts.id ? requireText(opts.id, 'id') : createWorkerId(soul.id, name)
  if (getWorker(id))
    throw new Error(`worker already exists: ${id}`)
  const runtime = createRuntimeForWorker(paths, upsertWorker({
    id,
    soulId: soul.id,
    name,
    defaultEngineId: 'codex',
    metadataJson: {
      defaultTemplates: [...soul.defaultTemplates],
      description: soul.description,
      domain: soul.domain,
      soulAppId: getHostedSoulApp(soul.id)?.appId ?? null,
    },
  }))
  await runtime.init()
  printJson({ worker: runtime.snapshot().worker })
}

async function selectWorkerCommand(id: string): Promise<void> {
  await ensureDb()
  const worker = getWorker(id)
  if (!worker)
    throw new Error(`worker not found: ${id}`)
  printJson({ setting: setSetting('selected-worker', { workerId: worker.id }) })
}

async function createWorkspaceCommand(opts: { name?: string, worker?: string }): Promise<void> {
  const runtime = await ensureRuntime({ worker: opts.worker })
  printJson({ workspace: await runtime.createWorkspace({ name: requireText(opts.name, 'name') }) })
}

async function listWorkspaceCommand(opts: { worker?: string }): Promise<void> {
  if (!opts.worker) {
    await ensureDb()
    printJson({ workspaces: listWorkspaces() })
    return
  }
  const runtime = await ensureRuntime({ worker: opts.worker })
  printJson({ workspaces: listWorkspaces(runtime.workerId) })
}

async function startSessionCommand(opts: { context?: string, input?: string, skill?: string, title?: string, worker?: string, workspace?: string }): Promise<void> {
  const runtime = await ensureRuntime({ worker: opts.worker })
  const workspaceId = requireText(opts.workspace, 'workspace')
  const workspace = getWorkspace(workspaceId)
  if (!workspace || workspace.workerId !== runtime.workerId)
    throw new Error(`workspace not found for ${runtime.workerId}: ${workspaceId}`)
  const skillId = requireText(opts.skill, 'skill')
  const template = findHostCapabilityTemplate(skillId)
  if (!template || template.soulId !== runtime.snapshot().worker.soulId)
    throw new Error(`template not found for worker ${runtime.workerId}: ${skillId}`)
  const session = await runtime.createSession({
    workspaceId,
    capabilityTemplateId: template.id,
    title: requireText(opts.title, 'title'),
    context: opts.context ?? '',
    metadata: {
      inputHints: template.inputHints,
      outputKind: template.outputKind,
      reviewRubric: template.reviewRubric,
      skillName: template.name,
    },
  })
  const input = requireText(opts.input, 'input')
  printJson(await runtime.startTurn({
    sessionId: session.id,
    input,
    engineId: 'codex',
    engineCommand: 'codex',
    metadata: {
      inputHints: template.inputHints,
      outputKind: template.outputKind,
      reviewRubric: template.reviewRubric,
      skillName: template.name,
      executionMode: 'local-cli',
    },
  }))
}

async function sendTurnCommand(opts: { input?: string, session?: string, worker?: string }): Promise<void> {
  await ensureDb()
  const sessionId = requireText(opts.session, 'session')
  const session = getSession(sessionId)
  if (!session)
    throw new Error(`session not found: ${sessionId}`)
  const runtime = await ensureRuntime({ worker: opts.worker ?? session.workerId })
  printJson(await runtime.startTurn({
    sessionId,
    input: requireText(opts.input, 'input'),
    engineId: 'codex',
    engineCommand: 'codex',
    metadata: { executionMode: 'local-cli' },
  }))
}

async function listSessionCommand(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ sessions: listSessions(opts.workspace) })
}

async function showSession(id: string): Promise<void> {
  await ensureAllWorkers()
  printJson({ session: getSession(id), turns: listTurns(id) })
}

async function listWorkspaceFiles(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ files: listFiles(opts.workspace) })
}

async function showFile(filePath: string, opts: { workspace?: string, worker?: string }): Promise<void> {
  await ensureDb()
  const workspaceId = requireText(opts.workspace, 'workspace')
  const workspace = getWorkspace(workspaceId)
  if (!workspace)
    throw new Error(`workspace not found: ${workspaceId}`)
  const runtime = await ensureRuntime({ worker: opts.worker ?? workspace.workerId })
  process.stdout.write(await runtime.files(workspaceId).read(filePath))
}

async function openArtifact(id: string, opts: { worker?: string }): Promise<void> {
  await ensureDb()
  const artifact = getArtifact(id)
  if (!artifact)
    throw new Error(`artifact not found: ${id}`)
  const workspace = getWorkspace(artifact.workspaceId)
  if (!workspace)
    throw new Error(`workspace not found for artifact: ${id}`)
  const runtime = await ensureRuntime({ worker: opts.worker ?? workspace.workerId })
  const fullPath = runtime.files(workspace.id).resolve(artifact.path)
  Bun.spawn(['open', fullPath])
  printJson({ opened: fullPath })
}

async function listArtifactsCommand(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ artifacts: listArtifacts(opts.workspace) })
}

async function listReviewsCommand(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ reviews: listReviews(opts.workspace) })
}

async function proposeLesson(opts: { review?: string, statement?: string, workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  const workspaceId = requireText(opts.workspace, 'workspace')
  const lesson = createLesson({
    id: randomUUID(),
    workspaceId,
    sourceReviewId: opts.review ?? null,
    statement: requireText(opts.statement, 'statement'),
    evidenceJson: opts.review ? [{ reviewId: opts.review }] : [],
  })
  printJson({ lesson })
}

function registryContext() {
  return { hostVersion: packageJson.version }
}

async function listAppsCommand(): Promise<void> {
  await ensureDb()
  printJson({ apps: listHostedSoulApps() })
}

async function showAppCommand(id: string): Promise<void> {
  await ensureDb()
  printJson({ app: getHostedSoulApp(id) })
}

async function installAppCommand(manifestPath: string): Promise<void> {
  await ensureDb()
  printJson({ app: await installSoulAppFromPath(manifestPath, registryContext()) })
}

async function enableAppCommand(id: string): Promise<void> {
  await ensureDb()
  printJson({ app: enableSoulApp(id, registryContext()), catalog: listHostSoulCatalog() })
}

async function disableAppCommand(id: string): Promise<void> {
  await ensureDb()
  printJson({ app: disableSoulApp(id, registryContext()), catalog: listHostSoulCatalog() })
}

async function doctorAppCommand(id: string): Promise<void> {
  await ensureDb()
  printJson({ app: runSoulAppHealthcheck(id, registryContext()) })
}

async function permissionsAppCommand(id: string): Promise<void> {
  await ensureDb()
  const app = getHostedSoulApp(id)
  printJson({ appId: id, permissions: app?.manifest.permissions ?? [] })
}

async function bootstrapAppCommand(scope: string): Promise<void> {
  await ensureDb()
  if (scope !== 'official')
    throw new Error(`unsupported app bootstrap scope: ${scope}`)
  const results = await bootstrapOfficialSoulApps(registryContext())
  const legacyMetadataRepair = repairOfficialSoulAppLegacyMetadata()
  printJson({
    bootstrap: {
      legacyMetadataRepair,
      results,
      scope,
      status: results.some(result => result.action === 'error') ? 'fail' : 'pass',
    },
    catalog: listHostSoulCatalog(),
  })
  if (results.some(result => result.action === 'error'))
    process.exitCode = 1
}

async function createAppScaffoldCommand(id: string, opts: { dir?: string } = {}): Promise<void> {
  const appId = soulAppIdSchema.parse(id)
  const targetDir = path.resolve(opts.dir ?? appId)
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0)
    throw new Error(`target directory is not empty: ${targetDir}`)

  const manifest = createScaffoldManifest(appId)
  const briefSchemaText = scaffoldBriefSchemaText(appId)
  writeScaffoldFile(path.join(targetDir, 'soul-app.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeScaffoldFile(path.join(targetDir, 'package.json'), `${JSON.stringify(createScaffoldPackageJson(appId), null, 2)}\n`)
  writeScaffoldFile(path.join(targetDir, 'tsconfig.json'), `${JSON.stringify(createScaffoldTsconfig(), null, 2)}\n`)
  writeScaffoldFile(path.join(targetDir, 'README.md'), scaffoldReadme(appId))
  writeScaffoldFile(path.join(targetDir, 'src/index.ts'), scaffoldIndexTs())
  writeScaffoldFile(path.join(targetDir, 'src/standalone.ts'), scaffoldStandaloneTs())
  writeScaffoldFile(path.join(targetDir, 'src/host-mounted.ts'), scaffoldHostMountedTs())
  writeScaffoldFile(path.join(targetDir, 'schemas/brief.schema.json'), briefSchemaText)
  writeScaffoldFile(path.join(targetDir, 'capabilities/brief/prompt.md'), scaffoldPrompt(appId))
  writeScaffoldFile(path.join(targetDir, 'review/brief.md'), scaffoldReview(appId))
  writeScaffoldFile(path.join(targetDir, 'packs', appId, 'SOUL.md'), scaffoldSoulPack(appId))

  printJson({
    appId,
    files: [
      'soul-app.manifest.json',
      'package.json',
      'tsconfig.json',
      'README.md',
      'src/index.ts',
      'src/standalone.ts',
      'src/host-mounted.ts',
      'schemas/brief.schema.json',
      'capabilities/brief/prompt.md',
      'review/brief.md',
      `packs/${appId}/SOUL.md`,
    ],
    next: [
      `cd ${targetDir}`,
      'aiworker app validate .',
      'aiworker app smoke .',
    ],
    path: targetDir,
  })
}

async function validateAppCommand(inputPath: string): Promise<void> {
  const result = validateAppAtPath(inputPath)
  printJson({ validation: validationReport(result) })
  if (result.status !== 'pass')
    process.exitCode = 1
}

async function smokeAppCommand(inputPath: string): Promise<void> {
  const validation = validateAppAtPath(inputPath)
  if (validation.status !== 'pass') {
    printJson({ smoke: { status: 'fail', validation: validationReport(validation) } })
    process.exitCode = 1
    return
  }
  const manifest = validation.manifest
  if (!manifest || !validation.manifestPath)
    throw new Error('Soul App validation passed without a parsed manifest.')
  const smokeRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-app-smoke-'))
  let mountedService: MountedServiceSmoke | null = null
  try {
    mountedService = await runMountedServiceSmoke(manifest, validation.rootDir)
    const smokeManifest: SoulAppManifest = mountedService.url
      ? {
          ...manifest,
          api: {
            ...manifest.api,
            localService: {
              baseUrl: mountedService.url,
              healthPath: manifest.api.localService?.healthPath ?? '/health',
            },
          },
        }
      : manifest
    closeWorkerDb()
    initWorkerDb(path.join(smokeRoot, 'worker.db'))
    runWorkerMigrations()
    const connectorIds = [
      ...smokeManifest.connectors.required.map(connector => connector.id),
      ...smokeManifest.connectors.optional.map(connector => connector.id),
    ]
    installSoulAppManifest({
      manifest: smokeManifest,
      sourceKind: 'manifest-path',
      sourceRef: validation.manifestPath,
    }, {
      availableConnectorIds: connectorIds,
      enabledConnectorIds: smokeManifest.connectors.required.map(connector => connector.id),
      hostVersion: packageJson.version,
    })
    const hostedApp = enableSoulApp(smokeManifest.id, {
      availableConnectorIds: connectorIds,
      enabledConnectorIds: smokeManifest.connectors.required.map(connector => connector.id),
      hostVersion: packageJson.version,
    })
    const template = listHostSoulCatalog().templates.find(item => item.soulId === manifest.id)
    if (!template)
      throw new Error(`No mounted capability template available for ${manifest.id}`)
    const worker = upsertWorker({
      defaultEngineId: 'smoke',
      id: `${manifest.id}-smoke-worker`,
      metadataJson: {
        description: manifest.description,
        domain: manifest.soul.domain,
        soulAppId: manifest.id,
      },
      name: `${manifest.name} Smoke`,
      soulId: manifest.id,
    })
    const runtime = createLocalWorkerRuntime({
      executor: {
        async invoke(input) {
          return {
            artifacts: [{
              content: `# ${manifest.name} smoke artifact\n\n${input.prompt}`,
              kind: template.outputKind,
              path: `artifacts/${input.sessionId}/smoke.md`,
              title: `${manifest.name} Smoke Artifact`,
            }],
            review: {
              findings: [{ message: 'Generated app smoke review created by Host runtime.' }],
              risks: [],
              verdict: 'needs_review',
            },
            summary: 'Generated Soul App smoke completed.',
          }
        },
      },
      worker: {
        defaultEngineId: worker.defaultEngineId,
        id: worker.id,
        metadata: worker.metadataJson,
        name: worker.name,
        soulId: worker.soulId,
      },
      workspacesRoot: path.join(smokeRoot, 'workers', worker.id, 'workspaces'),
    })
    await runtime.init()
    const workspace = await runtime.createWorkspace({ name: `${manifest.name} Smoke Workspace`, type: manifest.workspaceTypes[0]!.id })
    const session = await runtime.createSession({
      capabilityTemplateId: template.id,
      context: 'Validate generated Soul App through Host-mounted smoke.',
      metadata: {
        capabilityTemplateId: template.id,
        inputHints: template.inputHints,
        outputKind: template.outputKind,
        reviewRubric: template.reviewRubric,
        soulAppId: manifest.id,
        soulName: manifest.soul.name,
      },
      title: `${manifest.name} Smoke Session`,
      workspaceId: workspace.id,
    })
    const turn = await runtime.startTurn({
      engineId: 'smoke',
      input: 'Create a reviewable smoke artifact.',
      metadata: { soulAppId: manifest.id },
      sessionId: session.id,
    })
    const standalone = await runStandaloneBrowserSmoke(manifest)
    printJson({
      smoke: {
        appId: manifest.id,
        artifactCount: turn.artifacts.length,
        hostedStatus: hostedApp.status,
        mounted: 'pass',
        mountedService: mountedService.status,
        mountedServiceHttpStatus: mountedService.httpStatus,
        mountedServiceUrl: mountedService.url,
        reviewStatus: turn.review?.verdict ?? null,
        standalone: standalone.status,
        standaloneHttpStatus: standalone.httpStatus,
        standaloneUrl: standalone.url,
        status: 'pass',
        workspaceId: workspace.id,
      },
    })
  }
  finally {
    mountedService?.stop()
    closeWorkerDb()
    rmSync(smokeRoot, { recursive: true, force: true })
  }
}

interface MountedServiceSmoke {
  httpStatus: number | null
  status: 'pass' | 'skip'
  stop: () => void
  url: string | null
}

interface AppValidationIssue {
  code: string
  message: string
  path?: string
  severity: 'error' | 'warning'
}

interface PrivateImportIssue {
  file: string
  importPath: string
  message: string
}

interface AppValidationResult {
  appId: string | null
  assetIssues: AppValidationIssue[]
  checkedAssets: string[]
  manifest?: SoulAppManifest
  manifestIssues: AppValidationIssue[]
  manifestPath: string | null
  privateImportIssues: PrivateImportIssue[]
  rootDir: string | null
  status: 'fail' | 'pass'
  version: string | null
}

const HOST_PRIVATE_IMPORT_PREFIXES = [
  '@zonease/aiworker-api',
  '@zonease/aiworker-cli',
  '@zonease/aiworker-core',
  '@zonease/aiworker-fs-layout',
  '@zonease/aiworker-shared',
  '@zonease/aiworker-storage-sqlite',
  '@zonease/aiworker-web',
]

const SOUL_APP_PACKAGE_IMPORT_PREFIXES = [
  '@zonease/aiworker-hr',
  '@zonease/aiworker-qa',
]

function createScaffoldManifest(appId: string): SoulAppManifest {
  const routePrefix = `/api/local/apps/${appId}`
  const raw = {
    api: {
      entry: './src/host-mounted.ts',
      localService: {
        command: ['bun', 'src/host-mounted.ts'],
        healthPath: '/health',
      },
      routePrefix,
    },
    artifactTypes: [
      {
        description: 'Reviewable brief artifact for the starter Soul App.',
        id: 'brief',
        name: 'Brief',
        previewRef: './src/index.ts',
        reviewPolicyRef: './review/brief.md',
        schemaRef: './schemas/brief.schema.json',
        schemaSha256: sha256Text(scaffoldBriefSchemaText(appId)),
        version: '0.1.0',
      },
    ],
    capabilities: [
      {
        artifactTypes: ['brief'],
        description: 'Create a source-backed starter brief.',
        id: 'brief',
        name: 'Brief',
        outputKind: 'brief',
        packRefs: [appId],
        promptRef: './capabilities/brief/prompt.md',
        reviewRubricRef: './review/brief.md',
        version: '0.1.0',
        workspaceTypes: ['case'],
      },
    ],
    compatibility: {
      host: { minVersion: packageJson.version },
      sdk: { minVersion: '0.1.0' },
    },
    connectors: {
      optional: [],
      required: [],
    },
    description: `${appId} starter Soul App for one vertical workspace, capability, artifact, and review policy.`,
    exports: {
      artifact: './src/index.ts',
      connector: './src/index.ts',
      lifecycle: './src/index.ts',
      review: './src/index.ts',
      runtime: './src/index.ts',
      ui: './src/index.ts',
    },
    healthcheck: {
      kind: 'protocol-handler',
      ref: 'healthcheck',
      timeoutMs: 5000,
    },
    id: appId,
    memory: {
      admissionPolicy: 'manual-review',
      namespace: appId,
    },
    modes: {
      hostMounted: { entry: './src/host-mounted.ts', supported: true },
      standalone: { entry: './src/standalone.ts', supported: true },
    },
    name: titleCase(appId),
    pack: {
      refs: [
        { id: appId, ref: `./packs/${appId}/SOUL.md`, source: 'embedded', version: '0.1.0' },
      ],
    },
    permissions: [
      {
        action: 'read',
        kind: 'storage',
        reason: 'Read app-scoped metadata for the starter workspace.',
        target: appId,
      },
      {
        action: 'write',
        kind: 'storage',
        reason: 'Write app-scoped metadata for the starter workspace.',
        target: appId,
      },
      {
        action: 'write',
        kind: 'artifact',
        reason: 'Create reviewable starter artifacts.',
        target: 'brief',
      },
      {
        action: 'create',
        kind: 'review',
        reason: 'Create starter review rubrics and findings.',
        target: 'brief-review',
      },
      {
        action: 'propose',
        kind: 'memory',
        reason: 'Propose reviewed lessons into the app namespace.',
        target: appId,
      },
      {
        action: 'mount',
        kind: 'ui',
        reason: 'Mount starter workbench contributions.',
        target: `${appId}-workbench`,
      },
      {
        action: 'serve',
        kind: 'api',
        reason: 'Serve app-scoped local API routes.',
        target: routePrefix,
      },
    ],
    protocol: 'soul-app/v1',
    soul: {
      description: `${titleCase(appId)} vertical Soul for app-scoped workspaces and reviewable artifacts.`,
      domain: appId,
      id: appId,
      name: titleCase(appId),
      version: '0.1.0',
    },
    storage: {
      migrations: [],
      namespace: appId,
    },
    ui: {
      artifactPreviews: [
        {
          entry: './src/index.ts',
          id: 'brief-preview',
          label: 'Brief preview',
          slot: 'artifact-preview',
          target: 'brief',
        },
      ],
      panels: [
        {
          entry: './src/index.ts',
          id: 'brief-panel',
          label: 'Brief panel',
          slot: 'panel',
          surface: {
            entry: '/surfaces/panels/brief-panel',
            renderer: 'host-descriptor',
            requiredPermissions: [`storage:read:${appId}`],
            scope: 'workspace',
          },
        },
      ],
      reviewPanels: [
        {
          entry: './src/index.ts',
          id: 'brief-review-panel',
          label: 'Brief review panel',
          slot: 'review-panel',
        },
      ],
      routes: [
        {
          entry: './src/standalone.ts',
          id: 'brief-home',
          label: titleCase(appId),
          path: `/${appId}`,
          surface: {
            entry: '/surfaces/routes/brief-home',
            renderer: 'host-descriptor',
            requiredPermissions: [`ui:mount:${appId}-workbench`],
            scope: 'app',
          },
        },
      ],
      workspaceWidgets: [
        {
          entry: './src/index.ts',
          id: 'brief-widget',
          label: 'Brief widget',
          slot: 'workspace-widget',
          surface: {
            entry: '/frames/widgets/brief-widget',
            renderer: 'sandboxed-frame',
            scope: 'workspace',
          },
          target: 'case',
        },
      ],
    },
    version: '0.1.0',
    workspaceTypes: [
      {
        artifactTypes: ['brief'],
        defaultCapabilityIds: ['brief'],
        description: 'Starter workspace for one app-scoped case.',
        id: 'case',
        name: 'Case',
      },
    ],
  }
  const parsed = parseSoulAppManifestJson(JSON.stringify(raw), registryContext())
  if (parsed.status !== 'ok')
    throw new Error(parsed.error)
  return parsed.manifest
}

async function runStandaloneBrowserSmoke(manifest: SoulAppManifest): Promise<{ httpStatus: number | null, status: 'pass' | 'skip', url: string | null }> {
  if (!manifest.modes.standalone.supported)
    return { httpStatus: null, status: 'skip', url: null }

  const server = Bun.serve({
    fetch() {
      return new Response([
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        `<title>${escapeHtml(manifest.name)}</title>`,
        '</head>',
        `<body data-soul-app-id="${escapeHtml(manifest.id)}">`,
        `<main><h1>${escapeHtml(manifest.name)}</h1><p>${escapeHtml(manifest.description)}</p></main>`,
        '</body>',
        '</html>',
      ].join(''), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    },
    hostname: '127.0.0.1',
    port: 0,
  })
  const url = `http://127.0.0.1:${server.port}/`
  try {
    const res = await fetch(url)
    const body = await res.text()
    if (!res.ok || !body.includes(`data-soul-app-id="${manifest.id}"`))
      throw new Error(`Standalone browser smoke failed for ${manifest.id}`)
    return { httpStatus: res.status, status: 'pass', url }
  }
  finally {
    server.stop()
  }
}

async function runMountedServiceSmoke(manifest: SoulAppManifest, rootDir: string | null): Promise<MountedServiceSmoke> {
  const service = manifest.api.localService
  if (!manifest.modes.hostMounted.supported || !service?.command?.length || !rootDir)
    return { httpStatus: null, status: 'skip', stop: () => {}, url: null }

  const child = spawn(service.command[0]!, service.command.slice(1), {
    cwd: path.resolve(rootDir, service.cwd ?? '.'),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessByStdio<null, Readable, Readable>
  let stopped = false
  const stop = () => {
    if (!stopped) {
      stopped = true
      child.kill()
    }
  }
  const url = await waitForMountedServiceUrl(child, stop)
  const healthUrl = new URL(service.healthPath, url)
  const res = await fetch(healthUrl)
  if (!res.ok) {
    stop()
    throw new Error(`Mounted Soul App service healthcheck failed ${res.status}: ${healthUrl}`)
  }
  return { httpStatus: res.status, status: 'pass', stop, url }
}

async function waitForMountedServiceUrl(child: ChildProcessByStdio<null, Readable, Readable>, stop: () => void): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      stop()
      reject(new Error('Timed out waiting for mounted Soul App service URL.'))
    }, 5000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      const line = output.split(/\r?\n/).find(item => item.trim().startsWith('{'))
      if (!line)
        return
      try {
        const parsed = JSON.parse(line) as { url?: unknown }
        if (typeof parsed.url === 'string' && parsed.url.length > 0) {
          clearTimeout(timer)
          resolve(parsed.url)
        }
      }
      catch {
        // Keep waiting for the service status line.
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Mounted Soul App service exited before readiness: ${code ?? 'signal'}. ${output.trim()}`))
    })
  })
}

function createScaffoldPackageJson(appId: string) {
  return {
    name: `@aiworker-soul-app/${appId}`,
    private: true,
    scripts: {
      build: 'bun build src/index.ts src/standalone.ts src/host-mounted.ts --outdir dist --target bun',
      dev: 'bun src/standalone.ts --serve',
      serve: 'bun src/host-mounted.ts',
      smoke: 'aiworker app smoke .',
      test: 'bun test',
      typecheck: 'tsc --noEmit',
      validate: 'aiworker app validate .',
    },
    type: 'module',
    version: '0.1.0',
    dependencies: {
      '@zonease/aiworker-soul-app-sdk': 'workspace:*',
    },
    devDependencies: {
      '@types/bun': '^1.2.13',
      'typescript': '^5.8.3',
    },
  }
}

function createScaffoldTsconfig() {
  return {
    compilerOptions: {
      allowImportingTsExtensions: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      resolveJsonModule: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['src/**/*.ts'],
  }
}

function createBriefSchema(appId: string) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false,
    properties: {
      appId: { const: appId },
      evidence: {
        items: { type: 'string' },
        minItems: 1,
        type: 'array',
      },
      summary: { minLength: 1, type: 'string' },
    },
    required: ['appId', 'summary', 'evidence'],
    title: `${titleCase(appId)} Brief`,
    type: 'object',
  }
}

function scaffoldBriefSchemaText(appId: string): string {
  return `${JSON.stringify(createBriefSchema(appId), null, 2)}\n`
}

function scaffoldReadme(appId: string): string {
  return [
    `# ${titleCase(appId)} Soul App`,
    '',
    'This starter app stays inside the public Soul App SDK boundary.',
    '',
    '## Local Checks',
    '',
    '```bash',
    'aiworker app validate .',
    'aiworker app smoke .',
    '```',
    '',
    '## Contribution Checklist',
    '',
    '- Keep app code on `@zonease/aiworker-soul-app-sdk`; do not import Host private packages.',
    '- Keep storage permissions scoped to this app namespace.',
    '- Add one artifact schema and one review policy for each new artifact type.',
    '- Run PMA, focused tests, and code-review-graph before submitting Host changes.',
    '',
  ].join('\n')
}

function scaffoldIndexTs(): string {
  return `import type {
  SoulAppArtifactValidationResult,
  SoulAppCapability,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
} from '@zonease/aiworker-soul-app-sdk'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }
import { createSoulAppManifest, defineSoulApp, parseNamespacedSoulAppCapabilityId } from '@zonease/aiworker-soul-app-sdk'

const manifest = createSoulAppManifest(manifestJson)

export const soulApp = defineSoulApp({
  artifact: {
    async artifactSchemas() {
      return manifest.artifactTypes
    },
    async validateArtifact(_context, artifact) {
      return validateArtifactType(artifact.type)
    },
  },
  connector: {
    async declareConnectorNeeds() {
      return [
        ...manifest.connectors.required,
        ...manifest.connectors.optional,
      ]
    },
  },
  lifecycle: lifecycleHandlers('Starter Soul App ready.'),
  manifest,
  review: {
    async createReviewRubric(_context, artifactType) {
      return {
        checks: [
          \`Artifact type \${artifactType} cites source evidence.\`,
          'Missing facts and risks are explicit.',
          'Next action is concrete for a human reviewer.',
        ],
      }
    },
  },
  runtime: {
    async prepareSessionContext(context, input) {
      const capability = resolveCapability(input.capabilityId)
      return sessionContext(context, capability, input.workspaceType)
    },
    async resolveCapability(_context, input) {
      return resolveCapability(input.capabilityId ?? input.intent)
    },
  },
  ui: {
    async artifactTypes() {
      return manifest.artifactTypes
    },
    async capabilities() {
      return manifest.capabilities
    },
    async ui() {
      return manifest.ui
    },
    async workspaceTypes() {
      return manifest.workspaceTypes
    },
  },
})

export default soulApp

function resolveCapability(input?: string): SoulAppCapability {
  const id = input ? parseNamespacedSoulAppCapabilityId(input)?.capabilityId ?? input : manifest.capabilities[0]!.id
  const capability = manifest.capabilities.find(item => item.id === id)
  if (!capability)
    throw new Error(\`Capability not found: \${input}\`)
  return capability
}

function sessionContext(context: SoulAppScopedContext, capability: SoulAppCapability, workspaceType: string): SoulAppSessionContext {
  return {
    artifactTypes: capability.artifactTypes,
    capabilityId: capability.id,
    contextMarkdown: [
      '# Soul App Context',
      \`App: \${context.appId}\`,
      \`Workspace type: \${workspaceType}\`,
      'Use source-backed evidence language and produce a reviewable business artifact.',
    ].join('\\n'),
    promptFragments: [
      \`Use capability \${capability.name}.\`,
      'Separate evidence, missing facts, risks, and next actions.',
    ],
    reviewRubric: [
      'Evidence is cited.',
      'Risk and missing evidence are separated.',
      'Next action is concrete.',
    ],
  }
}

function validateArtifactType(type: string): SoulAppArtifactValidationResult {
  const known = manifest.artifactTypes.some(item => item.id === type)
  return {
    issues: known ? [] : [{ message: \`Unknown artifact type: \${type}\`, severity: 'error' }],
    ok: known,
  }
}

function lifecycleHandlers(message: string) {
  const ok = async (): Promise<SoulAppProtocolResult> => ({ message, ok: true })
  return {
    disable: ok,
    enable: ok,
    healthcheck: ok,
    install: ok,
    upgrade: ok,
  }
}
`
}

function scaffoldStandaloneTs(): string {
  return `import process from 'node:process'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }

const manifest = manifestJson

export function renderStandaloneHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>' + manifest.name + '</title></head>',
    \`<body data-soul-app-id="\${manifest.id}">\`,
    '<main>',
    \`<h1>\${manifest.name}</h1>\`,
    \`<p>\${manifest.description}</p>\`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

export function serveStandalone(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/health')
        return Response.json({ appId: manifest.id, mode: 'standalone', status: 'ok' })
      return new Response(renderStandaloneHtml(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveStandalone()
  process.stdout.write(\`\${JSON.stringify({ appId: manifest.id, mode: 'standalone', url: \`http://\${server.hostname}:\${server.port}\` })}\\n\`)
}
`
}

function scaffoldHostMountedTs(): string {
  return `import process from 'node:process'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }

const manifest = manifestJson

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/health')
        return Response.json({ appId: manifest.id, mode: 'host-mounted', status: 'ok' })

      const tokenError = verifyMountToken(request)
      if (tokenError)
        return tokenError

      if (url.pathname === '/domain') {
        return Response.json({
          appId: manifest.id,
          capabilities: manifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: manifest.soul.id,
          workspaceTypes: manifest.workspaceTypes.map(type => type.id),
        })
      }

      if (url.pathname === '/surfaces/routes/brief-home' || url.pathname === '/surfaces/panels/brief-panel') {
        return Response.json({
          actions: [{ id: 'create-review', label: 'Create review', method: 'POST', target: '/broker/reviews' }],
          appId: manifest.id,
          fields: [
            { label: 'Domain', value: manifest.soul.domain },
            { label: 'Workspace types', value: manifest.workspaceTypes.map(type => type.name).join(', ') },
          ],
          renderer: 'host-descriptor',
          status: 'ready',
          title: manifest.name,
          type: 'aiworker.surface.descriptor.v1',
        })
      }

      if (url.pathname === '/frames/widgets/brief-widget') {
        return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Brief Widget</title></head><body><main><h1>Brief Widget</h1></main></body></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      if (url.pathname === '/broker/permissions') {
        const hostUrl = request.headers.get('x-aiworker-host-url') ?? Bun.env.AIWORKER_HOST_URL
        if (!hostUrl)
          return Response.json({ appId: manifest.id, broker: 'not-configured', permissions: [] })
        return Response.json({ appId: manifest.id, broker: 'host-owned', permissions: manifest.permissions })
      }

      if (url.pathname === '/protocol/capabilities') {
        return Response.json({ capabilities: manifest.capabilities })
      }

      return Response.json({ error: { code: 'NOT_FOUND', message: \`Unknown app route: \${url.pathname}\` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(\`\${JSON.stringify({ appId: manifest.id, mode: 'host-mounted', url: \`http://\${server.hostname}:\${server.port}\` })}\\n\`)
}

function verifyMountToken(request: Request): Response | null {
  const expected = Bun.env.AIWORKER_MOUNT_TOKEN
  if (!expected)
    return null
  const actual = request.headers.get('x-aiworker-mount-token')
  return actual === expected
    ? null
    : Response.json({ error: { code: 'INVALID_MOUNT_TOKEN', message: 'Host mount token is required.' } }, { status: 401 })
}
`
}

function scaffoldPrompt(appId: string): string {
  return [
    `# ${titleCase(appId)} Brief Prompt`,
    '',
    'Create a concise, source-backed business brief.',
    '',
    '- Cite evidence references provided by the Host or connector broker.',
    '- Mark missing facts explicitly.',
    '- Separate summary, risks, and next actions.',
    '',
  ].join('\n')
}

function scaffoldReview(appId: string): string {
  return [
    `# ${titleCase(appId)} Brief Review`,
    '',
    '- Evidence is cited and scoped to the workspace.',
    '- Missing facts are explicit.',
    '- Risks and next actions are separated.',
    '- Memory candidates require human review before promotion.',
    '',
  ].join('\n')
}

function scaffoldSoulPack(appId: string): string {
  return [
    `# ${titleCase(appId)} Soul Pack`,
    '',
    'This pack describes the starter domain stance for the generated Soul App.',
    '',
    '- Keep work inside the app workspace.',
    '- Produce reviewable artifacts, not generic chat output.',
    '- Use brokered connectors and scoped storage only.',
    '',
  ].join('\n')
}

function writeScaffoldFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, { flag: 'wx' })
}

function validateAppAtPath(inputPath: string): AppValidationResult {
  const resolved = resolveAppManifestPath(inputPath)
  if (!resolved) {
    return {
      appId: null,
      assetIssues: [],
      checkedAssets: [],
      manifestIssues: [{
        code: 'missing_manifest',
        message: 'Soul App manifest not found. Pass a manifest path or a directory containing soul-app.manifest.json.',
        severity: 'error',
      }],
      manifestPath: null,
      privateImportIssues: [],
      rootDir: null,
      status: 'fail',
      version: null,
    }
  }

  const parsed = parseSoulAppManifestJson(readFileSync(resolved.manifestPath, 'utf8'), registryContext())
  const manifestIssues = parsed.status === 'ok' ? [] : parsed.issues
  const manifest = parsed.status === 'ok' ? parsed.manifest : undefined
  const assetResult = manifest ? validateManifestAssetRefs(resolved.rootDir, manifest) : { checkedAssets: [], issues: [] }
  const privateImportIssues = scanPrivateImports(resolved.rootDir)
  const status = manifest
    && manifestIssues.every(issue => issue.severity !== 'error')
    && assetResult.issues.every(issue => issue.severity !== 'error')
    && privateImportIssues.length === 0
    ? 'pass'
    : 'fail'

  return {
    appId: manifest?.id ?? null,
    assetIssues: assetResult.issues,
    checkedAssets: assetResult.checkedAssets,
    manifest,
    manifestIssues,
    manifestPath: resolved.manifestPath,
    privateImportIssues,
    rootDir: resolved.rootDir,
    status,
    version: manifest?.version ?? null,
  }
}

function validationReport(result: AppValidationResult) {
  return {
    appId: result.appId,
    assetIssues: result.assetIssues,
    checkedAssets: result.checkedAssets,
    manifestIssues: result.manifestIssues,
    manifestPath: result.manifestPath,
    privateImportIssues: result.privateImportIssues,
    rootDir: result.rootDir,
    status: result.status,
    version: result.version,
  }
}

function resolveAppManifestPath(inputPath: string): { manifestPath: string, rootDir: string } | null {
  const resolved = path.resolve(inputPath)
  if (!existsSync(resolved))
    return null
  const stats = statSync(resolved)
  const manifestPath = stats.isDirectory() ? path.join(resolved, 'soul-app.manifest.json') : resolved
  if (!existsSync(manifestPath))
    return null
  return {
    manifestPath,
    rootDir: stats.isDirectory() ? resolved : path.dirname(manifestPath),
  }
}

function validateManifestAssetRefs(rootDir: string, manifest: SoulAppManifest): { checkedAssets: string[], issues: AppValidationIssue[] } {
  const refs = manifestAssetRefs(manifest)
  const checkedAssets: string[] = []
  const issues: AppValidationIssue[] = []
  for (const ref of refs) {
    const assetPath = path.resolve(rootDir, ref.path)
    checkedAssets.push(ref.path)
    if (!existsSync(assetPath)) {
      issues.push({
        code: 'missing_asset',
        message: `Missing ${ref.kind} asset: ${ref.path}`,
        path: ref.path,
        severity: 'error',
      })
      continue
    }
    if (ref.kind === 'artifact-schema') {
      const content = readFileSync(assetPath, 'utf8')
      try {
        JSON.parse(content)
      }
      catch (error) {
        issues.push({
          code: 'invalid_artifact_schema',
          message: `Artifact schema is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          path: ref.path,
          severity: 'error',
        })
      }
    }
    if (ref.sha256) {
      const actual = sha256Text(readFileSync(assetPath, 'utf8'))
      if (actual !== ref.sha256) {
        issues.push({
          code: 'asset_hash_mismatch',
          message: `${ref.kind} SHA-256 mismatch for ${ref.path}: expected ${ref.sha256}, got ${actual}`,
          path: ref.path,
          severity: 'error',
        })
      }
    }
  }
  return { checkedAssets: [...new Set(checkedAssets)].sort(), issues }
}

function sha256Text(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function manifestAssetRefs(manifest: SoulAppManifest): Array<{ kind: string, path: string, sha256?: string }> {
  const refs: Array<{ kind: string, path: string, sha256?: string }> = []
  for (const type of manifest.artifactTypes) {
    refs.push({ kind: 'artifact-schema', path: type.schemaRef, sha256: type.schemaSha256 })
    if (type.previewRef)
      refs.push({ kind: 'artifact-preview', path: type.previewRef })
    if (type.reviewPolicyRef)
      refs.push({ kind: 'review-policy', path: type.reviewPolicyRef })
  }
  for (const capability of manifest.capabilities) {
    refs.push({ kind: 'capability-prompt', path: capability.promptRef })
    if (capability.reviewRubricRef)
      refs.push({ kind: 'capability-review', path: capability.reviewRubricRef })
  }
  for (const ref of manifest.pack.refs) {
    if (ref.source !== 'package')
      refs.push({ kind: 'soul-pack', path: ref.ref })
  }
  for (const migration of manifest.storage.migrations)
    refs.push({ kind: 'storage-migration', path: migration.path, sha256: migration.sha256 })
  for (const entry of [
    ...Object.values(manifest.exports),
    manifest.api.entry,
    manifest.modes.hostMounted.entry,
    manifest.modes.standalone.entry,
    ...manifest.ui.routes.map(route => route.entry),
    ...manifest.ui.panels.map(slot => slot.entry),
    ...manifest.ui.artifactPreviews.map(slot => slot.entry),
    ...manifest.ui.reviewPanels.map(slot => slot.entry),
    ...(manifest.ui.workspaceWidgets ?? []).map(slot => slot.entry),
  ]) {
    if (entry)
      refs.push({ kind: 'entry', path: entry })
  }
  return refs.filter((ref, index, items) => items.findIndex(item => item.kind === ref.kind && item.path === ref.path) === index)
}

function scanPrivateImports(rootDir: string): PrivateImportIssue[] {
  const srcDir = path.join(rootDir, 'src')
  if (!existsSync(srcDir))
    return []
  const issues: PrivateImportIssue[] = []
  for (const file of listSourceFiles(srcDir)) {
    const content = readFileSync(file, 'utf8')
    for (const importPath of importSpecifiers(content)) {
      if (!isForbiddenSoulAppImport(rootDir, importPath))
        continue
      issues.push({
        file: path.relative(rootDir, file),
        importPath,
        message: 'Soul Apps must use @zonease/aiworker-soul-app-sdk instead of Host private packages or sibling Soul Apps.',
      })
    }
  }
  return issues
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === 'dist')
      continue
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (/\.[cm]?[jt]sx?$/.test(item.name))
      files.push(fullPath)
  }
  return files
}

function importSpecifiers(content: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const spec = match[1]
      if (spec)
        specs.push(spec)
    }
  }
  return [...new Set(specs)]
}

function isForbiddenSoulAppImport(rootDir: string, importPath: string): boolean {
  if (HOST_PRIVATE_IMPORT_PREFIXES.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`)))
    return true
  if (isSiblingSoulAppImport(rootDir, importPath))
    return true
  return [
    'apps/api',
    'apps/cli',
    'apps/web',
    'packages/core',
    'packages/fs-layout',
    'packages/shared',
    'packages/storage-sqlite',
  ].some(part => importPath.includes(part))
}

function isSiblingSoulAppImport(rootDir: string, importPath: string): boolean {
  const appDirName = path.basename(rootDir)
  const ownPackageName = `@zonease/${appDirName}`
  if (SOUL_APP_PACKAGE_IMPORT_PREFIXES.some(prefix =>
    prefix !== ownPackageName && (importPath === prefix || importPath.startsWith(`${prefix}/`)),
  )) {
    return true
  }
  if (!importPath.includes('apps/aiworker-'))
    return false
  const normalized = importPath.replaceAll('\\\\', '/')
  return !normalized.includes(`apps/${appDirName}/`)
}

function titleCase(id: string): string {
  return id.split('-').map(part => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : '').join(' ')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  })[char] ?? char)
}

function registerCommands(): void {
  cli.command('init', 'initialize host-local AIWorker home and Soul workers').action(runInit)
  cli.command('dev', 'run local daemon and hosted Worker Web in foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('doctor', 'inspect host-local daemon readiness').action(runDoctor)

  cli.command('daemon start', 'start local daemon in background').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => startDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon foreground', 'run local daemon in foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon status', 'show local daemon status').action(() => printJson(daemonStatus()))
  cli.command('daemon stop', 'stop local daemon').action(stopDaemon)
  cli.command('daemon logs', 'show local daemon logs').option('--tail <n>', 'line count', { type: [Number] }).action((opts: { tail?: number[] }) => showLogs({ tail: optionalNumber(opts.tail) }))
  cli.command('daemon check', 'check local daemon health').option('--host <host>', 'host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonCheck({ host: opts.host, port: optionalNumber(opts.port) }))

  cli.command('app list', 'list installed Host Soul Apps').action(listAppsCommand)
  cli.command('app show <id>', 'show one installed Host Soul App').action(showAppCommand)
  cli.command('app install <manifest>', 'install a local Soul App manifest').action(installAppCommand)
  cli.command('app enable <id>', 'enable an installed Soul App').action(enableAppCommand)
  cli.command('app disable <id>', 'disable an installed Soul App').action(disableAppCommand)
  cli.command('app doctor <id>', 'run static Soul App healthcheck').action(doctorAppCommand)
  cli.command('app permissions <id>', 'show declared Soul App permissions').action(permissionsAppCommand)
  cli.command('app bootstrap <scope>', 'install and enable first-party Soul Apps by shortcut scope').action(bootstrapAppCommand)
  cli.command('app create <id>', 'scaffold a minimal Soul App').option('--dir <path>', 'target directory').action(createAppScaffoldCommand)
  cli.command('app validate <path>', 'validate a Soul App manifest and app boundary').action(validateAppCommand)
  cli.command('app smoke <path>', 'run standalone and Host-mounted Soul App smoke checks').action(smokeAppCommand)

  cli.command('soul list', 'list installed app-projected vertical Souls').action(async () => {
    await ensureDb()
    printJson({ souls: listHostSoulCatalog().souls })
  })
  cli.command('worker create', 'create a local Soul worker').option('--id <id>', 'worker id').option('--name <text>', 'worker name').option('--soul <id>', 'Soul id').action(createWorkerCommand)
  cli.command('worker list', 'list local Soul workers').action(async () => {
    await ensureAllWorkers()
    printJson({ workers: listWorkers() })
  })
  cli.command('worker show <id>', 'show one local Soul worker').action(async (id: string) => {
    await ensureDb()
    printJson({ worker: getWorker(id) })
  })
  cli.command('worker select <id>', 'select default local Soul worker').action(selectWorkerCommand)
  cli.command('template list', 'list capability templates').option('--soul <id>', 'Soul id').action(async (opts: { soul?: string }) => {
    await ensureDb()
    const templates = opts.soul ? listHostCapabilityTemplatesForSoul(opts.soul) : listHostSoulCatalog().templates
    printJson({ templates })
  })

  cli.command('workspace create', 'create a worker workspace').option('--name <text>', 'workspace name').option('--worker <id>', 'worker id').action(createWorkspaceCommand)
  cli.command('workspace list', 'list worker workspaces').option('--worker <id>', 'worker id').action(listWorkspaceCommand)
  cli.command('workspace show <id>', 'show one workspace').action(async (id: string) => {
    await ensureDb()
    printJson({ workspace: getWorkspace(id) })
  })

  cli.command('session start', 'create a workspace session and first turn')
    .option('--workspace <id>', 'workspace id')
    .option('--skill <id>', 'capability template id')
    .option('--title <text>', 'session title')
    .option('--context <text>', 'session context')
    .option('--input <text>', 'turn input')
    .option('--worker <id>', 'worker id')
    .action(startSessionCommand)
  cli.command('session list', 'list sessions').option('--workspace <id>', 'workspace id').action(listSessionCommand)
  cli.command('session show <id>', 'show one session').action(showSession)
  cli.command('turn send', 'send a turn to an existing session').option('--session <id>', 'session id').option('--input <text>', 'turn input').option('--worker <id>', 'worker id').action(sendTurnCommand)

  cli.command('files list', 'list workspace files').option('--workspace <id>', 'workspace id').action(listWorkspaceFiles)
  cli.command('files show <path>', 'print workspace file').option('--workspace <id>', 'workspace id').option('--worker <id>', 'worker id').action(showFile)

  cli.command('artifacts list', 'list artifacts').option('--workspace <id>', 'workspace id').action(listArtifactsCommand)
  cli.command('artifacts show <id>', 'show one artifact').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ artifact: getArtifact(id) })
  })
  cli.command('artifacts open <id>', 'open one artifact').option('--worker <id>', 'worker id').action(openArtifact)

  cli.command('review list', 'list reviews').option('--workspace <id>', 'workspace id').action(listReviewsCommand)
  cli.command('review show <id>', 'show one review').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ review: getReview(id) })
  })

  cli.command('lessons list', 'list lessons').option('--workspace <id>', 'workspace id').action(async (opts: { workspace?: string }) => {
    await ensureAllWorkers()
    printJson({ lessons: listLessons(opts.workspace) })
  })
  cli.command('lessons propose', 'propose a lesson').option('--statement <text>', 'lesson statement').option('--review <id>', 'source review id').option('--workspace <id>', 'workspace id').action(proposeLesson)
  cli.command('lessons accept <id>', 'accept a lesson').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ lesson: updateLesson(id, 'accepted') })
  })
  cli.command('lessons reject <id>', 'reject a lesson').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ lesson: updateLesson(id, 'rejected') })
  })

  cli.command('settings list', 'list host daemon settings').action(async () => {
    await ensureDb()
    printJson({ settings: listSettings() })
  })
  cli.command('engine select <engine>', 'set engine hint').action(async (engine: string) => {
    await ensureDb()
    printJson({ setting: setSetting('engine.default', { engine }) })
  })

  cli.command('open', 'open local daemon Web app').option('--port <n>', 'web port', { type: [Number] }).action((opts: { port?: number[] }) => {
    const port = optionalNumber(opts.port) ?? getWorkerEnv().PORT
    const url = `http://127.0.0.1:${port}`
    Bun.spawn(['open', url])
    printJson({ opened: url })
  })
  cli.command('commands', 'show command index').action(() => {
    process.stdout.write(`${commandIndex()}\n`)
  })
}

function requireAvailableSoul(id: string) {
  const soul = findHostSoul(id)
  if (!soul || soul.status !== 'available')
    throw new Error(`available Soul not found: ${id}`)
  return soul
}

function commandIndex(): string {
  return [
    'aiworker command index',
    'init',
    'dev',
    'daemon start|foreground|status|stop|logs|check',
    'app list|show|install|enable|disable|doctor|permissions|bootstrap|create|validate|smoke',
    'soul list',
    'worker create|list|show|select',
    'template list',
    'workspace create|list|show',
    'session start|list|show',
    'turn send',
    'files list|show',
    'artifacts list|show|open',
    'review list|show',
    'lessons list|propose|accept|reject',
    'settings list',
    'engine select',
    'open',
  ].join('\n')
}

registerCommands()
cli.help()
cli.version(packageJson.version)

export function preprocessArgv(argv: string[], commandNames = cli.commands.map(command => command.name)): string[] {
  const names = new Set(commandNames.filter(name => name.includes(' ')))
  const maxDepth = Math.max(1, ...[...names].map(name => name.split(' ').length))
  for (let depth = maxDepth; depth >= 2; depth--) {
    const combined = argv.slice(2, 2 + depth).join(' ')
    if (names.has(combined)) {
      const next = argv.slice()
      next.splice(2, depth, combined)
      return next
    }
  }
  return argv
}

export async function runCli(argv: string[] = process.argv): Promise<number> {
  try {
    process.exitCode = 0
    cli.unsetMatchedCommand()
    const parsed = cli.parse(preprocessArgv(argv), { run: false })
    if (cli.options.help === true || cli.options.version === true)
      return 0
    if (!cli.matchedCommand && parsed.args[0])
      throw new Error(`Unknown command: ${parsed.args[0]}`)
    await cli.runMatchedCommand()
    const code = typeof process.exitCode === 'number' ? process.exitCode : 0
    process.exitCode = 0
    return code
  }
  catch (error) {
    consola.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 0
    return 1
  }
  finally {
    closeWorkerDb()
  }
}

if (import.meta.main)
  process.exit(await runCli(process.argv))
