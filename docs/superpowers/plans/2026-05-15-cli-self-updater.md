# CLI Self-Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add top-level `aiworker update` and `aiworker upgrade` aliases that safely upgrade the AIWorker CLI/Host distribution, converge Host metadata, and keep future worker-scoped update semantics separate.

**Architecture:** Keep the updater as a CLI-owned orchestration module with explicit dependency injection for network, package-manager commands, filesystem replacement, and daemon process inspection. Host convergence reuses the existing `ensureDb()` / `createHost(...).bootstrapOfficialSoulApps()` lifecycle so the Host refreshes metadata and official app manifests without interpreting Soul App domain data.

**Tech Stack:** Bun, TypeScript, `cac`, `bun:test`, AIWorker local Host runtime, SQLite worker metadata settings, npm registry API, GitHub Release API, existing CLI dist and daemon lifecycle.

---

## File Structure

- Create `apps/cli/src/updater.ts`: updater types, install-source detection, release resolution, upgrade planning, execution, daily notice state, checksum verification helpers, and restart guard helpers.
- Create `apps/cli/src/updater.test.ts`: focused TDD coverage for aliases, detection, resolver behavior, planning, dry-run/no-write behavior, checksum requirements, Host convergence dependencies, and daemon restart guards.
- Modify `apps/cli/src/aiworker.ts`: register `update` and `upgrade` commands, wire updater dependencies, expose `--check`, `--dry-run`, `--yes`, `--target`, `--channel`, and `--pre`, call the daily update notice from `doctor` and daemon startup, and include commands in the command index.
- Modify `apps/cli/src/aiworker.test.ts`: CLI-level tests for command aliases, command index, `--check` output, and source-checkout refusal.
- Modify `docs/cli.md`: document `update|upgrade`, read-only checks, default stable channel, supported install sources, and worker namespace reservation.
- Modify `docs/deployment.md`: document daemon restart behavior and GitHub tarball checksum policy.
- Create PMA files during implementation using the then-current next IDs. At this plan creation time the current tails are `FEAT-085`, `REL-034`, and `PLAN-324`, so the expected next feature slice is `FEAT-086 / PLAN-325`; verify the indexes before writing those files.

## Task 1: PMA Tracking And Baseline

**Files:**
- Create after slot verification: `docs/task/FEAT-086.md`
- Create after slot verification: `docs/plan/PLAN-325.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Verify PMA slot numbers**

Run:

```bash
tail -40 docs/task/index.md
tail -40 docs/plan/index.md
```

Expected: no existing `FEAT-086` and no existing `PLAN-325`. If either exists, choose the next unused feature and plan number before creating files, and update every command in this task to use the chosen IDs.

- [ ] **Step 2: Create the feature task**

Create `docs/task/FEAT-086.md` with:

```markdown
# FEAT-086 CLI self-updater

- **status**: in_progress
- **priority**: P1
- **owner**: codex
- **plan**: PLAN-325
- **created**: 2026-05-15
- **updated**: 2026-05-15
- **relatesTo**: docs/superpowers/specs/2026-05-15-cli-self-updater-design.md

## Goal

Add top-level `aiworker update` and `aiworker upgrade` aliases that upgrade the
AIWorker CLI/Host distribution, converge Host metadata for the current
`AIWORKER_HOME`, and preserve worker-scoped update semantics for a future
namespace.

## Scope

- Add CLI self-updater detection, planning, execution, Host convergence and
  safe daemon restart guards.
- Add read-only `--check`, `--dry-run`, `--yes`, `--target`, `--channel` and
  `--pre` behavior.
- Add daily update notices without background binary replacement.
- Document source-specific behavior in CLI and deployment docs.

## Acceptance

- `aiworker update` and `aiworker upgrade` use the same handler.
- `aiworker update --check` is read-only.
- Stable channel is default; preview/prerelease is opt-in.
- npm and Bun global installs produce package-manager upgrade actions.
- source checkout and ephemeral `npx` / `bunx` runs refuse self-modification.
- GitHub tarball/binary upgrades require SHA256 checksums.
- Successful upgrades run Host convergence for the current `AIWORKER_HOME`.
- Only managed background daemons are restarted automatically.
- Future `worker update/upgrade` remains separate and unimplemented.

## Progress

- 2026-05-15: Implementation slice opened from approved Superpowers spec.
```

- [ ] **Step 3: Create the implementation plan record**

Create `docs/plan/PLAN-325.md` with:

```markdown
# PLAN-325 CLI self-updater

- **status**: in_progress
- **owner**: codex
- **task**: FEAT-086
- **created**: 2026-05-15
- **updated**: 2026-05-15

## Decision

Implement the approved top-level AIWorker distribution updater as a CLI-owned
module with dependency-injected release resolution, command execution,
filesystem replacement and daemon inspection.

## Work Items

1. Add updater core tests and install-source detection.
2. Add release resolution and upgrade plan building.
3. Add execution, checksum and dry-run behavior.
4. Add Host convergence and daemon restart guards.
5. Wire CLI commands and daily notices.
6. Update docs and run verification gates.

## Verification Plan

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
git diff --check
bun run crg:update
bun run crg:review
```
```

- [ ] **Step 4: Register PMA indexes and changelog**

Append to `docs/task/index.md`:

```markdown
- [ ] [**FEAT-086 CLI self-updater**](FEAT-086.md) `P1`
```

Append to `docs/plan/index.md`:

```markdown
- [ ] [**PLAN-325 CLI self-updater**](PLAN-325.md) `2026-05-15`
```

Prepend to `docs/changelog.md`:

```markdown
## 2026-05-15 [in_progress] FEAT-086 / PLAN-325 — CLI self-updater

Started the top-level `aiworker update` / `aiworker upgrade` self-updater slice
from the approved Superpowers design. The scope is the AIWorker CLI/Host
distribution and Host metadata convergence, not worker domain data migration.
```

- [ ] **Step 5: Commit PMA setup**

Run:

```bash
git add docs/task/FEAT-086.md docs/plan/PLAN-325.md docs/task/index.md docs/plan/index.md docs/changelog.md
git commit -m "docs: 规划 CLI 自更新实现"
```

Expected: commit succeeds. If the PMA IDs were renumbered in Step 1, stage and commit the renumbered file paths instead.

## Task 2: Updater Core And Install Source Detection

**Files:**
- Create: `apps/cli/src/updater.ts`
- Create: `apps/cli/src/updater.test.ts`

- [ ] **Step 1: Write failing detection tests**

Create `apps/cli/src/updater.test.ts` with:

```ts
import { describe, expect, it } from 'bun:test'

import {
  buildUpgradePlan,
  detectInstallSource,
  parseUpdateCommandOptions,
} from './updater'

describe('CLI updater core', () => {
  it('treats update and upgrade as the same command family', () => {
    expect(parseUpdateCommandOptions('update', {})).toMatchObject({ command: 'update', mode: 'apply' })
    expect(parseUpdateCommandOptions('upgrade', {})).toMatchObject({ command: 'upgrade', mode: 'apply' })
  })

  it('marks --check as read-only', () => {
    expect(parseUpdateCommandOptions('update', { check: true })).toMatchObject({ mode: 'check' })
  })

  it('defaults to stable channel and supports prerelease opt-in', () => {
    expect(parseUpdateCommandOptions('update', {})).toMatchObject({ channel: 'stable', includePrerelease: false })
    expect(parseUpdateCommandOptions('update', { pre: true })).toMatchObject({ channel: 'preview', includePrerelease: true })
  })

  it('detects source checkout and refuses self modification', () => {
    const source = detectInstallSource({
      argv1: '/repo/apps/cli/src/aiworker.ts',
      bunGlobalBinDirs: [],
      moduleDir: '/repo/apps/cli/src',
      npmGlobalBinDirs: [],
      packageJson: { name: '@zonease/aiworker-cli', version: '0.14.0' },
      realArgv1: '/repo/apps/cli/src/aiworker.ts',
    })

    expect(source).toMatchObject({
      canAutoUpgrade: false,
      kind: 'source-checkout',
    })
  })

  it('detects npm global bin shims', () => {
    const source = detectInstallSource({
      argv1: '/usr/local/bin/aiworker',
      bunGlobalBinDirs: [],
      moduleDir: '/usr/local/lib/node_modules/@zonease/aiworker-cli/dist',
      npmGlobalBinDirs: ['/usr/local/bin'],
      packageJson: { name: '@zonease/aiworker-cli', version: '0.14.0' },
      realArgv1: '/usr/local/lib/node_modules/@zonease/aiworker-cli/dist/aiworker.js',
    })

    expect(source).toMatchObject({
      canAutoUpgrade: true,
      kind: 'npm-global',
      packageManager: 'npm',
    })
  })

  it('detects bun global installs', () => {
    const source = detectInstallSource({
      argv1: '/Users/ben/.bun/bin/aiworker',
      bunGlobalBinDirs: ['/Users/ben/.bun/bin'],
      moduleDir: '/Users/ben/.bun/install/global/node_modules/@zonease/aiworker-cli/dist',
      npmGlobalBinDirs: [],
      packageJson: { name: '@zonease/aiworker-cli', version: '0.14.0' },
      realArgv1: '/Users/ben/.bun/install/global/node_modules/@zonease/aiworker-cli/dist/aiworker.js',
    })

    expect(source).toMatchObject({
      canAutoUpgrade: true,
      kind: 'bun-global',
      packageManager: 'bun',
    })
  })

  it('detects ephemeral npx and bunx cache paths', () => {
    const npx = detectInstallSource({
      argv1: '/Users/ben/.npm/_npx/abc/node_modules/.bin/aiworker',
      bunGlobalBinDirs: [],
      moduleDir: '/Users/ben/.npm/_npx/abc/node_modules/@zonease/aiworker-cli/dist',
      npmGlobalBinDirs: [],
      packageJson: { name: '@zonease/aiworker-cli', version: '0.14.0' },
      realArgv1: '/Users/ben/.npm/_npx/abc/node_modules/@zonease/aiworker-cli/dist/aiworker.js',
    })
    const bunx = detectInstallSource({
      argv1: '/Users/ben/.bun/install/cache/@zonease/aiworker-cli/aiworker',
      bunGlobalBinDirs: [],
      moduleDir: '/Users/ben/.bun/install/cache/@zonease/aiworker-cli/dist',
      npmGlobalBinDirs: [],
      packageJson: { name: '@zonease/aiworker-cli', version: '0.14.0' },
      realArgv1: '/Users/ben/.bun/install/cache/@zonease/aiworker-cli/dist/aiworker.js',
    })

    expect(npx).toMatchObject({ canAutoUpgrade: false, kind: 'ephemeral' })
    expect(bunx).toMatchObject({ canAutoUpgrade: false, kind: 'ephemeral' })
  })

  it('builds a read-only plan for unsupported sources', () => {
    const plan = buildUpgradePlan({
      currentVersion: '0.14.0',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: {
        canAutoUpgrade: false,
        detail: 'source checkout',
        kind: 'source-checkout',
      },
      target: {
        channel: 'stable',
        downloadUrl: null,
        isPrerelease: false,
        source: 'npm',
        version: '0.14.1',
      },
    })

    expect(plan).toMatchObject({
      currentVersion: '0.14.0',
      mode: 'check',
      requiresConfirmation: false,
      status: 'update_available',
      targetVersion: '0.14.1',
    })
    expect(plan.actions).toEqual([])
  })
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts
```

Expected: fail because `apps/cli/src/updater.ts` does not exist.

- [ ] **Step 3: Create updater core**

Create `apps/cli/src/updater.ts` with:

```ts
export type UpdateCommandName = 'update' | 'upgrade'
export type UpdateMode = 'apply' | 'check' | 'dry-run'
export type UpdateChannel = 'stable' | 'preview'
export type InstallSourceKind = 'bun-global' | 'ephemeral' | 'github-tarball' | 'npm-global' | 'source-checkout' | 'unknown'
export type PackageManager = 'bun' | 'npm'
export type ReleaseSource = 'github' | 'npm'
export type UpgradePlanStatus = 'already_current' | 'source_not_supported' | 'source_unknown' | 'update_available'

export interface UpdateCliOptions {
  channel?: UpdateChannel
  check?: boolean
  dryRun?: boolean
  pre?: boolean
  target?: string
  yes?: boolean
}

export interface ParsedUpdateOptions {
  channel: UpdateChannel
  command: UpdateCommandName
  includePrerelease: boolean
  mode: UpdateMode
  target?: string
  yes: boolean
}

export interface InstallSourceInput {
  argv1: string
  bunGlobalBinDirs: string[]
  moduleDir: string
  npmGlobalBinDirs: string[]
  packageJson: { name?: string, version?: string }
  realArgv1: string
}

export interface InstallSource {
  canAutoUpgrade: boolean
  detail: string
  kind: InstallSourceKind
  packageManager?: PackageManager
  path?: string
}

export interface ReleaseTarget {
  channel: UpdateChannel
  checksumUrl?: string | null
  downloadUrl: string | null
  isPrerelease: boolean
  source: ReleaseSource
  version: string
}

export type UpgradeAction =
  | { command: string[], kind: 'package-manager' }
  | { checksumUrl: string, downloadUrl: string, kind: 'github-tarball' }
  | { kind: 'host-convergence' }
  | { kind: 'daemon-restart' }

export interface BuildUpgradePlanInput {
  currentVersion: string
  options: ParsedUpdateOptions
  source: InstallSource
  target: ReleaseTarget
}

export interface UpgradePlan {
  actions: UpgradeAction[]
  channel: UpdateChannel
  currentVersion: string
  mode: UpdateMode
  requiresConfirmation: boolean
  source: InstallSource
  status: UpgradePlanStatus
  targetVersion: string
}

export function parseUpdateCommandOptions(command: UpdateCommandName, opts: UpdateCliOptions): ParsedUpdateOptions {
  const includePrerelease = Boolean(opts.pre) || opts.channel === 'preview'
  return {
    channel: includePrerelease ? 'preview' : opts.channel ?? 'stable',
    command,
    includePrerelease,
    mode: opts.check ? 'check' : opts.dryRun ? 'dry-run' : 'apply',
    target: opts.target,
    yes: Boolean(opts.yes),
  }
}

export function detectInstallSource(input: InstallSourceInput): InstallSource {
  const argv1 = normalizePath(input.argv1)
  const realArgv1 = normalizePath(input.realArgv1)
  const moduleDir = normalizePath(input.moduleDir)
  const joined = `${argv1}\n${realArgv1}\n${moduleDir}`

  if (moduleDir.includes('/apps/cli/src') || realArgv1.endsWith('/apps/cli/src/aiworker.ts')) {
    return {
      canAutoUpgrade: false,
      detail: 'source checkout',
      kind: 'source-checkout',
      path: realArgv1,
    }
  }

  if (joined.includes('/.npm/_npx/') || joined.includes('/.bun/install/cache/')) {
    return {
      canAutoUpgrade: false,
      detail: 'ephemeral npx/bunx cache',
      kind: 'ephemeral',
      path: realArgv1,
    }
  }

  if (input.npmGlobalBinDirs.map(normalizePath).some(dir => argv1.startsWith(`${dir}/`))) {
    return {
      canAutoUpgrade: true,
      detail: 'npm global install',
      kind: 'npm-global',
      packageManager: 'npm',
      path: realArgv1,
    }
  }

  if (input.bunGlobalBinDirs.map(normalizePath).some(dir => argv1.startsWith(`${dir}/`))) {
    return {
      canAutoUpgrade: true,
      detail: 'bun global install',
      kind: 'bun-global',
      packageManager: 'bun',
      path: realArgv1,
    }
  }

  if (moduleDir.includes('/aiworker-darwin-') || moduleDir.includes('/aiworker-linux-')) {
    return {
      canAutoUpgrade: true,
      detail: 'GitHub release bundle',
      kind: 'github-tarball',
      path: realArgv1,
    }
  }

  return {
    canAutoUpgrade: false,
    detail: 'installation source could not be proven',
    kind: 'unknown',
    path: realArgv1,
  }
}

export function buildUpgradePlan(input: BuildUpgradePlanInput): UpgradePlan {
  const status = compareVersions(input.currentVersion, input.target.version) >= 0
    ? 'already_current'
    : input.source.kind === 'unknown'
      ? 'source_unknown'
      : !input.source.canAutoUpgrade && input.options.mode !== 'check'
        ? 'source_not_supported'
        : 'update_available'

  const actions: UpgradeAction[] = []
  if (status === 'update_available' && input.options.mode !== 'check') {
    if (input.source.packageManager === 'npm')
      actions.push({ command: ['npm', 'install', '-g', `@zonease/aiworker-cli@${input.target.version}`], kind: 'package-manager' })
    if (input.source.packageManager === 'bun')
      actions.push({ command: ['bun', 'install', '-g', `@zonease/aiworker-cli@${input.target.version}`], kind: 'package-manager' })
    if (input.source.kind === 'github-tarball' && input.target.downloadUrl && input.target.checksumUrl)
      actions.push({ checksumUrl: input.target.checksumUrl, downloadUrl: input.target.downloadUrl, kind: 'github-tarball' })
    if (input.options.mode === 'apply') {
      actions.push({ kind: 'host-convergence' })
      actions.push({ kind: 'daemon-restart' })
    }
  }

  return {
    actions,
    channel: input.options.channel,
    currentVersion: input.currentVersion,
    mode: input.options.mode,
    requiresConfirmation: input.options.mode === 'apply' && actions.length > 0 && !input.options.yes,
    source: input.source,
    status,
    targetVersion: input.target.version,
  }
}

function normalizePath(value: string): string {
  return value.replaceAll('\\\\', '/')
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(part => Number.parseInt(part, 10) || 0)
  const b = right.split('.').map(part => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0)
    if (delta !== 0)
      return delta
  }
  return 0
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit updater core**

Run:

```bash
git add apps/cli/src/updater.ts apps/cli/src/updater.test.ts
git commit -m "feat: 增加 CLI 自更新核心检测"
```

Expected: commit succeeds.

## Task 3: Release Resolution And Upgrade Planning

**Files:**
- Modify: `apps/cli/src/updater.ts`
- Modify: `apps/cli/src/updater.test.ts`

- [ ] **Step 1: Add resolver tests**

Replace the existing `./updater` import in `apps/cli/src/updater.test.ts` with:

```ts
import {
  buildUpgradePlan,
  detectInstallSource,
  executeUpgradePlan,
  parseUpdateCommandOptions,
  resolveReleaseTarget,
} from './updater'
```

Then append:

```ts

describe('CLI updater release resolution', () => {
  it('resolves npm latest for stable package-manager installs', async () => {
    const target = await resolveReleaseTarget({
      fetchJson: async (url) => {
        expect(url).toBe('https://registry.npmjs.org/@zonease%2Faiworker-cli')
        return {
          'dist-tags': { latest: '0.14.1', preview: '0.15.0-preview.0' },
          versions: { '0.14.1': {}, '0.15.0-preview.0': {} },
        }
      },
      options: parseUpdateCommandOptions('update', {}),
      source: { canAutoUpgrade: true, detail: 'npm global', kind: 'npm-global', packageManager: 'npm' },
    })

    expect(target).toMatchObject({ channel: 'stable', source: 'npm', version: '0.14.1' })
  })

  it('resolves npm preview when --pre is set', async () => {
    const target = await resolveReleaseTarget({
      fetchJson: async () => ({
        'dist-tags': { latest: '0.14.1', preview: '0.15.0-preview.0' },
        versions: { '0.14.1': {}, '0.15.0-preview.0': {} },
      }),
      options: parseUpdateCommandOptions('update', { pre: true }),
      source: { canAutoUpgrade: true, detail: 'bun global', kind: 'bun-global', packageManager: 'bun' },
    })

    expect(target).toMatchObject({ channel: 'preview', isPrerelease: true, source: 'npm', version: '0.15.0-preview.0' })
  })

  it('requires GitHub checksum assets for tarball installs', async () => {
    const target = await resolveReleaseTarget({
      fetchJson: async () => ({
        assets: [
          { browser_download_url: 'https://example.test/aiworker-darwin-arm64.tar.gz', name: 'aiworker-darwin-arm64.tar.gz' },
          { browser_download_url: 'https://example.test/aiworker-darwin-arm64.tar.gz.sha256', name: 'aiworker-darwin-arm64.tar.gz.sha256' },
        ],
        prerelease: false,
        tag_name: 'v0.14.1',
      }),
      options: parseUpdateCommandOptions('update', {}),
      platformAssetName: 'aiworker-darwin-arm64.tar.gz',
      source: { canAutoUpgrade: true, detail: 'GitHub release bundle', kind: 'github-tarball' },
    })

    expect(target).toMatchObject({
      checksumUrl: 'https://example.test/aiworker-darwin-arm64.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker-darwin-arm64.tar.gz',
      source: 'github',
      version: '0.14.1',
    })
  })

  it('does not execute writes during dry-run', async () => {
    const calls: string[] = []
    const result = await executeUpgradePlan({
      convergeHost: async () => calls.push('converge'),
      downloadAndReplace: async () => calls.push('replace'),
      plan: {
        actions: [{ command: ['npm', 'install', '-g', '@zonease/aiworker-cli@0.14.1'], kind: 'package-manager' }],
        channel: 'stable',
        currentVersion: '0.14.0',
        mode: 'dry-run',
        requiresConfirmation: false,
        source: { canAutoUpgrade: true, detail: 'npm global', kind: 'npm-global', packageManager: 'npm' },
        status: 'update_available',
        targetVersion: '0.14.1',
      },
      restartDaemon: async () => calls.push('restart'),
      runCommand: async () => calls.push('command'),
    })

    expect(result).toMatchObject({ status: 'dry_run' })
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts
```

Expected: fail because `resolveReleaseTarget` and `executeUpgradePlan` are not exported.

- [ ] **Step 3: Add resolver and executor scaffolding**

Append these exports to `apps/cli/src/updater.ts`:

```ts
export interface ResolveReleaseTargetInput {
  fetchJson: (url: string) => Promise<unknown>
  options: ParsedUpdateOptions
  platformAssetName?: string
  source: InstallSource
}

export interface ExecuteUpgradePlanInput {
  convergeHost: () => Promise<unknown>
  downloadAndReplace: (action: Extract<UpgradeAction, { kind: 'github-tarball' }>) => Promise<unknown>
  plan: UpgradePlan
  restartDaemon: () => Promise<unknown>
  runCommand: (command: string[]) => Promise<unknown>
}

export interface ExecuteUpgradePlanResult {
  completedActions: string[]
  status: 'completed' | 'dry_run' | 'skipped'
}

interface NpmRegistryResponse {
  'dist-tags'?: Record<string, string>
  versions?: Record<string, unknown>
}

interface GitHubReleaseResponse {
  assets?: Array<{ browser_download_url?: string, name?: string }>
  prerelease?: boolean
  tag_name?: string
}

export async function resolveReleaseTarget(input: ResolveReleaseTargetInput): Promise<ReleaseTarget> {
  if (input.options.target) {
    return {
      channel: input.options.channel,
      downloadUrl: null,
      isPrerelease: input.options.includePrerelease,
      source: input.source.kind === 'github-tarball' ? 'github' : 'npm',
      version: input.options.target,
    }
  }

  if (input.source.kind === 'github-tarball') {
    const release = await input.fetchJson('https://api.github.com/repos/ZonEaseTech/aiworker/releases/latest') as GitHubReleaseResponse
    const version = String(release.tag_name ?? '').replace(/^v/, '')
    const assetName = input.platformAssetName ?? platformAssetName()
    const asset = release.assets?.find(item => item.name === assetName)
    const checksum = release.assets?.find(item => item.name === `${assetName}.sha256`)
    return {
      channel: input.options.channel,
      checksumUrl: checksum?.browser_download_url ?? null,
      downloadUrl: asset?.browser_download_url ?? null,
      isPrerelease: Boolean(release.prerelease),
      source: 'github',
      version,
    }
  }

  const registry = await input.fetchJson('https://registry.npmjs.org/@zonease%2Faiworker-cli') as NpmRegistryResponse
  const distTag = input.options.channel === 'preview' ? 'preview' : 'latest'
  const version = registry['dist-tags']?.[distTag]
  if (!version)
    throw new Error(`npm dist-tag not found: ${distTag}`)
  return {
    channel: input.options.channel,
    downloadUrl: null,
    isPrerelease: version.includes('-'),
    source: 'npm',
    version,
  }
}

export async function executeUpgradePlan(input: ExecuteUpgradePlanInput): Promise<ExecuteUpgradePlanResult> {
  if (input.plan.mode === 'dry-run')
    return { completedActions: [], status: 'dry_run' }
  if (input.plan.status !== 'update_available' || input.plan.actions.length === 0)
    return { completedActions: [], status: 'skipped' }

  const completedActions: string[] = []
  for (const action of input.plan.actions) {
    if (action.kind === 'package-manager') {
      await input.runCommand(action.command)
      completedActions.push('package-manager')
    }
    if (action.kind === 'github-tarball') {
      if (!action.checksumUrl)
        throw new Error('checksum_missing')
      await input.downloadAndReplace(action)
      completedActions.push('github-tarball')
    }
    if (action.kind === 'host-convergence') {
      await input.convergeHost()
      completedActions.push('host-convergence')
    }
    if (action.kind === 'daemon-restart') {
      await input.restartDaemon()
      completedActions.push('daemon-restart')
    }
  }
  return { completedActions, status: 'completed' }
}

function platformAssetName(): string {
  const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `aiworker-${os}-${arch}.tar.gz`
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit resolver and planning**

Run:

```bash
git add apps/cli/src/updater.ts apps/cli/src/updater.test.ts
git commit -m "feat: 增加 CLI 更新版本解析"
```

Expected: commit succeeds.

## Task 4: Checksums, Host Convergence And Daemon Restart Guards

**Files:**
- Modify: `apps/cli/src/updater.ts`
- Modify: `apps/cli/src/updater.test.ts`
- Modify: `apps/cli/src/aiworker.ts`

- [ ] **Step 1: Add safety helper tests**

Replace the existing `./updater` import in `apps/cli/src/updater.test.ts` with:

```ts
import {
  buildUpgradePlan,
  canRestartManagedDaemon,
  detectInstallSource,
  executeUpgradePlan,
  formatUpgradeReport,
  parseUpdateCommandOptions,
  readDailyUpdateNoticeState,
  resolveReleaseTarget,
  verifySha256Text,
} from './updater'
```

Then append:

```ts

describe('CLI updater safety helpers', () => {
  it('verifies sha256 checksum lines', () => {
    const digest = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    expect(verifySha256Text('test', `${digest}  aiworker-darwin-arm64.tar.gz\n`)).toBe(true)
    expect(verifySha256Text('test', '0000  aiworker-darwin-arm64.tar.gz\n')).toBe(false)
  })

  it('allows restart only for the managed daemon in the same home', () => {
    expect(canRestartManagedDaemon({
      command: '/usr/local/bin/bun /usr/local/bin/aiworker daemon foreground --host 127.0.0.1 --port 9217',
      expectedHome: '/Users/ben/.aiworker',
      pid: 123,
      pidFileHome: '/Users/ben/.aiworker',
      running: true,
    })).toMatchObject({ allowed: true })

    expect(canRestartManagedDaemon({
      command: 'bun apps/cli/src/aiworker.ts dev --port 9217',
      expectedHome: '/Users/ben/.aiworker',
      pid: 123,
      pidFileHome: '/Users/ben/.aiworker',
      running: true,
    })).toMatchObject({ allowed: false, reason: 'not-managed-daemon' })
  })

  it('reads absent daily notice state as ready for a check', () => {
    expect(readDailyUpdateNoticeState(null, new Date('2026-05-15T00:00:00.000Z'))).toMatchObject({
      canCheck: true,
      latestSeenVersion: null,
    })
  })

  it('formats reports with source, target, actions and restart result', () => {
    const report = formatUpgradeReport({
      completedActions: ['package-manager', 'host-convergence'],
      currentVersion: '0.14.0',
      daemon: { restarted: false, reason: 'foreground daemon requires manual restart' },
      source: { canAutoUpgrade: true, detail: 'npm global', kind: 'npm-global', packageManager: 'npm' },
      status: 'completed',
      targetVersion: '0.14.1',
    })

    expect(report).toContain('0.14.0 -> 0.14.1')
    expect(report).toContain('npm global')
    expect(report).toContain('foreground daemon requires manual restart')
  })
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts
```

Expected: fail because safety helpers do not exist.

- [ ] **Step 3: Add helper exports**

Append to `apps/cli/src/updater.ts`:

```ts
import { createHash } from 'node:crypto'

export interface ManagedDaemonProbe {
  command: string | null
  expectedHome: string
  pid: number | null
  pidFileHome: string
  running: boolean
}

export interface ManagedDaemonDecision {
  allowed: boolean
  reason: 'managed-daemon' | 'not-managed-daemon' | 'not-running' | 'home-mismatch' | 'unknown-command'
}

export interface DailyUpdateNoticeValue {
  checkedAt?: string
  latestSeenVersion?: string
}

export interface DailyUpdateNoticeState {
  canCheck: boolean
  latestSeenVersion: string | null
}

export interface UpgradeReportInput {
  completedActions: string[]
  currentVersion: string
  daemon: { reason: string, restarted: boolean }
  source: InstallSource
  status: string
  targetVersion: string
}

export function verifySha256Text(content: string, checksumText: string): boolean {
  const expected = checksumText.trim().split(/\s+/)[0]
  const actual = createHash('sha256').update(content).digest('hex')
  return expected === actual
}

export function canRestartManagedDaemon(input: ManagedDaemonProbe): ManagedDaemonDecision {
  if (!input.running || !input.pid)
    return { allowed: false, reason: 'not-running' }
  if (input.pidFileHome !== input.expectedHome)
    return { allowed: false, reason: 'home-mismatch' }
  if (!input.command)
    return { allowed: false, reason: 'unknown-command' }
  if (!input.command.includes('aiworker') || !input.command.includes('daemon foreground'))
    return { allowed: false, reason: 'not-managed-daemon' }
  if (input.command.includes(' apps/cli/src/aiworker.ts dev'))
    return { allowed: false, reason: 'not-managed-daemon' }
  return { allowed: true, reason: 'managed-daemon' }
}

export function readDailyUpdateNoticeState(value: DailyUpdateNoticeValue | null, now: Date): DailyUpdateNoticeState {
  if (!value?.checkedAt)
    return { canCheck: true, latestSeenVersion: value?.latestSeenVersion ?? null }
  const checkedAt = new Date(value.checkedAt)
  const ageMs = now.getTime() - checkedAt.getTime()
  return {
    canCheck: !Number.isFinite(checkedAt.getTime()) || ageMs >= 24 * 60 * 60 * 1000,
    latestSeenVersion: value.latestSeenVersion ?? null,
  }
}

export function formatUpgradeReport(input: UpgradeReportInput): string {
  return [
    `AIWorker update ${input.status}: ${input.currentVersion} -> ${input.targetVersion}`,
    `Source: ${input.source.detail}`,
    `Actions: ${input.completedActions.length > 0 ? input.completedActions.join(', ') : 'none'}`,
    `Daemon: ${input.daemon.restarted ? 'restarted' : input.daemon.reason}`,
  ].join('\n')
}
```

- [ ] **Step 4: Add Host convergence function in CLI**

In `apps/cli/src/aiworker.ts`, add this function near `bootstrapAppCommand`:

```ts
async function convergeHostAfterCliUpgrade(): Promise<{ bootstrap: Awaited<ReturnType<HostRuntime['bootstrapOfficialSoulApps']>>, home: string }> {
  const paths = await ensureDb()
  const host = createHost(paths)
  const bootstrap = await host.bootstrapOfficialSoulApps()
  return { bootstrap, home: paths.home }
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts
```

Expected: updater tests pass and existing CLI tests still pass.

- [ ] **Step 6: Commit safety helpers**

Run:

```bash
git add apps/cli/src/updater.ts apps/cli/src/updater.test.ts apps/cli/src/aiworker.ts
git commit -m "feat: 增加 CLI 更新安全守卫"
```

Expected: commit succeeds.

## Task 5: CLI Command Integration And Daily Notices

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`

- [ ] **Step 1: Add CLI integration tests**

Append to `apps/cli/src/aiworker.test.ts`:

```ts
it('lists update and upgrade commands in the command index', async () => {
  expect(await runCli(argv('commands'))).toBe(0)
  expect(output).toContain('update|upgrade')
})

it('prints a read-only update check report in source checkout mode', async () => {
  expect(await runCli(argv('update', '--check', '--target', '0.14.1'))).toBe(0)
  const body = JSON.parse(output) as { update: { mode: string, source: { kind: string }, status: string } }
  expect(body.update).toMatchObject({
    mode: 'check',
    source: { kind: 'source-checkout' },
    status: 'update_available',
  })
})

it('keeps update and upgrade aliases equivalent', async () => {
  expect(await runCli(argv('update', '--check', '--target', '0.14.1'))).toBe(0)
  const updateOutput = output
  output = ''
  expect(await runCli(argv('upgrade', '--check', '--target', '0.14.1'))).toBe(0)
  expect(JSON.parse(output)).toEqual(JSON.parse(updateOutput))
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test --timeout=15000 apps/cli/src/aiworker.test.ts
```

Expected: fail because update commands are not registered.

- [ ] **Step 3: Import updater APIs**

In `apps/cli/src/aiworker.ts`, add the updater imports near the local imports:

```ts
import {
  buildUpgradePlan,
  detectInstallSource,
  executeUpgradePlan,
  parseUpdateCommandOptions,
  readDailyUpdateNoticeState,
  resolveReleaseTarget,
} from './updater'
```

- [ ] **Step 4: Add update command handler**

Add this function near `runDoctor()`:

```ts
async function runUpdateCommand(command: 'update' | 'upgrade', opts: { channel?: 'stable' | 'preview', check?: boolean, dryRun?: boolean, pre?: boolean, target?: string, yes?: boolean }): Promise<void> {
  const options = parseUpdateCommandOptions(command, opts)
  const source = detectInstallSource({
    argv1: process.argv[1] ?? '',
    bunGlobalBinDirs: bunGlobalBinDirs(),
    moduleDir: CLI_MODULE_DIR,
    npmGlobalBinDirs: npmGlobalBinDirs(),
    packageJson,
    realArgv1: path.resolve(process.argv[1] ?? ''),
  })
  const target = opts.target
    ? {
        channel: options.channel,
        downloadUrl: null,
        isPrerelease: options.includePrerelease,
        source: source.kind === 'github-tarball' ? 'github' as const : 'npm' as const,
        version: opts.target,
      }
    : await resolveReleaseTarget({
        fetchJson: async url => await (await fetch(url)).json(),
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

  const result = await executeUpgradePlan({
    convergeHost: convergeHostAfterCliUpgrade,
    downloadAndReplace: async () => {
      throw new Error('github_tarball_replacement_not_wired')
    },
    plan,
    restartDaemon: async () => ({ restarted: false, reason: 'manual restart required' }),
    runCommand: async commandArgs => {
      const proc = Bun.spawn(commandArgs, { stderr: 'pipe', stdout: 'pipe' })
      const code = await proc.exited
      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`package_manager_failed: ${stderr}`)
      }
    },
  })
  printJson({ update: plan, result })
}

function npmGlobalBinDirs(): string[] {
  const prefix = process.env.npm_config_prefix
  return prefix ? [path.join(prefix, 'bin')] : ['/usr/local/bin', path.join(process.env.HOME ?? '', '.npm-global/bin')].filter(Boolean)
}

function bunGlobalBinDirs(): string[] {
  return [path.join(process.env.HOME ?? '', '.bun/bin')].filter(Boolean)
}
```

This initial handler keeps GitHub replacement behind the checksum/replacement task path. Task 6 must replace `github_tarball_replacement_not_wired` before `FEAT-086` is closed.

- [ ] **Step 5: Add daily update notice wiring**

Add the daily notice helper near `runUpdateCommand`:

```ts
async function maybeResolveDailyUpdateNotice(): Promise<{ channel: string, command: string, currentVersion: string, targetVersion: string } | null> {
  await ensureDb()
  const setting = listSettings().find(item => item.key === 'update.notice')
  const state = readDailyUpdateNoticeState(setting?.valueJson as { checkedAt?: string, latestSeenVersion?: string } | null, new Date())
  if (!state.canCheck)
    return null
  try {
    const source = detectInstallSource({
      argv1: process.argv[1] ?? '',
      bunGlobalBinDirs: bunGlobalBinDirs(),
      moduleDir: CLI_MODULE_DIR,
      npmGlobalBinDirs: npmGlobalBinDirs(),
      packageJson,
      realArgv1: path.resolve(process.argv[1] ?? ''),
    })
    const target = await resolveReleaseTarget({
      fetchJson: async url => await (await fetch(url)).json(),
      options: parseUpdateCommandOptions('update', { check: true }),
      source,
    })
    setSetting('update.notice', { checkedAt: new Date().toISOString(), latestSeenVersion: target.version })
    if (target.version === packageJson.version)
      return null
    return {
      channel: target.channel,
      command: 'aiworker update',
      currentVersion: packageJson.version,
      targetVersion: target.version,
    }
  }
  catch (err) {
    setSetting('update.notice', {
      checkedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
      latestSeenVersion: state.latestSeenVersion,
    })
    return null
  }
}
```

Update `runDoctor()` so its JSON includes:

```ts
    updateNotice: await maybeResolveDailyUpdateNotice(),
```

Update `daemonForeground()` after `localPaths()`:

```ts
  const notice = await maybeResolveDailyUpdateNotice()
  if (notice)
    consola.info(`[aiworker-update] ${notice.currentVersion} -> ${notice.targetVersion} available on ${notice.channel}. Run ${notice.command}.`)
```

- [ ] **Step 6: Register commands and command index**

In `registerCommands()`, after `doctor`, add:

```ts
  cli.command('update', 'update AIWorker CLI and Host distribution')
    .option('--check', 'check for an update without changing local state')
    .option('--dry-run', 'print the upgrade plan without running writes')
    .option('--yes', 'skip interactive confirmation')
    .option('--target <version>', 'explicit target version')
    .option('--channel <channel>', 'release channel: stable or preview')
    .option('--pre', 'include prerelease target')
    .action((opts: { channel?: 'stable' | 'preview', check?: boolean, dryRun?: boolean, pre?: boolean, target?: string, yes?: boolean }) => runUpdateCommand('update', opts))
  cli.command('upgrade', 'alias for update')
    .option('--check', 'check for an update without changing local state')
    .option('--dry-run', 'print the upgrade plan without running writes')
    .option('--yes', 'skip interactive confirmation')
    .option('--target <version>', 'explicit target version')
    .option('--channel <channel>', 'release channel: stable or preview')
    .option('--pre', 'include prerelease target')
    .action((opts: { channel?: 'stable' | 'preview', check?: boolean, dryRun?: boolean, pre?: boolean, target?: string, yes?: boolean }) => runUpdateCommand('upgrade', opts))
```

In `commandIndex()`, add:

```ts
    'update|upgrade',
```

after `doctor` or before `daemon start|foreground|status|stop|logs|check`.

- [ ] **Step 7: Run GREEN**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit command integration**

Run:

```bash
git add apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts
git commit -m "feat: 接入 aiworker update upgrade 命令"
```

Expected: commit succeeds.

## Task 6: Complete GitHub Tarball Replacement Or Downgrade Scope Explicitly

**Files:**
- Modify: `apps/cli/src/updater.ts`
- Modify: `apps/cli/src/updater.test.ts`
- Modify: `apps/cli/src/aiworker.ts`

- [ ] **Step 1: Add a checksum-missing test**

Append to `apps/cli/src/updater.test.ts`:

```ts
it('rejects GitHub replacement when checksum is missing', async () => {
  const plan = buildUpgradePlan({
    currentVersion: '0.14.0',
    options: parseUpdateCommandOptions('update', {}),
    source: { canAutoUpgrade: true, detail: 'GitHub release bundle', kind: 'github-tarball' },
    target: {
      channel: 'stable',
      checksumUrl: null,
      downloadUrl: 'https://example.test/aiworker-darwin-arm64.tar.gz',
      isPrerelease: false,
      source: 'github',
      version: '0.14.1',
    },
  })

  expect(plan.actions).toEqual([])
  expect(plan.status).toBe('source_not_supported')
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts
```

Expected: fail if the plan still treats missing-checksum tarballs as eligible.

- [ ] **Step 3: Enforce checksum eligibility in `buildUpgradePlan`**

Modify `buildUpgradePlan` in `apps/cli/src/updater.ts` so the status calculation includes:

```ts
  const missingGitHubChecksum = input.source.kind === 'github-tarball'
    && (!input.target.downloadUrl || !input.target.checksumUrl)
    && input.options.mode !== 'check'
  const status = compareVersions(input.currentVersion, input.target.version) >= 0
    ? 'already_current'
    : input.source.kind === 'unknown'
      ? 'source_unknown'
      : missingGitHubChecksum
        ? 'source_not_supported'
        : !input.source.canAutoUpgrade && input.options.mode !== 'check'
          ? 'source_not_supported'
          : 'update_available'
```

- [ ] **Step 4: Replace the temporary GitHub execution throw**

Implement `downloadAndReplace` in `apps/cli/src/aiworker.ts` with a same-directory staging helper. Change the existing Buffer import from type-only to a runtime import:

```ts
import { Buffer } from 'node:buffer'
```

Extend the existing `node:fs` import with the replacement helpers:

```ts
import { chmodSync, copyFileSync, renameSync } from 'node:fs'
```

Use this implementation:

```ts
async function downloadAndReplaceGitHubBundle(action: { checksumUrl: string, downloadUrl: string }): Promise<{ backupPath: string, installedPath: string }> {
  const currentBinary = path.resolve(process.argv[1] ?? 'aiworker')
  const installDir = path.dirname(currentBinary)
  const stageRoot = mkdtempSync(path.join(installDir, '.aiworker-update-'))
  const archivePath = path.join(stageRoot, 'bundle.tar.gz')
  const checksumText = await (await fetch(action.checksumUrl)).text()
  const archiveBytes = await (await fetch(action.downloadUrl)).arrayBuffer()
  const archiveBuffer = Buffer.from(archiveBytes)
  const expected = checksumText.trim().split(/\s+/)[0]
  const actual = createHash('sha256').update(archiveBuffer).digest('hex')
  if (expected !== actual)
    throw new Error('checksum_mismatch')
  writeFileSync(archivePath, archiveBuffer)
  const tar = Bun.spawn(['tar', '-xzf', archivePath, '-C', stageRoot], { stderr: 'pipe', stdout: 'pipe' })
  if (await tar.exited !== 0) {
    const stderr = await new Response(tar.stderr).text()
    throw new Error(`staging_failed: ${stderr}`)
  }
  const extractedDir = readdirSync(stageRoot)
    .map(name => path.join(stageRoot, name))
    .find(item => statSync(item).isDirectory())
  if (!extractedDir)
    throw new Error('staging_failed: extracted bundle directory not found')
  const stagedBinary = path.join(extractedDir, 'aiworker')
  if (!existsSync(stagedBinary))
    throw new Error('staging_failed: extracted aiworker binary not found')
  const nextPath = path.join(installDir, `.aiworker-next-${process.pid}`)
  const backupPath = path.join(installDir, `.aiworker-backup-${Date.now()}`)
  copyFileSync(stagedBinary, nextPath)
  chmodSync(nextPath, 0o755)
  const probe = Bun.spawn([nextPath, '--version'], { stderr: 'pipe', stdout: 'pipe' })
  if (await probe.exited !== 0) {
    const stderr = await new Response(probe.stderr).text()
    throw new Error(`staging_failed: version probe failed: ${stderr}`)
  }
  renameSync(currentBinary, backupPath)
  renameSync(nextPath, currentBinary)
  return { backupPath, installedPath: currentBinary }
}
```

Then wire:

```ts
    downloadAndReplace: downloadAndReplaceGitHubBundle,
```

This function stages and verifies the release archive, probes the extracted binary, and swaps the current binary with same-directory `renameSync` calls. Remove the earlier `github_tarball_replacement_not_wired` throw before committing this task.

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts
```

Expected: pass and no production `github_tarball_replacement_not_wired` string remains.

- [ ] **Step 6: Commit checksum behavior**

Run:

```bash
git add apps/cli/src/updater.ts apps/cli/src/updater.test.ts apps/cli/src/aiworker.ts
git commit -m "feat: 校验 CLI GitHub 更新资产"
```

Expected: commit succeeds.

## Task 7: Documentation And Verification

**Files:**
- Modify: `docs/cli.md`
- Modify: `docs/deployment.md`
- Modify: `docs/task/FEAT-086.md`
- Modify: `docs/plan/PLAN-325.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Update CLI documentation**

In `docs/cli.md`, add `aiworker update|upgrade` to the command index and add this section after "Host Daemon":

```markdown
## Updates

`aiworker update` and `aiworker upgrade` are aliases for the AIWorker
distribution updater. They upgrade the CLI package, package-local Host Web
assets, worker DB migrations and bundled official Soul App release resources.

Use `aiworker update --check` for a read-only check. The default channel is
stable. Preview or prerelease targets require `--channel preview` or `--pre`.

Global npm and Bun installs can be upgraded through their package managers.
Source checkout, `npx`, `bunx` and unknown sources print a plan and do not
self-modify. GitHub release bundles require SHA256 checksum assets before
automatic replacement.

Future `aiworker worker <worker_id> update|upgrade` is reserved for
worker-scoped compatibility and is not the same command as top-level CLI
self-update.
```

- [ ] **Step 2: Update deployment documentation**

In `docs/deployment.md`, add this paragraph near the npm preview section:

```markdown
`aiworker update` / `aiworker upgrade` only restart daemons that were started
through `aiworker daemon start` for the same `AIWORKER_HOME` and can be proven
from the managed pid/log files. Foreground, source `dev`, tmux and manually
started daemon processes require a manual restart after upgrade.
```

Add this paragraph near GitHub release assets:

```markdown
Standalone GitHub release bundle upgrades require matching `.sha256` assets.
When checksums are missing, AIWorker reports the target release and refuses
automatic binary replacement.
```

- [ ] **Step 3: Run verification gates**

Run:

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: both commands exit 0. If review reports actionable issues, fix them and rerun the focused tests plus `crg:review`.

- [ ] **Step 5: Close PMA docs**

Update `docs/task/FEAT-086.md` and `docs/plan/PLAN-325.md` to `completed`, append verification evidence, mark the index entries `[x]`, and prepend a completed changelog entry:

```markdown
## 2026-05-15 [completed] FEAT-086 / PLAN-325 — CLI self-updater

Completed the top-level `aiworker update` / `aiworker upgrade` self-updater
slice. Verification passed: focused CLI updater tests, CLI typecheck, CLI
bundle build, dist release smoke, `git diff --check`, `bun run crg:update` and
`bun run crg:review`.
```

- [ ] **Step 6: Commit closeout**

Run:

```bash
git add apps/cli/src/updater.ts apps/cli/src/updater.test.ts apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts docs/cli.md docs/deployment.md docs/task/FEAT-086.md docs/plan/PLAN-325.md docs/task/index.md docs/plan/index.md docs/changelog.md
git commit -m "feat: 支持 AIWorker CLI 自更新"
```

Expected: commit succeeds.

## Self-Review Checklist

- Spec coverage: command aliases, `--check`, stable default, prerelease opt-in, install-source detection, package-manager plans, GitHub checksum requirement, Host convergence, daemon restart guard, daily notices and future worker namespace all map to tasks above.
- Red-flag scan: no task contains unresolved markers, vague "add tests", or missing command expectations.
- Type consistency: `ParsedUpdateOptions`, `InstallSource`, `ReleaseTarget`, `UpgradePlan`, and helper names are introduced before later tasks reference them.
- Scope check: this plan covers one implementation slice, the top-level CLI/Host distribution updater. Worker-scoped update remains explicitly out of scope.
