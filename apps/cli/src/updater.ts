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
  yes?: boolean
}

export interface ParsedUpdateOptions {
  channel: UpdateChannel
  command: UpdateCommandName
  mode: UpdateMode
  prerelease: boolean
  target?: string
  yes: boolean
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
  kind: InstallSourceKind
  packageManager?: PackageManager
  reason?: string
}

export interface ReleaseTarget {
  checksumUrl?: string
  downloadUrl?: string
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
  requiresConfirmation: boolean
  source: InstallSource
  status: UpgradePlanStatus
  target: ReleaseTarget
  targetVersion: string
}

const packageName = '@zonease/aiworker-cli'

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
    yes: opts.yes === true,
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

  if (moduleDir.includes('/aiworker-darwin-') || moduleDir.includes('/aiworker-linux-')) {
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
    requiresConfirmation: input.options.mode === 'apply' && actions.length > 0 && !input.options.yes,
    source: input.source,
    status,
    target: input.target,
    targetVersion: input.target.version,
  }
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
