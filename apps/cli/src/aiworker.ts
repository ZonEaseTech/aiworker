#!/usr/bin/env bun
import type { HostRuntime, LocalExecutor, LocalWorkerRuntime, SoulAppRegistryContext } from '@zonease/aiworker-host-runtime'
import type { SoulDescriptorV1 } from '@zonease/aiworker-soul-protocol'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { SoulDiscovery, SoulValidationIssue } from '../../../packages/soul-app-sdk/src/index'
import type { UpdateCliOptions, UpdateCommandName } from './updater'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { redactEngineBridgeValue } from '@zonease/aiworker-engine-bridge'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import {
  createHostRuntime,
  getWorkerEnv,
  readFrozenSessionEngine,
  resolveLocalCliEngine,
  scanLocalEngines,
} from '@zonease/aiworker-host-runtime'
import {
  parseSoulDescriptorV1,
  SOUL_DESCRIPTOR_OUTPUT_PATH,
  soulAppIdSchema,
} from '@zonease/aiworker-soul-protocol'
import {
  closeWorkerDb,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listEngineInvocations,
  listFiles,
  listSessions,
  listSettings,
  listWorkers,
  listWorkspaces,
  runWorkerMigrations,
  setSetting,
  updateSession,
} from '@zonease/aiworker-storage-sqlite/worker'
import cac from 'cac'

import consola from 'consola'
import packageJson from '../package.json' with { type: 'json' }
import {
  createScaffoldPackageJson,
  createScaffoldTsconfig,
  scaffoldBuildScriptTs,
  scaffoldClaudeCodeMcpConfig,
  scaffoldCodexMcpConfig,
  scaffoldPrompt,
  scaffoldReadme,
  scaffoldSkill,
  scaffoldSoulConfigTs,
  scaffoldValidateScriptTs,
  scaffoldWorkspaceAgents,
  scaffoldWorkspaceGitignore,
  scaffoldWorkspaceReadme,
  writeScaffoldFile,
} from './scaffold'
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

type SoulAppSdkModule = typeof import('../../../packages/soul-app-sdk/src/index')

const SOUL_APP_SDK_PACKAGE = '@zonease/aiworker-soul-app-sdk'
const SOURCE_SOUL_APP_SDK_ROOT = path.resolve(import.meta.dir, '../../../packages/soul-app-sdk')

let soulAppSdk: Promise<SoulAppSdkModule> | null = null

interface RuntimeOptions {
  worker?: string
}

interface SessionContinuationCommandOptions {
  input?: string
  model?: string
  reasoning?: string
  session?: string
  worker?: string
}

interface SessionContinuationContext {
  engineCommand: string
  engineId: string
  input: string
  metadata: Record<string, unknown>
  runtime: LocalWorkerRuntime
  sessionId: string
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
const OFFICIAL_APP_DESCRIPTOR_FILENAME = 'dist/soul.descriptor.json'

export function resolveCliOfficialAppsRoot(moduleDir = CLI_MODULE_DIR): string | undefined {
  const packaged = path.resolve(moduleDir, 'official-apps')
  if (existsSync(path.join(packaged, 'aiworker-freeform', OFFICIAL_APP_DESCRIPTOR_FILENAME)))
    return packaged
  const source = path.resolve(moduleDir, '../../../souls')
  if (existsSync(path.join(source, 'aiworker-freeform', OFFICIAL_APP_DESCRIPTOR_FILENAME)))
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

function selectedCliEngineId(): string {
  const setting = listSettings().find(setting => setting.key === 'engine.default')
  const value = setting?.valueJson
  return value && typeof value.engine === 'string' && value.engine.trim().length > 0 ? value.engine.trim() : 'codex'
}

function resolveCliEngineMetadata(engineId: string): { engineCommand: string, engineId: string, engineName: string, executionMode: 'local-cli' } {
  return resolveLocalCliEngine({
    engineId,
    engines: scanLocalEngines(),
  })
}

function resolveInvocationEngineMetadata(sessionMetadata: Record<string, unknown> | null | undefined): { engineCommand: string, engineId: string, executionMode: 'local-cli' } {
  const frozen = readFrozenSessionEngine(sessionMetadata)
  if (frozen?.executionMode === 'local-cli') {
    if (frozen.engineCommand) {
      return {
        engineCommand: frozen.engineCommand,
        engineId: frozen.engineId,
        executionMode: 'local-cli',
      }
    }
    return resolveCliEngineMetadata(frozen.engineId)
  }
  const selectedEngineId = selectedCliEngineId()
  return resolveCliEngineMetadata(selectedEngineId)
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
  process.stdout.write(`${redactCliInspectOutput(JSON.stringify(redactEngineBridgeValue(value), null, 2))}\n`)
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
  const { bootstrapWorkerApp, localApiExposureWarning } = await import('@zonease/aiworker-host-daemon/bootstrap')
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
  const exposureWarning = localApiExposureWarning(server.hostname ?? '127.0.0.1', env.AIWORKER_LOCAL_TOKEN)
  if (exposureWarning)
    console.warn(exposureWarning)
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
  process.stdout.write(`${redactCliInspectOutput(lines.slice(-(opts.tail ?? 80)).join('\n'))}\n`)
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

async function startSessionCommand(opts: { capability?: string, context?: string, engine?: string, input?: string, model?: string, reasoning?: string, title?: string, worker?: string, workspace?: string }): Promise<void> {
  const paths = await ensureDb()
  const runtime = await ensureRuntime({ worker: opts.worker })
  const workspaceId = requireText(opts.workspace, 'workspace')
  const workspace = getWorkspace(workspaceId)
  if (!workspace || workspace.workerId !== runtime.workerId)
    throw new Error(`workspace not found for ${runtime.workerId}: ${workspaceId}`)
  const capabilityId = requireText(opts.capability, 'capability')
  const host = createHost(paths)
  const capability = host.requireCapabilityForWorker(runtime.workerId, capabilityId)
  const selectedEngineId = opts.engine?.trim() || selectedCliEngineId()
  const engineMetadata = {
    ...resolveCliEngineMetadata(selectedEngineId),
    ...cliEngineOverrideMetadata(opts),
  }
  const session = await runtime.createSession({
    workspaceId,
    capabilityId: capability.id,
    title: requireText(opts.title, 'title'),
    context: opts.context ?? '',
    metadata: engineMetadata,
  })
  const input = requireText(opts.input, 'input')
  printJson(await runtime.startInvocation({
    sessionId: session.id,
    input,
    engineId: engineMetadata.engineId,
    engineCommand: engineMetadata.engineCommand,
    metadata: {
      ...(session.metadataJson ?? engineMetadata),
      ...cliEngineOverrideMetadata(opts),
    },
  }))
}

async function resolveSessionContinuationContext(opts: SessionContinuationCommandOptions): Promise<SessionContinuationContext> {
  await ensureDb()
  const sessionId = requireText(opts.session, 'session')
  const session = getSession(sessionId)
  if (!session)
    throw new Error(`session not found: ${sessionId}`)
  const runtime = await ensureRuntime({ worker: opts.worker ?? session.workerId })
  const engineMetadata = resolveInvocationEngineMetadata(session.metadataJson)
  const frozen = readFrozenSessionEngine(session.metadataJson)
  const currentSession = frozen?.executionMode === 'local-cli' && frozen.engineCommand !== engineMetadata.engineCommand
    ? updateSession({
        id: session.id,
        metadataJson: {
          ...(session.metadataJson ?? {}),
          ...engineMetadata,
        },
      })
    : session
  const metadata = {
    ...(currentSession.metadataJson ?? {}),
    ...cliEngineOverrideMetadata(opts),
  }
  return {
    engineCommand: engineMetadata.engineCommand,
    engineId: engineMetadata.engineId,
    input: requireText(opts.input, 'input'),
    metadata,
    runtime,
    sessionId,
  }
}

async function invokeSessionCommand(opts: SessionContinuationCommandOptions): Promise<void> {
  const continuation = await resolveSessionContinuationContext(opts)
  printJson(await continuation.runtime.startInvocation({
    sessionId: continuation.sessionId,
    input: continuation.input,
    engineId: continuation.engineId,
    engineCommand: continuation.engineCommand,
    metadata: continuation.metadata,
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
  printJson({
    invocations: listEngineInvocations(id).sort((left, right) => left.seq - right.seq),
    session: getSession(id),
  })
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
  process.stdout.write(redactCliInspectOutput(await runtime.files(workspaceId).read(filePath)))
}

function redactCliInspectOutput(value: string): string {
  const redacted = redactEngineBridgeValue(value)
  return typeof redacted === 'string' ? redacted : ''
}

async function listAppsCommand(): Promise<void> {
  const paths = await ensureDb()
  printJson({ apps: createHost(paths).listApps() })
}

async function showAppCommand(id: string): Promise<void> {
  const paths = await ensureDb()
  printJson({ app: createHost(paths).getApp(id) })
}

async function installAppCommand(descriptorPath: string): Promise<void> {
  const paths = await ensureDb()
  printJson({ app: await createHost(paths).installAppFromPath(descriptorPath) })
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
  printJson({ appId: id, descriptor: app?.descriptor ?? null, permissions: [] })
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

  const sourceFiles = [
    'package.json',
    'tsconfig.json',
    'README.md',
    'soul.config.ts',
    'scripts/build.ts',
    'scripts/validate.ts',
    'product/capabilities/default/prompt.md',
    'engine/workspace/AGENTS.md',
    'engine/workspace/CLAUDE.md',
    'engine/workspace/README.md',
    'engine/workspace/.gitignore',
    'engine/skills/default/SKILL.md',
    'engine/mcp/codex/config.toml',
    'engine/mcp/claude-code/.mcp.json',
  ]
  writeScaffoldFile(path.join(targetDir, 'package.json'), `${JSON.stringify(createScaffoldPackageJson(appId), null, 2)}\n`)
  writeScaffoldFile(path.join(targetDir, 'tsconfig.json'), `${JSON.stringify(createScaffoldTsconfig(), null, 2)}\n`)
  writeScaffoldFile(path.join(targetDir, 'README.md'), scaffoldReadme(appId))
  writeScaffoldFile(path.join(targetDir, 'soul.config.ts'), scaffoldSoulConfigTs(appId))
  writeScaffoldFile(path.join(targetDir, 'scripts/build.ts'), scaffoldBuildScriptTs())
  writeScaffoldFile(path.join(targetDir, 'scripts/validate.ts'), scaffoldValidateScriptTs())
  writeScaffoldFile(path.join(targetDir, 'product/capabilities/default/prompt.md'), scaffoldPrompt(appId))
  writeScaffoldFile(path.join(targetDir, 'engine/workspace/AGENTS.md'), scaffoldWorkspaceAgents(appId))
  writeScaffoldFile(path.join(targetDir, 'engine/workspace/CLAUDE.md'), '@AGENTS.md\n')
  writeScaffoldFile(path.join(targetDir, 'engine/workspace/README.md'), scaffoldWorkspaceReadme(appId))
  writeScaffoldFile(path.join(targetDir, 'engine/workspace/.gitignore'), scaffoldWorkspaceGitignore())
  writeScaffoldFile(path.join(targetDir, 'engine/skills/default/SKILL.md'), scaffoldSkill(appId))
  writeScaffoldFile(path.join(targetDir, 'engine/mcp/codex/config.toml'), scaffoldCodexMcpConfig())
  writeScaffoldFile(path.join(targetDir, 'engine/mcp/claude-code/.mcp.json'), scaffoldClaudeCodeMcpConfig())

  ensureScaffoldSdkLink(targetDir)
  const { buildSoul } = await loadSoulAppSdk()
  const build = await buildSoul(targetDir)
  const descriptorFile = portableRelativePath(targetDir, build.outputPath)

  printJson({
    appId,
    descriptorPath: build.outputPath,
    files: [...sourceFiles, descriptorFile],
    next: [
      `cd ${targetDir}`,
      'bun run build',
      'aiworker app validate .',
      `aiworker app validate ${descriptorFile}`,
      'aiworker app smoke .',
    ],
    path: targetDir,
  })
}

async function validateAppCommand(inputPath: string): Promise<void> {
  const result = await validateAppAtPath(inputPath)
  printJson({ validation: validationReport(result) })
  if (result.status !== 'pass')
    process.exitCode = 1
}

async function smokeAppCommand(inputPath: string): Promise<void> {
  const validation = await validateAppAtPath(inputPath)
  if (validation.status !== 'pass') {
    printJson({ smoke: { status: 'fail', validation: validationReport(validation) } })
    process.exitCode = 1
    return
  }
  const descriptor = validation.descriptor
  if (!descriptor || !validation.descriptorPath || !validation.rootDir)
    throw new Error('Soul descriptor validation passed without a parsed descriptor.')

  const smoke = smokeDescriptorAssets(validation.rootDir, validation.descriptorPath, descriptor)
  printJson({
    smoke: {
      appId: validation.appId,
      descriptorPath: validation.descriptorPath,
      descriptorStatus: 'pass',
      engineAssets: smoke.engineAssets,
      sdkValidation: validation.sdkStatus ?? 'skipped',
      status: 'pass',
      workbench: smoke.workbench,
    },
  })
}

interface AppValidationIssue {
  code: string
  message: string
  path?: string
  severity: 'error'
}

interface AppValidationResult {
  appId: string | null
  descriptor?: SoulDescriptorV1
  descriptorIssues: AppValidationIssue[]
  descriptorPath: string | null
  discovery: SoulDiscovery | null
  rootDir: string | null
  sdkIssues: AppValidationIssue[]
  sdkStatus: 'invalid' | 'valid' | null
  source: 'descriptor' | 'directory' | 'missing'
  status: 'fail' | 'pass'
  version: string | null
}

async function validateAppAtPath(inputPath: string): Promise<AppValidationResult> {
  const resolved = resolveAppDescriptorTarget(inputPath)
  if (!resolved) {
    return {
      appId: null,
      descriptorIssues: [{
        code: 'missing_descriptor',
        message: `Soul descriptor not found. Pass a Soul directory or ${SOUL_DESCRIPTOR_OUTPUT_PATH}.`,
        severity: 'error',
      }],
      descriptorPath: null,
      discovery: null,
      rootDir: null,
      sdkIssues: [],
      sdkStatus: null,
      source: 'missing',
      status: 'fail',
      version: null,
    }
  }

  const sdkValidation = resolved.source === 'directory'
    ? await (await loadSoulAppSdk()).validateSoul(resolved.rootDir)
    : null
  const descriptorResult = resolved.descriptorPath && existsSync(resolved.descriptorPath)
    ? readSoulDescriptorAtPath(resolved.descriptorPath)
    : { descriptor: undefined, issues: [] }
  const sdkIssues = sdkValidation ? normalizeSdkIssues(sdkValidation.issues) : []
  const descriptorIssues = descriptorResult.issues
  const status = sdkIssues.length === 0 && descriptorIssues.length === 0 ? 'pass' : 'fail'

  return {
    appId: descriptorIdentityString(descriptorResult.descriptor, 'appId'),
    descriptor: descriptorResult.descriptor,
    descriptorIssues,
    descriptorPath: resolved.descriptorPath,
    discovery: sdkValidation?.discovery ?? null,
    rootDir: resolved.rootDir,
    sdkIssues,
    sdkStatus: sdkValidation?.status ?? null,
    source: resolved.source,
    status,
    version: descriptorIdentityString(descriptorResult.descriptor, 'version'),
  }
}

function validationReport(result: AppValidationResult) {
  return {
    appId: result.appId,
    descriptorIssues: result.descriptorIssues,
    descriptorPath: result.descriptorPath,
    discovery: result.discovery,
    rootDir: result.rootDir,
    sdkIssues: result.sdkIssues,
    sdkStatus: result.sdkStatus,
    source: result.source,
    status: result.status,
    version: result.version,
  }
}

function resolveAppDescriptorTarget(inputPath: string): { descriptorPath: string | null, rootDir: string, source: 'descriptor' | 'directory' } | null {
  const resolved = path.resolve(inputPath)
  if (!existsSync(resolved))
    return null
  const stats = statSync(resolved)
  if (stats.isDirectory()) {
    return {
      descriptorPath: path.join(resolved, SOUL_DESCRIPTOR_OUTPUT_PATH),
      rootDir: resolved,
      source: 'directory',
    }
  }
  if (!stats.isFile())
    return null
  return {
    descriptorPath: resolved,
    rootDir: descriptorRootForPath(resolved),
    source: 'descriptor',
  }
}

function readSoulDescriptorAtPath(descriptorPath: string): { descriptor?: SoulDescriptorV1, issues: AppValidationIssue[] } {
  try {
    return {
      descriptor: parseSoulDescriptorV1(JSON.parse(readFileSync(descriptorPath, 'utf8'))),
      issues: [],
    }
  }
  catch (error) {
    return {
      issues: normalizeDescriptorError(error),
    }
  }
}

function descriptorIdentityString(descriptor: SoulDescriptorV1 | undefined, key: string): string | null {
  const value = descriptor?.identity[key]
  return typeof value === 'string' ? value : null
}

function smokeDescriptorAssets(rootDir: string, descriptorPath: string, descriptor: SoulDescriptorV1): { engineAssets: 'pass', workbench: 'pass' } {
  const expectedDescriptorPath = path.join(rootDir, SOUL_DESCRIPTOR_OUTPUT_PATH)
  if (path.resolve(descriptorPath) !== path.resolve(expectedDescriptorPath))
    throw new Error(`Soul descriptor must be located at ${SOUL_DESCRIPTOR_OUTPUT_PATH}.`)
  assertDescriptorFile(rootDir, descriptor.workbench.entry, 'workbench entry')
  if (descriptor.engine.workspaceAssets)
    assertDescriptorDirectory(rootDir, descriptor.engine.workspaceAssets.source, 'workspace assets')
  if (descriptor.engine.skills)
    assertDescriptorDirectory(rootDir, descriptor.engine.skills.source, 'skills')
  for (const [target, mcp] of Object.entries(descriptor.engine.mcp?.targets ?? {}))
    assertDescriptorFile(rootDir, mcp.file, `${target} native MCP file`)
  return { engineAssets: 'pass', workbench: 'pass' }
}

function assertDescriptorFile(rootDir: string, ref: string, label: string): void {
  const filePath = path.join(rootDir, ...safeDescriptorRefSegments(ref))
  if (!existsSync(filePath) || !statSync(filePath).isFile())
    throw new Error(`Missing ${label}: ${ref}`)
}

function assertDescriptorDirectory(rootDir: string, ref: string, label: string): void {
  const dirPath = path.join(rootDir, ...safeDescriptorRefSegments(ref))
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory())
    throw new Error(`Missing ${label}: ${ref}`)
}

function safeDescriptorRefSegments(ref: string): string[] {
  const segments = ref.split('/')
  if (segments.length === 0 || segments.some(segment => !segment || segment === '.' || segment === '..'))
    throw new Error(`Unsafe descriptor ref: ${ref}`)
  return segments
}

function descriptorRootForPath(descriptorPath: string): string {
  const descriptorDir = path.dirname(descriptorPath)
  return path.basename(descriptorDir) === 'dist' ? path.dirname(descriptorDir) : descriptorDir
}

function normalizeSdkIssues(issues: SoulValidationIssue[]): AppValidationIssue[] {
  return issues.map(issue => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
    severity: 'error',
  }))
}

function normalizeDescriptorError(error: unknown): AppValidationIssue[] {
  const zodIssues = error && typeof error === 'object' && Array.isArray((error as { issues?: unknown }).issues)
    ? (error as { issues: Array<{ message?: unknown, path?: unknown }> }).issues
    : null
  if (zodIssues) {
    return zodIssues.map(issue => ({
      code: 'invalid_descriptor',
      message: typeof issue.message === 'string' ? issue.message : 'Descriptor is invalid.',
      path: descriptorIssuePath(issue.path),
      severity: 'error',
    }))
  }
  return [{
    code: 'invalid_descriptor',
    message: error instanceof Error ? error.message : String(error),
    severity: 'error',
  }]
}

function descriptorIssuePath(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0)
    return undefined
  return value.map(segment => String(segment)).join('.')
}

function portableRelativePath(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}

async function loadSoulAppSdk(): Promise<SoulAppSdkModule> {
  soulAppSdk ??= import(SOUL_APP_SDK_PACKAGE)
    .catch(async () => import('../../../packages/soul-app-sdk/src/index')) as Promise<SoulAppSdkModule>
  return soulAppSdk
}

function ensureScaffoldSdkLink(targetDir: string): void {
  if (!existsSync(SOURCE_SOUL_APP_SDK_ROOT))
    return
  const linkPath = path.join(targetDir, 'node_modules/@zonease/aiworker-soul-app-sdk')
  if (existsSync(linkPath))
    return
  mkdirSync(path.dirname(linkPath), { recursive: true })
  symlinkSync(SOURCE_SOUL_APP_SDK_ROOT, linkPath, 'dir')
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
  cli.command('app install <descriptor>', 'install a local Soul descriptor').action(installAppCommand)
  cli.command('app enable <id>', 'enable an installed Soul App').action(enableAppCommand)
  cli.command('app disable <id>', 'disable an installed Soul App').action(disableAppCommand)
  cli.command('app doctor <id>', 'run static Soul App healthcheck').action(doctorAppCommand)
  cli.command('app permissions <id>', 'show declared Soul App permissions').action(permissionsAppCommand)
  cli.command('app bootstrap <scope>', 'install and enable first-party Soul Apps by shortcut scope').action(bootstrapAppCommand)
  cli.command('app create <id>', 'scaffold a descriptor-only SDK Soul').option('--dir <path>', 'target directory').action(createAppScaffoldCommand)
  cli.command('app validate <path>', 'validate a Soul directory or dist/soul.descriptor.json').action(validateAppCommand)
  cli.command('app smoke <path>', 'run descriptor-only Soul App smoke checks').action(smokeAppCommand)

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
  cli.command('capability list', 'list app-declared capabilities').option('--soul <id>', 'Soul id').action(async (opts: { soul?: string }) => {
    const paths = await ensureDb()
    const capabilities = createHost(paths).listCapabilities(opts.soul)
    printJson({ capabilities })
  })

  cli.command('workspace create', 'create a worker workspace').option('--name <text>', 'workspace name').option('--type <id>', 'workspace type').option('--worker <id>', 'worker id').action(createWorkspaceCommand)
  cli.command('workspace list', 'list worker workspaces').option('--worker <id>', 'worker id').action(listWorkspaceCommand)
  cli.command('workspace show <id>', 'show one workspace').action(async (id: string) => {
    await ensureDb()
    printJson({ workspace: getWorkspace(id) })
  })

  cli.command('session start', 'create a workspace session and first invocation')
    .option('--workspace <id>', 'workspace id')
    .option('--capability <id>', 'capability id')
    .option('--title <text>', 'session title')
    .option('--context <text>', 'session context')
    .option('--input <text>', 'initial invocation input')
    .option('--engine <id>', 'engine id for this new session')
    .option('--model <id>', 'Codex model override')
    .option('--reasoning <effort>', 'Codex reasoning effort override')
    .option('--worker <id>', 'worker id')
    .action(startSessionCommand)
  cli.command('session list', 'list sessions').option('--workspace <id>', 'workspace id').action(listSessionCommand)
  cli.command('session show <id>', 'show one session').action(showSession)
  cli.command('session invoke', 'create a session-level engine invocation').option('--session <id>', 'session id').option('--input <text>', 'invocation input').option('--model <id>', 'Codex model override').option('--reasoning <effort>', 'Codex reasoning effort override').option('--worker <id>', 'worker id').action(invokeSessionCommand)

  cli.command('files list', 'list workspace files').option('--workspace <id>', 'workspace id').action(listWorkspaceFiles)
  cli.command('files show <path>', 'print workspace file').option('--workspace <id>', 'workspace id').option('--worker <id>', 'worker id').action(showFile)

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
  cli.command('commands', 'show command index').option('--all', 'show advanced and diagnostics commands').action((opts: { all?: boolean }) => {
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
  'session start|invoke|list|show',
  '',
  'Run `aiworker commands --all` for authoring and diagnostics commands.',
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
  'session start|invoke|list|show',
  'capability list',
  'files list|show',
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
    consola.error(redactCliInspectOutput(error instanceof Error ? error.message : String(error)))
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
