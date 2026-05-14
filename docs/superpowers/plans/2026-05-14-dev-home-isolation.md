# Dev Home Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make source-checkout AIWorker default to `~/.aiworker-dev` while packaged/dist/npm CLI continues to default to `~/.aiworker`.

**Architecture:** Keep Host-local home resolution explicit and centralized. Add a small CLI packaging-mode resolver that chooses `.aiworker-dev` for source entrypoints and `.aiworker` for package-local dist entrypoints, then apply the resolved home before Core/API env defaults are read.

**Tech Stack:** Bun, TypeScript, `cac`, `@zonease/aiworker-fs-layout`, `@zonease/aiworker-core`, shell scripts, PMA docs, code-review-graph.

---

## File Structure

- Modify `packages/fs-layout/src/index.ts`: add a `defaultHomeDir` option to the low-level Host-local resolver without reintroducing project detection.
- Modify `packages/fs-layout/src/index.test.ts`: prove default home override keeps explicit env and CLI flag priority.
- Modify `apps/cli/src/aiworker.ts`: add CLI source-vs-packaged default home detection, export testable helpers, and apply the resolved home before DB/API env reads.
- Modify `apps/cli/src/aiworker.test.ts`: add source default, dist default and explicit override regression tests.
- Modify `package.json`: change `dev:host` default from `/tmp/aiworker-dev` to `$HOME/.aiworker-dev`.
- Modify `scripts/dev-local.sh`, `scripts/dev-apps.sh`, `scripts/dev-status.sh`, `scripts/dev-clean.sh`: change default dev home to `$HOME/.aiworker-dev`.
- Modify `README.md`, `docs/cli.md`, `docs/deployment.md`: document source default, packaged default and override rules.
- Create `docs/task/FEAT-083.md`: PMA task tracking for this implementation.
- Create `docs/plan/PLAN-318.md`: PMA implementation plan and verification evidence.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`: PMA index and changelog sync.

## Task 1: Register PMA Tracking

**Files:**
- Create: `docs/task/FEAT-083.md`
- Create: `docs/plan/PLAN-318.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Confirm slot availability**

Run:

```bash
ls docs/task | rg '^FEAT-[0-9]+\.md$' | sort -V | tail -5
ls docs/plan | rg '^PLAN-[0-9]+\.md$' | sort -V | tail -5
```

Expected: highest existing feature is `FEAT-082.md`; highest existing plan is `PLAN-317.md`. If the repository already contains `FEAT-083.md` or `PLAN-318.md`, stop and reserve the next unused feature/plan pair before editing.

- [ ] **Step 2: Create the PMA task**

Create `docs/task/FEAT-083.md` with:

```markdown
# FEAT-083 Dev home isolation

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14
- **plan**: PLAN-318
- **relatesTo**: apps/cli, packages/fs-layout, packages/core, scripts/dev-local.sh, scripts/dev-apps.sh, scripts/dev-status.sh, scripts/dev-clean.sh, docs/cli.md, docs/deployment.md, README.md

## Context

Source-checkout development and packaged preview usage can both default to
`~/.aiworker`. That makes local development compete with operator preview state
for `aiworker.db`, app registry rows, selected workers, workspaces, pid files
and daemon logs.

## Goals

- Source-checkout CLI defaults to `~/.aiworker-dev` when no explicit
  `AIWORKER_HOME` is set.
- Packaged/dist/npm CLI defaults remain `~/.aiworker`.
- Explicit `AIWORKER_HOME` and `WORKER_DB_PATH` keep priority in all modes.
- Root dev scripts use `~/.aiworker-dev`.
- Docs explain source versus packaged defaults.

## Non-Goals

- No migration from `/tmp/aiworker-dev`.
- No migration from `~/.aiworker`.
- No project-root `.aiworker/` detection.
- No profile UI or channel manager.
- No Host interpretation of Soul App domain data.

## Acceptance Criteria

- `bun apps/cli/src/aiworker.ts init` with no explicit `AIWORKER_HOME` reports
  `~/.aiworker-dev`.
- `apps/cli/dist/aiworker.js init` with no explicit `AIWORKER_HOME` reports
  `~/.aiworker`.
- Explicit `AIWORKER_HOME` wins over source and packaged defaults.
- Explicit `WORKER_DB_PATH` wins over the derived DB path.
- Root dev scripts print and use `~/.aiworker-dev`.
- Release smoke still uses temporary homes and passes.
- PMA docs, source docs and changelog are synchronized.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `rg -n '/tmp/aiworker-dev|~/.aiworker-dev|\\.aiworker-dev' package.json scripts README.md docs/cli.md docs/deployment.md`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

This task remains open until implementation records final verification evidence.
```

- [ ] **Step 3: Create the PMA plan**

Create `docs/plan/PLAN-318.md` with:

```markdown
# PLAN-318 Dev home isolation

- **status**: implementing
- **createdAt**: 2026-05-14
- **approvedAt**: 2026-05-14
- **owner**: codex
- **relatedTask**: FEAT-083

## Context

AIWorker is a local-first Host/Soul App runtime. The Host-local daemon stores
platform metadata, installed apps, workers, workspaces, pid files and logs under
`AIWORKER_HOME`.

Published preview users should keep the operator default `~/.aiworker`.
Source-checkout development should use a durable but separate profile at
`~/.aiworker-dev`.

## Proposal

1. Add a `defaultHomeDir` option to `packages/fs-layout` so callers can choose a
   default directory name while preserving explicit override priority.
2. Add CLI-local source/dist detection:
   - package-local `official-apps/` or `web/worker/` means packaged mode and
     default `.aiworker`;
   - otherwise the source-checkout CLI default is `.aiworker-dev`.
3. Apply resolved local paths before DB migration or API bootstrap reads Core
   env defaults.
4. Change root dev scripts to `$HOME/.aiworker-dev`.
5. Document source and packaged defaults.

## Scope

In scope:

- Host-local path resolution for CLI and source scripts.
- Focused fs-layout/Core/CLI tests.
- Source docs and PMA bookkeeping.

Out of scope:

- Data migration.
- Deleting any existing runtime home.
- Project-local `.aiworker` auto-detection.
- UI profile management.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-14: Implementation started from
  `docs/superpowers/specs/2026-05-14-dev-home-isolation-design.md`.

## Verification Results

Implementation records exact command output in this section before closeout.
```

- [ ] **Step 4: Add index entries**

Append these lines near the existing completed feature/plan sections, preserving the current index style:

```markdown
- [ ] [**FEAT-083 Dev home isolation**](FEAT-083.md) `P0`
```

```markdown
- [ ] [**PLAN-318 Dev home isolation**](PLAN-318.md) `2026-05-14`
```

- [ ] **Step 5: Add changelog start entry**

Add a top entry to `docs/changelog.md`:

```markdown
## 2026-05-14 [progress]

Started FEAT-083 / PLAN-318 to isolate source-checkout development state under
`~/.aiworker-dev` while preserving packaged CLI default state under
`~/.aiworker`.
```

- [ ] **Step 6: Validate PMA docs**

Run:

```bash
rg -n 'FEAT-083|PLAN-318|Dev home isolation' docs/task docs/plan docs/changelog.md
git diff --check
```

Expected: all five PMA files reference the same feature/plan pair; `git diff --check` exits 0.

## Task 2: Extend fs-layout Default Home Options

**Files:**
- Modify: `packages/fs-layout/src/index.ts`
- Modify: `packages/fs-layout/src/index.test.ts`

- [ ] **Step 1: Write failing fs-layout tests**

Add this test after `uses AIWORKER_HOME env when no explicit home is provided` in `packages/fs-layout/src/index.test.ts`:

```ts
  it('uses a caller-provided default home directory when no explicit home exists', () => {
    process.env.HOME = '/tmp/aiworker-home-owner'

    const result = resolveAiworkerScope({ defaultHomeDir: '.aiworker-dev' })

    expect(result.scope).toBe('user')
    expect(result.home).toBe('/tmp/aiworker-home-owner/.aiworker-dev')
    expect(result.source).toBe('user-default')
  })

  it('keeps explicit env priority over a caller-provided default home directory', () => {
    process.env.HOME = '/tmp/aiworker-home-owner'
    process.env.AIWORKER_HOME = '/tmp/env-aiworker-home'

    const result = resolveAiworkerScope({ defaultHomeDir: '.aiworker-dev' })

    expect(result.scope).toBe('explicit')
    expect(result.home).toBe('/tmp/env-aiworker-home')
    expect(result.source).toBe('env')
  })
```

- [ ] **Step 2: Run fs-layout tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-fs-layout' test
```

Expected: FAIL with a TypeScript error or runtime assertion because `defaultHomeDir` is not defined on `ResolveScopeOptions`.

- [ ] **Step 3: Implement `defaultHomeDir`**

In `packages/fs-layout/src/index.ts`, replace:

```ts
const DEFAULT_HOME_DIR = '.aiworker'
```

with:

```ts
export const DEFAULT_AIWORKER_HOME_DIR = '.aiworker'
```

Change `ResolveScopeOptions` to:

```ts
export interface ResolveScopeOptions {
  /** Deprecated compatibility input. CWD never affects scope resolution. */
  cwd?: string
  /** Explicit `--aiworker-home <path>` from a CLI flag. Highest priority. */
  explicitHome?: string
  /** Caller-selected fallback directory name when neither flag nor env exists. */
  defaultHomeDir?: string
  /** Deprecated compatibility input. Project detection is always disabled. */
  disableProjectDetect?: boolean
}
```

Replace the final return in `resolveAiworkerScope` with:

```ts
  const defaultHomeDir = opts.defaultHomeDir && opts.defaultHomeDir.length > 0
    ? opts.defaultHomeDir
    : DEFAULT_AIWORKER_HOME_DIR

  return {
    scope: 'user',
    home: path.resolve(currentHomeDir(), defaultHomeDir),
    source: 'user-default',
  }
```

Change `resolveAiworkerHome` to:

```ts
export function resolveAiworkerHome(opts: ResolveScopeOptions = {}): string {
  return resolveAiworkerScope(opts).home
}
```

- [ ] **Step 4: Run fs-layout tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-fs-layout' test
```

Expected: PASS for all `packages/fs-layout` tests.

- [ ] **Step 5: Commit fs-layout change**

Run:

```bash
git add packages/fs-layout/src/index.ts packages/fs-layout/src/index.test.ts
git commit -m "feat: 支持自定义 AIWorker 默认 home"
```

Expected: commit succeeds and contains only fs-layout files.

## Task 3: Add CLI Source vs Packaged Home Resolution

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`

- [ ] **Step 1: Write failing CLI local path tests**

In `apps/cli/src/aiworker.test.ts`, replace the current import from `./aiworker` with:

```ts
import {
  preprocessArgv,
  resolveCliDefaultHomeDir,
  resolveCliLocalPaths,
  resolveCliOfficialAppsRoot,
  resolveCliWorkerWebStaticDir,
  runCli,
} from './aiworker'
```

Add these tests after the Worker Web static resolver test:

```ts
  it('defaults source-checkout local paths to ~/.aiworker-dev when no home env exists', () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    const moduleDir = path.join(root, 'repo', 'apps', 'cli', 'src')
    const paths = resolveCliLocalPaths(moduleDir)

    expect(resolveCliDefaultHomeDir(moduleDir)).toBe('.aiworker-dev')
    expect(paths.home).toBe(path.join(root, '.aiworker-dev'))
    expect(paths.dbPath).toBe(path.join(root, '.aiworker-dev', 'aiworker.db'))
    expect(paths.workersRoot).toBe(path.join(root, '.aiworker-dev', 'workers'))
    expect(paths.pidFile).toBe(path.join(root, '.aiworker-dev', 'aiworker-daemon.pid'))
    expect(paths.logFile).toBe(path.join(root, '.aiworker-dev', 'aiworker-daemon.log'))
  })

  it('defaults packaged local paths to ~/.aiworker when package resources exist', () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    const moduleDir = path.join(root, 'package', 'dist')
    mkdirSync(path.join(moduleDir, 'official-apps'), { recursive: true })
    const paths = resolveCliLocalPaths(moduleDir)

    expect(resolveCliDefaultHomeDir(moduleDir)).toBe('.aiworker')
    expect(paths.home).toBe(path.join(root, '.aiworker'))
    expect(paths.dbPath).toBe(path.join(root, '.aiworker', 'aiworker.db'))
    expect(paths.workersRoot).toBe(path.join(root, '.aiworker', 'workers'))
  })

  it('keeps explicit home and db path ahead of source defaults', () => {
    process.env.HOME = root
    process.env.AIWORKER_HOME = path.join(root, 'explicit-home')
    process.env.WORKER_DB_PATH = path.join(root, 'explicit-home', 'custom.db')

    const moduleDir = path.join(root, 'repo', 'apps', 'cli', 'src')
    const paths = resolveCliLocalPaths(moduleDir)

    expect(resolveCliDefaultHomeDir(moduleDir)).toBe('.aiworker-dev')
    expect(paths.home).toBe(path.join(root, 'explicit-home'))
    expect(paths.dbPath).toBe(path.join(root, 'explicit-home', 'custom.db'))
    expect(paths.workersRoot).toBe(path.join(root, 'explicit-home', 'workers'))
  })

  it('applies the source default before init reads core env defaults', async () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    expect(await runCli(argv('init'))).toBe(0)
    const body = JSON.parse(output) as { dbPath: string, home: string, workersRoot: string }

    expect(body.home).toBe(path.join(root, '.aiworker-dev'))
    expect(body.dbPath).toBe(path.join(root, '.aiworker-dev', 'aiworker.db'))
    expect(body.workersRoot).toBe(path.join(root, '.aiworker-dev', 'workers'))
    await expect(stat(path.join(root, '.aiworker'))).rejects.toThrow()
  })
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test
```

Expected: FAIL because `resolveCliDefaultHomeDir` and `resolveCliLocalPaths` are not exported yet, or because source init still reports `~/.aiworker`.

- [ ] **Step 3: Import fs-layout resolver in CLI**

In `apps/cli/src/aiworker.ts`, add:

```ts
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
```

Change:

```ts
import { homedir, tmpdir } from 'node:os'
```

to:

```ts
import { tmpdir } from 'node:os'
```

- [ ] **Step 4: Export local path helpers**

Replace the non-exported `LocalPaths` interface and `localPaths()` function in `apps/cli/src/aiworker.ts` with:

```ts
export interface LocalPaths {
  home: string
  dbPath: string
  workersRoot: string
  pidFile: string
  logFile: string
}
```

Then add these helpers after `resolveCliWorkerWebStaticDir`:

```ts
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
```

- [ ] **Step 5: Apply local paths before API bootstrap**

At the start of `daemonForeground` in `apps/cli/src/aiworker.ts`, add:

```ts
  localPaths()
```

The resulting function start should be:

```ts
async function daemonForeground(opts: { host?: string, port?: number } = {}): Promise<void> {
  localPaths()
  const { bootstrapWorkerApp } = await import('@zonease/aiworker-api/bootstrap')
```

- [ ] **Step 6: Run CLI tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test
```

Expected: PASS for all CLI tests, including source default and packaged default path tests.

- [ ] **Step 7: Run Core tests to protect packaged defaults**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
```

Expected: PASS. The existing Core env test should still expect `~/.aiworker` because Core is not source-checkout channel aware by itself.

- [ ] **Step 8: Commit CLI resolver change**

Run:

```bash
git add apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts
git commit -m "feat: 隔离源码态 AIWorker home 默认值"
```

Expected: commit succeeds and contains only CLI files.

## Task 4: Update Root Development Scripts

**Files:**
- Modify: `package.json`
- Modify: `scripts/dev-local.sh`
- Modify: `scripts/dev-apps.sh`
- Modify: `scripts/dev-status.sh`
- Modify: `scripts/dev-clean.sh`

- [ ] **Step 1: Change package script default**

In `package.json`, replace the `dev:host` script value with:

```json
"dev:host": "AIWORKER_HOME=${AIWORKER_HOME:-$HOME/.aiworker-dev} AIWORKER_WORKER_HOST=${AIWORKER_WORKER_HOST:-127.0.0.1} PORT=${PORT:-9217} bun apps/cli/src/aiworker.ts daemon foreground --host ${AIWORKER_WORKER_HOST:-127.0.0.1} --port ${PORT:-9217}",
```

- [ ] **Step 2: Change shell script defaults**

In each of these files:

- `scripts/dev-local.sh`
- `scripts/dev-apps.sh`
- `scripts/dev-status.sh`
- `scripts/dev-clean.sh`

Replace:

```bash
AIWORKER_HOME="${AIWORKER_HOME:-/tmp/aiworker-dev}"
```

or:

```bash
export AIWORKER_HOME="${AIWORKER_HOME:-/tmp/aiworker-dev}"
```

with the matching `$HOME/.aiworker-dev` form:

```bash
AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"
```

or:

```bash
export AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"
```

- [ ] **Step 3: Verify no dev script keeps the old temp default**

Run:

```bash
rg -n '/tmp/aiworker-dev' package.json scripts
```

Expected: no output.

- [ ] **Step 4: Verify dev script output uses the durable dev home**

Run:

```bash
bash scripts/dev-status.sh | sed -n '1,2p'
```

Expected first line includes:

```text
[dev:status] AIWORKER_HOME=/Users/ben/.aiworker-dev
```

If the environment has a custom `HOME`, expect `$HOME/.aiworker-dev` for that environment.

- [ ] **Step 5: Commit dev script change**

Run:

```bash
git add package.json scripts/dev-local.sh scripts/dev-apps.sh scripts/dev-status.sh scripts/dev-clean.sh
git commit -m "chore: 默认使用开发版 AIWorker home"
```

Expected: commit succeeds and contains only root script files.

## Task 5: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/cli.md`
- Modify: `docs/deployment.md`

- [ ] **Step 1: Update README source checkout text**

In `README.md`, after the source-checkout command block that runs:

```bash
bun run --filter '@zonease/aiworker-web' build
bun apps/cli/src/aiworker.ts dev --port 9217
```

add:

```markdown
源码态默认使用 `~/.aiworker-dev` 作为开发 profile；发布包和 npm preview
默认仍使用 `~/.aiworker`。两种入口都可以通过 `AIWORKER_HOME=<path>` 显式覆盖。
```

- [ ] **Step 2: Update CLI guide primary flow**

In `docs/cli.md`, after the source debug command block, add:

```markdown
源码调试默认把 Host-local state 放在 `~/.aiworker-dev`，避免与已安装 preview
CLI 的 `~/.aiworker` 竞争同一个 `aiworker.db`、pid/log 和 workspace tree。
```

After the npm preview command block, add:

```markdown
安装或打包后的 CLI 默认使用 `~/.aiworker`。如果需要隔离环境，显式设置
`AIWORKER_HOME=<path>`；如果只想替换 DB 文件，设置 `WORKER_DB_PATH=<path>`。
```

- [ ] **Step 3: Update deployment source checkout instructions**

In `docs/deployment.md`, replace:

```bash
bun install
bun run --filter '@zonease/aiworker-web' build
AIWORKER_HOME=/tmp/aiworker-dev \
  bun apps/cli/src/aiworker.ts dev --host 127.0.0.1 --port 9217
```

with:

```bash
bun install
bun run --filter '@zonease/aiworker-web' build
bun apps/cli/src/aiworker.ts dev --host 127.0.0.1 --port 9217
```

Add this paragraph below the command block:

```markdown
源码 checkout 默认使用 `~/.aiworker-dev`。这是一份可长期保留的开发 profile，
不是临时目录；如需一次性 smoke，可显式设置 `AIWORKER_HOME=/tmp/aiworker-smoke`。
```

- [ ] **Step 4: Update deployment packaged CLI wording**

In `docs/deployment.md`, keep the packaged CLI default as `~/.aiworker` and add:

```markdown
打包或 npm 安装后的 CLI 默认使用 `~/.aiworker`，与源码态
`~/.aiworker-dev` 分离。`AIWORKER_HOME` 和 `WORKER_DB_PATH` 对两种入口都保持最高优先级。
```

- [ ] **Step 5: Verify docs mention both defaults**

Run:

```bash
rg -n '~/.aiworker-dev|~/.aiworker|AIWORKER_HOME|WORKER_DB_PATH' README.md docs/cli.md docs/deployment.md
```

Expected: source-checkout sections mention `~/.aiworker-dev`; packaged/npm sections mention `~/.aiworker`; override sections mention `AIWORKER_HOME`.

- [ ] **Step 6: Commit docs change**

Run:

```bash
git add README.md docs/cli.md docs/deployment.md
git commit -m "docs: 说明源码态与发布态 home 隔离"
```

Expected: commit succeeds and contains only docs files.

## Task 6: Verify Dist Behavior and Close PMA

**Files:**
- Modify: `docs/task/FEAT-083.md`
- Modify: `docs/plan/PLAN-318.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run focused package gates**

Run:

```bash
bun run --filter '@zonease/aiworker-fs-layout' test
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-cli' test
```

Expected: all commands exit 0.

- [ ] **Step 2: Build Web and CLI dist**

Run:

```bash
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
```

Expected: both commands exit 0 and `apps/cli/dist/official-apps` exists.

- [ ] **Step 3: Verify source default with real CLI output**

Run:

```bash
tmp_home="$(mktemp -d)"
HOME="$tmp_home" env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts init
rm -rf "$tmp_home"
```

Expected JSON includes:

```json
"home": "<tmp_home>/.aiworker-dev"
```

and:

```json
"dbPath": "<tmp_home>/.aiworker-dev/aiworker.db"
```

- [ ] **Step 4: Verify dist default with real CLI output**

Run:

```bash
tmp_home="$(mktemp -d)"
HOME="$tmp_home" env -u AIWORKER_HOME -u WORKER_DB_PATH apps/cli/dist/aiworker.js init
rm -rf "$tmp_home"
```

Expected JSON includes:

```json
"home": "<tmp_home>/.aiworker"
```

and:

```json
"dbPath": "<tmp_home>/.aiworker/aiworker.db"
```

- [ ] **Step 5: Run release smoke**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```

Expected: PASS message from `smoke-dist-release` and no writes to the real `~/.aiworker` or `~/.aiworker-dev`.

- [ ] **Step 6: Run static checks**

Run:

```bash
rg -n '/tmp/aiworker-dev' package.json scripts README.md docs/cli.md docs/deployment.md
git diff --check
```

Expected: first command prints no matches; `git diff --check` exits 0.

- [ ] **Step 7: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: graph update completes; review reports no high-severity blocker. Investigate any finding that points at path resolution, env cache, release smoke, or user data risk.

- [ ] **Step 8: Close PMA docs**

Update `docs/task/FEAT-083.md`:

```markdown
- **status**: completed
```

Replace its `## Result` section with:

```markdown
## Result

Completed on 2026-05-14.

- Source-checkout CLI defaults to `~/.aiworker-dev`.
- Packaged/dist/npm CLI defaults remain `~/.aiworker`.
- Explicit `AIWORKER_HOME` and `WORKER_DB_PATH` still win.
- Root dev scripts use `$HOME/.aiworker-dev`.
- Docs describe source and packaged defaults.
- Focused tests, dist smoke and code-review-graph were run.
```

Update `docs/plan/PLAN-318.md` header:

```markdown
- **status**: completed
- **createdAt**: 2026-05-14
- **approvedAt**: 2026-05-14
- **completedAt**: 2026-05-14
```

Replace its `## Verification Results` section with the exact command results from Steps 1-7.

Change the FEAT/PLAN index checkboxes from `[ ]` to `[x]`.

Add a top changelog completion entry:

```markdown
## 2026-05-14 [done]

Completed FEAT-083 / PLAN-318. Source-checkout development now defaults to
`~/.aiworker-dev`, packaged CLI defaults remain `~/.aiworker`, and explicit
`AIWORKER_HOME` / `WORKER_DB_PATH` overrides keep priority. Verified with
focused fs-layout/Core/CLI tests, Web build, CLI bundle, dist release smoke,
`git diff --check` and code-review-graph.
```

- [ ] **Step 9: Commit PMA closeout**

Run:

```bash
git add docs/task/FEAT-083.md docs/plan/PLAN-318.md docs/task/index.md docs/plan/index.md docs/changelog.md
git commit -m "docs: 记录开发版 home 隔离交付"
```

Expected: commit succeeds and contains only PMA/changelog files.

- [ ] **Step 10: Final status**

Run:

```bash
git status --short
```

Expected: clean working tree.

Summarize:

- commits created;
- source default proof;
- dist default proof;
- verification commands;
- code-review-graph result;
- any residual risk.
