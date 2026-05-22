#!/usr/bin/env bun
import type { HostRuntime, LocalExecutor, LocalWorkerRuntime, SoulAppRegistryContext } from '@zonease/aiworker-core'
import type { SoulAppManifest } from '@zonease/aiworker-shared'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import type { UpdateCliOptions, UpdateCommandName } from './updater'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createHostRuntime,
  getWorkerEnv,
} from '@zonease/aiworker-core'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import {
  parseSoulAppManifestJson,
  soulAppIdSchema,
} from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listFiles,
  listSessions,
  listSettings,
  listTurns,
  listWorkers,
  listWorkspaces,
  runWorkerMigrations,
  setSetting,
} from '@zonease/aiworker-storage-sqlite/worker'
import cac from 'cac'

import consola from 'consola'
import packageJson from '../package.json' with { type: 'json' }
import {
  buildUpgradePlan,
  canRestartManagedDaemon,
  detectInstallSource,
  executeUpgradePlan,
  parseUpdateCommandOptions,
  readDailyUpdateNoticeState,
  resolveReleaseTarget,
} from './updater'

export interface LocalPaths {
  home: string
  dbPath: string
  workersRoot: string
  pidFile: string
  logFile: string
}

interface RuntimeOptions {
  worker?: string
}

interface DaemonStartResult {
  logFile: string
  pid: number
  started: true
  url: string
}

interface DaemonStopResult {
  pid?: number
  running: false
  stopped: boolean
}

interface DaemonRestartResult {
  reason: string
  restarted: boolean
  started?: DaemonStartResult
  stopped?: DaemonStopResult
}

const cli = cac('aiworker')
const CLI_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const OFFICIAL_APP_MANIFEST_FILENAME = 'soul-app.manifest.json'

export function resolveCliOfficialAppsRoot(moduleDir = CLI_MODULE_DIR): string | undefined {
  const packaged = path.resolve(moduleDir, 'official-apps')
  if (existsSync(path.join(packaged, 'aiworker-hr', OFFICIAL_APP_MANIFEST_FILENAME)))
    return packaged
  const source = path.resolve(moduleDir, '../../apps')
  if (existsSync(path.join(source, 'aiworker-hr', OFFICIAL_APP_MANIFEST_FILENAME)))
    return source
  return undefined
}

export function resolveCliWorkerWebStaticDir(moduleDir = CLI_MODULE_DIR): string | undefined {
  const packaged = path.resolve(moduleDir, 'web', 'worker')
  if (existsSync(path.join(packaged, 'index.html')))
    return packaged
  const source = path.resolve(moduleDir, '../../web/dist/worker')
  if (existsSync(path.join(source, 'index.html')))
    return source
  return undefined
}

const SOURCE_CHECKOUT_DEFAULT_HOME_DIR = '.aiworker-dev'
const PACKAGED_DEFAULT_HOME_DIR = '.aiworker'

export function resolveCliDefaultHomeDir(moduleDir = CLI_MODULE_DIR): string {
  const hasPackagedOfficialApps = existsSync(path.join(moduleDir, 'official-apps'))
  const hasPackagedWeb = existsSync(path.join(moduleDir, 'web', 'worker'))
  return hasPackagedOfficialApps || hasPackagedWeb
    ? PACKAGED_DEFAULT_HOME_DIR
    : SOURCE_CHECKOUT_DEFAULT_HOME_DIR
}

export function resolveCliLocalPaths(moduleDir = CLI_MODULE_DIR): LocalPaths {
  const home = resolveAiworkerScope({
    defaultHomeDir: resolveCliDefaultHomeDir(moduleDir),
  }).home
  return {
    home,
    dbPath: process.env.WORKER_DB_PATH ?? path.join(home, 'aiworker.db'),
    workersRoot: path.join(home, 'workers'),
    pidFile: path.join(home, 'aiworker-daemon.pid'),
    logFile: path.join(home, 'aiworker-daemon.log'),
  }
}

function applyLocalPathEnv(paths: LocalPaths): void {
  process.env.AIWORKER_HOME ??= paths.home
  process.env.WORKER_DB_PATH ??= paths.dbPath
}

function localPaths(): LocalPaths {
  const paths = resolveCliLocalPaths()
  applyLocalPathEnv(paths)
  return paths
}

async function ensureDb(): Promise<LocalPaths> {
  const paths = localPaths()
  await mkdir(paths.home, { recursive: true })
  await mkdir(path.dirname(paths.dbPath), { recursive: true })
  initWorkerDb(paths.dbPath)
  runWorkerMigrations(getWorkerEnv().WORKER_MIGRATIONS_FOLDER)
  return paths
}

function selectedWorkerId(): string | null {
  const setting = listSettings().find(setting => setting.key === 'selected-worker')
  const value = setting?.valueJson
  return value && typeof value.workerId === 'string' ? value.workerId : null
}

function registryContext() {
  return { hostVersion: packageJson.version }
}

function createHost(paths: LocalPaths, options: { executor?: LocalExecutor, officialAppsRoot?: string, registryContext?: () => SoulAppRegistryContext } = {}): HostRuntime {
  return createHostRuntime({
    executor: options.executor,
    officialAppsRoot: options.officialAppsRoot ?? resolveCliOfficialAppsRoot(),
    registryContext: options.registryContext ?? registryContext,
    workersRoot: paths.workersRoot,
  })
}

async function ensureRuntime(options: RuntimeOptions = {}): Promise<LocalWorkerRuntime> {
  const paths = await ensureDb()
  const workerId = options.worker ?? selectedWorkerId()
  if (!workerId)
    throw new Error('worker is required; pass --worker or run `aiworker worker select <id>`')
  const worker = getWorker(workerId)
  if (!worker)
    throw new Error(`worker not found: ${workerId}`)
  const runtime = createHost(paths).createRuntimeForWorker(worker)
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
  const updateNotice = await maybeResolveDailyUpdateNotice()
  printJson({
    ok: true,
    home: paths.home,
    dbPath: paths.dbPath,
    apps: createHost(paths).listApps(),
    workers: listWorkers(),
    workspaces: listWorkspaces(),
    daemon: daemonStatus(),
    settings: listSettings(),
    updateNotice,
  })
}

async function runUpdateCommand(command: UpdateCommandName, opts: UpdateCliOptions): Promise<void> {
  const options = parseUpdateCommandOptions(command, opts)
  const argv1 = resolveArgv1(process.argv[1])
  const source = detectInstallSource({
    argv1,
    bunGlobalBinDirs: bunGlobalBinDirs(),
    moduleDir: CLI_MODULE_DIR,
    npmGlobalBinDirs: npmGlobalBinDirs(),
    realArgv1: safeRealpath(argv1),
  })
  const target = await resolveReleaseTarget({
    fetch: url => fetch(url),
    options,
    source,
  })
  const plan = buildUpgradePlan({
    currentVersion: packageJson.version,
    options,
    source,
    target,
  })

  if (options.mode !== 'apply') {
    printJson({ update: plan })
    return
  }

  if (plan.status === 'source_not_supported' || plan.status === 'source_unknown') {
    printJson({ update: plan })
    throw new Error(`update_not_supported: ${plan.source.detail ?? plan.source.reason ?? plan.source.kind}`)
  }

  if (plan.status === 'update_available' && plan.actions.length === 0) {
    printJson({ update: plan })
    throw new Error('update_not_actionable')
  }

  if (plan.status !== 'update_available') {
    printJson({ update: plan })
    return
  }

  if (plan.requiresConfirmation) {
    printJson({ update: plan })
    throw new Error('update requires --yes to apply changes')
  }

  let daemonRestart: DaemonRestartResult = { reason: 'update did not request daemon restart', restarted: false }
  const result = await executeUpgradePlan({
    convergeHost: async () => {
      await convergeHostAfterCliUpgrade()
    },
    downloadAndReplace: async (action) => {
      await downloadAndReplaceGitHubBundle(action)
    },
    plan,
    restartDaemon: async () => {
      daemonRestart = await restartManagedDaemonAfterCliUpgrade()
    },
    runCommand: async (command, args) => {
      const proc = Bun.spawn([command, ...args], {
        stderr: 'inherit',
        stdin: 'inherit',
        stdout: 'inherit',
      })
      const code = await proc.exited
      if (code !== 0)
        throw new Error(`package manager upgrade failed: ${command} ${args.join(' ')}`)
    },
  })

  printJson({ update: plan, result, daemon: daemonRestart })
}

interface GitHubBundleReplacementOptions {
  currentPath?: string
  fetch?: typeof fetch
  renameSync?: typeof renameSync
  spawnSync?: (command: string[]) => { exitCode: number | null, stderr?: ArrayBufferView | string }
}

export async function downloadAndReplaceGitHubBundle(action: { checksumUrl: string, downloadUrl: string }, options: GitHubBundleReplacementOptions = {}): Promise<{ backupPath: string, installedPath: string }> {
  const currentPath = safeRealpath(resolveArgv1(options.currentPath ?? process.argv[1]))
  if (!currentPath)
    throw new Error('current binary path is required')

  const rename = options.renameSync ?? renameSync
  const spawnSync = options.spawnSync ?? ((command: string[]) => Bun.spawnSync(command))
  const fetchImpl = options.fetch ?? fetch
  const currentBundleDir = path.dirname(currentPath)
  const installParentDir = path.dirname(currentBundleDir)
  const stageDir = mkdtempSync(path.join(installParentDir, '.aiworker-update-'))
  const archivePath = path.join(stageDir, 'aiworker.tar.gz')
  const nextBundleDir = path.join(installParentDir, `.aiworker-next-${process.pid}-${randomUUID()}`)
  const backupPath = path.join(installParentDir, `.aiworker-backup-${process.pid}-${randomUUID()}`)
  let installed = false

  try {
    const [checksumText, archiveBytes] = await Promise.all([
      fetchUpdateText(action.checksumUrl, fetchImpl),
      fetchUpdateBytes(action.downloadUrl, fetchImpl),
    ])
    const expectedChecksum = checksumText.trim().split(/\s+/)[0]
    const actualChecksum = createHash('sha256').update(archiveBytes).digest('hex')
    if (!expectedChecksum || actualChecksum !== expectedChecksum)
      throw new Error('checksum_mismatch')

    writeFileSync(archivePath, archiveBytes)
    const extract = spawnSync(['tar', '-xzf', archivePath, '-C', stageDir])
    if (extract.exitCode !== 0) {
      const stderr = spawnStderrText(extract.stderr)
      throw new Error(`staging_failed: ${stderr || `tar exited ${extract.exitCode}`}`)
    }

    const extractedDirs = readdirSync(stageDir)
      .map(entry => path.join(stageDir, entry))
      .filter(entry => statSync(entry).isDirectory())
    const extractedDir = extractedDirs.find(entry => existsSync(path.join(entry, 'aiworker')))
    if (!extractedDir)
      throw new Error(extractedDirs.length > 0 ? 'staging_failed: aiworker binary not found' : 'staging_failed: extracted directory not found')

    const stagedBinary = path.join(extractedDir, 'aiworker')
    if (!existsSync(stagedBinary) || !statSync(stagedBinary).isFile())
      throw new Error('staging_failed: aiworker binary not found')
    if (!existsSync(path.join(extractedDir, 'web')) || !statSync(path.join(extractedDir, 'web')).isDirectory())
      throw new Error('staging_failed: web assets not found')
    if (!existsSync(path.join(extractedDir, 'drizzle')) || !statSync(path.join(extractedDir, 'drizzle')).isDirectory())
      throw new Error('staging_failed: drizzle migrations not found')

    rmSync(nextBundleDir, { force: true, recursive: true })
    rmSync(backupPath, { force: true, recursive: true })
    rename(extractedDir, nextBundleDir)
    chmodSync(path.join(nextBundleDir, 'aiworker'), 0o755)

    const probe = spawnSync([path.join(nextBundleDir, 'aiworker'), '--version'])
    if (probe.exitCode !== 0) {
      const stderr = spawnStderrText(probe.stderr)
      throw new Error(`staging_failed: version probe failed${stderr ? `: ${stderr}` : ''}`)
    }

    rename(currentBundleDir, backupPath)
    try {
      rename(nextBundleDir, currentBundleDir)
    }
    catch (error) {
      rename(backupPath, currentBundleDir)
      throw error
    }
    installed = true
    return { backupPath, installedPath: currentPath }
  }
  finally {
    rmSync(stageDir, { recursive: true, force: true })
    if (!installed)
      rmSync(nextBundleDir, { recursive: true, force: true })
  }
}

function spawnStderrText(stderr: ArrayBufferView | string | undefined): string {
  if (!stderr)
    return ''
  if (typeof stderr === 'string')
    return stderr.trim()
  return Buffer.from(stderr.buffer, stderr.byteOffset, stderr.byteLength).toString('utf8').trim()
}

async function fetchUpdateBytes(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const response = await fetchImpl(url)
  if (!response.ok)
    throw new Error(`update asset fetch failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function fetchUpdateText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(url)
  if (!response.ok)
    throw new Error(`update checksum fetch failed: HTTP ${response.status}`)
  return await response.text()
}

async function maybeResolveDailyUpdateNotice(): Promise<null | { channel: 'stable', command: 'aiworker update', currentVersion: string, targetVersion: string }> {
  const checkedAt = new Date()
  try {
    await ensureDb()
    const setting = listSettings().find(setting => setting.key === 'update.notice')
    const previous = setting?.valueJson ?? null
    const state = readDailyUpdateNoticeState(previous, checkedAt)

    if (!state.canCheck) {
      return state.latestSeenVersion && compareVersionStrings(state.latestSeenVersion, packageJson.version) > 0
        ? {
            channel: 'stable',
            command: 'aiworker update',
            currentVersion: packageJson.version,
            targetVersion: state.latestSeenVersion,
          }
        : null
    }

    const options = parseUpdateCommandOptions('update', { check: true, channel: 'stable' })
    const argv1 = resolveArgv1(process.argv[1])
    const source = detectInstallSource({
      argv1,
      bunGlobalBinDirs: bunGlobalBinDirs(),
      moduleDir: CLI_MODULE_DIR,
      npmGlobalBinDirs: npmGlobalBinDirs(),
      realArgv1: safeRealpath(argv1),
    })
    const target = await resolveReleaseTarget({
      fetch: url => fetchWithShortTimeout(url),
      options,
      source,
    })
    const plan = buildUpgradePlan({
      currentVersion: packageJson.version,
      options,
      source,
      target,
    })

    setSetting('update.notice', {
      checkedAt: checkedAt.toISOString(),
      latestSeenVersion: target.version,
    })

    return plan.status === 'update_available'
      ? {
          channel: 'stable',
          command: 'aiworker update',
          currentVersion: packageJson.version,
          targetVersion: target.version,
        }
      : null
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      const latestSeenVersion = listSettings().find(setting => setting.key === 'update.notice')?.valueJson.latestSeenVersion
      setSetting('update.notice', {
        checkedAt: checkedAt.toISOString(),
        errorMessage: message,
        latestSeenVersion: typeof latestSeenVersion === 'string' ? latestSeenVersion : packageJson.version,
      })
    }
    catch {
      // Daily notices must never block daemon or doctor startup.
    }
    return null
  }
}

function npmGlobalBinDirs(): string[] {
  return uniqueTruthy([
    process.env.npm_config_prefix ? path.join(process.env.npm_config_prefix, 'bin') : undefined,
    process.env.PREFIX ? path.join(process.env.PREFIX, 'bin') : undefined,
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ])
}

function bunGlobalBinDirs(): string[] {
  return uniqueTruthy([
    process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin') : undefined,
    process.env.HOME ? path.join(process.env.HOME, '.bun', 'bin') : undefined,
  ])
}

function uniqueTruthy(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0).map(value => path.resolve(value)))]
}

function resolveArgv1(value: string | undefined): string | undefined {
  return value ? path.resolve(value) : undefined
}

function safeRealpath(value: string | undefined): string | undefined {
  if (!value)
    return undefined
  try {
    return realpathSync(value)
  }
  catch {
    return value
  }
}

async function fetchWithShortTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 750)
  try {
    return await fetch(url, { signal: controller.signal })
  }
  finally {
    clearTimeout(timeout)
  }
}

function compareVersionStrings(left: string, right: string): number {
  const a = left.split(/[.-]/).map(part => Number.parseInt(part, 10) || 0)
  const b = right.split(/[.-]/).map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0)
      return diff
  }
  return 0
}

function daemonStatus(): { logFile: string, pid: number | null, running: boolean } {
  const paths = localPaths()
  if (!existsSync(paths.pidFile))
    return { pid: null, running: false, logFile: paths.logFile }
  const pid = Number.parseInt(readFileSync(paths.pidFile, 'utf8'), 10)
  return { pid: Number.isFinite(pid) ? pid : null, running: Number.isFinite(pid) && isProcessAlive(pid), logFile: paths.logFile }
}

async function startDaemonProcess(opts: { host?: string, port?: number } = {}, paths = localPaths()): Promise<DaemonStartResult> {
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
  return { started: true, pid: child.pid, logFile: paths.logFile, url: `http://127.0.0.1:${opts.port ?? getWorkerEnv().PORT}` }
}

async function startDaemon(opts: { host?: string, port?: number } = {}): Promise<void> {
  printJson(await startDaemonProcess(opts))
}

async function stopDaemonProcess(paths = localPaths(), status = daemonStatus()): Promise<DaemonStopResult> {
  if (!status.pid || !status.running) {
    rmSync(paths.pidFile, { force: true })
    return { stopped: false, running: false }
  }
  try {
    process.kill(status.pid, 'SIGTERM')
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH')
      throw error
  }
  await waitForProcessExit(status.pid)
  rmSync(paths.pidFile, { force: true })
  return { stopped: true, pid: status.pid, running: false }
}

async function stopDaemon(): Promise<void> {
  printJson(await stopDaemonProcess())
}

async function restartDaemon(opts: { host?: string, port?: number } = {}): Promise<void> {
  const paths = localPaths()
  const status = daemonStatus()
  const stopped = await stopDaemonProcess(paths, status)
  const started = await startDaemonProcess(opts, paths)
  printJson({ restarted: stopped.stopped, stopped, started })
}

async function restartManagedDaemonAfterCliUpgrade(): Promise<DaemonRestartResult> {
  const paths = localPaths()
  const status = daemonStatus()
  const command = status.pid ? readProcessCommand(status.pid) : null
  const decision = canRestartManagedDaemon({
    command,
    expectedHome: paths.home,
    pid: status.pid,
    pidFileHome: paths.home,
    running: status.running,
  })

  if (!decision.allowed)
    return { restarted: false, reason: decision.reason }

  const stopped = await stopDaemonProcess(paths, status)
  const started = await startDaemonProcess({}, paths)
  return { restarted: true, reason: decision.reason, stopped, started }
}

async function waitForProcessExit(pid: number, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now()
  while (isProcessAlive(pid)) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`daemon did not stop before restart: pid=${pid}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

function readProcessCommand(pid: number): string | null {
  const result = Bun.spawnSync(['ps', '-p', String(pid), '-o', 'command='])
  if (result.exitCode !== 0)
    return null
  const output = Buffer.from(result.stdout).toString('utf8').trim()
  return output.length > 0 ? output : null
}

async function daemonForeground(opts: { host?: string, port?: number } = {}): Promise<void> {
  localPaths()
  const updateNotice = await maybeResolveDailyUpdateNotice()
  if (updateNotice) {
    consola.info(`[aiworker-daemon] update available: ${updateNotice.currentVersion} -> ${updateNotice.targetVersion}; run ${updateNotice.command}`)
  }
  const { bootstrapWorkerApp } = await import('@zonease/aiworker-api/bootstrap')
  const { app, port } = await bootstrapWorkerApp({
    officialAppsRoot: resolveCliOfficialAppsRoot(),
    runtimeVersion: packageJson.version,
    webStaticDir: resolveCliWorkerWebStaticDir(),
  })
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
  const created = await createHost(paths).createSoulWorker({
    id: opts.id,
    name: requireText(opts.name, 'name'),
    soulId: requireText(opts.soul, 'soul'),
  })
  printJson({ worker: created.snapshot.worker })
}

async function selectWorkerCommand(id: string): Promise<void> {
  await ensureDb()
  const worker = getWorker(id)
  if (!worker)
    throw new Error(`worker not found: ${id}`)
  printJson({ setting: setSetting('selected-worker', { workerId: worker.id }) })
}

async function createWorkspaceCommand(opts: { name?: string, type?: string, worker?: string }): Promise<void> {
  const runtime = await ensureRuntime({ worker: opts.worker })
  printJson({ workspace: await runtime.createWorkspace({ name: requireText(opts.name, 'name'), type: opts.type }) })
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

async function startSessionCommand(opts: { context?: string, input?: string, model?: string, reasoning?: string, skill?: string, title?: string, worker?: string, workspace?: string }): Promise<void> {
  const paths = await ensureDb()
  const runtime = await ensureRuntime({ worker: opts.worker })
  const workspaceId = requireText(opts.workspace, 'workspace')
  const workspace = getWorkspace(workspaceId)
  if (!workspace || workspace.workerId !== runtime.workerId)
    throw new Error(`workspace not found for ${runtime.workerId}: ${workspaceId}`)
  const skillId = requireText(opts.skill, 'skill')
  const host = createHost(paths)
  const template = host.requireCapabilityTemplateForWorker(runtime.workerId, skillId)
  const sessionMetadata = {
    ...cliEngineOverrideMetadata(opts),
  }
  const session = await runtime.createSession({
    workspaceId,
    capabilityTemplateId: template.id,
    title: requireText(opts.title, 'title'),
    context: opts.context ?? '',
    metadata: sessionMetadata,
  })
  const input = requireText(opts.input, 'input')
  printJson(await runtime.startTurn({
    sessionId: session.id,
    input,
    engineId: 'codex',
    engineCommand: 'codex',
    metadata: {
      ...(session.metadataJson ?? sessionMetadata),
      executionMode: 'local-cli',
      ...cliEngineOverrideMetadata(opts),
    },
  }))
}

async function sendTurnCommand(opts: { input?: string, model?: string, reasoning?: string, session?: string, worker?: string }): Promise<void> {
  const _paths = await ensureDb()
  const sessionId = requireText(opts.session, 'session')
  const session = getSession(sessionId)
  if (!session)
    throw new Error(`session not found: ${sessionId}`)
  const runtime = await ensureRuntime({ worker: opts.worker ?? session.workerId })
  const metadata = {
    ...(session.metadataJson ?? {}),
    executionMode: 'local-cli',
    ...cliEngineOverrideMetadata(opts),
  }
  printJson(await runtime.startTurn({
    sessionId,
    input: requireText(opts.input, 'input'),
    engineId: 'codex',
    engineCommand: 'codex',
    metadata,
  }))
}

function cliEngineOverrideMetadata(opts: { model?: string, reasoning?: string }): Record<string, string> {
  return {
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.reasoning ? { reasoning: opts.reasoning } : {}),
  }
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

async function listAppsCommand(): Promise<void> {
  const paths = await ensureDb()
  printJson({ apps: createHost(paths).listApps() })
}

async function showAppCommand(id: string): Promise<void> {
  const paths = await ensureDb()
  printJson({ app: createHost(paths).getApp(id) })
}

async function installAppCommand(manifestPath: string): Promise<void> {
  const paths = await ensureDb()
  printJson({ app: await createHost(paths).installAppFromPath(manifestPath) })
}

async function enableAppCommand(id: string): Promise<void> {
  const paths = await ensureDb()
  const host = createHost(paths)
  printJson({ app: host.enableApp(id), catalog: host.listCatalog() })
}

async function disableAppCommand(id: string): Promise<void> {
  const paths = await ensureDb()
  const host = createHost(paths)
  printJson({ app: host.disableApp(id), catalog: host.listCatalog() })
}

async function doctorAppCommand(id: string): Promise<void> {
  const paths = await ensureDb()
  printJson({ app: createHost(paths).healthcheckApp(id) })
}

async function permissionsAppCommand(id: string): Promise<void> {
  const paths = await ensureDb()
  const app = createHost(paths).getApp(id)
  printJson({ appId: id, permissions: app?.manifest.permissions ?? [] })
}

async function bootstrapAppCommand(scope: string): Promise<void> {
  const paths = await ensureDb()
  if (scope !== 'official')
    throw new Error(`unsupported app bootstrap scope: ${scope}`)
  const bootstrap = await createHost(paths).bootstrapOfficialSoulApps()
  printJson({ bootstrap, catalog: bootstrap.catalog })
  if (bootstrap.status === 'fail')
    process.exitCode = 1
}

export async function convergeHostAfterCliUpgrade(): Promise<{ bootstrap: Awaited<ReturnType<HostRuntime['bootstrapOfficialSoulApps']>>, home: string }> {
  const paths = await ensureDb()
  const host = createHost(paths)
  const bootstrap = await host.bootstrapOfficialSoulApps()
  if (bootstrap.status === 'fail')
    throw new Error('host convergence failed while bootstrapping official Soul Apps')
  return { bootstrap, home: paths.home }
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
  writeScaffoldFile(path.join(targetDir, 'engine-assets/workspace/AGENTS.md'), scaffoldWorkspaceAgents(appId))
  writeScaffoldFile(path.join(targetDir, 'engine-assets/workspace/CLAUDE.md'), '@AGENTS.md\n')
  writeScaffoldFile(path.join(targetDir, 'engine-assets/workspace/README.md'), scaffoldWorkspaceReadme(appId))
  writeScaffoldFile(path.join(targetDir, 'engine-assets/workspace/.gitignore'), scaffoldWorkspaceGitignore())
  writeScaffoldFile(path.join(targetDir, 'engine-assets/skills/brief/SKILL.md'), scaffoldSkill(appId))
  writeScaffoldFile(path.join(targetDir, 'host-adapter/index.ts'), scaffoldIndexTs())
  writeScaffoldFile(path.join(targetDir, 'host-adapter/api.ts'), scaffoldApiTs())
  writeScaffoldFile(path.join(targetDir, 'host-adapter/standalone/standalone.ts'), scaffoldStandaloneTs())
  writeScaffoldFile(path.join(targetDir, 'host-adapter/mounted/host-mounted.ts'), scaffoldHostMountedTs())
  writeScaffoldFile(path.join(targetDir, 'product/artifacts/schemas/brief.schema.json'), briefSchemaText)
  writeScaffoldFile(path.join(targetDir, 'product/workflows/brief/prompt.md'), scaffoldPrompt(appId))
  writeScaffoldFile(path.join(targetDir, 'product/workflows/brief/review.md'), scaffoldReview(appId))
  writeScaffoldFile(path.join(targetDir, 'product/reviews/brief.md'), scaffoldReview(appId))
  writeScaffoldFile(path.join(targetDir, 'product/profiles', appId, 'SOUL.md'), scaffoldSoulPack(appId))
  writeScaffoldFile(path.join(targetDir, 'product/web/artifact-previews/brief-preview.tsx'), scaffoldProductWebTs('briefPreview'))
  writeScaffoldFile(path.join(targetDir, 'product/web/panels/brief-panel.tsx'), scaffoldProductWebTs('briefPanel'))
  writeScaffoldFile(path.join(targetDir, 'product/web/panels/brief-review-panel.tsx'), scaffoldProductWebTs('briefReviewPanel'))
  writeScaffoldFile(path.join(targetDir, 'product/web/routes/brief-route.tsx'), scaffoldProductWebTs('briefRoute'))
  writeScaffoldFile(path.join(targetDir, 'product/web/widgets/brief-widget.tsx'), scaffoldProductWebTs('briefWidget'))

  printJson({
    appId,
    files: [
      'soul-app.manifest.json',
      'package.json',
      'tsconfig.json',
      'README.md',
      'engine-assets/workspace/AGENTS.md',
      'engine-assets/workspace/CLAUDE.md',
      'engine-assets/workspace/README.md',
      'engine-assets/workspace/.gitignore',
      'engine-assets/skills/brief/SKILL.md',
      'host-adapter/index.ts',
      'host-adapter/api.ts',
      'host-adapter/standalone/standalone.ts',
      'host-adapter/mounted/host-mounted.ts',
      'product/artifacts/schemas/brief.schema.json',
      'product/workflows/brief/prompt.md',
      'product/workflows/brief/review.md',
      'product/reviews/brief.md',
      `product/profiles/${appId}/SOUL.md`,
      'product/web/artifact-previews/brief-preview.tsx',
      'product/web/panels/brief-panel.tsx',
      'product/web/panels/brief-review-panel.tsx',
      'product/web/routes/brief-route.tsx',
      'product/web/widgets/brief-widget.tsx',
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
    const smokePaths: LocalPaths = {
      dbPath: path.join(smokeRoot, 'worker.db'),
      home: smokeRoot,
      logFile: path.join(smokeRoot, 'aiworker-daemon.log'),
      pidFile: path.join(smokeRoot, 'aiworker-daemon.pid'),
      workersRoot: path.join(smokeRoot, 'workers'),
    }
    initWorkerDb(smokePaths.dbPath)
    runWorkerMigrations()
    const connectorIds = [
      ...smokeManifest.connectors.required.map(connector => connector.id),
      ...smokeManifest.connectors.optional.map(connector => connector.id),
    ]
    const smokeRegistryContext = () => ({
      availableConnectorIds: connectorIds,
      enabledConnectorIds: smokeManifest.connectors.required.map(connector => connector.id),
      hostVersion: packageJson.version,
    })
    const host = createHost(smokePaths, {
      registryContext: smokeRegistryContext,
    })
    host.installAppManifest({
      manifest: smokeManifest,
      sourceKind: 'manifest-path',
      sourceRef: validation.manifestPath,
    })
    const hostedApp = host.enableApp(smokeManifest.id)
    const template = host.listCatalog().templates.find(item => item.soulId === manifest.id)
    if (!template)
      throw new Error(`No mounted capability template available for ${manifest.id}`)
    const hostWithExecutor = createHost(smokePaths, {
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
      registryContext: smokeRegistryContext,
    })
    const { runtime } = await hostWithExecutor.createSoulWorker({
      defaultEngineId: 'smoke',
      id: `${manifest.id}-smoke-worker`,
      metadata: {
        description: manifest.description,
        domain: manifest.soul.domain,
        soulAppId: manifest.id,
      },
      name: `${manifest.name} Smoke`,
      soulId: manifest.id,
    })
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
    const _turn = await runtime.startTurn({
      engineId: 'smoke',
      input: 'Create a reviewable smoke artifact.',
      metadata: { soulAppId: manifest.id },
      sessionId: session.id,
    })
    const standalone = await runStandaloneBrowserSmoke(manifest)
    printJson({
      smoke: {
        appId: manifest.id,
        artifactCount: 0,
        hostedStatus: hostedApp.status,
        mounted: 'pass',
        mountedService: mountedService.status,
        mountedServiceHttpStatus: mountedService.httpStatus,
        mountedServiceUrl: mountedService.url,
        reviewStatus: null,
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

interface WebStorageIssue {
  file: string
  message: string
  symbol: string
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
  webStorageIssues: WebStorageIssue[]
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
const RAW_WEB_STORAGE_MESSAGE = 'Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.'

function createScaffoldManifest(appId: string): SoulAppManifest {
  const routePrefix = `/api/local/apps/${appId}`
  const raw = {
    api: {
      entry: './host-adapter/api.ts',
      localService: {
        command: ['bun', 'host-adapter/mounted/host-mounted.ts'],
        healthPath: '/health',
      },
      routePrefix,
    },
    capabilities: [
      {
        description: 'Create a source-backed starter brief.',
        id: 'brief',
        name: 'Brief',
        outputKind: 'brief',
        packRefs: [appId],
        promptRef: './product/workflows/brief/prompt.md',
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
    description: `${appId} starter Soul App for one vertical workspace and capability.`,
    engineAssets: {
      skills: {
        source: './engine-assets/skills',
        targets: ['codex', 'claude-code'],
      },
      workspace: {
        source: './engine-assets/workspace',
      },
    },
    exports: {
      connector: './host-adapter/index.ts',
      lifecycle: './host-adapter/index.ts',
      runtime: './host-adapter/index.ts',
      ui: './host-adapter/index.ts',
    },
    healthcheck: {
      kind: 'protocol-handler',
      ref: 'healthcheck',
      timeoutMs: 5000,
    },
    id: appId,
    modes: {
      hostMounted: { entry: './host-adapter/mounted/host-mounted.ts', supported: true },
      standalone: { entry: './host-adapter/standalone/standalone.ts', supported: true },
    },
    name: titleCase(appId),
    pack: {
      refs: [
        { id: appId, ref: `./product/profiles/${appId}/SOUL.md`, source: 'embedded', version: '0.1.0' },
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
        action: 'mount',
        kind: 'ui',
        reason: 'Mount starter micro-app surfaces.',
        target: `${appId}-micro-app`,
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
      description: `${titleCase(appId)} vertical Soul for app-scoped workspaces.`,
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
          entry: './product/web/artifact-previews/brief-preview.tsx',
          id: 'brief-preview',
          label: 'Brief preview',
          slot: 'artifact-preview',
          target: 'brief',
        },
      ],
      panels: [
        {
          entry: './product/web/panels/brief-panel.tsx',
          id: 'brief-panel',
          label: 'Brief panel',
          slot: 'panel',
        },
      ],
      routes: [
        {
          entry: './product/web/routes/brief-route.tsx',
          id: 'brief-home',
          label: titleCase(appId),
          path: `/${appId}`,
          surface: {
            entry: '/micro-app/routes/brief-home',
            renderer: 'micro-app',
            requiredPermissions: [`ui:mount:${appId}-micro-app`],
            scope: 'app',
          },
        },
      ],
      workspaceContext: {
        terminal: {
          cwd: {
            source: 'host-workspace-root',
          },
          id: 'starter-workspace-terminal',
          label: 'Workspace terminal',
        },
      },
      workspaceWidgets: [
        {
          entry: './product/web/widgets/brief-widget.tsx',
          id: 'brief-widget',
          label: 'Brief widget',
          slot: 'workspace-widget',
          surface: {
            entry: '/micro-app/widgets/brief-widget',
            renderer: 'micro-app',
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
      build: 'bun build host-adapter/index.ts host-adapter/standalone/standalone.ts host-adapter/mounted/host-mounted.ts --outdir dist --target bun',
      dev: 'bun host-adapter/standalone/standalone.ts --serve',
      serve: 'bun host-adapter/mounted/host-mounted.ts',
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
    include: ['host-adapter/**/*.ts'],
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
    'It is a source-checkout preview scaffold: the generated package uses `workspace:*` while the SDK is still unpublished; replace `workspace:*` after the SDK is published.',
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
    '- Serve mounted UI from micro-app routes and keep actions/search in app-owned mounted API paths.',
    '- Use `ui.workspaceContext` for Host-owned workspace process context such as a future web terminal.',
    '- Keep storage permissions scoped to this app namespace.',
    '- Add one artifact schema and one review policy for each new artifact type.',
    '- Run PMA, focused tests, and code-review-graph before submitting Host changes.',
    '',
  ].join('\n')
}

function scaffoldWorkspaceAgents(appId: string): string {
  return [
    `# ${titleCase(appId)} Workspace Instructions`,
    '',
    'This workspace belongs to an AIWorker Soul App.',
    'Treat action-started sessions as explicit native skill selections.',
    'Keep generated artifacts reviewable before they become accepted workspace state.',
    '',
  ].join('\n')
}

function scaffoldWorkspaceReadme(appId: string): string {
  return [
    '# {{workspaceName}}',
    '',
    `Workspace for ${titleCase(appId)}.`,
    '',
  ].join('\n')
}

function scaffoldWorkspaceGitignore(): string {
  return [
    '.aiworker/sessions/',
    '.aiworker/projections.json',
    'evidence/raw/',
    '',
  ].join('\n')
}

function scaffoldSkill(appId: string): string {
  return [
    '---',
    'name: brief',
    `description: Create source-backed ${titleCase(appId)} briefs.`,
    '---',
    '',
    '# Brief',
    '',
    'Create a concise, source-backed brief and surface missing evidence for human review.',
    '',
  ].join('\n')
}

function scaffoldProductWebTs(symbol: string): string {
  return `export const ${symbol} = {
  renderer: 'app-owned',
  status: 'scaffold',
}
`
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

function scaffoldApiTs(): string {
  return `export { soulApp } from './index'
`
}

function scaffoldStandaloneTs(): string {
  return `import process from 'node:process'

import manifestJson from '../../soul-app.manifest.json' with { type: 'json' }

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

import manifestJson from '../../soul-app.manifest.json' with { type: 'json' }

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

      if (url.pathname === '/api/capabilities')
        return Response.json({ capabilities: manifest.capabilities })

      if (url.pathname === '/api/briefs' && request.method === 'POST')
        return handleCreateBrief(request)

      if (url.pathname === '/api/briefs/search' && request.method === 'GET')
        return handleBriefSearch(url)

      if (url.pathname === '/micro-app/routes/brief-home') {
        return new Response(renderBriefMicroAppHtml('Brief Home'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      if (url.pathname === '/micro-app/widgets/brief-widget') {
        return new Response(renderBriefMicroAppHtml('Brief Widget'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
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

interface CreateBriefBody {
  title?: string
}

async function handleCreateBrief(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as CreateBriefBody
  return Response.json({
    item: {
      appId: manifest.id,
      id: 'starter-brief',
      kind: 'brief',
      status: 'draft',
      title: typeof body.title === 'string' && body.title ? body.title : 'Starter brief',
    },
  })
}

function handleBriefSearch(url: URL): Response {
  const query = url.searchParams.get('query') ?? ''
  return Response.json({
    items: [{
      appId: manifest.id,
      id: 'starter-brief',
      kind: 'brief',
      status: 'draft',
      summary: query ? \`Starter brief match for \${query}\` : 'Starter brief workspace item',
      title: query ? \`Brief: \${query}\` : 'Starter brief',
    }],
  })
}

function renderBriefMicroAppHtml(title: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    \`<title>\${escapeHtml(title)}</title>\`,
    '</head>',
    '<body>',
    \`<main data-soul-app-id="\${escapeHtml(manifest.id)}"><h1>\${escapeHtml(title)}</h1></main>\`,
    '</body>',
    '</html>',
  ].join('')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}
`
}

function scaffoldPrompt(appId: string): string {
  return [
    `# ${titleCase(appId)} Brief Prompt`,
    '',
    'Create a concise, source-backed business brief.',
    '',
    '- Cite evidence references provided by the workspace context or app-owned API.',
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
      webStorageIssues: [],
    }
  }

  const parsed = parseSoulAppManifestJson(readFileSync(resolved.manifestPath, 'utf8'), registryContext())
  const manifestIssues = parsed.status === 'ok' ? [] : parsed.issues
  const manifest = parsed.status === 'ok' ? parsed.manifest : undefined
  const assetResult = manifest ? validateManifestAssetRefs(resolved.rootDir, manifest) : { checkedAssets: [], issues: [] }
  const privateImportIssues = scanPrivateImports(resolved.rootDir)
  const webStorageIssues = scanRawWebStorageUsage(resolved.rootDir)
  const status = manifest
    && manifestIssues.every(issue => issue.severity !== 'error')
    && assetResult.issues.every(issue => issue.severity !== 'error')
    && privateImportIssues.length === 0
    && webStorageIssues.length === 0
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
    webStorageIssues,
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
    webStorageIssues: result.webStorageIssues,
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
  refs.push({ kind: 'engine-assets-workspace', path: manifest.engineAssets.workspace.source })
  if (manifest.engineAssets.skills)
    refs.push({ kind: 'engine-assets-skills', path: manifest.engineAssets.skills.source })
  for (const client of manifest.engineAssets.mcpClients ?? [])
    refs.push({ kind: 'engine-assets-mcp-client', path: client.source })
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
    ...(manifest.ui.workspaceWidgets ?? []).map(slot => slot.entry),
  ]) {
    if (entry)
      refs.push({ kind: 'entry', path: entry })
  }
  return refs.filter((ref, index, items) => items.findIndex(item => item.kind === ref.kind && item.path === ref.path) === index)
}

function scanPrivateImports(rootDir: string): PrivateImportIssue[] {
  const issues: PrivateImportIssue[] = []
  for (const sourceDir of appSourceScanDirs(rootDir)) {
    for (const file of listSourceFiles(sourceDir)) {
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
  }
  return issues
}

function scanRawWebStorageUsage(rootDir: string): WebStorageIssue[] {
  const issues: WebStorageIssue[] = []
  for (const sourceDir of appSourceScanDirs(rootDir)) {
    for (const file of listSourceFiles(sourceDir)) {
      if (isTestSourceFile(file))
        continue
      const content = readFileSync(file, 'utf8')
      for (const symbol of rawWebStorageSymbols(content)) {
        issues.push({
          file: path.relative(rootDir, file),
          message: RAW_WEB_STORAGE_MESSAGE,
          symbol,
        })
      }
    }
  }
  return issues
}

function appSourceScanDirs(rootDir: string): string[] {
  return ['host-adapter', 'product', 'src']
    .map(dir => path.join(rootDir, dir))
    .filter(dir => existsSync(dir))
}

function rawWebStorageSymbols(content: string): string[] {
  const matches: Array<{ index: number, symbol: string }> = []
  const clearPattern = /\b(?:window\.)?(?:localStorage|sessionStorage)\.clear\s*\(/g
  for (const match of content.matchAll(clearPattern)) {
    if (match.index !== undefined)
      matches.push({ index: match.index, symbol: match[0].replace(/\s*\($/, '') })
  }
  const storagePattern = /\b(?:window\.)?(?:localStorage|sessionStorage)\b/g
  for (const match of content.matchAll(storagePattern)) {
    if (match.index === undefined)
      continue
    const symbol = match[0]
    const after = content.slice(match.index + symbol.length)
    if (after.match(/^\s*\.clear\s*\(/))
      continue
    matches.push({ index: match.index, symbol })
  }
  return matches
    .sort((left, right) => left.index - right.index)
    .filter((match, index, items) => items.findIndex(item => item.index === match.index && item.symbol === match.symbol) === index)
    .map(match => match.symbol)
}

function isTestSourceFile(file: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
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
  cli.command('dev', 'source-checkout alias for daemon foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => {
    consola.warn('aiworker dev is a source-checkout compatibility alias; prefer `bun run dev` in the repository or `aiworker daemon start` after installation.')
    return daemonForeground({ host: opts.host, port: optionalNumber(opts.port) })
  })
  cli.command('doctor', 'inspect host-local daemon readiness').action(runDoctor)
  cli.command('update', 'check or apply an AIWorker CLI update')
    .option('--check', 'check for updates without changing files')
    .option('--dry-run', 'print planned update actions without applying them')
    .option('--yes', 'accepted for compatibility; updates execute by default')
    .option('--target <version>', 'explicit target version')
    .option('--channel <channel>', 'release channel: stable or preview')
    .option('--pre', 'use preview release channel')
    .action((opts: UpdateCliOptions) => runUpdateCommand('update', opts))
  cli.command('upgrade', 'alias for aiworker update')
    .option('--check', 'check for updates without changing files')
    .option('--dry-run', 'print planned update actions without applying them')
    .option('--yes', 'confirm update application')
    .option('--target <version>', 'explicit target version')
    .option('--channel <channel>', 'release channel: stable or preview')
    .option('--pre', 'use preview release channel')
    .action((opts: UpdateCliOptions) => runUpdateCommand('upgrade', opts))

  cli.command('daemon start', 'start local daemon in background').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => startDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon foreground', 'run local daemon in foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon status', 'show local daemon status').action(() => printJson(daemonStatus()))
  cli.command('daemon stop', 'stop local daemon').action(stopDaemon)
  cli.command('daemon restart', 'restart local daemon').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => restartDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
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
    const paths = await ensureDb()
    printJson({ souls: createHost(paths).listSouls() })
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
  cli.command('template list', 'compatibility inspection: list app-declared session templates').option('--soul <id>', 'Soul id').action(async (opts: { soul?: string }) => {
    const paths = await ensureDb()
    const templates = createHost(paths).listCapabilityTemplates(opts.soul)
    printJson({ templates })
  })

  cli.command('workspace create', 'create a worker workspace').option('--name <text>', 'workspace name').option('--type <id>', 'workspace type').option('--worker <id>', 'worker id').action(createWorkspaceCommand)
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
    .option('--model <id>', 'Codex model override')
    .option('--reasoning <effort>', 'Codex reasoning effort override')
    .option('--worker <id>', 'worker id')
    .action(startSessionCommand)
  cli.command('session list', 'list sessions').option('--workspace <id>', 'workspace id').action(listSessionCommand)
  cli.command('session show <id>', 'show one session').action(showSession)
  cli.command('turn send', 'send a turn to an existing session').option('--session <id>', 'session id').option('--input <text>', 'turn input').option('--model <id>', 'Codex model override').option('--reasoning <effort>', 'Codex reasoning effort override').option('--worker <id>', 'worker id').action(sendTurnCommand)

  cli.command('files list', 'compatibility inspection: list workspace files').option('--workspace <id>', 'workspace id').action(listWorkspaceFiles)
  cli.command('files show <path>', 'compatibility inspection: print workspace file').option('--workspace <id>', 'workspace id').option('--worker <id>', 'worker id').action(showFile)

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
  cli.command('commands', 'show command index').option('--all', 'show advanced and compatibility commands').action((opts: { all?: boolean }) => {
    process.stdout.write(`${commandIndex({ all: opts.all === true })}\n`)
  })
}

const OPERATOR_COMMAND_INDEX = [
  'aiworker operator commands',
  'daemon start|stop|restart|status|logs',
  'open',
  'doctor',
  'update',
  'app list|show|install|enable|bootstrap',
  'worker create|list|select',
  'workspace create|list',
  'session start|list|show',
  'turn send',
  '',
  'Run `aiworker commands --all` for authoring, diagnostics and compatibility commands.',
]

const FULL_COMMAND_INDEX = [
  'aiworker command index',
  'init',
  'dev',
  'update|upgrade',
  'daemon start|foreground|status|stop|restart|logs|check',
  'app list|show|install|enable|disable|doctor|permissions|bootstrap|create|validate|smoke',
  'soul list',
  'worker create|list|show|select',
  'workspace create|list|show',
  'session start|list|show',
  'turn send',
  'compatibility inspection: template list; files list|show',
  'settings list',
  'engine select',
  'open',
]

function commandIndex(opts: { all?: boolean } = {}): string {
  return (opts.all ? FULL_COMMAND_INDEX : OPERATOR_COMMAND_INDEX).join('\n')
}

function renderTopLevelHelp(opts: { all?: boolean } = {}): string {
  if (opts.all) {
    const longest = Math.max(...cli.commands.map(command => command.rawName.length))
    return [
      `aiworker/${packageJson.version}`,
      '',
      'Usage:',
      '  $ aiworker <command> [options]',
      '',
      'Commands:',
      ...cli.commands.map(command => `  ${command.rawName.padEnd(longest)}  ${command.description}`),
      '',
      'Options:',
      '  -h, --help     Display this message',
      '  -v, --version  Display version number',
      '',
      'Run `aiworker commands` for the compact operator command index.',
    ].join('\n')
  }

  return [
    `aiworker/${packageJson.version}`,
    '',
    'Usage:',
    '  $ aiworker <command> [options]',
    '',
    'Primary operator commands:',
    ...OPERATOR_COMMAND_INDEX.slice(1).map(line => line ? `  ${line}` : ''),
    '',
    'Options:',
    '  -h, --help     Display this message',
    '  -v, --version  Display version number',
    '  --all          Show every registered command',
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
    if (isTopLevelHelpRequest(argv)) {
      process.stdout.write(`${renderTopLevelHelp({ all: argv.includes('--all') })}\n`)
      return 0
    }
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

function isTopLevelHelpRequest(argv: string[]): boolean {
  const args = argv.slice(2)
  return args.some(arg => arg === '--help' || arg === '-h') && args.every(arg => arg.startsWith('-'))
}

if (import.meta.main)
  process.exit(await runCli(process.argv))
