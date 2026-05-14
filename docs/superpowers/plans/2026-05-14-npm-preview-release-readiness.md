# npm Preview Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `@zonease/aiworker-cli` npm preview package self-contained enough for external `bunx` / `npx` users to start Host Web/API and bootstrap official HR/QA Soul Apps without cloning the monorepo.

**Architecture:** Keep Host generic: the CLI package carries official app release resources, but Host still installs/enables them through the manifest registry. Add explicit package resource locators for Worker Web static files and official app roots so source checkout and npm dist use the same lifecycle with different resource roots.

**Tech Stack:** Bun CLI, Bun build, Hono/OpenAPI local daemon, SQLite worker DB migrations, AIWorker Host runtime, Soul App manifests, npm pack dry-run, Bun tests.

---

## File Structure

- Modify `apps/cli/src/aiworker.ts`: resolve package-local runtime resources, pass `webStaticDir` and `officialAppsRoot` into daemon/API/Host runtime, and expose a reusable dist smoke helper entry.
- Modify `apps/api/src/modes/worker.ts`: accept `officialAppsRoot` in `bootstrapWorkerApp` and forward it to `createHostRuntime`.
- Modify `packages/core/src/host/runtime.ts`: accept `officialAppsRoot` in `HostRuntimeOptions` and pass it into official bootstrap.
- Modify `packages/core/src/soul-app/official.ts`: resolve official manifest paths from an explicit official app root before falling back to source checkout.
- Modify `apps/cli/scripts/build-publish-manifest.ts`: copy official app release resources into `apps/cli/dist/official-apps`, patch manifest commands to use bundled `dist/host-mounted.js` and `dist/standalone.js`, and include `official-apps/` in the publish files.
- Create `apps/cli/scripts/smoke-dist-release.ts`: run the built dist CLI in a temporary home, start a daemon on a free port, verify Web/API/catalog, run `app bootstrap official`, then clean up.
- Modify `apps/cli/package.json`: build official HR/QA app bundles before packaging and replace stale release smoke with `smoke:dist-release`.
- Modify root `package.json`: keep root build aligned with the CLI release resource needs.
- Modify `README.md`, `docs/cli.md`, and `docs/deployment.md`: mark this as `0.x preview`, document npm runtime expectations, and stop implying source-only paths are release-ready.
- Create `docs/task/FEAT-082.md` and `docs/plan/PLAN-315.md`; update `docs/task/index.md`, `docs/plan/index.md`, and `docs/changelog.md`.

## Task 1: PMA Tracking And Release Scope

**Files:**
- Create: `docs/task/FEAT-082.md`
- Create: `docs/plan/PLAN-315.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Add the PMA task**

Create `docs/task/FEAT-082.md`:

```markdown
# FEAT-082 npm preview release readiness

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 14:11
- **plan**: PLAN-315
- **relatesTo**: apps/cli, apps/api, packages/core, apps/aiworker-hr, apps/aiworker-qa, docs/deployment.md, docs/cli.md

## Context

AIWorker is preparing a 0.x public preview release for external npm users.
The package should support `bunx` / `npx @zonease/aiworker-cli` as the entry,
without requiring a monorepo checkout for Host Web/API startup or official
HR/QA Soul App bootstrap.

Current source-checkout validation passes for official app bootstrap,
validate and smoke. The built dist package starts `/health`, but it does not
serve Worker Web from package-local static assets and cannot locate official
Soul App manifests inside the package.

## Goals

- Make the CLI package self-contained for local daemon runtime resources.
- Serve Worker Web from the npm package in dist mode.
- Bootstrap official HR/QA Soul Apps from package-local release resources.
- Replace stale release smoke coverage with a current Host/Soul App product
  path smoke.
- Mark the npm release as 0.x preview and keep Host auth out of this gate.

## Non-Goals

- No 1.0 release claim.
- No Host auth implementation.
- No third-party Soul App SDK/runtime npm publication.
- No remote gateway, fleet, marketplace or cloud provider scope.
- No Host interpretation of HR/QA domain data.

## Acceptance Criteria

- `apps/cli/dist/aiworker.js daemon foreground` serves `/`, `/health`,
  Worker Web assets and `/api/local/apps` from a fresh temp home.
- `apps/cli/dist/aiworker.js app bootstrap official` succeeds without source
  repo `apps/aiworker-*` paths.
- `apps/cli/dist/aiworker.js app list`, `soul list`, and
  `template list --soul aiworker-hr` show app-projected catalog data.
- `cd apps/cli/dist && npm pack --dry-run --json` includes `official-apps/`,
  `web/`, `drizzle/`, `aiworker.js`, and `aiworker-bun.js`.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passes.
- Docs describe this as a 0.x preview and identify preview/non-goal surfaces.

## Verification

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `cd apps/cli/dist && npm pack --dry-run --json`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Pending.
```

- [x] **Step 2: Add the PMA plan**

Create `docs/plan/PLAN-315.md`:

```markdown
# PLAN-315 npm preview release readiness

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-14 14:11
- **relatedTask**: FEAT-082

## Decision

Implement the 0.x public preview release gate defined in
`docs/superpowers/specs/2026-05-14-npm-preview-release-readiness-design.md`.

The package will carry official first-party Soul App release resources, while
Host continues to install and enable them through the normal manifest registry.
The release is not a 1.0 commitment and does not include Host auth.

## Implementation Slices

1. Add PMA and Superpowers implementation tracking.
2. Add runtime resource locators for Worker Web static and official Soul Apps.
3. Package official app resources into the CLI dist directory.
4. Add a dist/npm release smoke that matches the current Host/Soul App path.
5. Update preview release docs.
6. Run focused and root verification, close PMA, and review with CRG.

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `cd apps/cli/dist && npm pack --dry-run --json`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Pending.
```

- [x] **Step 3: Register the PMA entries**

Append these lines to the active completed/in-progress blocks in `docs/task/index.md` and `docs/plan/index.md`:

```markdown
- [ ] [**FEAT-082 npm preview release readiness**](FEAT-082.md) `P0`
```

```markdown
- [ ] [**PLAN-315 npm preview release readiness**](PLAN-315.md) `2026-05-14`
```

- [x] **Step 4: Add the changelog placeholder**

Prepend this entry to `docs/changelog.md`:

```markdown
## 2026-05-14 14:11 [in_progress] FEAT-082 / PLAN-315 — npm preview release readiness

Started the 0.x public preview release readiness slice.

- Target npm users running `bunx` / `npx @zonease/aiworker-cli`.
- Scope is self-contained Host Web/API startup and official HR/QA Soul App
  bootstrap from the published package.
- Host auth, 1.0 release claims and third-party SDK/runtime npm publication are
  out of scope for this slice.
```

- [x] **Step 5: Verify docs formatting**

Run:

```bash
git diff --check docs/task/FEAT-082.md docs/plan/PLAN-315.md docs/task/index.md docs/plan/index.md docs/changelog.md
```

Expected: no output and exit code 0.

## Task 2: Official App Resource Root In Host Runtime

**Files:**
- Modify: `packages/core/src/soul-app/official.ts`
- Modify: `packages/core/src/host/runtime.ts`
- Test: `packages/core/src/soul-app/registry.test.ts`

- [x] **Step 1: Write the failing core test**

Add this test to `packages/core/src/soul-app/registry.test.ts` after the existing official bootstrap test:

```ts
  it('bootstraps official apps from an explicit packaged app root', async () => {
    const packagedRoot = path.join(dir, 'official-apps')
    const hrRoot = path.join(packagedRoot, 'aiworker-hr')
    const qaRoot = path.join(packagedRoot, 'aiworker-qa')
    mkdirSync(hrRoot, { recursive: true })
    mkdirSync(qaRoot, { recursive: true })
    writeFileSync(path.join(hrRoot, 'soul-app.manifest.json'), JSON.stringify(hrSoulAppManifest))
    writeFileSync(path.join(qaRoot, 'soul-app.manifest.json'), JSON.stringify(qaSoulAppManifest))

    const results = await bootstrapOfficialSoulApps({
      availableConnectorIds: ['ats', 'calendar', 'ci', 'issue-tracker'],
      hostVersion: '0.12.1',
      now: () => '2026-05-14T14:12:00.000Z',
      officialAppsRoot: packagedRoot,
    })

    expect(results.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'installed_enabled'],
      ['aiworker-qa', 'installed_enabled'],
    ])
    expect(results.every(result => result.manifestPath.startsWith(packagedRoot))).toBe(true)
    expect(findHostSoul('aiworker-hr')?.status).toBe('available')
    expect(findHostSoul('aiworker-qa')?.status).toBe('available')
  })
```

Also update the test import:

```ts
import { hrSoulAppManifest, namespaceSoulAppCapabilityId, qaSoulAppManifest } from '@zonease/aiworker-shared'
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
```

Expected: FAIL with a TypeScript/runtime error indicating `officialAppsRoot` is not part of `OfficialSoulAppBootstrapOptions` or is ignored.

- [x] **Step 3: Add the explicit resource root**

In `packages/core/src/soul-app/official.ts`, extend the options and resolver:

```ts
export interface OfficialSoulAppBootstrapOptions extends SoulAppRegistryContext {
  definitions?: readonly OfficialSoulAppDefinition[]
  officialAppsRoot?: string
  repoRoot?: string
}
```

Replace `resolveOfficialManifestPath(...)` with:

```ts
function resolveOfficialManifestPath(definition: OfficialSoulAppDefinition, options: OfficialSoulAppBootstrapOptions): string {
  if (path.isAbsolute(definition.manifestPath))
    return definition.manifestPath
  if (options.officialAppsRoot) {
    const manifestPath = path.resolve(options.officialAppsRoot, definition.id, DEFAULT_OFFICIAL_MANIFEST_FILENAME)
    return manifestPath
  }
  return path.resolve(options.repoRoot ?? defaultRepoRoot(), definition.manifestPath)
}
```

Add near the official definitions:

```ts
const DEFAULT_OFFICIAL_MANIFEST_FILENAME = 'soul-app.manifest.json'
```

- [x] **Step 4: Forward the root through HostRuntime**

In `packages/core/src/host/runtime.ts`, extend `HostRuntimeOptions`:

```ts
export interface HostRuntimeOptions {
  executor?: LocalExecutor
  now?: () => string
  officialAppsRoot?: string
  registryContext?: () => SoulAppRegistryContext
  workersRoot: string
}
```

Change `bootstrapOfficialSoulApps()`:

```ts
  async bootstrapOfficialSoulApps(): Promise<HostOfficialSoulAppBootstrap> {
    const results = await bootstrapOfficialSoulAppRegistry({
      ...this.registryContext(),
      officialAppsRoot: this.options.officialAppsRoot,
    })
    const legacyMetadataDiscard = discardOfficialSoulAppLegacyMetadata(this.options.now?.())
    return {
      catalog: this.listCatalog(),
      legacyMetadataDiscard,
      results,
      scope: 'official',
      status: results.some(result => result.action === 'error') ? 'fail' : 'pass',
    }
  }
```

- [x] **Step 5: Run the focused test and verify it passes**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
```

Expected: PASS.

## Task 3: CLI And API Runtime Resource Locators

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/cli/src/aiworker.ts`
- Test: `apps/api/src/modes/worker.local.test.ts`
- Test: `apps/cli/src/aiworker.test.ts`

- [x] **Step 1: Add an API bootstrap test for explicit roots**

In `apps/api/src/modes/worker.local.test.ts`, add a test near the official app bootstrap tests:

```ts
  it('bootstraps official apps from an explicit packaged app root', async () => {
    const officialAppsRoot = join(dir, 'official-apps')
    mkdirSync(join(officialAppsRoot, 'aiworker-hr'), { recursive: true })
    mkdirSync(join(officialAppsRoot, 'aiworker-qa'), { recursive: true })
    writeFileSync(join(officialAppsRoot, 'aiworker-hr', 'soul-app.manifest.json'), JSON.stringify(hrSoulAppManifest))
    writeFileSync(join(officialAppsRoot, 'aiworker-qa', 'soul-app.manifest.json'), JSON.stringify(qaSoulAppManifest))

    const target = await app(undefined, undefined, officialAppsRoot)
    const res = await target.request('/api/local/apps')
    const body = await res.json() as { apps: Array<{ appId: string, sourceRef: string, status: string }> }

    expect(body.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ appId: 'aiworker-hr', status: 'enabled' }),
      expect.objectContaining({ appId: 'aiworker-qa', status: 'enabled' }),
    ]))
    expect(body.apps.every(item => item.sourceRef.startsWith(officialAppsRoot))).toBe(true)
  })
```

Update the local test helper signature:

```ts
  async function app(token?: string, webStaticDir?: string, officialAppsRoot?: string) {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      officialAppsRoot,
      token,
      webStaticDir,
      workersRoot: join(dir, 'workers'),
    })
    return boot.app
  }
```

Add `qaSoulAppManifest` to the shared import if it is missing.

- [x] **Step 2: Add CLI resource locator tests**

In `apps/cli/src/aiworker.test.ts`, import `readFile` and add tests for exported resolver helpers:

```ts
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
```

Update the source import:

```ts
import { preprocessArgv, resolveCliOfficialAppsRoot, resolveCliWorkerWebStaticDir, runCli } from './aiworker'
```

Add:

```ts
  it('resolves package-local official apps before source apps', async () => {
    const moduleDir = path.join(root, 'dist')
    const officialRoot = path.join(moduleDir, 'official-apps')
    mkdirSync(path.join(officialRoot, 'aiworker-hr'), { recursive: true })
    await writeFile(path.join(officialRoot, 'aiworker-hr', 'soul-app.manifest.json'), '{}')

    expect(resolveCliOfficialAppsRoot(moduleDir)).toBe(officialRoot)
  })

  it('resolves package-local Worker Web static before source static', async () => {
    const moduleDir = path.join(root, 'dist')
    const webRoot = path.join(moduleDir, 'web', 'worker')
    mkdirSync(webRoot, { recursive: true })
    await writeFile(path.join(webRoot, 'index.html'), '<html></html>')

    expect(resolveCliWorkerWebStaticDir(moduleDir)).toBe(webRoot)
  })
```

- [x] **Step 3: Run focused tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: FAIL because the new bootstrap option and exported resolver helpers do not exist yet.

- [x] **Step 4: Forward `officialAppsRoot` through API bootstrap**

In `apps/api/src/modes/worker.ts`, add to `BootstrapWorkerAppOptions`:

```ts
  officialAppsRoot?: string
```

Pass it into `createHostRuntime`:

```ts
  const host = createHostRuntime({
    executor: options.executor,
    now: options.now,
    officialAppsRoot: options.officialAppsRoot,
    registryContext: () => {
      const settings = loadLocalSettings()
      return {
        availableConnectorIds: settings.connectors.map(connector => connector.id),
        enabledConnectorIds: settings.connectors.filter(connector => connector.enabled).map(connector => connector.id),
        hostVersion: runtimeVersion,
      }
    },
    workersRoot,
  })
```

- [x] **Step 5: Add CLI resource resolvers**

In `apps/cli/src/aiworker.ts`, add imports:

```ts
import { fileURLToPath } from 'node:url'
```

Add helpers near `localPaths()`:

```ts
const CLI_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

export function resolveCliOfficialAppsRoot(moduleDir = CLI_MODULE_DIR): string | undefined {
  const packaged = path.resolve(moduleDir, 'official-apps')
  if (existsSync(path.join(packaged, 'aiworker-hr', 'soul-app.manifest.json')))
    return packaged
  const source = path.resolve(moduleDir, '../../apps')
  if (existsSync(path.join(source, 'aiworker-hr', 'soul-app.manifest.json')))
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
```

Update `createHost(...)`:

```ts
function createHost(paths: LocalPaths, options: { executor?: LocalExecutor, officialAppsRoot?: string, registryContext?: () => SoulAppRegistryContext } = {}): HostRuntime {
  return createHostRuntime({
    executor: options.executor,
    officialAppsRoot: options.officialAppsRoot ?? resolveCliOfficialAppsRoot(),
    registryContext: options.registryContext ?? registryContext,
    workersRoot: paths.workersRoot,
  })
}
```

Update `daemonForeground(...)`:

```ts
async function daemonForeground(opts: { host?: string, port?: number } = {}): Promise<void> {
  const { bootstrapWorkerApp } = await import('@zonease/aiworker-api/bootstrap')
  const { app, port } = await bootstrapWorkerApp({
    officialAppsRoot: resolveCliOfficialAppsRoot(),
    webStaticDir: resolveCliWorkerWebStaticDir(),
  })
  const env = getWorkerEnv()
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: opts.host ?? env.AIWORKER_WORKER_HOST,
    idleTimeout: 255,
    port: opts.port ?? port,
  })
```

- [x] **Step 6: Run focused tests and verify they pass**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: PASS.

## Task 4: Package Official App Release Resources

**Files:**
- Modify: `apps/cli/scripts/build-publish-manifest.ts`
- Modify: `apps/cli/package.json`
- Modify: `package.json`

- [x] **Step 1: Write a package dry-run expectation**

After implementation, this command must include `official-apps/aiworker-hr/soul-app.manifest.json`, `official-apps/aiworker-hr/dist/host-mounted.js`, `official-apps/aiworker-qa/soul-app.manifest.json`, and `official-apps/aiworker-qa/dist/host-mounted.js`:

```bash
cd apps/cli/dist && npm pack --dry-run --json
```

Expected before implementation: those paths are absent.

- [x] **Step 2: Add official app builds to CLI packaging scripts**

In `apps/cli/package.json`, change scripts to:

```json
{
  "build": "bun run --filter '@zonease/aiworker-web' build && bun run build:bundle",
  "build:bundle": "bun run --filter '@zonease/aiworker-hr' build && bun run --filter '@zonease/aiworker-qa' build && bun build --target=bun --minify --outfile=dist/aiworker-bun.js src/aiworker.ts && bun scripts/build-publish-manifest.ts",
  "prepublishOnly": "bun run build",
  "smoke:dist-release": "bun scripts/smoke-dist-release.ts"
}
```

Keep `test`, `typecheck`, and `test:stress` unchanged.

In root `package.json`, change the build script to:

```json
"build": "bun run --filter '@zonease/aiworker-api' build && bun run --filter '@zonease/aiworker-web' build && bun run --filter '@zonease/aiworker-cli' build:bundle"
```

No root change is needed if the line already matches this text.

- [x] **Step 3: Include `official-apps/` in dist package metadata**

In `apps/cli/scripts/build-publish-manifest.ts`, update:

```ts
files: ['aiworker.js', 'aiworker-bun.js', 'README.md', 'drizzle/', 'web/', 'official-apps/'],
```

- [x] **Step 4: Copy and patch official apps**

Add after the Worker Web copy block in `apps/cli/scripts/build-publish-manifest.ts`:

```ts
const officialApps = ['aiworker-hr', 'aiworker-qa'] as const
const officialAppsDst = resolve(distDir, 'official-apps')
await rm(officialAppsDst, { recursive: true, force: true })
for (const appId of officialApps)
  await copyOfficialApp(appId)
```

Add helpers below `copyDir(...)`:

```ts
async function copyOfficialApp(appId: string): Promise<void> {
  const appSrc = resolve(repoRoot, 'apps', appId)
  const appDst = resolve(officialAppsDst, appId)
  await copyDir(appSrc, appDst)
  await patchOfficialAppManifest(resolve(appDst, 'soul-app.manifest.json'))
}

async function patchOfficialAppManifest(manifestPath: string): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    api?: { localService?: { command?: string[] } }
    modes?: {
      hostMounted?: { entry?: string }
      standalone?: { entry?: string }
    }
  }
  if (manifest.api?.localService)
    manifest.api.localService.command = ['bun', 'dist/host-mounted.js']
  if (manifest.modes?.hostMounted)
    manifest.modes.hostMounted.entry = './dist/host-mounted.js'
  if (manifest.modes?.standalone)
    manifest.modes.standalone.entry = './dist/standalone.js'
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}
```

This copies source files for validation/reference and uses bundled dist entrypoints for executed mounted services.

- [x] **Step 5: Build and verify package contents**

Run:

```bash
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
cd apps/cli/dist && npm pack --dry-run --json
```

Expected: dry-run JSON includes:

```text
official-apps/aiworker-hr/soul-app.manifest.json
official-apps/aiworker-hr/dist/host-mounted.js
official-apps/aiworker-qa/soul-app.manifest.json
official-apps/aiworker-qa/dist/host-mounted.js
web/worker/index.html
drizzle/worker/meta/_journal.json
```

## Task 5: Current Dist Release Smoke

**Files:**
- Create: `apps/cli/scripts/smoke-dist-release.ts`
- Modify: `apps/cli/package.json`

- [x] **Step 1: Create the dist smoke script**

Create `apps/cli/scripts/smoke-dist-release.ts`:

```ts
#!/usr/bin/env bun
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

interface CommandResult {
  code: number
  stderr: string
  stdout: string
}

async function main(): Promise<number> {
  const cli = resolve(import.meta.dirname, '..', 'dist', 'aiworker.js')
  if (!existsSync(cli))
    throw new Error(`Dist CLI not found: ${cli}. Run bun run build:bundle first.`)

  const root = mkdtempSync(join(tmpdir(), 'aiworker-dist-release-'))
  const home = join(root, 'home')
  const port = await reservePort()
  const env = {
    ...process.env,
    AIWORKER_HOME: home,
    AIWORKER_WORKER_HOST: '127.0.0.1',
    PORT: String(port),
    WORKER_DB_PATH: join(home, 'aiworker.db'),
  }
  let daemon: ReturnType<typeof spawn> | null = null

  try {
    daemon = spawn([cli, 'daemon', 'foreground', '--host', '127.0.0.1', '--port', String(port)], {
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await waitForHealth(port)
    await assertHttpText(`http://127.0.0.1:${port}/`, '<!doctype html>')
    await assertHttpOk(`http://127.0.0.1:${port}/assets/`)

    const apps = await getJson<{ apps: Array<{ appId: string, status: string }> }>(`http://127.0.0.1:${port}/api/local/apps`)
    assertCatalogApps(apps.apps)

    await assertCli(cli, ['app', 'bootstrap', 'official'], { env, label: 'app bootstrap official' })
    const list = await assertCli(cli, ['app', 'list'], { env, label: 'app list' })
    const souls = await assertCli(cli, ['soul', 'list'], { env, label: 'soul list' })
    const templates = await assertCli(cli, ['template', 'list', '--soul', 'aiworker-hr'], { env, label: 'template list' })
    assertJsonIncludes(list.stdout, 'aiworker-hr')
    assertJsonIncludes(souls.stdout, 'aiworker-qa')
    assertJsonIncludes(templates.stdout, 'aiworker-hr.person-profile')

    consola.success('[smoke-dist-release] PASS: dist CLI starts Host Web/API and bootstraps official Soul Apps')
    return 0
  }
  finally {
    if (daemon) {
      daemon.kill()
      await Promise.race([
        daemon.exited.catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 2_000)),
      ])
      const stdout = await new Response(daemon.stdout).text().catch(() => '')
      const stderr = await new Response(daemon.stderr).text().catch(() => '')
      if (stdout.trim())
        consola.info(`[smoke-dist-release] daemon stdout:\n${stdout}`)
      if (stderr.trim())
        consola.info(`[smoke-dist-release] daemon stderr:\n${stderr}`)
    }
    rmSync(root, { recursive: true, force: true })
  }
}

async function assertCli(cli: string, args: string[], options: { env: NodeJS.ProcessEnv, label: string }): Promise<CommandResult> {
  const result = await runCli(cli, args, options.env)
  if (result.code !== 0) {
    throw new Error(`${options.label} failed with ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result
}

async function runCli(cli: string, args: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const proc = spawn([cli, ...args], {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stderr, stdout }
}

async function reservePort(): Promise<number> {
  const server = Bun.serve({ fetch: () => new Response('ok'), hostname: '127.0.0.1', port: 0 })
  const port = server.port
  server.stop()
  return port
}

async function waitForHealth(port: number): Promise<void> {
  let lastError = ''
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok)
        return
      lastError = `${res.status} ${await res.text()}`
    }
    catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`daemon health did not become ready on port ${port}: ${lastError}`)
}

async function assertHttpText(url: string, expected: string): Promise<void> {
  const res = await fetch(url)
  const body = await res.text()
  if (!res.ok || !body.includes(expected))
    throw new Error(`Expected ${url} to include ${expected}; got ${res.status}: ${body.slice(0, 200)}`)
}

async function assertHttpOk(url: string): Promise<void> {
  const res = await fetch(url).catch(() => null)
  if (res && res.status < 500)
    return
  const root = await fetch(url.replace(/\/assets\/$/, '/')).then(res => res.text())
  if (!root.includes('/assets/'))
    throw new Error(`Worker Web asset route was not discoverable from HTML at ${url}`)
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`GET ${url} failed: ${res.status} ${await res.text()}`)
  return await res.json() as T
}

function assertCatalogApps(apps: Array<{ appId: string, status: string }>): void {
  for (const appId of ['aiworker-hr', 'aiworker-qa']) {
    const app = apps.find(item => item.appId === appId)
    if (!app)
      throw new Error(`Catalog is missing ${appId}: ${JSON.stringify(apps)}`)
    if (app.status !== 'enabled')
      throw new Error(`${appId} should be enabled, got ${app.status}`)
  }
}

function assertJsonIncludes(stdout: string, expected: string): void {
  if (!stdout.includes(expected))
    throw new Error(`Expected CLI output to include ${expected}:\n${stdout}`)
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(`[smoke-dist-release] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
```

- [x] **Step 2: Ensure package script points to the new smoke**

In `apps/cli/package.json`, ensure this script exists:

```json
"smoke:dist-release": "bun scripts/smoke-dist-release.ts"
```

Remove the stale `smoke:aiworker-run` script or leave it unreferenced only if another active doc still names it. Active release docs must use `smoke:dist-release`.

- [x] **Step 3: Build and run the smoke**

Run:

```bash
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```

Expected: PASS with a message containing `dist CLI starts Host Web/API and bootstraps official Soul Apps`.

## Task 6: Preview Release Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/cli.md`
- Modify: `docs/deployment.md`

- [x] **Step 1: Update README quickstart**

In `README.md`, update the Quickstart section so the packaged path reads:

````markdown
目标 packaged/npm preview 入口：

```bash
bunx @zonease/aiworker-cli daemon foreground --port 9217
# or, if Bun is already available for the shim:
npx @zonease/aiworker-cli daemon foreground --port 9217
```

This is a `0.x preview`: Host Web/API startup, worker DB migrations and
official HR/QA Soul App bootstrap are expected to work from the package.
HR/QA business workflows, third-party Soul App authoring and standalone SDK/npm
publication are still preview surfaces, not 1.0 commitments.
````

- [x] **Step 2: Update CLI docs verification**

In `docs/cli.md`, add the dist release smoke under Verification:

````markdown
For npm preview release readiness:

```bash
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
cd apps/cli/dist && npm pack --dry-run --json
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```
````

- [x] **Step 3: Update deployment packaged CLI section**

In `docs/deployment.md`, state that packaged CLI resources are self-contained:

```markdown
The npm preview package is expected to include Worker Web static assets,
worker DB migrations and first-party official Soul App release resources under
the CLI package directory. It should not require a source checkout to serve
`/` or bootstrap HR/QA.
```

- [x] **Step 4: Search for stale release smoke references**

Run:

```bash
rg -n "smoke:aiworker-run|run/runs|lessons promote|apps/cli/scripts/smoke-aiworker-run" README.md docs apps/cli/package.json
```

Expected: no active release guidance points to the stale smoke script. Historical PMA records may still contain old text.

## Task 7: Full Verification, PMA Closeout, And Code Review Graph

**Files:**
- Modify: `docs/task/FEAT-082.md`
- Modify: `docs/plan/PLAN-315.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused verification**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
cd apps/cli/dist && npm pack --dry-run --json
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```

Expected: all commands exit 0, and the npm pack dry-run includes `official-apps/`.

- [x] **Step 2: Run root verification**

Run:

```bash
bun run check
bun run test
bun run build
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 3: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: both commands exit 0. If CRG reports static test-gap hints, verify each hinted path is covered by focused tests or add coverage.

- [x] **Step 4: Close PMA records**

Change `docs/task/FEAT-082.md`:

```markdown
- **status**: completed
```

Replace its Result section:

```markdown
## Result

Completed on 2026-05-14.

- The CLI dist package now carries Worker Web static assets, DB migrations and
  first-party official HR/QA Soul App release resources.
- Source checkout and dist/npm runtime use explicit resource locators instead
  of relying on source repo paths in published packages.
- Dist release smoke verifies daemon startup, Host Web, app catalog,
  `app bootstrap official`, `app list`, `soul list` and HR template projection.
- Documentation marks the release as 0.x preview and keeps Host auth, 1.0
  claims and independent SDK/runtime npm publication out of scope.
- Verification passed with focused package tests, dist packaging checks, root
  gates and code-review-graph.
```

Change `docs/plan/PLAN-315.md`:

```markdown
- **status**: completed
```

Replace its Result section with the same summary plus the exact verification command list.

Mark the index entries as completed:

```markdown
- [x] [**FEAT-082 npm preview release readiness**](FEAT-082.md) `P0`
- [x] [**PLAN-315 npm preview release readiness**](PLAN-315.md) `2026-05-14`
```

- [x] **Step 5: Update changelog completion entry**

Replace the in-progress changelog entry title with:

```markdown
## 2026-05-14 14:11 [completed] FEAT-082 / PLAN-315 — npm preview release readiness
```

Add bullets for the shipped behavior and verification evidence.

- [x] **Step 6: Commit**

Run:

```bash
git status --short
git add apps/cli/src/aiworker.ts apps/cli/scripts/build-publish-manifest.ts apps/cli/scripts/smoke-dist-release.ts apps/cli/package.json apps/api/src/modes/worker.ts packages/core/src/host/runtime.ts packages/core/src/soul-app/official.ts packages/core/src/soul-app/registry.test.ts apps/api/src/modes/worker.local.test.ts apps/cli/src/aiworker.test.ts README.md docs/cli.md docs/deployment.md docs/task/FEAT-082.md docs/plan/PLAN-315.md docs/task/index.md docs/plan/index.md docs/changelog.md docs/superpowers/plans/2026-05-14-npm-preview-release-readiness.md
git commit -m "feat: 闭环 npm preview 发版资源"
```

Expected: commit succeeds with only scoped files.

## Self-Review

- Spec coverage: P0 npm runtime, package self-contained resources, dist release smoke, preview messaging and non-goals are covered by Tasks 2 through 7.
- Placeholder scan: the plan has no placeholder markers or unresolved future work. Historical old smoke names appear only as explicit removal/search targets.
- Type consistency: `officialAppsRoot` is introduced in core, API and CLI with the same property name; CLI locator helpers return `string | undefined`; package resource path is `official-apps/<appId>/soul-app.manifest.json`.
