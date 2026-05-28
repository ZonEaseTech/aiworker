import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import process from 'node:process'

export type UpdateCommandName = 'update' | 'upgrade'
export type UpdateMode = 'apply' | 'check' | 'dry-run'
export type UpdateChannel = 'stable' | 'preview'
export type InstallSourceKind = 'bun-global' | 'ephemeral' | 'github-tarball' | 'npm-global' | 'source-checkout' | 'unknown'
export type PackageManager = 'bun' | 'npm'
export type ReleaseSource = 'github' | 'npm'
export type UpgradePlanStatus = 'already_current' | 'source_not_supported' | 'source_unknown' | 'update_available'

export interface UpdateCliOptions {
  check?: boolean
  channel?: UpdateChannel
  dryRun?: boolean
  pre?: boolean
  target?: string
}

export interface ParsedUpdateOptions {
  channel: UpdateChannel
  command: UpdateCommandName
  mode: UpdateMode
  prerelease: boolean
  target?: string
}

export interface InstallSourceInput {
  argv1?: string
  bunGlobalBinDirs?: string[]
  moduleDir?: string
  npmGlobalBinDirs?: string[]
  realArgv1?: string
}

export interface InstallSource {
  canAutoUpgrade: boolean
  detail?: string
  kind: InstallSourceKind
  packageManager?: PackageManager
  reason?: string
}

export interface ReleaseTarget {
  checksumUrl?: null | string
  downloadUrl?: null | string
  isPrerelease?: boolean
  source: ReleaseSource
  version: string
}

export interface UpgradeAction {
  args?: string[]
  checksumUrl?: string
  command?: PackageManager
  downloadUrl?: string
  kind: 'daemon-restart' | 'github-tarball' | 'host-convergence' | 'package-manager'
  packageManager?: PackageManager
}

export interface BuildUpgradePlanInput {
  currentVersion: string
  options: ParsedUpdateOptions
  source: InstallSource
  target: ReleaseTarget
}

export interface UpgradePlan {
  actions: UpgradeAction[]
  currentVersion: string
  mode: UpdateMode
  source: InstallSource
  status: UpgradePlanStatus
  target: ReleaseTarget
  targetVersion: string
}

export interface ResolveReleaseTargetInput {
  fetch?: FetchRelease
  options: ParsedUpdateOptions
  platformAssetName?: () => string
  source: InstallSource
}

export interface ExecuteUpgradePlanInput {
  convergeHost: () => MaybePromise<void>
  downloadAndReplace: (action: { checksumUrl: string, downloadUrl: string }) => MaybePromise<void>
  plan: UpgradePlan
  restartDaemon: () => MaybePromise<void>
  runCommand: (command: PackageManager, args: string[]) => MaybePromise<void>
}

export interface ExecuteUpgradePlanResult {
  completedActions: UpgradeAction['kind'][]
  status: 'completed' | 'dry_run' | 'skipped'
}

export interface ManagedDaemonProbe {
  command: null | string
  expectedHome: string
  pid: null | number
  pidFileHome: string
  running: boolean
}

export interface ManagedDaemonDecision {
  allowed: boolean
  reason: 'home-mismatch' | 'managed-daemon' | 'not-managed-daemon' | 'not-running' | 'unknown-command'
}

export interface DailyUpdateNoticeValue {
  checkedAt?: string
  latestSeenVersion?: string
}

export interface DailyUpdateNoticeState {
  canCheck: boolean
  latestSeenVersion: null | string
}

export interface UpgradeReportInput {
  completedActions: string[]
  currentVersion: string
  daemon: { reason: string, restarted: boolean }
  source: InstallSource
  status: string
  targetVersion: string
}

type FetchRelease = (url: string) => Promise<Response>
type MaybePromise<T> = Promise<T> | T

interface NpmRegistryResponse {
  'dist-tags'?: Record<string, string | undefined>
}

interface GitHubReleaseAssetResponse {
  browser_download_url?: unknown
  name?: string
}

interface GitHubReleaseResponse {
  assets: GitHubReleaseAssetResponse[]
  tag_name: string
}

const packageName = '@zonease/aiworker-cli'
const npmRegistryUrl = 'https://registry.npmjs.org/@zonease%2Faiworker-cli'
const githubLatestReleaseUrl = 'https://api.github.com/repos/ZonEaseTech/aiworker/releases/latest'

export function parseUpdateCommandOptions(command: UpdateCommandName, opts: UpdateCliOptions): ParsedUpdateOptions {
  if (opts.channel !== undefined && opts.channel !== 'stable' && opts.channel !== 'preview') {
    throw new Error(`unsupported update channel: ${opts.channel}`)
  }

  const prerelease = opts.pre === true || opts.channel === 'preview'
  const mode: UpdateMode = opts.check === true ? 'check' : opts.dryRun === true ? 'dry-run' : 'apply'

  return {
    channel: prerelease ? 'preview' : 'stable',
    command,
    mode,
    prerelease,
    target: opts.target,
  }
}

export function detectInstallSource(input: InstallSourceInput): InstallSource {
  const argv1 = normalizePath(input.argv1)
  const realArgv1 = normalizePath(input.realArgv1)
  const moduleDir = normalizePath(input.moduleDir)
  const evidence = [argv1, realArgv1, moduleDir].filter(Boolean).join('\n')

  if (moduleDir.includes('/apps/cli/src') || realArgv1.endsWith('/apps/cli/src/aiworker.ts')) {
    return { canAutoUpgrade: false, kind: 'source-checkout', reason: 'source checkout cannot self-modify' }
  }

  if (evidence.includes('/.npm/_npx/') || evidence.includes('/.bun/install/cache/')) {
    return { canAutoUpgrade: false, kind: 'ephemeral', reason: 'ephemeral runner cache cannot be upgraded in place' }
  }

  if (isUnderAnyDir(argv1, input.npmGlobalBinDirs) || isUnderAnyDir(realArgv1, input.npmGlobalBinDirs)) {
    return { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' }
  }

  if (isUnderAnyDir(argv1, input.bunGlobalBinDirs) || isUnderAnyDir(realArgv1, input.bunGlobalBinDirs)) {
    return { canAutoUpgrade: true, kind: 'bun-global', packageManager: 'bun' }
  }

  if (evidence.includes('/.bun/install/global/node_modules/@zonease/aiworker-cli')) {
    return { canAutoUpgrade: true, kind: 'bun-global', packageManager: 'bun' }
  }

  if (evidence.includes('/lib/node_modules/@zonease/aiworker-cli')) {
    return { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' }
  }

  if (evidence.includes('/aiworker-darwin-') || evidence.includes('/aiworker-linux-')) {
    return { canAutoUpgrade: true, kind: 'github-tarball' }
  }

  return { canAutoUpgrade: false, kind: 'unknown', reason: 'installation source could not be proven' }
}

export function buildUpgradePlan(input: BuildUpgradePlanInput): UpgradePlan {
  const actions: UpgradeAction[] = []
  let status: UpgradePlanStatus

  if (compareVersions(input.currentVersion, input.target.version) >= 0) {
    status = 'already_current'
  }
  else if (input.source.kind === 'unknown') {
    status = 'source_unknown'
  }
  else if (!input.source.canAutoUpgrade && input.options.mode !== 'check') {
    status = 'source_not_supported'
  }
  else if (input.source.kind === 'github-tarball' && input.options.mode !== 'check' && (!input.target.downloadUrl || !input.target.checksumUrl)) {
    status = 'source_not_supported'
  }
  else {
    status = 'update_available'
  }

  if (status === 'update_available' && input.options.mode !== 'check') {
    if (input.source.packageManager) {
      actions.push(buildPackageManagerAction(input.source.packageManager, input.target.version))
    }
    else if (input.source.kind === 'github-tarball' && input.target.downloadUrl && input.target.checksumUrl) {
      actions.push({
        checksumUrl: input.target.checksumUrl,
        downloadUrl: input.target.downloadUrl,
        kind: 'github-tarball',
      })
    }

    if (input.options.mode === 'apply' && actions.length > 0) {
      actions.push({ kind: 'host-convergence' }, { kind: 'daemon-restart' })
    }
  }

  return {
    actions,
    currentVersion: input.currentVersion,
    mode: input.options.mode,
    source: input.source,
    status,
    target: input.target,
    targetVersion: input.target.version,
  }
}

export async function resolveReleaseTarget(input: ResolveReleaseTargetInput): Promise<ReleaseTarget> {
  if (input.options.target) {
    return {
      checksumUrl: null,
      downloadUrl: null,
      isPrerelease: input.options.prerelease,
      source: input.source.kind === 'github-tarball' ? 'github' : 'npm',
      version: input.options.target,
    }
  }

  if (input.source.kind === 'github-tarball') {
    const response = validateGitHubReleaseResponse(await fetchJson<unknown>(input.fetch, githubLatestReleaseUrl))
    const assetName = (input.platformAssetName ?? platformAssetName)()
    const asset = response.assets.find(candidate => candidate.name === assetName)
    const checksumAsset = response.assets.find(candidate => candidate.name === `${assetName}.sha256`)

    return {
      checksumUrl: resolveGitHubReleaseAssetUrl(checksumAsset, `${assetName}.sha256`),
      downloadUrl: resolveGitHubReleaseAssetUrl(asset, assetName),
      isPrerelease: input.options.prerelease,
      source: 'github',
      version: response.tag_name.replace(/^v/, ''),
    }
  }

  const response = validateNpmRegistryResponse(await fetchJson<unknown>(input.fetch, npmRegistryUrl))
  const tag = input.options.prerelease ? 'preview' : 'latest'
  const version = response['dist-tags']?.[tag]

  if (typeof version !== 'string' || version.length === 0)
    throw new Error(`npm dist-tag not found: ${tag}`)

  return {
    checksumUrl: null,
    downloadUrl: null,
    isPrerelease: input.options.prerelease,
    source: 'npm',
    version,
  }
}

export async function executeUpgradePlan(input: ExecuteUpgradePlanInput): Promise<ExecuteUpgradePlanResult> {
  if (input.plan.mode === 'dry-run')
    return { completedActions: [], status: 'dry_run' }

  if (input.plan.status !== 'update_available' || input.plan.actions.length === 0)
    return { completedActions: [], status: 'skipped' }

  const completedActions: UpgradeAction['kind'][] = []

  for (const action of input.plan.actions) {
    if (action.kind === 'package-manager') {
      if (!action.command || !action.args)
        throw new Error('package-manager upgrade action is missing command or args')

      const runCommand = requireExecutorHook(input.runCommand, 'runCommand')
      await runCommand(action.command, action.args)
    }
    else if (action.kind === 'github-tarball') {
      if (!action.downloadUrl || !action.checksumUrl)
        throw new Error('github tarball upgrade action requires downloadUrl and checksumUrl')

      const downloadAndReplace = requireExecutorHook(input.downloadAndReplace, 'downloadAndReplace')
      await downloadAndReplace({ checksumUrl: action.checksumUrl, downloadUrl: action.downloadUrl })
    }
    else if (action.kind === 'host-convergence') {
      const convergeHost = requireExecutorHook(input.convergeHost, 'convergeHost')
      await convergeHost()
    }
    else {
      const restartDaemon = requireExecutorHook(input.restartDaemon, 'restartDaemon')
      await restartDaemon()
    }

    completedActions.push(action.kind)
  }

  return { completedActions, status: 'completed' }
}

export function verifySha256Text(content: Buffer | Uint8Array | string, checksumText: string): boolean {
  const expected = checksumText.trim().split(/\s+/)[0]
  if (!expected)
    return false

  const actual = createHash('sha256').update(content).digest('hex')
  return expected === actual
}

export function canRestartManagedDaemon(input: ManagedDaemonProbe): ManagedDaemonDecision {
  if (!input.running || !input.pid)
    return { allowed: false, reason: 'not-running' }
  if (normalizePath(input.pidFileHome) !== normalizePath(input.expectedHome))
    return { allowed: false, reason: 'home-mismatch' }
  if (!input.command)
    return { allowed: false, reason: 'unknown-command' }

  const commandTokens = input.command.trim().split(/\s+/).filter(Boolean)
  const hasManagedBinary = commandTokens.some(token => token === 'aiworker' || token.endsWith('/aiworker'))
  const daemonIndex = commandTokens.findIndex(token => token === 'daemon')
  const hasDaemonForeground = daemonIndex >= 0 && commandTokens[daemonIndex + 1] === 'foreground'

  if (
    input.command.includes('apps/cli/src/aiworker.ts')
    || commandTokens.includes('dev')
    || !hasManagedBinary
    || !hasDaemonForeground
  ) {
    return { allowed: false, reason: 'not-managed-daemon' }
  }

  return { allowed: true, reason: 'managed-daemon' }
}

export function readDailyUpdateNoticeState(value: DailyUpdateNoticeValue | null, now: Date): DailyUpdateNoticeState {
  if (!value?.checkedAt) {
    return {
      canCheck: true,
      latestSeenVersion: value?.latestSeenVersion ?? null,
    }
  }

  const checkedAt = new Date(value.checkedAt)
  const ageMs = now.getTime() - checkedAt.getTime()
  const canCheck = !Number.isFinite(checkedAt.getTime()) || ageMs < 0 || ageMs >= 24 * 60 * 60 * 1000

  return {
    canCheck,
    latestSeenVersion: value.latestSeenVersion ?? null,
  }
}

export function formatUpgradeReport(input: UpgradeReportInput): string {
  const sourceDetail = input.source.detail ?? input.source.kind
  return [
    `AIWorker update ${input.status}: ${input.currentVersion} -> ${input.targetVersion}`,
    `Source: ${sourceDetail}`,
    `Actions: ${input.completedActions.length > 0 ? input.completedActions.join(', ') : 'none'}`,
    `Daemon: ${input.daemon.restarted ? 'restarted' : input.daemon.reason}`,
  ].join('\n')
}

export function platformAssetName(): string {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch

  return `aiworker-${platform}-${arch}.tar.gz`
}

function buildPackageManagerAction(packageManager: PackageManager, version: string): UpgradeAction {
  if (packageManager === 'bun') {
    return {
      args: ['install', '-g', `${packageName}@${version}`],
      command: 'bun',
      kind: 'package-manager',
      packageManager,
    }
  }

  return {
    args: ['install', '-g', `${packageName}@${version}`],
    command: 'npm',
    kind: 'package-manager',
    packageManager,
  }
}

async function fetchJson<T>(fetchRelease: FetchRelease | undefined, url: string): Promise<T> {
  const response = await (fetchRelease ?? globalThis.fetch)(url)

  if (!response.ok)
    throw new Error(`failed to resolve release target from ${url}: HTTP ${response.status}`)

  return await response.json() as T
}

function validateNpmRegistryResponse(value: unknown): NpmRegistryResponse {
  if (!isRecord(value))
    return {}

  const distTags = value['dist-tags']
  if (!isRecord(distTags))
    return {}

  return {
    'dist-tags': Object.fromEntries(
      Object.entries(distTags).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
  }
}

function validateGitHubReleaseResponse(value: unknown): GitHubReleaseResponse {
  if (!isRecord(value) || typeof value.tag_name !== 'string' || value.tag_name.length === 0)
    throw new Error('github release tag not found')

  if (!Array.isArray(value.assets))
    throw new Error('github release assets invalid')

  return {
    assets: value.assets.filter(isGitHubReleaseAssetResponse),
    tag_name: value.tag_name,
  }
}

function isGitHubReleaseAssetResponse(value: unknown): value is GitHubReleaseAssetResponse {
  return isRecord(value)
    && (value.name === undefined || typeof value.name === 'string')
}

function resolveGitHubReleaseAssetUrl(asset: GitHubReleaseAssetResponse | undefined, assetName: string): string | null {
  if (asset === undefined)
    return null

  if (typeof asset.browser_download_url !== 'string' || asset.browser_download_url.trim().length === 0)
    throw new Error(`github release asset url invalid: ${assetName}`)

  return asset.browser_download_url
}

function requireExecutorHook<T extends (...args: never[]) => MaybePromise<void>>(hook: T | undefined, name: string): T {
  if (hook === undefined)
    throw new Error(`upgrade executor hook missing: ${name}`)

  return hook
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compareVersions(current: string, target: string): number {
  const currentSemver = parseSemver(current)
  const targetSemver = parseSemver(target)

  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentSemver.core[index] ?? 0
    const targetPart = targetSemver.core[index] ?? 0

    if (currentPart > targetPart)
      return 1
    if (currentPart < targetPart)
      return -1
  }

  return comparePrerelease(currentSemver.prerelease, targetSemver.prerelease)
}

function isUnderAnyDir(candidate: string, dirs?: string[]): boolean {
  if (!candidate)
    return false

  return (dirs ?? []).map(normalizePath).some((dir) => {
    if (!dir)
      return false

    return candidate === dir || candidate.startsWith(`${dir}/`)
  })
}

function normalizePath(value?: string): string {
  if (!value)
    return ''

  return value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

function comparePrerelease(current: string[], target: string[]): number {
  if (current.length === 0 && target.length === 0)
    return 0
  if (current.length === 0)
    return 1
  if (target.length === 0)
    return -1

  const width = Math.max(current.length, target.length)
  for (let index = 0; index < width; index += 1) {
    const currentPart = current[index]
    const targetPart = target[index]

    if (currentPart === undefined)
      return -1
    if (targetPart === undefined)
      return 1

    const currentNumber = parseNumericIdentifier(currentPart)
    const targetNumber = parseNumericIdentifier(targetPart)
    if (currentNumber !== undefined && targetNumber !== undefined) {
      if (currentNumber > targetNumber)
        return 1
      if (currentNumber < targetNumber)
        return -1
      continue
    }

    if (currentNumber !== undefined)
      return -1
    if (targetNumber !== undefined)
      return 1
    if (currentPart > targetPart)
      return 1
    if (currentPart < targetPart)
      return -1
  }

  return 0
}

function parseNumericIdentifier(value: string): number | undefined {
  if (!/^\d+$/.test(value))
    return undefined

  return Number.parseInt(value, 10)
}

function parseSemver(version: string): { core: number[], prerelease: string[] } {
  const withoutBuild = version.replace(/^v/, '').split('+', 1)[0] ?? ''
  const prereleaseStart = withoutBuild.indexOf('-')
  const coreVersion = prereleaseStart === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseStart)
  const prereleaseVersion = prereleaseStart === -1 ? undefined : withoutBuild.slice(prereleaseStart + 1)

  return {
    core: (coreVersion ?? '')
      .split('.')
      .slice(0, 3)
      .map(part => Number.parseInt(part, 10))
      .map(part => Number.isFinite(part) ? part : 0),
    prerelease: prereleaseVersion ? prereleaseVersion.split('.') : [],
  }
}
