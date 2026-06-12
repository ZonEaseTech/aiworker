#!/usr/bin/env bun
import type { SoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import type { SoulDiscovery, SoulValidationIssue } from '@zonease/aiworker-soul-sdk'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { WorkerCheckInResponse } from '@zonease/aiworker-worker-control-protocol'
import type { CheckInInput } from '@zonease/aiworker-worker-daemon/provision'
import type { LocalExecutor, LocalWorkerRuntime, SoulAppRegistryContext, WorkerOrchestrator } from '@zonease/aiworker-worker-runtime'
import type { OfficialSoulAppDefinition, OfficialSoulCatalogView } from '@zonease/aiworker-worker-runtime/internal/official-soul-catalog'
import type { FleetIndex, FleetWorker } from './fleet'
import type { UpdateCliOptions, UpdateCommandName } from './updater'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { renderText, runChecks } from '@zonease/aiworker-cli-doctor'
import { redactEngineBridgeValue } from '@zonease/aiworker-engine-bridge'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import {
  mintWorkerId,
  parseSoulDescriptorV1,
  SOUL_DESCRIPTOR_OUTPUT_PATH,
  soulAppIdSchema,
} from '@zonease/aiworker-soul-descriptor'
import {
  closeWorkerDb,
  deleteSession,
  deleteWorker,
  deleteWorkerConfigValue,
  deleteWorkspace,
  getEngineInvocation,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listEngineInvocations,
  listFiles,
  listSessionEvents,
  listSessions,
  listSettings,
  listWorkerConfigValues,
  listWorkers,
  listWorkspaces,
  resolveSingleActiveWorker,
  runWorkerMigrations,
  setSetting,
  updateSession,
  updateWorkspace,
  upsertWorker,
  upsertWorkerConfigValue,
} from '@zonease/aiworker-storage-sqlite/worker'
import { checkInToHost, persistWorkerAccess } from '@zonease/aiworker-worker-daemon/provision'
// Worker-scoped engine/execution-mode settings live in the daemon local-settings store.
// Importing the settings helpers (not the daemon app entry) keeps the secret-ref guard in
// `saveLocalSettings` as the single writer — the CLI never reimplements the secret check.
import { loadLocalSettings, readLocalEngineSettings, saveLocalSettings } from '@zonease/aiworker-worker-daemon/settings'
import {
  createWorkerOrchestrator,
  getWorkerEnv,
  inspectLocalEngineCredential,
  LOCAL_ENGINE_DEFINITIONS,
  readFrozenSessionEngine,
  resolveLocalCliEngine,
  scanLocalEngines,
} from '@zonease/aiworker-worker-runtime'
import {
  ALL_FIRST_PARTY_OFFICIAL_SOUL_APPS,
  DEV_SAMPLING_OFFICIAL_SOUL_APPS,
  OFFICIAL_SOUL_APPS,
  SHIPPED_OFFICIAL_SOUL_APPS,
} from '@zonease/aiworker-worker-runtime/internal/official-soul-catalog'

import cac from 'cac'
import consola from 'consola'
import packageJson from '../package.json' with { type: 'json' }
import { buildWorkerChecks } from './doctor-checks'
import {
  adoptLegacyHome,
  allocatePort,
  buildLocalPaths,
  FLEET_ADOPTED_HOME,
  FLEET_DEFAULT_BASE_PORT,
  fleetWorkerPaths,
  readFleet,
  resolveDefault,
  resolveTargets,
  setDefault,
  upsertFleetWorker,
  workerHomeDir,
  writeFleet,
} from './fleet'
import { isOfficialFreeformDescriptorFile, OFFICIAL_FREEFORM_APP_ID, parseOfficialFreeformDescriptorJson } from './official-freeform-descriptor'
import {
  createScaffoldPackageJson,
  createScaffoldTsconfig,
  scaffoldBuildScriptTs,
  scaffoldClaudeCodeMcpConfig,
  scaffoldCodexMcpConfig,
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
  isManagedWorkerCliCommand,
  isManagedWorkerDaemonCommand,
  parseUpdateCommandOptions,
  readDailyUpdateNoticeState,
  resolveReleaseTarget,
} from './updater'

export interface LocalPaths {
  home: string
  dbPath: string
  workersRoot: string
  pidFile: string
  daemonMetaFile: string
  logFile: string
}

type SoulAppSdkModule = typeof import('../../../packages/soul-sdk/src/index')

const SOUL_APP_SDK_PACKAGE = '@zonease/aiworker-soul-sdk'
const SOURCE_SOUL_APP_SDK_ROOT = path.resolve(import.meta.dir, '../../../packages/soul-sdk')

let soulAppSdk: Promise<SoulAppSdkModule> | null = null

interface RuntimeOptions {
  requireEnabledApp?: boolean
  worker?: string
}

interface WorkerConfigSetCommandOptions {
  checksum?: string
  disabled?: boolean
  kind?: string
  optionsJson?: string
  sourceRef?: string
  target?: string
}

interface SessionContinuationCommandOptions {
  input?: string
  model?: string
  reasoning?: string
  session?: string
  worker?: string
}

interface WorkspaceProjectionRefreshCommandOptions {
  target?: string
}

export interface ProvisionCommandInput {
  host: string
  token: string
}

interface SessionContinuationContext {
  engineCommand: string
  engineId: string
  input: string
  metadata: Record<string, unknown>
  runtime: LocalWorkerRuntime
  sessionId: string
}

type CliProjectionEngineTarget = 'claude-code' | 'codex'

export interface DaemonStartedResult {
  host: string
  logFile: string
  pid: number
  port: number
  started: true
  url: string
}

interface DaemonReuseResult {
  actual: {
    host?: string
    port?: number
    url: null | string
  }
  logFile: string
  message: string
  pid: number
  requested: {
    host?: string
    port?: number
  }
  started: false
  url: null | string
}

type DaemonStartResult = DaemonStartedResult | DaemonReuseResult
export type DaemonStarter = (opts: { host?: string, port?: number }, paths: LocalPaths) => Promise<DaemonStartedResult>
type DaemonForegroundRunner = (opts?: { host?: string, port?: number }) => Promise<void>

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
const INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV = 'AIWORKER_INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW'

let daemonStarterForTest: DaemonStarter | null = null
let officialSoulDistBuilderForTest: (() => Promise<void>) | null = null
let officialSoulDescriptorsReadyForTest: (() => boolean) | null = null
let daemonForegroundForTest: DaemonForegroundRunner | null = null
let provisionCheckInForTest: ((input: CheckInInput) => Promise<WorkerCheckInResponse>) | null = null
let workerCreateSelectorForTest: ((candidates: readonly WorkerCreateCandidate[]) => Promise<string>) | null = null
// Tests cannot make their own `bun` test-runner process answer `ps` with a managed-daemon
// command, so the cmdline-verify in `daemonStatus` needs an injectable reader. Mirrors the
// `daemonStarterForTest` precedent; reset in `afterEach`.
let readProcessCommandForTest: ((pid: number) => null | string) | null = null
// The real startDaemonProcess polls a freshly-spawned daemon's /health; tests that drive
// the real spawn body (vs. the daemonStarter fake) inject the readiness result here.
let daemonHealthWaiterForTest: ((url: string) => Promise<{ healthy: boolean }>) | null = null

export interface WorkerCreateCandidate {
  id: string
  name?: string
}

export function __setDaemonStarterForTest(starter: DaemonStarter | null): void {
  daemonStarterForTest = starter
}

export function __setReadProcessCommandForTest(reader: ((pid: number) => null | string) | null): void {
  readProcessCommandForTest = reader
}

export function __setDaemonHealthWaiterForTest(waiter: ((url: string) => Promise<{ healthy: boolean }>) | null): void {
  daemonHealthWaiterForTest = waiter
}

export function __setOfficialSoulDistBuilderForTest(builder: (() => Promise<void>) | null): void {
  officialSoulDistBuilderForTest = builder
}

export function __setOfficialSoulDescriptorsReadyForTest(check: (() => boolean) | null): void {
  officialSoulDescriptorsReadyForTest = check
}

export function __setDaemonForegroundForTest(runner: DaemonForegroundRunner | null): void {
  daemonForegroundForTest = runner
}

export function __setProvisionCheckInForTest(
  checkIn: ((input: CheckInInput) => Promise<WorkerCheckInResponse>) | null,
): void {
  provisionCheckInForTest = checkIn
}

export function __setWorkerCreateSelectorForTest(
  selector: ((candidates: readonly WorkerCreateCandidate[]) => Promise<string>) | null,
): void {
  workerCreateSelectorForTest = selector
}

// Pure dedup merge of the official catalog candidates with installed app candidates.
// Official first, installed (not already official) after; dedup by id. Kept pure so the
// union contract is unit-testable without TTY/DB, and so a future slice can feed real
// installed expert Souls in without changing the merge.
export function workerCreateCandidates(
  official: readonly { id: string }[],
  installed: readonly WorkerCreateCandidate[],
): WorkerCreateCandidate[] {
  const seen = new Set<string>()
  const candidates: WorkerCreateCandidate[] = []
  for (const definition of official) {
    if (seen.has(definition.id))
      continue
    seen.add(definition.id)
    candidates.push({ id: definition.id })
  }
  for (const app of installed) {
    if (seen.has(app.id))
      continue
    seen.add(app.id)
    candidates.push({ id: app.id, name: app.name })
  }
  return candidates
}

async function resolveWorkerCreateApp(optApp?: string): Promise<string> {
  const provided = optApp?.trim()
  if (provided)
    return provided

  // Live candidates = the official first-party Souls that `worker create` bootstraps into
  // the new worker home. Cross-home installed expert Souls in the selector require the
  // distribution-slice index linkage (see open questions); the merge stays generic so they
  // flow in later without changing this resolver.
  const candidates = workerCreateCandidates(ALL_FIRST_PARTY_OFFICIAL_SOUL_APPS, [])

  if (workerCreateSelectorForTest)
    return workerCreateSelectorForTest(candidates)

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `worker create needs a Soul but no interactive terminal was detected. Pass --app <id>. Available Souls: ${candidates.map(candidate => candidate.id).join(', ')}.`,
    )
  }

  return promptWorkerCreateApp(candidates)
}

async function promptWorkerCreateApp(candidates: readonly WorkerCreateCandidate[]): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write('Select a Soul for the new Worker:\n')
    candidates.forEach((candidate, index) => {
      const label = candidate.name ? `${candidate.id} (${candidate.name})` : candidate.id
      process.stdout.write(`  ${index + 1}. ${label}\n`)
    })
    for (;;) {
      const answer = (await rl.question(`Enter 1-${candidates.length}: `)).trim()
      const choice = Number.parseInt(answer, 10)
      if (Number.isInteger(choice) && choice >= 1 && choice <= candidates.length)
        return candidates[choice - 1]!.id
      process.stdout.write(`Invalid choice: ${answer || '<empty>'}\n`)
    }
  }
  finally {
    rl.close()
  }
}

export function buildProvisionEnv(input: ProvisionCommandInput): {
  AIWORKER_HOST_URL: string
  AIWORKER_PROVISION_TOKEN: string
} {
  return {
    AIWORKER_HOST_URL: input.host,
    AIWORKER_PROVISION_TOKEN: input.token,
  }
}

export function redactProvisionCommandForLog(argv: string[]): string {
  const redacted = argv.slice()
  for (let i = 0; i < redacted.length; i++) {
    const arg = redacted[i] ?? ''
    if (arg === '--token' && i + 1 < redacted.length) {
      redacted[i + 1] = '[REDACTED]'
      i++
      continue
    }
    if (arg.startsWith('--token='))
      redacted[i] = '--token=[REDACTED]'
  }
  return redacted.join(' ')
}

// Test-only: seed an active worker row (with full orchestrator-populated
// engine/metadata) into the current home DB, the way the old option-based
// `worker create` did. The public `worker create` is now fleet-aware (it builds a
// separate per-worker home), so fixtures that need a worker in the *test* home
// use this seam instead. Mirrors the `__setDaemonStarterForTest` precedent.
export async function __seedWorkerForTest(input: { app: string, id?: string, name?: string }): Promise<{ appId: string, id: string }> {
  const paths = await ensureDb()
  const created = await createHost(paths).createSoulWorker({
    appId: input.app,
    id: input.id,
    name: input.name ?? input.id ?? input.app,
  })
  return { appId: created.worker.appId, id: created.worker.id }
}

interface CliResourceResolutionOptions {
  executableDir?: string
}

function cliExecutableDirs(): string[] {
  return cliExecutablePaths().map(value => path.dirname(value))
}

function cliExecutablePaths(): string[] {
  return uniqueTruthy([
    resolveArgv1(process.argv[1]),
    resolveArgv1(process.argv[0]),
    resolveArgv1(process.execPath),
  ].filter((value): value is string => typeof value === 'string' && existsSync(value)))
}

function packagedResourceRoots(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): string[] {
  return uniqueTruthy([
    moduleDir,
    options.executableDir,
    ...cliExecutableDirs(),
  ])
}

export function resolveCliOfficialAppsRoot(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): string | undefined {
  const packaged = resolveCliPackagedOfficialAppsRoot(moduleDir, options)
  if (packaged)
    return packaged
  const source = path.resolve(moduleDir, '../../../souls')
  if (existsSync(path.join(source, 'aiworker-freeform', OFFICIAL_APP_DESCRIPTOR_FILENAME)))
    return source
  return undefined
}

function resolveCliPackagedOfficialAppsRoot(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): string | undefined {
  for (const root of packagedResourceRoots(moduleDir, options)) {
    const packaged = path.resolve(root, 'official-apps')
    if (existsSync(path.join(packaged, 'aiworker-freeform', OFFICIAL_APP_DESCRIPTOR_FILENAME)))
      return packaged
  }
  return undefined
}

export function inspectCliOfficialAppsResource(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): {
  officialAppsReady: boolean
  officialAppsRoot: null | string
  officialFreeformDescriptorReady: boolean
} {
  const officialAppsRoot = resolveCliOfficialAppsRoot(moduleDir, options) ?? null
  const descriptorPath = officialAppsRoot
    ? path.join(officialAppsRoot, 'aiworker-freeform', OFFICIAL_APP_DESCRIPTOR_FILENAME)
    : null
  const officialFreeformDescriptorReady = Boolean(descriptorPath && isOfficialFreeformDescriptorFile(descriptorPath))
  return {
    officialAppsReady: Boolean(officialAppsRoot && officialFreeformDescriptorReady),
    officialAppsRoot,
    officialFreeformDescriptorReady,
  }
}

function sourceRepoRoot(moduleDir = CLI_MODULE_DIR): string {
  return path.resolve(moduleDir, '..', '..', '..')
}

function sourceOfficialAppsRoot(moduleDir = CLI_MODULE_DIR): string {
  return path.resolve(sourceRepoRoot(moduleDir), 'souls')
}

function sourceOfficialSoulBuildScript(moduleDir = CLI_MODULE_DIR): string {
  return path.resolve(sourceRepoRoot(moduleDir), 'scripts/official-soul-dist.ts')
}

function sourceOfficialSoulDescriptorsReady(
  moduleDir = CLI_MODULE_DIR,
  definitions: readonly OfficialSoulAppDefinition[] = OFFICIAL_SOUL_APPS,
): boolean {
  if (officialSoulDescriptorsReadyForTest)
    return officialSoulDescriptorsReadyForTest()
  const repoRoot = sourceRepoRoot(moduleDir)
  return definitions.every(definition => existsSync(path.resolve(repoRoot, definition.descriptorPath)))
}

async function ensureSourceOfficialSoulDists(
  definitions: readonly OfficialSoulAppDefinition[] = OFFICIAL_SOUL_APPS,
  catalogView: OfficialSoulCatalogView = 'shipped',
): Promise<void> {
  if (catalogView === 'shipped' && resolveCliPackagedOfficialAppsRoot())
    return
  if (!existsSync(sourceOfficialSoulBuildScript())) {
    throw new Error(`official Soul catalog view ${catalogView} requires a source checkout`)
  }
  if (sourceOfficialSoulDescriptorsReady(CLI_MODULE_DIR, definitions))
    return
  if (officialSoulDistBuilderForTest) {
    await officialSoulDistBuilderForTest()
    return
  }
  await runOfficialSoulDistBuildCommand(definitions)
}

// Build the explicitly-requested Soul dists from source by their own package build
// scripts. Driven by `definitions` (not the internal `dev-sampling` catalog-view name),
// so the public worker-create path can build any first-party Soul without leaking the
// internal sampling view into the public surface (plan Low-3).
async function runOfficialSoulDistBuildCommand(
  definitions: readonly OfficialSoulAppDefinition[],
): Promise<void> {
  const repoRoot = sourceRepoRoot()
  for (const definition of definitions) {
    const packageName = readSourceSoulPackageName(path.resolve(repoRoot, 'souls', definition.id))
    const proc = Bun.spawn(['bun', 'run', '--filter', packageName, 'build'], {
      cwd: repoRoot,
      stderr: 'inherit',
      stdout: 'inherit',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(
        `failed to build official Soul dist for ${definition.id}: bun run --filter ${packageName} build exited ${exitCode}`,
      )
    }
  }
}

function readSourceSoulPackageName(soulRoot: string): string {
  const parsed = JSON.parse(readFileSync(path.resolve(soulRoot, 'package.json'), 'utf8')) as { name?: unknown }
  if (typeof parsed.name !== 'string' || parsed.name.length === 0)
    throw new Error(`official Soul package is missing a package name: ${soulRoot}`)
  return parsed.name
}

export function resolveCliWorkerWebStaticDir(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): string | undefined {
  for (const root of packagedResourceRoots(moduleDir, options)) {
    const packaged = path.resolve(root, 'web', 'worker')
    if (existsSync(path.join(packaged, 'index.html')))
      return packaged
  }
  const source = path.resolve(moduleDir, '../../worker-web/dist/worker')
  if (existsSync(path.join(source, 'index.html')))
    return source
  return undefined
}

export function resolveCliMigrationsFolder(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): string | undefined {
  for (const root of packagedResourceRoots(moduleDir, options)) {
    const packaged = path.resolve(root, 'drizzle', 'worker')
    if (existsSync(path.join(packaged, 'meta', '_journal.json')))
      return packaged
  }
  return undefined
}

const SOURCE_CHECKOUT_DEFAULT_HOME_DIR = '.aiworker-dev'
const PACKAGED_DEFAULT_HOME_DIR = '.aiworker'

export function resolveCliDefaultHomeDir(moduleDir = CLI_MODULE_DIR, options: CliResourceResolutionOptions = {}): string {
  const hasPackagedOfficialApps = packagedResourceRoots(moduleDir, options)
    .some(root => existsSync(path.join(root, 'official-apps', 'aiworker-freeform', OFFICIAL_APP_DESCRIPTOR_FILENAME)))
  const hasPackagedWeb = packagedResourceRoots(moduleDir, options)
    .some(root => existsSync(path.join(root, 'web', 'worker', 'index.html')))
  return hasPackagedOfficialApps || hasPackagedWeb
    ? PACKAGED_DEFAULT_HOME_DIR
    : SOURCE_CHECKOUT_DEFAULT_HOME_DIR
}

export function resolveCliLocalPaths(moduleDir = CLI_MODULE_DIR): LocalPaths {
  const home = resolveAiworkerScope({
    defaultHomeDir: resolveCliDefaultHomeDir(moduleDir),
  }).home
  const base = buildLocalPaths(home)
  // Single-home CLI honors WORKER_DB_PATH (tests + power users pin the DB).
  // Per-worker fleet paths derive dbPath purely from home (see buildLocalPaths),
  // so this override stays scoped to the resolved default home only.
  return {
    ...base,
    dbPath: process.env.WORKER_DB_PATH ?? base.dbPath,
  }
}

function applyLocalPathEnv(paths: LocalPaths): void {
  process.env.AIWORKER_HOME ??= paths.home
  process.env.WORKER_DB_PATH ??= paths.dbPath
  process.env.WORKER_MIGRATIONS_FOLDER ??= resolveCliMigrationsFolder()
}

function localPaths(): LocalPaths {
  const paths = resolveCliLocalPaths()
  applyLocalPathEnv(paths)
  return paths
}

async function ensureDb(): Promise<LocalPaths> {
  const paths = localPaths()
  return ensureDbAt(paths)
}

async function ensureDefaultDb(): Promise<LocalPaths> {
  const paths = localPaths()
  const root = fleetRootDir()
  const index = readFleet(root)
  const target = resolveDefault(index)
  if (target && !existsSync(paths.dbPath))
    return ensureDbAt(fleetWorkerPaths(root, target))
  return ensureDbAt(paths)
}

// Open + migrate the SQLite DB for an explicit set of paths. The DB handle is a
// process-global singleton, so callers must not interleave two homes in one
// process; fleet commands that touch a specific worker's DB (`worker create`,
// adopt) close the handle before targeting another home.
async function ensureDbAt(paths: LocalPaths): Promise<LocalPaths> {
  await mkdir(paths.home, { recursive: true })
  await mkdir(path.dirname(paths.dbPath), { recursive: true })
  initWorkerDb(paths.dbPath)
  runWorkerMigrations(resolveCliMigrationsFolder() ?? getWorkerEnv().WORKER_MIGRATIONS_FOLDER)
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

function cliProjectionEngineTarget(engineId: string): CliProjectionEngineTarget | null {
  if (engineId === 'codex' || engineId.startsWith('codex/'))
    return 'codex'
  if (engineId === 'claude-code' || engineId.startsWith('claude-code/'))
    return 'claude-code'
  return null
}

function resolveCliProjectionTarget(value?: string): CliProjectionEngineTarget {
  const engineId = value?.trim() || selectedCliEngineId()
  const target = cliProjectionEngineTarget(engineId)
  if (!target)
    throw new Error(`projection target must be codex or claude-code: ${engineId}`)
  return target
}

function registryContext() {
  return { hostVersion: packageJson.version }
}

function currentInstallSource() {
  const argv1 = resolveArgv1(process.argv[1])
  const realArgv1 = cliExecutablePaths().find(value => !value.includes('/$bunfs/')) ?? argv1
  return detectInstallSource({
    argv1,
    bunGlobalBinDirs: bunGlobalBinDirs(),
    moduleDir: CLI_MODULE_DIR,
    npmGlobalBinDirs: npmGlobalBinDirs(),
    realArgv1: safeRealpath(realArgv1),
  })
}

function cliInstallationDiagnostics(): {
  resources: {
    migrationsFolder: null | string
    migrationsReady: boolean
    officialAppsReady: boolean
    officialAppsRoot: null | string
    officialFreeformDescriptorReady: boolean
    workerWebReady: boolean
    workerWebStaticDir: null | string
  }
  source: ReturnType<typeof detectInstallSource>
} {
  const officialApps = inspectCliOfficialAppsResource()
  const workerWebStaticDir = resolveCliWorkerWebStaticDir() ?? null
  // 诊断须镜像*实际跑迁移*的 ensureDbAt（resolveCliMigrationsFolder() ?? env），并与
  // officialApps / workerWeb 对称——CLI resolver（经 cliExecutableDirs 找 packaged drizzle/worker
  // sidecar）优先，env 仅作 source-checkout 回落。不能信 getWorkerEnv().WORKER_MIGRATIONS_FOLDER
  // 的默认值：在 compile 二进制里 defaultWorkerMigrationsFolder 解析成不存在的 `/drizzle/worker`
  // （storage-sqlite resolveMigrationsFolder 的 bunfs 浅路径 fallback），doctor 据此误报
  // migrationsReady:false——而迁移其实从 sidecar 正常跑（见 ensureDbAt）。
  const migrationsFolder = resolveCliMigrationsFolder() ?? (getWorkerEnv().WORKER_MIGRATIONS_FOLDER || null)
  return {
    resources: {
      migrationsFolder,
      migrationsReady: Boolean(migrationsFolder && existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))),
      officialAppsReady: officialApps.officialAppsReady,
      officialAppsRoot: officialApps.officialAppsRoot,
      officialFreeformDescriptorReady: officialApps.officialFreeformDescriptorReady,
      workerWebReady: Boolean(workerWebStaticDir && existsSync(path.join(workerWebStaticDir, 'index.html'))),
      workerWebStaticDir,
    },
    source: currentInstallSource(),
  }
}

function createHost(paths: LocalPaths, options: { executor?: LocalExecutor, officialAppsRoot?: string, registryContext?: () => SoulAppRegistryContext } = {}): WorkerOrchestrator {
  return createWorkerOrchestrator({
    executor: options.executor,
    officialAppsRoot: options.officialAppsRoot ?? resolveCliOfficialAppsRoot(),
    registryContext: options.registryContext ?? registryContext,
    workersRoot: paths.workersRoot,
  })
}

async function bootstrapOfficialSoulApps(
  host: WorkerOrchestrator,
  options: {
    catalogView?: OfficialSoulCatalogView
    definitions?: readonly OfficialSoulAppDefinition[]
  } = {},
): Promise<Awaited<ReturnType<WorkerOrchestrator['bootstrapOfficialSoulApps']>>> {
  const catalogView = options.catalogView ?? 'shipped'
  const definitions = options.definitions ?? officialSoulDefinitionsForView(catalogView)
  await ensureSourceOfficialSoulDists(definitions, catalogView)
  return host.bootstrapOfficialSoulApps({ definitions })
}

function officialSoulDefinitionsForView(view: OfficialSoulCatalogView): readonly OfficialSoulAppDefinition[] {
  if (view === 'dev-sampling')
    return DEV_SAMPLING_OFFICIAL_SOUL_APPS
  return SHIPPED_OFFICIAL_SOUL_APPS
}

function resolveOfficialSoulCatalogView(input?: string): OfficialSoulCatalogView {
  if (!input || input === 'shipped')
    return 'shipped'
  if (input === 'dev-sampling')
    return 'dev-sampling'
  throw new Error(`unsupported official Soul catalog view: ${input}`)
}

function resolveInternalOfficialSoulCatalogView(): OfficialSoulCatalogView {
  return resolveOfficialSoulCatalogView(process.env[INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV])
}

function resolveWorkerFromOpenDb(workerOpt?: string): { requestedId?: string, worker: WorkerRow | null } {
  const currentResolution = resolveSingleActiveWorker()
  if (currentResolution.kind === 'multiple' && !workerOpt && !selectedWorkerId()) {
    throw new Error(
      `cannot resolve a standalone worker: the DB holds more than one active worker (${currentResolution.workers.map(worker => worker.id).join(', ')}); a daemon hosts at most one active worker. Pass --worker to disambiguate.`,
    )
  }
  const requestedId = workerOpt
    ?? selectedWorkerId()
    ?? (currentResolution.kind === 'single' ? currentResolution.worker.id : undefined)
  return { requestedId, worker: requestedId ? getWorker(requestedId) : null }
}

// Resolve the home + worker row that a runtime command targets. Current home wins:
// when an explicit `--worker`, the per-home `selected-worker`, or the lone active
// worker of the current home resolves a row, we serve it from the current home
// exactly as before. Only when the current home cannot resolve the worker do we
// fall back to the fleet index and reopen the targeted worker's own home/DB — this
// unlocks `workspace create --worker X` (and the rest of the runtime surface) for a
// worker that `worker create` built in its own per-worker fleet home.
//
// `ensureDbAt` reopens the global SQLite singleton (initWorkerDb force-closes the
// prior handle), so the fleet branch reopens the target home before `getWorker`
// and the caller builds `createHost` from the returned (target-home) paths — the
// current and fleet DBs never interleave.
async function resolveWorkerTarget(workerOpt?: string): Promise<{ paths: LocalPaths, worker: WorkerRow }> {
  const currentPaths = localPaths()
  let currentWorkerId: string | undefined
  if (existsSync(currentPaths.dbPath)) {
    await ensureDbAt(currentPaths)
    const current = resolveWorkerFromOpenDb(workerOpt)
    currentWorkerId = current.requestedId
    if (current.worker)
      return { paths: currentPaths, worker: current.worker }
  }

  // Fleet fallback (by id): reopen the targeted worker's own home/DB.
  const root = fleetRootDir()
  const index = readFleet(root)
  const targetId = workerOpt ?? index.default ?? index.workers[0]?.id
  const entry = targetId ? index.workers.find(worker => worker.id === targetId) : undefined
  if (entry) {
    const fleetPaths = fleetWorkerPaths(root, entry)
    await ensureDbAt(fleetPaths)
    const fleetWorker = getWorker(entry.id)
    if (fleetWorker)
      return { paths: fleetPaths, worker: fleetWorker }
  }

  if (!existsSync(currentPaths.dbPath) && index.workers.length === 0) {
    await ensureDbAt(currentPaths)
    const current = resolveWorkerFromOpenDb(workerOpt)
    currentWorkerId = current.requestedId
    if (current.worker)
      return { paths: currentPaths, worker: current.worker }
  }

  if (currentWorkerId || targetId)
    throw new Error(`worker not found: ${currentWorkerId ?? targetId}`)
  throw new Error('no active worker; run `aiworker worker create` or pass --worker')
}

// Build a runtime against an ALREADY-resolved home/worker. Split out of
// `ensureRuntime` so the session-/invocation-keyed commands (Bug-1) can build their
// runtime from the home that `resolveSessionHome`/`resolveInvocationHome` left open,
// without re-running `resolveWorkerTarget`/`ensureDefaultDb` (which would reopen the
// root/default home and reintroduce the wrong-home bug). Operates purely on the
// global SQLite singleton the caller left open — it never reopens a different home.
async function buildRuntimeFromPaths(paths: LocalPaths, worker: WorkerRow, options: { requireEnabledApp?: boolean } = {}): Promise<LocalWorkerRuntime> {
  const host = createHost(paths)
  if (options.requireEnabledApp)
    host.requireEnabledAppForWorker(worker.id)
  const runtime = host.createRuntimeForWorker(worker)
  await runtime.init()
  return runtime
}

async function ensureRuntime(options: RuntimeOptions = {}): Promise<LocalWorkerRuntime> {
  const { paths, worker } = await resolveWorkerTarget(options.worker)
  return buildRuntimeFromPaths(paths, worker, { requireEnabledApp: options.requireEnabledApp })
}

// Resolve the per-worker home that owns a session- or invocation-keyed row. Mirrors
// `resolveWorkerTarget`'s reopen-by-home pattern but keys by the row id instead of a
// worker id: `worker create` builds each worker in its own fleet home, so a session
// or invocation lives in that home's DB — not the root/default home `ensureDefaultDb`
// opens. Session/invocation ids are `randomUUID()` (globally unique), so scanning
// every fleet home can never resolve the wrong worker's row.
//
// DB-handle hazard (M2): `ensureDbAt` reopens the global SQLite singleton
// (`initWorkerDb` force-closes the prior handle). The scan therefore STOPS on the hit
// home and leaves THAT home's DB open, so the caller's ensuing `getSession`/runtime
// read runs against the correct, open handle — never a later-scanned or closed one.
// Callers MUST build the runtime from the returned `paths` (via `buildRuntimeFromPaths`),
// never re-`ensureDefaultDb`/`resolveWorkerTarget`.
async function scanHomesForRow<TRow>(
  id: string,
  workerOpt: string | undefined,
  lookup: () => TRow | null | undefined,
  label: 'invocation' | 'session',
): Promise<{ paths: LocalPaths, row: TRow }> {
  // Explicit `--worker`: open that worker's home directly and look up there.
  if (workerOpt) {
    const { paths } = await resolveWorkerTarget(workerOpt)
    const row = lookup()
    if (row)
      return { paths, row }
    throw new Error(`${label} not found: ${id}`)
  }

  // Standalone: probe the current/default home first.
  const currentPaths = await ensureDefaultDb()
  const currentRow = lookup()
  if (currentRow)
    return { paths: currentPaths, row: currentRow }

  // Fleet scan: walk every registered home; stop on the hit and leave its DB open.
  const root = fleetRootDir()
  const index = readFleet(root)
  for (const worker of index.workers) {
    const fleetPaths = fleetWorkerPaths(root, worker)
    if (path.resolve(fleetPaths.dbPath) === path.resolve(currentPaths.dbPath))
      continue
    await ensureDbAt(fleetPaths)
    const row = lookup()
    if (row)
      return { paths: fleetPaths, row }
  }

  throw new Error(`${label} not found: ${id}`)
}

async function resolveSessionHome(sessionId: string, workerOpt?: string): Promise<{ paths: LocalPaths, session: NonNullable<ReturnType<typeof getSession>> }> {
  const { paths, row } = await scanHomesForRow(sessionId, workerOpt, () => getSession(sessionId), 'session')
  return { paths, session: row }
}

async function resolveInvocationHome(invocationId: string, workerOpt?: string): Promise<{ invocation: NonNullable<ReturnType<typeof getEngineInvocation>>, paths: LocalPaths }> {
  const { paths, row } = await scanHomesForRow(invocationId, workerOpt, () => getEngineInvocation(invocationId), 'invocation')
  return { invocation: row, paths }
}

async function ensureAllWorkers(): Promise<WorkerRow[]> {
  await ensureDefaultDb()
  return listWorkers()
}

function requireWorkerRow(workerId: string): WorkerRow {
  const worker = getWorker(workerId)
  if (!worker)
    throw new Error(`worker not found: ${workerId}`)
  return worker
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

function parseJsonObjectOption(value: string | undefined, label: string): Record<string, unknown> {
  if (!value)
    return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  }
  catch {
    throw new Error(`${label} must be valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${label} must be a JSON object`)
  return parsed as Record<string, unknown>
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

interface DoctorCliOptions {
  json?: boolean
  probe?: boolean
  strict?: boolean
  verbose?: boolean
}

async function runDoctor(opts: DoctorCliOptions = {}): Promise<void> {
  const paths = await ensureDefaultDb()
  const updateNotice = await maybeResolveDailyUpdateNotice()
  const installation = cliInstallationDiagnostics()
  const context = {
    home: paths.home,
    dbPath: paths.dbPath,
    apps: createHost(paths).listApps(),
    workers: listWorkers(),
    workspaces: listWorkspaces(),
    daemon: daemonStatus(),
    installation,
    settings: listSettings(),
    updateNotice,
  }

  const report = await runChecks(
    buildWorkerChecks({
      homeBunPath: path.join(os.homedir(), '.bun/bin/bun'),
      daemonRunning: () => daemonStatus().running,
      migrationsReady: () => installation.resources.migrationsReady,
      migrationsFolder: () => installation.resources.migrationsFolder,
      scanEngines: () => scanLocalEngines(),
      inspectEngineCredential: inspectLocalEngineCredential,
    }),
    { probe: opts.probe, strict: opts.strict },
  )

  if (opts.json) {
    printJson({ ...report, context })
  }
  else {
    process.stdout.write(`${renderText(report, { title: 'AIWorker Worker Doctor' })}\n`)
    if (opts.verbose)
      process.stdout.write(`\ncontext:\n${JSON.stringify(redactEngineBridgeValue(context), null, 2)}\n`)
  }

  process.exitCode = report.exitCode
}

async function runUpdateCommand(command: UpdateCommandName, opts: UpdateCliOptions): Promise<void> {
  const options = parseUpdateCommandOptions(command, opts)
  const source = currentInstallSource()
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
    if (!existsSync(path.join(extractedDir, 'drizzle', 'worker', 'meta', '_journal.json')))
      throw new Error('staging_failed: drizzle migration journal not found')
    const freeformDescriptorPath = path.join(extractedDir, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json')
    if (!existsSync(freeformDescriptorPath))
      throw new Error('staging_failed: official Freeform descriptor not found')
    assertPackagedDescriptorV1(freeformDescriptorPath)

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

function assertPackagedDescriptorV1(descriptorPath: string): void {
  try {
    parseOfficialFreeformDescriptorJson(readFileSync(descriptorPath, 'utf8'))
  }
  catch (err) {
    if (err instanceof Error && err.message.includes('expected aiworker-freeform'))
      throw new Error('staging_failed: official Freeform descriptor is not the official Freeform descriptor')
    throw new Error('staging_failed: official Freeform descriptor is not descriptor v1')
  }
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
    await ensureDefaultDb()
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

export interface WaitForDaemonHealthOptions {
  deadlineMs?: number
  fetchImpl?: (url: string) => Promise<Response>
  intervalMs?: number
}

// Poll the background daemon's GET /health until it answers ok or the deadline elapses.
// The daemon binds Bun.serve and writes its real URL only after DB migration + boot, so a
// freshly-spawned `start` must wait for readiness before reporting a URL — otherwise the
// printed URL races into connection-refused / 404. Returns healthy:false on timeout so the
// caller fails loudly with the log tail (never a silent predicted-URL success).
export async function waitForDaemonHealth(
  url: string,
  options: WaitForDaemonHealthOptions = {},
): Promise<{ healthy: boolean }> {
  const deadlineMs = options.deadlineMs ?? 15_000
  const intervalMs = options.intervalMs ?? 150
  const fetchImpl = options.fetchImpl ?? fetchWithShortTimeout
  const healthUrl = `${url.replace(/\/+$/, '')}/health`
  const startedAt = Date.now()
  do {
    try {
      const res = await fetchImpl(healthUrl)
      if (res.ok)
        return { healthy: true }
    }
    catch {
      // Not bound yet (connection refused / aborted) — keep polling until the deadline.
    }
    if (Date.now() - startedAt >= deadlineMs)
      return { healthy: false }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  } while (Date.now() - startedAt < deadlineMs)
  return { healthy: false }
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

function daemonStatus(paths = localPaths()): { logFile: string, pid: number | null, running: boolean } {
  if (!existsSync(paths.pidFile))
    return { pid: null, running: false, logFile: paths.logFile }
  const pid = Number.parseInt(readFileSync(paths.pidFile, 'utf8'), 10)
  // `running` is true only for a live, cmdline-verified managed worker daemon. A pidFile
  // that points at a dead pid, a reused pid, or some other process reads as not-running so
  // callers treat it as stale (clear the pidFile, never kill the foreign process).
  return { pid: Number.isFinite(pid) ? pid : null, running: Number.isFinite(pid) && isManagedDaemonPid(pid), logFile: paths.logFile }
}

interface DaemonMetadata {
  host: string
  pid: number
  port: number
  startedAt: string
  url: string
}

function daemonUrl(host: string, port: number): string {
  return `http://${host}:${port}`
}

function readDaemonMetadata(paths: LocalPaths): DaemonMetadata | null {
  try {
    const parsed = JSON.parse(readFileSync(paths.daemonMetaFile, 'utf8')) as Partial<DaemonMetadata>
    if (
      typeof parsed.host === 'string'
      && typeof parsed.pid === 'number'
      && typeof parsed.port === 'number'
      && typeof parsed.startedAt === 'string'
      && typeof parsed.url === 'string'
    ) {
      return {
        host: parsed.host,
        pid: parsed.pid,
        port: parsed.port,
        startedAt: parsed.startedAt,
        url: parsed.url,
      }
    }
  }
  catch {
    return null
  }
  return null
}

function writeDaemonMetadata(paths: LocalPaths, metadata: DaemonMetadata): void {
  mkdirSync(paths.home, { recursive: true })
  writeFileSync(paths.daemonMetaFile, `${JSON.stringify(metadata, null, 2)}\n`)
}

function removeDaemonMetadata(paths: LocalPaths): void {
  rmSync(paths.daemonMetaFile, { force: true })
}

// Atomically claim the pidFile as a start lock. O_EXCL (`wx`) makes the create-or-fail a
// single syscall, so two concurrent `start`s cannot both pass the liveness check and both
// spawn (the TOCTOU double-spawn). The lock records THIS CLI's pid, so a concurrent start
// can tell a live in-flight holder (back off) from a crashed one (reclaim). It composes with
// WDLM-1's stale detection: a leftover lock from a crashed start never wedges future starts.
export function acquireDaemonStartLock(paths: LocalPaths): void {
  // Bounded retry: a stale lock is reclaimed then the atomic claim is re-attempted. Under a
  // concurrent stale-lock reclaim the loser's create EEXISTs against the winner's fresh lock and
  // re-evaluates into the back-off below, so two same-home starts converge on one winner instead
  // of both spawning. (The remaining sub-microsecond window — a reclaim deleting a holder freshly
  // created between our read and our compare-and-delete — would need a mkdir/rename lock to close
  // fully; not worth it for this crashed-lock + concurrent-start edge.)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      writeLockHolderPid(paths.pidFile)
      return
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST')
        throw error
    }
    // The pidFile already exists. Three cases, in order:
    //   1. it points at a live managed daemon → genuine already-running collision.
    //   2. it records another live CLI pid mid-start → a concurrent start is in progress; back
    //      off so two same-home starts never both spawn (the TOCTOU double-spawn).
    //   3. it is stale — a dead/reused pid or a crashed in-flight start → reclaim and retry.
    const existing = daemonStatus(paths)
    if (existing.running)
      throw new Error(`daemon already running: pid=${existing.pid}`)
    // Back off only when the recorded pid is a LIVE worker CLI process — another start is
    // mid-flight (its command is `aiworker … start`, no `daemon foreground` yet). Verify the
    // command, not just liveness: a stale lock from a daemon that died without `aiworker stop`
    // (reboot / kill -9; the SIGTERM handler removes metadata but not the pidFile) can have its
    // pid reused by an unrelated same-user process — that must be reclaimed, not wedge starts.
    const lockPid = Number.parseInt(readFileSync(paths.pidFile, 'utf8'), 10)
    if (Number.isFinite(lockPid) && isProcessAlive(lockPid) && isManagedWorkerCliCommand(readProcessCommand(lockPid)))
      throw new Error(`daemon start already in progress: pid=${lockPid}`)
    reclaimStaleStartLock(paths.pidFile, lockPid)
  }
  throw new Error('could not acquire daemon start lock after repeated stale-lock reclaim')
}

// Delete the start lock only while it still records the same stale pid we evaluated
// (compare-and-delete), so a concurrent reclaim that already replaced it with a live holder is
// not clobbered. A missing file means another reclaim won the race — treat as done.
function reclaimStaleStartLock(pidFile: string, stalePid: number): void {
  try {
    const current = Number.parseInt(readFileSync(pidFile, 'utf8'), 10)
    if (current === stalePid)
      rmSync(pidFile, { force: true })
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return
    throw error
  }
}

// Atomically create the pidFile recording this CLI's pid as the start-lock holder. O_EXCL
// (`wx`) makes the create-or-fail a single syscall; recording the pid lets a concurrent
// start distinguish a live in-flight holder (back off) from a crashed one (reclaim).
function writeLockHolderPid(pidFile: string): void {
  const fd = openSync(pidFile, 'wx')
  try {
    writeFileSync(fd, String(process.pid))
  }
  finally {
    closeSync(fd)
  }
}

// A `bun build --compile` standalone binary embeds its module graph under `/$bunfs/`, so
// import.meta.url (hence CLI_MODULE_DIR) carries that marker — the same intrinsic signal the
// resource resolver already uses (see currentInstallSource). It does not depend on user
// args, unlike inspecting argv[1].
function isCompiledBinary(): boolean {
  return CLI_MODULE_DIR.includes('/$bunfs/')
}

// Build the args for respawning the daemon as a detached `<runnable> daemon foreground`.
// For a compiled binary process.execPath IS the runnable and argv[1] is the first user arg
// ('start'), so passing a script path would make the child reinterpret it as a subcommand
// and the respawn breaks. For npm/source process.execPath is the Bun runtime and the script
// path (argv[1]) must lead so Bun loads it before the subcommand.
export function buildDaemonRespawnArgs(input: {
  compiled: boolean
  host?: string
  port?: number
  scriptPath: string
}): string[] {
  return [
    ...(input.compiled ? [] : [input.scriptPath]),
    'daemon',
    'foreground',
    ...(input.host ? ['--host', input.host] : []),
    ...(input.port ? ['--port', String(input.port)] : []),
  ]
}

async function startDaemonProcess(opts: { host?: string, port?: number } = {}, paths = localPaths()): Promise<DaemonStartedResult> {
  mkdirSync(paths.home, { recursive: true })
  const current = daemonStatus(paths)
  if (current.running)
    throw new Error(`daemon already running: pid=${current.pid}`)
  acquireDaemonStartLock(paths)
  let child
  try {
    writeFileSync(paths.logFile, '')
    const logFd = openSync(paths.logFile, 'a')
    child = spawn(process.execPath, buildDaemonRespawnArgs({
      compiled: isCompiledBinary(),
      host: opts.host,
      port: opts.port,
      scriptPath: path.resolve(process.argv[1] ?? 'aiworker'),
    }), {
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
  }
  catch (error) {
    // Spawn failed after we took the lock — release it so the next start is not wedged.
    rmSync(paths.pidFile, { force: true })
    throw error
  }
  const env = getWorkerEnv()
  const host = opts.host ?? env.AIWORKER_WORKER_HOST
  const port = opts.port ?? env.PORT
  const predictedUrl = daemonUrl(host, port)

  // WDLM-3: wait for the child to actually bind before reporting a URL. The child writes
  // its real bound URL into aiworker-daemon.json only after Bun.serve is up, so we poll
  // /health on the predicted URL, then read the metadata for the authoritative URL.
  const health = await (daemonHealthWaiterForTest ?? waitForDaemonHealth)(predictedUrl)
  if (!health.healthy) {
    // Fail loudly: stop the half-booted child, release the lock, and surface the log tail
    // instead of silently handing back a URL that connection-refuses.
    try {
      process.kill(child.pid, 'SIGTERM')
    }
    catch {
      // Already gone — nothing to stop.
    }
    rmSync(paths.pidFile, { force: true })
    removeDaemonMetadata(paths)
    throw new Error(`daemon did not become healthy at ${predictedUrl}/health within the startup deadline; last logs:\n${readDaemonLogTail(paths)}`)
  }

  const metadata = readDaemonMetadata(paths)
  const url = metadata?.pid === child.pid ? metadata.url : predictedUrl
  const actualHost = metadata?.pid === child.pid ? metadata.host : host
  const actualPort = metadata?.pid === child.pid ? metadata.port : port
  return { started: true, pid: child.pid, logFile: paths.logFile, host: actualHost, port: actualPort, url }
}

function readDaemonLogTail(paths: LocalPaths, lines = 20): string {
  try {
    return readFileSync(paths.logFile, 'utf8').split(/\r?\n/).slice(-lines).join('\n')
  }
  catch {
    return '<no daemon log available>'
  }
}

async function startOrReuseDaemon(
  opts: { host?: string, port?: number } = {},
  paths = localPaths(),
  starter: DaemonStarter = daemonStarterForTest ?? startDaemonProcess,
): Promise<DaemonStartResult> {
  const status = daemonStatus(paths)
  if (status.running && status.pid) {
    const metadata = readDaemonMetadata(paths)
    const actual = metadata?.pid === status.pid ? metadata : null
    return {
      actual: {
        host: actual?.host,
        port: actual?.port,
        url: actual?.url ?? null,
      },
      logFile: paths.logFile,
      message: actual
        ? 'daemon already running; reused existing process'
        : metadata
          ? 'daemon already running; reused existing process, daemon metadata pid mismatch, actual URL unknown'
          : 'daemon already running; reused existing process, actual URL unknown',
      pid: status.pid,
      requested: {
        host: opts.host,
        port: opts.port,
      },
      started: false,
      url: actual?.url ?? null,
    }
  }

  return starter(opts, paths)
}

async function startDaemon(opts: { host?: string, port?: number } = {}): Promise<void> {
  const paths = await ensureDb()
  const worker = await ensureStandaloneServiceReady(paths)
  const daemon = await startOrReuseDaemon(opts, paths)
  printJson({ daemon, worker })
}

interface StartCommandOptions {
  all?: boolean
  host?: string
  id?: string
  port?: number
}

export interface EnsuredStartWorker {
  appId: string
  created: boolean
  id: string
}

interface EnsureStandaloneServiceReadyOptions {
  appId?: string
  id?: string
  name?: string
}

// Idempotent CLI service bootstrap: ensure exactly one active Worker bound to
// the bundled official Freeform Soul exists. Install + enable the bundled
// descriptor, then reuse the single active Worker if present, or create one when
// none exists. This convenience lives in the public CLI service-start commands;
// the daemon package stays passive and never auto-creates a Worker.
async function ensureStandaloneServiceReady(paths: LocalPaths, options: EnsureStandaloneServiceReadyOptions = {}): Promise<EnsuredStartWorker> {
  const host = createHost(paths)
  const bootstrap = await bootstrapOfficialSoulApps(host)
  if (bootstrap.status === 'fail')
    throw new Error('failed to install the bundled official Freeform Soul App')

  const resolution = resolveSingleActiveWorker()
  if (resolution.kind === 'single') {
    const worker = resolution.worker
    return { appId: worker.appId, created: false, id: worker.id }
  }
  if (resolution.kind === 'multiple') {
    throw new Error(
      `cannot start: the DB holds more than one active worker (${resolution.workers.map(worker => worker.id).join(', ')}); a daemon hosts at most one active worker.`,
    )
  }

  const created = await host.createSoulWorker({
    appId: options.appId ?? OFFICIAL_FREEFORM_APP_ID,
    id: options.id,
    name: options.name ?? 'AIWorker Freeform',
  })
  return { appId: created.worker.appId, created: true, id: created.worker.id }
}

// Probe whether a TCP port is already bound on the loopback host. Best-effort and
// synchronous-ish: any failure to bind means "in use", which is the conservative
// answer for port allocation. Never throws.
async function isPortInUse(host: string, port: number): Promise<boolean> {
  try {
    const server = Bun.listen({
      hostname: host,
      port,
      socket: { data() {} },
    })
    server.stop(true)
    return false
  }
  catch {
    return true
  }
}

// Fleet-level `start [id] [--all]`: every target runs fully in the background and
// the command prints each daemon URL. There is no browser open and no foreground
// mode here (the dedicated `open` command and `daemon foreground` cover those).
// Each target's daemon is spawned with its own per-worker home (AIWORKER_HOME +
// WORKER_DB_PATH derived from fleetWorkerPaths) so daemons never share a DB.
async function runFleetStart(opts: StartCommandOptions = {}): Promise<void> {
  const root = fleetRootDir()
  let index = ensureFleetSeeded(root)
  const targets = resolveTargets(index, { all: opts.all, id: opts.id })
  if (targets.length === 0)
    throw new Error('no fleet worker to start')

  const singleTarget = targets.length === 1 ? targets[0] : null
  const host = opts.host ?? '127.0.0.1'
  const results: Array<{ daemon: DaemonStartResult, id: string, port: number, url: string }> = []

  for (const target of targets) {
    const paths = fleetWorkerPaths(root, target)
    const alreadyRunning = daemonStatus(paths).running
    let port = singleTarget && typeof opts.port === 'number' ? opts.port : target.port
    // Live bind-probe: when this worker's daemon is not already running, bump past
    // a port that is busy on the system (or registered to another fleet worker)
    // and persist the choice so the fleet index always reflects the port the
    // daemon will actually try to bind. An already-running daemon is reused as-is.
    if (!alreadyRunning) {
      while (await isPortInUse(host, port)) {
        const used = new Set(index.workers.filter(worker => worker.id !== target.id).map(worker => worker.port))
        do {
          port += 1
        } while (used.has(port))
      }
      if (port !== target.port) {
        index = upsertFleetWorker(index, { ...target, port })
        writeFleet(root, index)
      }
      await ensureDbAt(paths)
      await ensureStandaloneServiceReady(paths, {
        appId: target.app,
        id: target.id,
        name: target.id,
      })
    }
    // Single-source the resolved host: the same `host` drives the live bind-probe
    // above, the daemon spawn/bind here, and the printed URL below — instead of
    // relying on `AIWORKER_WORKER_HOST` defaulting to 127.0.0.1 to coincide.
    const daemon = await startOrReuseDaemon({ host, port }, paths)
    results.push({ daemon, id: target.id, port, url: daemonUrl(host, port) })
  }

  printJson({
    fleet: { default: index.default, root },
    started: results,
  })
}

// Fleet-level `stop [id] [--all]`: resolve targets and stop each per-worker home
// daemon by its pid (reuses the single-home stop logic against per-worker paths).
async function runFleetStop(opts: { all?: boolean, id?: string } = {}): Promise<void> {
  const root = fleetRootDir()
  const index = ensureFleetSeeded(root)
  const targets = resolveTargets(index, { all: opts.all, id: opts.id })
  const stopped: Array<{ id: string } & DaemonStopResult> = []
  for (const target of targets) {
    const paths = fleetWorkerPaths(root, target)
    stopped.push({ id: target.id, ...await stopDaemonProcess(paths) })
  }
  printJson({ fleet: { default: index.default, root }, stopped })
}

async function runFleetList(): Promise<void> {
  const root = fleetRootDir()
  const index = ensureFleetSeeded(root)
  printJson({
    fleet: { default: index.default, root },
    workers: index.workers.map(worker => fleetWorkerSummary(root, worker)),
  })
}

async function runFleetStatus(): Promise<void> {
  const root = fleetRootDir()
  const index = ensureFleetSeeded(root)
  const workers = []
  for (const worker of index.workers) {
    const summary = fleetWorkerSummary(root, worker)
    let health: { ok: boolean, status: number | null } = { ok: false, status: null }
    if (summary.running) {
      try {
        const res = await fetch(`${summary.url}/health`)
        health = { ok: res.ok, status: res.status }
      }
      catch {
        health = { ok: false, status: null }
      }
    }
    workers.push({ ...summary, health })
  }
  printJson({ fleet: { default: index.default, root }, workers })
}

async function stopDaemonProcess(paths = localPaths(), status = daemonStatus(paths)): Promise<DaemonStopResult> {
  if (!status.pid || !status.running) {
    rmSync(paths.pidFile, { force: true })
    removeDaemonMetadata(paths)
    return { stopped: false, running: false }
  }
  try {
    process.kill(status.pid, 'SIGTERM')
  }
  catch (error) {
    // ESRCH: the process is already gone (lost the TOCTOU race after the liveness check).
    // EPERM: the pid was reused by a process we do not own — the cmdline-verify in
    // daemonStatus already rejects most such pids as stale, but a process that flipped
    // identity between check and kill lands here. Either way: clear the stale pidFile and
    // do not crash stop. Any other error is a real failure and propagates.
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'ESRCH' && error.code !== 'EPERM')) {
      throw error
    }
  }
  await waitForProcessExit(status.pid)
  rmSync(paths.pidFile, { force: true })
  removeDaemonMetadata(paths)
  return { stopped: true, pid: status.pid, running: false }
}

async function stopDaemon(): Promise<void> {
  printJson(await stopDaemonProcess())
}

async function restartDaemon(opts: { host?: string, port?: number } = {}): Promise<void> {
  const paths = await ensureDb()
  const worker = await ensureStandaloneServiceReady(paths)
  const status = daemonStatus(paths)
  const stopped = await stopDaemonProcess(paths, status)
  const starter = daemonStarterForTest ?? startDaemonProcess
  const started = await starter(opts, paths)
  printJson({ restarted: stopped.stopped, stopped, started, worker })
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
  // Wait for *our* managed daemon to be gone, not for raw pid liveness. If the kill was a
  // no-op because the pid was reused by a foreign process (EPERM stale case), that pid is
  // not a managed daemon and this returns at once instead of blocking on a process we do
  // not control. A reused pid that flips into a managed-looking command is astronomically
  // unlikely; the bounded timeout still backstops it.
  while (isManagedDaemonPid(pid)) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`daemon did not stop before restart: pid=${pid}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

// `-ww` disables ps column truncation. Without it, BSD/macOS ps truncates the command
// column to the terminal/default width, which can drop the trailing `foreground` token and
// make a real managed daemon read as foreign (→ double-spawn / failed stop on macOS). Both
// Linux procps and BSD ps honor `-ww`; the extracted argv keeps the flag under regression test.
export function psReadCommandArgs(pid: number): string[] {
  return ['ps', '-ww', '-p', String(pid), '-o', 'command=']
}

function readProcessCommand(pid: number): string | null {
  if (readProcessCommandForTest)
    return readProcessCommandForTest(pid)
  const result = Bun.spawnSync(psReadCommandArgs(pid))
  if (result.exitCode !== 0)
    return null
  const output = Buffer.from(result.stdout).toString('utf8').trim()
  return output.length > 0 ? output : null
}

// A pid is a live managed worker daemon only when it is both alive AND its process
// command is a real `<worker-binary> daemon foreground` form. A stale pidFile whose pid
// was reused by an unrelated process therefore reads as not-running (so start/status/stop
// treat it as stale: never a ghost-running report, never an accidental kill of another
// process). The host daemon and dev/source checkouts are likewise rejected.
function isManagedDaemonPid(pid: number): boolean {
  return isProcessAlive(pid) && isManagedWorkerDaemonCommand(readProcessCommand(pid))
}

export interface DaemonForegroundPreparation {
  opts: {
    host?: string
    port?: number
  }
  paths: LocalPaths
  updateNotice: Awaited<ReturnType<typeof maybeResolveDailyUpdateNotice>>
  worker: EnsuredStartWorker
}

export async function prepareDaemonForeground(opts: { host?: string, port?: number } = {}): Promise<DaemonForegroundPreparation> {
  const paths = await ensureDb()
  const worker = await ensureStandaloneServiceReady(paths)
  const updateNotice = await maybeResolveDailyUpdateNotice()
  return { opts, paths, updateNotice, worker }
}

async function runDaemonForegroundServer(prepared: DaemonForegroundPreparation): Promise<void> {
  const { opts, paths, updateNotice } = prepared
  if (updateNotice) {
    consola.info(`[aiworker-daemon] update available: ${updateNotice.currentVersion} -> ${updateNotice.targetVersion}; run ${updateNotice.command}`)
  }
  const { bootstrapWorkerApp, localApiExposureWarning } = await import('@zonease/aiworker-worker-daemon/bootstrap')
  const { app, port, state } = await bootstrapWorkerApp({
    // Mirror ensureDbAt: prefer the CLI-resolved packaged migrations sidecar. In a compiled
    // standalone binary the daemon's own workerEnv default resolves to the bunfs-shallow
    // `/drizzle/worker` that does not exist, so without this the background daemon crashes
    // with "Can't find meta/_journal.json file". The CLI resolver finds the packaged folder
    // next to the binary; env is only the source-checkout fallback.
    migrationsFolder: resolveCliMigrationsFolder() ?? getWorkerEnv().WORKER_MIGRATIONS_FOLDER,
    officialAppsRoot: resolveCliOfficialAppsRoot(),
    runtimeVersion: packageJson.version,
    sessionAutoName: true,
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
  const actualHost = server.hostname ?? opts.host ?? env.AIWORKER_WORKER_HOST
  const actualPort = server.port
  if (typeof actualPort !== 'number')
    throw new Error('daemon server did not expose a bound port')
  writeDaemonMetadata(paths, {
    host: actualHost,
    pid: process.pid,
    port: actualPort,
    startedAt: state.startedAt,
    url: daemonUrl(actualHost, actualPort),
  })
  consola.success(`[aiworker-daemon] listening on http://${server.hostname}:${server.port}`)
  await new Promise<void>((resolve) => {
    const keepAlive = setInterval(() => undefined, 60_000)
    const shutdown = () => {
      clearInterval(keepAlive)
      // 先 dispose 运行体(排空事件总线,断开还活着的 SSE live-tail 订阅),再停 server,
      // 最后 runCli 的 finally 关库——确保关库前已无订阅者可触发 DB 读。
      state.shutdown()
      server.stop()
      removeDaemonMetadata(paths)
      resolve()
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}

async function daemonForeground(opts: { host?: string, port?: number } = {}): Promise<void> {
  await runDaemonForegroundServer(await prepareDaemonForeground(opts))
}

async function provisionCommand(input: Partial<ProvisionCommandInput>, argv: string[]): Promise<void> {
  if (!input.host)
    throw new Error('provision requires --host')
  if (!input.token)
    throw new Error('provision requires --token')
  const host = input.host
  const token = input.token
  Object.assign(process.env, buildProvisionEnv({ host, token }))
  consola.info(`[aiworker-provision] ${redactProvisionCommandForLog(argv)}`)

  // first-provision 引导(破 C2 循环依赖):裸机 daemon boot 的 gating 要求已存在 active worker
  // 才 check-in/连 tunnel,而 worker 又要靠 check-in 拿来的 descriptor 才能建——因此先在 CLI 进程里
  // 把 worker 引导出来,再起 daemon。daemon boot 读持久 token 连 tunnel、不重复 check-in。
  await ensureDb()
  if (resolveSingleActiveWorker().kind === 'single') {
    // 幂等:worker 已存在 → 跳过引导(provision token 单次消费,重 check-in 必 401)。
    // 直接起 daemon,让它走重启自愈读 <worker-home>/access-token。
    closeWorkerDb()
    await (daemonForegroundForTest ?? daemonForeground)({})
    return
  }
  closeWorkerDb()

  await firstProvisionBootstrap({ host, token })
  await (daemonForegroundForTest ?? daemonForeground)({})
}

// 引导一个全新 worker:check-in(worker.id 发占位)→ 落盘 descriptor → descriptor-path 安装 →
// 解析真实 identity.id 作 appId → enable → createSoulWorker 绑定 → 持久化 access token。
// 失败(check-in 非 2xx 等)向上抛 → runCli 顶层捕获并诚实非零退出,不静默起 daemon。
async function firstProvisionBootstrap(opts: { host: string, token: string }): Promise<void> {
  const paths = await ensureDb()
  try {
    // worker.id(appId)在 first-provision 时还不知道——真实 soul id 要等 descriptor。Host 的 handleCheckIn
    // 不消费 worker.id(只用 workerId + version),故这里发占位(用 mint 的 workerId);建 worker 时才用
    // descriptor 解析出的真 identity.id 作 appId。
    const workerId = mintWorkerId()
    const checkIn = await (provisionCheckInForTest ?? checkInToHost)({
      host: opts.host,
      id: workerId,
      provisionToken: opts.token,
      version: packageJson.version,
      workerId,
      workbenchUrl: '/',
    })

    const descriptorJson = checkIn.assignment.soulDescriptor
    if (!descriptorJson)
      throw new Error('Host check-in did not include a soul descriptor; cannot provision this worker')

    // 落盘 descriptor 后走 descriptor-path 安装(inline 会丢 engine 资产,§0-D 关键 gap)。
    const descriptorPath = path.join(paths.home, 'soul.descriptor.json')
    await writeFile(descriptorPath, descriptorJson)

    const host = createHost(paths)
    await host.installAppFromPath(descriptorPath)
    const identity = parseSoulDescriptorV1(JSON.parse(descriptorJson)).identity
    const appId = String(identity.id)
    const name = typeof identity.name === 'string' && identity.name.trim().length > 0 ? identity.name : appId
    // catalog-availability 桥接:installAppFromPath 落 'installed',但 createSoulWorker 的
    // requireAvailableSoul 要 'available'(投影自 'enabled'),且 engineAssetSourceForWorker 也要 'enabled'
    // + descriptor-path。漏 enable → SOUL_NOT_AVAILABLE + 引擎资产返 null。
    host.enableApp(appId)
    await host.createSoulWorker({ appId, id: workerId, name })

    // 持久化 access token(0600,全仓首个 secret 文件)→ daemon boot 读回连 tunnel、跳过 check-in。
    await persistWorkerAccess(paths.home, {
      access: { mode: checkIn.access.mode, token: checkIn.access.token },
      assignment: { assignmentId: checkIn.assignment.assignmentId, workerId },
    })

    // fleet index 登记 + 端口,使 `aiworker list` 等 fleet 命令能看到这个引导出来的 worker。
    registerProvisionedWorkerInFleet({ appId, id: workerId, home: paths.home })
  }
  finally {
    closeWorkerDb()
  }
}

// 把引导出来的 worker 登记进 fleet index(home '.'=默认 home 原地登记)。纯索引登记,不动 DB。
function registerProvisionedWorkerInFleet(worker: { appId: string, home: string, id: string }): void {
  const root = fleetRootDir()
  const index = readFleet(root)
  if (index.workers.some(existing => existing.id === worker.id))
    return
  const next = upsertFleetWorker(index, {
    app: worker.appId,
    createdAt: new Date().toISOString(),
    home: path.relative(root, worker.home) || FLEET_ADOPTED_HOME,
    id: worker.id,
    port: allocatePort(index, FLEET_DEFAULT_BASE_PORT),
  })
  writeFleet(root, next)
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

// The fleet root = the resolved default home. Every fleet worker lives in its
// own standalone home under `<root>/workers/<id>/`; the adopted legacy default
// home maps to the root itself. This resolves independently of WORKER_DB_PATH so
// the fleet index never collapses onto a single pinned DB.
function fleetRootDir(): string {
  return resolveAiworkerScope({ defaultHomeDir: resolveCliDefaultHomeDir() }).home
}

function fleetWorkerSummary(root: string, worker: FleetWorker): {
  app: string
  createdAt: string
  home: string
  id: string
  pid: number | null
  port: number
  running: boolean
  url: string
} {
  const paths = fleetWorkerPaths(root, worker)
  const status = daemonStatus(paths)
  const metadata = readDaemonMetadata(paths)
  const host = metadata?.host ?? '127.0.0.1'
  return {
    app: worker.app,
    createdAt: worker.createdAt,
    home: worker.home,
    id: worker.id,
    pid: status.pid,
    port: worker.port,
    running: status.running,
    url: daemonUrl(host, worker.port),
  }
}

function legacyWorkerFromDb(paths: LocalPaths): { app: string, id: string } | null {
  closeWorkerDb()
  if (!existsSync(paths.dbPath))
    return null
  initWorkerDb(paths.dbPath)
  try {
    const resolution = resolveSingleActiveWorker()
    const worker = resolution.kind === 'single'
      ? resolution.worker
      : listWorkers().find(row => row.status === 'active') ?? listWorkers()[0]
    return worker ? { app: worker.appId, id: worker.id } : null
  }
  finally {
    closeWorkerDb()
  }
}

function legacyPortFromDaemonMeta(paths: LocalPaths): number | null {
  return readDaemonMetadata(paths)?.port ?? null
}

// Adopt an existing single-home default into the fleet index in place (home '.'),
// then seed a Freeform fleet entry with a real Worker id when the index is still
// empty so a bare `aiworker start` matches today's zero-config behavior. The
// Worker row is ensured inside that fleet home before the daemon is spawned.
function ensureFleetSeeded(root: string): FleetIndex {
  adoptLegacyHome(root, {
    readLegacyPort: legacyPortFromDaemonMeta,
    readLegacyWorker: legacyWorkerFromDb,
  })
  const index = readFleet(root)
  if (index.workers.length > 0)
    return index
  const workerId = mintWorkerId()
  const seeded = upsertFleetWorker(index, {
    app: OFFICIAL_FREEFORM_APP_ID,
    createdAt: new Date().toISOString(),
    home: path.relative(root, workerHomeDir(root, workerId)) || FLEET_ADOPTED_HOME,
    id: workerId,
    port: allocatePort(index, FLEET_DEFAULT_BASE_PORT),
  })
  writeFleet(root, seeded)
  return seeded
}

async function createWorkerCommand(opts: { id?: string, name?: string, app?: string, port?: number }): Promise<void> {
  // `--app <id>` stays non-interactive (scripts/CI). With no `--app`, an interactive
  // terminal opens a Soul selector; a non-interactive caller gets an actionable error.
  const app = await resolveWorkerCreateApp(opts.app)
  const catalogView = resolveInternalOfficialSoulCatalogView()
  const root = fleetRootDir()
  const index = readFleet(root)
  let id = opts.id?.trim() || mintWorkerId()
  while (!opts.id && (index.workers.some(worker => worker.id === id) || existsSync(workerHomeDir(root, id)))) {
    id = mintWorkerId()
  }
  if (index.workers.some(worker => worker.id === id))
    throw new Error(`fleet worker already exists: ${id}`)
  const homeDir = workerHomeDir(root, id)
  if (existsSync(homeDir))
    throw new Error(`worker home already exists: ${homeDir}`)

  const paths = buildLocalPaths(homeDir)
  closeWorkerDb()
  await ensureDbAt(paths)
  try {
    const host = createHost(paths, {
      officialAppsRoot: catalogView === 'dev-sampling' ? sourceOfficialAppsRoot() : undefined,
    })
    // Med-1: public `worker create` candidates = every first-party Soul (not the
    // shipped/freeform-only default). ALL_FIRST_PARTY === DEV_SAMPLING by value, so the
    // internal dev-sampling path is unchanged; only the public (shipped) path widens.
    // `officialSoulDefinitionsForView` stays untouched so zero-config `aiworker start`
    // bootstrap keeps installing only Freeform.
    const bootstrap = await bootstrapOfficialSoulApps(host, {
      catalogView,
      definitions: ALL_FIRST_PARTY_OFFICIAL_SOUL_APPS,
    })
    if (bootstrap.status === 'fail')
      throw new Error('failed to install the bundled official Soul Apps for the new worker home')
    const created = await host.createSoulWorker({
      appId: app,
      id,
      name: opts.name?.trim() || id,
    })
    const port = opts.port ?? allocatePort(index, FLEET_DEFAULT_BASE_PORT)
    const next = upsertFleetWorker(index, {
      app,
      createdAt: new Date().toISOString(),
      home: path.relative(root, homeDir) || FLEET_ADOPTED_HOME,
      id,
      port,
    })
    writeFleet(root, next)
    printJson({
      fleet: { default: next.default, root },
      worker: {
        app,
        home: homeDir,
        id,
        port,
        workerId: created.snapshot.worker.id,
      },
    })
  }
  finally {
    closeWorkerDb()
  }
}

// `worker select` writes `fleet.default` (the fleet-level default target for a
// bare `start`/`stop`). This is decoupled from the per-home `selected-worker`
// setting (still read by `selectedWorkerId()` for backward compatibility); do
// not assume this command sets a per-home worker selection.
async function selectWorkerCommand(id: string): Promise<void> {
  const root = fleetRootDir()
  const index = ensureFleetSeeded(root)
  const next = setDefault(index, requireText(id, 'id'))
  writeFleet(root, next)
  printJson({ fleet: { default: next.default, root } })
}

async function archiveWorkerCommand(id: string): Promise<void> {
  const { worker: existing } = await resolveWorkerTarget(id)
  const worker = upsertWorker({
    defaultEngineId: existing.defaultEngineId,
    id: existing.id,
    metadataJson: existing.metadataJson,
    name: existing.name,
    appId: existing.appId,
    status: 'archived',
  })
  printJson({ worker })
}

async function deleteWorkerCommand(id: string): Promise<void> {
  const { paths, worker } = await resolveWorkerTarget(id)
  const runtime = createHost(paths).createRuntimeForWorker(worker)
  const cleanedTargets: string[] = []
  for (const workspace of listWorkspaces(worker.id, Number.MAX_SAFE_INTEGER)) {
    let cleanup
    try {
      cleanup = await runtime.cleanupWorkspaceProjectionReceipt(workspace.id)
    }
    catch (error) {
      if (isProjectionReceiptStaleError(error))
        throw projectionReceiptStaleCliError(workspace.id)
      throw error
    }
    cleanedTargets.push(...cleanup?.cleanedTargets ?? [])
  }
  deleteWorker(worker.id)
  printJson({ cleanedTargets, deleted: true, worker })
}

async function listWorkerConfigCommand(workerId: string): Promise<void> {
  const { worker } = await resolveWorkerTarget(workerId)
  printJson({ config: workerConfigResponse(worker.id) })
}

async function setWorkerConfigCommand(workerId: string, configKey: string, opts: WorkerConfigSetCommandOptions): Promise<void> {
  const { worker } = await resolveWorkerTarget(workerId)
  const saved = upsertWorkerConfigValue({
    configKey: requireText(configKey, 'config key'),
    configValueJson: {
      checksum: opts.checksum ?? null,
      enabled: opts.disabled !== true,
      kind: requireText(opts.kind, 'kind'),
      options: parseJsonObjectOption(opts.optionsJson, 'options-json'),
      sourceRef: opts.sourceRef ?? null,
      target: requireText(opts.target, 'target'),
    },
    source: 'cli',
    workerId: worker.id,
  })
  printJson({ config: workerConfigValueResponse(saved, false) })
}

async function archiveWorkerConfigCommand(workerId: string, configKey: string): Promise<void> {
  const { worker } = await resolveWorkerTarget(workerId)
  const key = requireText(configKey, 'config key')
  deleteWorkerConfigValue(worker.id, key)
  printJson({
    config: {
      archived: true,
      configKey: key,
      updatedAt: new Date().toISOString(),
      value: null,
      workerId: worker.id,
    },
  })
}

function workerConfigResponse(workerId: string) {
  return {
    values: listWorkerConfigValues(workerId).map(row => workerConfigValueResponse(row, false)),
  }
}

function workerConfigValueResponse(
  row: ReturnType<typeof listWorkerConfigValues>[number],
  archived: boolean,
) {
  return {
    archived,
    configKey: row.configKey,
    source: row.source,
    updatedAt: row.updatedAt,
    value: row.configValueJson,
    workerId: row.workerId,
  }
}

async function createWorkspaceCommand(opts: { name?: string, type?: string, worker?: string }): Promise<void> {
  const runtime = await ensureRuntime({ requireEnabledApp: true, worker: opts.worker })
  printJson({ workspace: await runtime.createWorkspace({ name: requireText(opts.name, 'name'), type: opts.type }) })
}

async function listWorkspaceCommand(opts: { worker?: string }): Promise<void> {
  if (!opts.worker) {
    await ensureDefaultDb()
    printJson({ workspaces: listWorkspaces() })
    return
  }
  const runtime = await ensureRuntime({ worker: opts.worker })
  printJson({ workspaces: listWorkspaces(runtime.workerId) })
}

async function archiveWorkspaceCommand(id: string): Promise<void> {
  await ensureDefaultDb()
  const workspace = getWorkspace(id)
  if (!workspace)
    throw new Error(`workspace not found: ${id}`)
  printJson({ workspace: updateWorkspace({ id: workspace.id, status: 'archived' }) })
}

async function deleteWorkspaceCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  const workspace = getWorkspace(id)
  if (!workspace)
    throw new Error(`workspace not found: ${id}`)
  const runtime = createHost(paths).createRuntimeForWorker(requireWorkerRow(workspace.workerId))
  let cleanup
  try {
    cleanup = await runtime.cleanupWorkspaceProjectionReceipt(workspace.id)
  }
  catch (error) {
    if (isProjectionReceiptStaleError(error))
      throw projectionReceiptStaleCliError(workspace.id)
    throw error
  }
  deleteWorkspace(workspace.id)
  printJson({
    cleanedTargets: cleanup?.cleanedTargets ?? [],
    deleted: true,
    workspace,
  })
}

async function refreshWorkspaceProjectionCommand(id: string, opts: WorkspaceProjectionRefreshCommandOptions): Promise<void> {
  const paths = await ensureDefaultDb()
  const workspace = getWorkspace(id)
  if (!workspace)
    throw new Error(`workspace not found: ${id}`)
  const host = createHost(paths)
  const runtime = host.createRuntimeForWorker(requireWorkerRow(workspace.workerId))
  host.requireEnabledAppForWorker(runtime.workerId)
  const target = resolveCliProjectionTarget(opts.target)
  printJson({
    projection: await runtime.reprojectWorkspaceAssets(workspace.id, { engineTarget: target }),
    target,
  })
}

function isProjectionReceiptStaleError(error: unknown): boolean {
  return error != null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PROJECTION_RECEIPT_STALE'
}

function projectionReceiptStaleCliError(workspaceId: string): Error {
  return new Error(`PROJECTION_RECEIPT_STALE: Projection receipt is invalid for workspace ${workspaceId}.`)
}

async function startSessionCommand(opts: { engine?: string, input?: string, model?: string, reasoning?: string, title?: string, worker?: string, workspace?: string }): Promise<void> {
  const runtime = await ensureRuntime({ requireEnabledApp: true, worker: opts.worker })
  const workspaceId = requireText(opts.workspace, 'workspace')
  const workspace = getWorkspace(workspaceId)
  if (!workspace || workspace.workerId !== runtime.workerId)
    throw new Error(`workspace not found for ${runtime.workerId}: ${workspaceId}`)
  const selectedEngineId = opts.engine?.trim() || selectedCliEngineId()
  const engineMetadata = {
    ...resolveCliEngineMetadata(selectedEngineId),
    ...cliEngineOverrideMetadata(opts),
  }
  const session = await runtime.createSession({
    workspaceId,
    title: requireText(opts.title, 'title'),
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
  const sessionId = requireText(opts.session, 'session')
  const { paths, session } = await resolveSessionHome(sessionId, opts.worker)
  const runtime = await buildRuntimeFromPaths(paths, requireWorkerRow(session.workerId), { requireEnabledApp: true })
  const engineMetadata = resolveInvocationEngineMetadata(session.metadataJson)
  const frozen = readFrozenSessionEngine(session.metadataJson)
  const needsLegacyEngineRepair = frozen?.executionMode === 'local-cli' && frozen.engineCommand !== engineMetadata.engineCommand
  const currentSession = needsLegacyEngineRepair
    ? updateSession({
        id: session.id,
        metadataJson: {
          ...(session.metadataJson ?? {}),
          ...engineMetadata,
        },
      })
    : session
  if (needsLegacyEngineRepair) {
    await runtime.reprojectWorkspaceAssets(currentSession.workspaceId, {
      engineTarget: cliProjectionEngineTarget(engineMetadata.engineId),
    })
  }
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

async function showSession(id: string, opts: { worker?: string } = {}): Promise<void> {
  const { session } = await resolveSessionHome(id, opts.worker)
  printJson({
    invocations: listEngineInvocations(id).sort((left, right) => left.seq - right.seq),
    session,
  })
}

async function showInvocationEventsCommand(invocationId: string, opts: { after?: number[], limit?: number[], worker?: string }): Promise<void> {
  const { invocation } = await resolveInvocationHome(invocationId, opts.worker)
  const after = optionalNumber(opts.after)
  const limit = optionalNumber(opts.limit)
  const events = listSessionEvents(invocation.sessionId, {
    ...(after !== undefined ? { after } : {}),
    ...(limit !== undefined ? { limit } : {}),
  }).filter(event => event.invocationId === invocationId)
  printJson({
    events,
    invocation: {
      id: invocation.id,
      processState: invocation.processState,
      sessionId: invocation.sessionId,
      status: invocation.status,
    },
  })
}

async function cancelInvocationCommand(invocationId: string, opts: { reason?: string, worker?: string }): Promise<void> {
  const { paths, invocation } = await resolveInvocationHome(invocationId, opts.worker)
  const session = getSession(invocation.sessionId)
  if (!session)
    throw new Error(`session not found: ${invocation.sessionId}`)
  const runtime = await buildRuntimeFromPaths(paths, requireWorkerRow(session.workerId))
  const result = await runtime.cancelEngineInvocation(invocation.id, opts.reason ? { reason: opts.reason } : {})
  printJson({
    invocation: result.invocation,
    session: result.session,
  })
}

async function reconcileInvocationCommand(invocationId: string, opts: { diagnostic?: string, state?: string, worker?: string }): Promise<void> {
  const { paths, invocation } = await resolveInvocationHome(invocationId, opts.worker)
  const session = getSession(invocation.sessionId)
  if (!session)
    throw new Error(`session not found: ${invocation.sessionId}`)
  const runtime = await buildRuntimeFromPaths(paths, requireWorkerRow(session.workerId))
  const result = await runtime.reconcileEngineInvocation(invocation.id, {
    ...(opts.state ? { state: opts.state as 'exited' | 'killed' | 'lost' | 'not_spawned' | 'spawned' } : {}),
    ...(opts.diagnostic ? { diagnostic: opts.diagnostic } : {}),
  })
  printJson({
    invocation: result.invocation,
    session: result.session,
  })
}

async function archiveSessionCommand(id: string, opts: { worker?: string } = {}): Promise<void> {
  const { session } = await resolveSessionHome(id, opts.worker)
  printJson({ session: updateSession({ id: session.id, status: 'archived' }) })
}

async function deleteSessionCommand(id: string, opts: { worker?: string } = {}): Promise<void> {
  const { session } = await resolveSessionHome(id, opts.worker)
  deleteSession(session.id)
  printJson({ deleted: true, session })
}

async function listWorkspaceFiles(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ files: listFiles(opts.workspace) })
}

async function showFile(filePath: string, opts: { workspace?: string, worker?: string }): Promise<void> {
  await ensureDefaultDb()
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
  const paths = await ensureDefaultDb()
  printJson({ apps: createHost(paths).listApps() })
}

async function showAppCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  printJson({ app: createHost(paths).getApp(id) })
}

async function installAppCommand(descriptorPath: string): Promise<void> {
  const paths = await ensureDefaultDb()
  printJson({ app: await createHost(paths).installAppFromPath(descriptorPath) })
}

async function enableAppCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  const host = createHost(paths)
  printJson({ app: host.enableApp(id), catalog: host.listCatalog() })
}

async function archiveAppCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  const host = createHost(paths)
  printJson({ app: host.archiveApp(id), catalog: host.listCatalog() })
}

async function deleteAppCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  printJson({ app: createHost(paths).deleteApp(id) })
}

async function doctorAppCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  printJson({ app: createHost(paths).healthcheckApp(id) })
}

async function permissionsAppCommand(id: string): Promise<void> {
  const paths = await ensureDefaultDb()
  const app = createHost(paths).getApp(id)
  printJson({ appId: id, descriptor: app?.descriptor ?? null, permissions: [] })
}

async function bootstrapAppCommand(scope: string): Promise<void> {
  const paths = await ensureDefaultDb()
  if (scope !== 'official')
    throw new Error(`unsupported app bootstrap scope: ${scope}`)
  const bootstrap = await bootstrapOfficialSoulApps(createHost(paths))
  printJson({ bootstrap, catalog: bootstrap.catalog })
  if (bootstrap.status === 'fail')
    process.exitCode = 1
}

export async function convergeHostAfterCliUpgrade(): Promise<{ bootstrap: Awaited<ReturnType<WorkerOrchestrator['bootstrapOfficialSoulApps']>>, home: string }> {
  const paths = await ensureDb()
  const host = createHost(paths)
  const bootstrap = await bootstrapOfficialSoulApps(host)
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

async function buildSoulCommand(dir?: string): Promise<void> {
  const rootDir = path.resolve(dir ?? process.cwd())
  const { buildSoul } = await loadSoulAppSdk()
  const build = await buildSoul(rootDir)
  const descriptorFile = portableRelativePath(rootDir, build.outputPath)

  printJson({
    appId: descriptorIdentityString(build.descriptor, 'id'),
    descriptorPath: build.outputPath,
    files: [descriptorFile],
    generatedSections: build.discovery.generatedSections,
    next: [
      `aiworker app validate ${descriptorFile}`,
      'aiworker app install dist/soul.descriptor.json',
    ],
    path: rootDir,
    status: build.status,
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
    appId: descriptorIdentityString(descriptorResult.descriptor, 'id'),
    descriptor: descriptorResult.descriptor,
    descriptorIssues,
    descriptorPath: resolved.descriptorPath,
    discovery: sdkValidation?.discovery ?? null,
    rootDir: resolved.rootDir,
    sdkIssues,
    sdkStatus: sdkValidation?.status ?? null,
    source: resolved.source,
    status,
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

function smokeDescriptorAssets(rootDir: string, descriptorPath: string, descriptor: SoulDescriptorV1): { engineAssets: 'pass' } {
  const expectedDescriptorPath = path.join(rootDir, SOUL_DESCRIPTOR_OUTPUT_PATH)
  if (path.resolve(descriptorPath) !== path.resolve(expectedDescriptorPath))
    throw new Error(`Soul descriptor must be located at ${SOUL_DESCRIPTOR_OUTPUT_PATH}.`)
  if (descriptor.engine.workspaceAssets)
    assertDescriptorDirectory(rootDir, descriptor.engine.workspaceAssets.source, 'workspace assets')
  if (descriptor.engine.skills)
    assertDescriptorDirectory(rootDir, descriptor.engine.skills.source, 'skills')
  for (const [target, mcp] of Object.entries(descriptor.engine.mcp?.targets ?? {}))
    assertDescriptorFile(rootDir, mcp.file, `${target} native MCP file`)
  return { engineAssets: 'pass' }
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
    .catch(async () => import('../../../packages/soul-sdk/src/index')) as Promise<SoulAppSdkModule>
  return soulAppSdk
}

function ensureScaffoldSdkLink(targetDir: string): void {
  if (!existsSync(SOURCE_SOUL_APP_SDK_ROOT))
    return
  const linkPath = path.join(targetDir, 'node_modules/@zonease/aiworker-soul-sdk')
  if (existsSync(linkPath))
    return
  mkdirSync(path.dirname(linkPath), { recursive: true })
  symlinkSync(SOURCE_SOUL_APP_SDK_ROOT, linkPath, 'dir')
}

// `aiworker config` is the Worker-level engine/execution-mode config (daemon local-settings).
// It is distinct from `worker config` (the worker-scoped Host config envelope command tree).
function requireExecutionMode(value: unknown): 'byok' | 'local-cli' {
  const mode = requireText(value, 'mode')
  if (mode === 'local-cli' || mode === 'byok')
    return mode
  throw new Error(`unsupported execution mode: ${mode} (expected local-cli or byok)`)
}

// Always print the redacted readiness view (byok.apiKeyRefPresent boolean), never the raw
// local-settings (which carries the literal byok.apiKeyRef reference). No ref ever printed.
function printLocalEngineConfigView(): void {
  const settings = readLocalEngineSettings()
  printJson({
    config: {
      byok: {
        apiKeyRefPresent: settings.byok.apiKeyRefPresent,
        model: settings.byok.model,
        provider: settings.byok.provider,
      },
      engineId: settings.engineId,
      engines: settings.engines.map(engine => ({ id: engine.id, installed: engine.installed, name: engine.name })),
      executionMode: settings.executionMode,
    },
  })
}

async function configShowCommand(): Promise<void> {
  await ensureDb()
  printLocalEngineConfigView()
}

async function configSetEngineCommand(engineId: string): Promise<void> {
  const id = requireText(engineId, 'engine id')
  // Validate against the known native engines before any write — an unknown id is an
  // actionable error, never persisted to local-settings.
  if (!LOCAL_ENGINE_DEFINITIONS.some(definition => definition.id === id)) {
    throw new Error(
      `unknown engine: ${id} (expected one of: ${LOCAL_ENGINE_DEFINITIONS.map(definition => definition.id).join(', ')})`,
    )
  }
  await ensureDb()
  const current = loadLocalSettings()
  saveLocalSettings({
    ...current,
    engineId: id,
    executionMode: 'local-cli',
    updatedAt: new Date().toISOString(),
  })
  printLocalEngineConfigView()
}

async function configSetModeCommand(mode: string): Promise<void> {
  const executionMode = requireExecutionMode(mode)
  await ensureDb()
  const current = loadLocalSettings()
  saveLocalSettings({
    ...current,
    executionMode,
    updatedAt: new Date().toISOString(),
  })
  printLocalEngineConfigView()
}

async function configSetByokCommand(opts: { keyRef?: string, baseUrl?: string, model?: string, provider?: string }): Promise<void> {
  // Only a secret reference is accepted; saveLocalSettings' assertSafeSecretRefs rejects
  // literal secrets (LOCAL_SETTINGS_SECRET). The CLI never inspects the value itself.
  const apiKeyRef = requireText(opts.keyRef, 'key-ref')
  await ensureDb()
  const current = loadLocalSettings()
  saveLocalSettings({
    ...current,
    byok: {
      ...current.byok,
      apiKeyRef,
      ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.provider !== undefined ? { provider: opts.provider } : {}),
    },
    executionMode: 'byok',
    updatedAt: new Date().toISOString(),
  })
  printLocalEngineConfigView()
}

function registerCommands(): void {
  cli.command('init', 'initialize host-local AIWorker home and Soul workers').action(runInit)
  cli.command('doctor', 'grade worker runtime/engine/service health and surface fixes')
    .option('--json', 'emit the DoctorReport plus full context as JSON')
    .option('--probe', 'run deeper connectivity probes (slower)')
    .option('--strict', 'treat warnings as failures (warn → exit 1)')
    .option('--verbose', 'print the diagnostic context summary alongside the report')
    .action((opts: DoctorCliOptions) => runDoctor(opts))
  cli.command('update', 'check or apply an AIWorker CLI update')
    .option('--check', 'check for updates without changing files')
    .option('--dry-run', 'print planned update actions without applying them')
    .option('--target <version>', 'explicit target version')
    .option('--channel <channel>', 'release channel: stable or preview')
    .option('--pre', 'use preview release channel')
    .action((opts: UpdateCliOptions) => runUpdateCommand('update', opts))
  cli.command('upgrade', 'alias for aiworker update')
    .option('--check', 'check for updates without changing files')
    .option('--dry-run', 'print planned update actions without applying them')
    .option('--target <version>', 'explicit target version')
    .option('--channel <channel>', 'release channel: stable or preview')
    .option('--pre', 'use preview release channel')
    .action((opts: UpdateCliOptions) => runUpdateCommand('upgrade', opts))

  cli.command('start [id]', 'start one fleet worker (default/<id>) or all (--all) in the background and print URLs')
    .option('--all', 'start every fleet worker')
    .option('--host <host>', 'bind host')
    .option('--port <n>', 'port (single target only)', { type: [Number] })
    .action((id: string | undefined, opts: { all?: boolean, host?: string, port?: number[] }) =>
      runFleetStart({ all: opts.all, host: opts.host, id, port: optionalNumber(opts.port) }))
  cli.command('stop [id]', 'stop one fleet worker (default/<id>) or all (--all)')
    .option('--all', 'stop every fleet worker')
    .action((id: string | undefined, opts: { all?: boolean }) => runFleetStop({ all: opts.all, id }))
  cli.command('fleet list', 'list fleet workers (id/app/home/port/running)').action(runFleetList)
  cli.command('fleet status', 'list fleet workers and probe each /health').action(runFleetStatus)
  cli.command('daemon start', 'ensure the bundled Freeform Worker and start the service in background without opening Workbench').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => startDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon foreground', 'ensure the bundled Freeform Worker and run the service in foreground without opening Workbench').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon status', 'show local daemon status').action(() => printJson(daemonStatus()))
  cli.command('daemon stop', 'stop local daemon').action(stopDaemon)
  cli.command('daemon restart', 'ensure the bundled Freeform Worker and restart the local service').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => restartDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon logs', 'show local daemon logs').option('--tail <n>', 'line count', { type: [Number] }).action((opts: { tail?: number[] }) => showLogs({ tail: optionalNumber(opts.tail) }))
  cli.command('daemon check', 'check local daemon health').option('--host <host>', 'host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonCheck({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('provision', 'run this Worker and check in to a Host with a provision token')
    .option('--host <url>', 'Host URL')
    .option('--token <token>', 'provision token')
    .action((opts: { host?: string, token?: string }) =>
      provisionCommand(
        { host: opts.host, token: opts.token },
        ['provision', '--host', opts.host ?? '', '--token', opts.token ?? ''],
      ))

  cli.command('app list', 'list installed Host Soul Apps').action(listAppsCommand)
  cli.command('app show <id>', 'show one installed Host Soul App').action(showAppCommand)
  cli.command('app install <descriptor>', 'install a local Soul descriptor').action(installAppCommand)
  cli.command('app enable <id>', 'enable an installed Soul App').action(enableAppCommand)
  cli.command('app archive <id>', 'archive an installed Soul App').action(archiveAppCommand)
  cli.command('app delete <id>', 'hard-delete installed Soul App metadata').action(deleteAppCommand)
  cli.command('app doctor <id>', 'run static Soul App healthcheck').action(doctorAppCommand)
  cli.command('app permissions <id>', 'show declared Soul App permissions').action(permissionsAppCommand)
  cli.command('app bootstrap <scope>', 'install and enable first-party Soul Apps by shortcut scope').action(bootstrapAppCommand)
  cli.command('app create <id>', 'scaffold a descriptor-only SDK Soul').option('--dir <path>', 'target directory').action(createAppScaffoldCommand)
  cli.command('app validate <path>', 'validate a Soul directory or dist/soul.descriptor.json').action(validateAppCommand)
  cli.command('app smoke <path>', 'run descriptor-only Soul App smoke checks').action(smokeAppCommand)

  cli.command('soul create <name>', 'scaffold a descriptor-only SDK Soul').option('--dir <path>', 'target directory').action(createAppScaffoldCommand)
  cli.command('soul build [dir]', 'build a Soul descriptor from source').action((dir?: string) => buildSoulCommand(dir))
  cli.command('soul list', 'list installed app-projected vertical Souls').action(async () => {
    const paths = await ensureDefaultDb()
    printJson({ souls: createHost(paths).listSouls() })
  })
  cli.command('worker create [id]', 'create a standalone fleet worker in its own home')
    .option('--app <appId>', 'Soul App id (appId, e.g. aiworker-freeform)')
    .option('--name <text>', 'worker name (defaults to <id>)')
    .option('--port <n>', 'daemon port (auto-allocated when omitted)', { type: [Number] })
    .action((id: string | undefined, opts: { app?: string, name?: string, port?: number[] }) =>
      createWorkerCommand({ app: opts.app, id, name: opts.name, port: optionalNumber(opts.port) }))
  cli.command('worker list', 'list local Soul workers').action(async () => {
    printJson({ workers: await ensureAllWorkers() })
  })
  cli.command('worker show <id>', 'show one local Soul worker').action(async (id: string) => {
    try {
      const { worker } = await resolveWorkerTarget(id)
      printJson({ worker })
    }
    catch (error) {
      if (error instanceof Error && error.message === `worker not found: ${id}`) {
        printJson({ worker: null })
        return
      }
      throw error
    }
  })
  cli.command('worker select <id>', 'select default local Soul worker').action(selectWorkerCommand)
  cli.command('worker config list <workerId>', 'list worker-scoped Host config envelopes').action(listWorkerConfigCommand)
  cli.command('worker config set <workerId> <configKey>', 'set a worker-scoped Host config envelope')
    .option('--kind <kind>', 'config value kind')
    .option('--target <target>', 'engine target, all, or none')
    .option('--source-ref <ref>', 'non-secret source reference')
    .option('--checksum <checksum>', 'optional checksum')
    .option('--options-json <json>', 'non-secret operational options JSON object')
    .option('--disabled', 'store the config envelope as disabled')
    .action(setWorkerConfigCommand)
  cli.command('worker config archive <workerId> <configKey>', 'archive a worker-scoped Host config envelope').action(archiveWorkerConfigCommand)

  // Worker engine/execution-mode config (daemon local-settings) — distinct from `worker config`.
  cli.command('config show', 'show the Worker engine selection and execution mode').action(configShowCommand)
  cli.command('config set-engine <engineId>', 'select the native engine and switch to local-cli mode').action(configSetEngineCommand)
  cli.command('config set-mode <mode>', 'set execution mode: local-cli or byok').action(configSetModeCommand)
  cli.command('config set-byok', 'configure BYOK execution (stores a secret reference, never a literal secret)')
    .option('--key-ref <ref>', 'BYOK API key reference (env:NAME / $VAR / secretref:...); never a literal secret')
    .option('--base-url <url>', 'BYOK API base URL')
    .option('--model <id>', 'BYOK model id')
    .option('--provider <name>', 'BYOK provider name')
    .action(configSetByokCommand)
  cli.command('worker archive <id>', 'archive a local Soul worker').action(archiveWorkerCommand)
  cli.command('worker delete <id>', 'hard-delete local Soul worker metadata').action(deleteWorkerCommand)

  cli.command('workspace create', 'create a worker workspace').option('--name <text>', 'workspace name').option('--type <id>', 'workspace type').option('--worker <id>', 'worker id').action(createWorkspaceCommand)
  cli.command('workspace list', 'list worker workspaces').option('--worker <id>', 'worker id').action(listWorkspaceCommand)
  cli.command('workspace show <id>', 'show one workspace').action(async (id: string) => {
    await ensureDefaultDb()
    printJson({ workspace: getWorkspace(id) })
  })
  cli.command('workspace projection refresh <id>', 'refresh workspace engine projection').option('--target <target>', 'projection target: codex or claude-code').action(refreshWorkspaceProjectionCommand)
  cli.command('workspace archive <id>', 'archive a workspace locator').action(archiveWorkspaceCommand)
  cli.command('workspace delete <id>', 'hard-delete workspace locator metadata').action(deleteWorkspaceCommand)

  cli.command('session start', 'create a workspace session and first invocation')
    .option('--workspace <id>', 'workspace id')
    .option('--title <text>', 'session title')
    .option('--input <text>', 'initial invocation input')
    .option('--engine <id>', 'engine id for this new session')
    .option('--model <id>', 'Codex model override')
    .option('--reasoning <effort>', 'Codex reasoning effort override')
    .option('--worker <id>', 'worker id')
    .action(startSessionCommand)
  cli.command('session list', 'list sessions').option('--workspace <id>', 'workspace id').action(listSessionCommand)
  cli.command('session show <id>', 'show one session').action(showSession)
  cli.command('session invoke', 'create a session-level engine invocation').option('--session <id>', 'session id').option('--input <text>', 'invocation input').option('--model <id>', 'Codex model override').option('--reasoning <effort>', 'Codex reasoning effort override').option('--worker <id>', 'worker id').action(invokeSessionCommand)
  cli.command('session events <invocationId>', 'list normalized bridge events for an engine invocation').option('--after <seq>', 'return only events after this seq', { type: [Number] }).option('--limit <n>', 'maximum events to return', { type: [Number] }).option('--worker <id>', 'worker id').action(showInvocationEventsCommand)
  cli.command('session reconcile <invocationId>', 'reconcile native engine process state for an engine invocation').option('--worker <id>', 'worker id').option('--state <processState>', 'observed process state: not_spawned/spawned/exited/killed/lost').option('--diagnostic <text>', 'reconcile diagnostic (redacted before persistence)').action(reconcileInvocationCommand)
  cli.command('session cancel <invocationId>', 'cancel an engine invocation by id').option('--worker <id>', 'worker id').option('--reason <text>', 'cancel reason (redacted before persistence)').action(cancelInvocationCommand)
  cli.command('session archive <id>', 'archive an AIWorker session').action(archiveSessionCommand)
  cli.command('session delete <id>', 'hard-delete AIWorker session metadata').action(deleteSessionCommand)

  cli.command('files list', 'list workspace files').option('--workspace <id>', 'workspace id').action(listWorkspaceFiles)
  cli.command('files show <path>', 'print workspace file').option('--workspace <id>', 'workspace id').option('--worker <id>', 'worker id').action(showFile)

  cli.command('settings list', 'list host daemon settings').action(async () => {
    await ensureDefaultDb()
    printJson({ settings: listSettings() })
  })
  cli.command('engine select <engine>', 'set engine hint').action(async (engine: string) => {
    await ensureDefaultDb()
    printJson({ setting: setSetting('engine.default', { engine }) })
  })

  cli.command('open', 'open local Worker Workbench URL').option('--port <n>', 'web port', { type: [Number] }).action((opts: { port?: number[] }) => {
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
  'start [id]|--all',
  'stop [id]|--all',
  'fleet list|status',
  'daemon start|stop|restart|status|logs',
  'open',
  'doctor',
  'update',
  'app list|show|install|enable|archive|delete|bootstrap',
  'worker create|list|select|config|archive|delete',
  'workspace create|list|projection refresh|archive|delete',
  'session start|invoke|events|reconcile|cancel|list|show|archive|delete',
  '',
  'Run `aiworker commands --all` for authoring and diagnostics commands.',
]

const FULL_COMMAND_INDEX = [
  'aiworker command index',
  'start [id]|--all',
  'stop [id]|--all',
  'fleet list|status',
  'init',
  'update|upgrade',
  'daemon start|foreground|status|stop|restart|logs|check',
  'app list|show|install|enable|archive|delete|doctor|permissions|bootstrap|create|validate|smoke',
  'soul list|create|build',
  'worker create|list|show|select|config list|config set|config archive|archive|delete',
  'workspace create|list|show|projection refresh|archive|delete',
  'session start|invoke|events|reconcile|cancel|list|show|archive|delete',
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
    const parsed = cli.parse(preprocessArgv(defaultToStartCommand(argv)), { run: false })
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
    process.stderr.write(`${redactCliInspectOutput(error instanceof Error ? error.message : String(error))}\n`)
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

// `aiworker` with no subcommand is the zero-config entry: it runs `start`. Help
// and version short-circuit before this; only a bare invocation (no command
// token, no help/version flag) is rewritten so service flags like `--port` still
// flow to `start`.
export function defaultToStartCommand(argv: string[]): string[] {
  const args = argv.slice(2)
  const hasCommandToken = args.some(arg => !arg.startsWith('-'))
  if (hasCommandToken)
    return argv
  if (args.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-v'))
    return argv
  const next = argv.slice()
  next.splice(2, 0, 'start')
  return next
}

if (import.meta.main)
  process.exit(await runCli(process.argv))
