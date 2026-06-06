# Soul Dist Generated Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop tracking `souls/*/dist/**` in Git while preserving generated official Soul descriptor bundles in local builds, npm packages, and standalone releases.

**Architecture:** Add one reusable root helper that builds every official Soul from source, then make CLI publish-manifest copying call that helper before reading `souls/<id>/dist`. Tests that currently depend on tracked repo-local `dist` either build the needed descriptor first or assert source-only contracts; release smoke keeps proving packaged `official-apps/<id>/dist` exists.

**Tech Stack:** Bun, TypeScript, AIWorker workspace packages, `@zonease/aiworker-soul-sdk`, `@zonease/aiworker-worker-runtime`, existing Bun tests and release smoke scripts.

---

## File Structure

- Create `scripts/official-soul-dist.ts`: reusable root helper that reads `OFFICIAL_SOUL_APPS`, resolves each Soul package name, runs its `build` script, and verifies `dist/soul.descriptor.json` exists.
- Create `scripts/official-soul-dist.test.ts`: unit tests for command dispatch and missing descriptor failure.
- Modify `apps/worker-cli/scripts/build-publish-manifest.ts`: call the helper before copying official Soul dist into `apps/worker-cli/dist/official-apps`.
- Modify `apps/worker-cli/scripts/build-publish-manifest.test.ts`: prove official app copying runs the build hook before reading `dist`.
- Modify `package.json`: add `build:official-souls`.
- Modify `apps/worker-cli/package.json`: remove the Freeform-only prebuild from `build:bundle`; package manifest generation now builds all official Souls. Make package tests build Freeform first because several CLI tests install the repo-local Freeform descriptor.
- Modify `tests/architecture/freeform-soul-contract.test.ts`: build Freeform inside the contract test before reading its descriptor; add a Git-tracking assertion that Soul dist files are not tracked.
- Modify `packages/worker-runtime/src/soul-app/registry.test.ts`: use a temp `repoRoot` fixture for the repo-local official descriptor test instead of depending on real tracked dist.
- Modify `scripts/e2e-soul-sampling.test.ts`: remove static assertions against repo-local generated dist and keep the source asset assertions.
- Untrack current generated files with `git rm --cached -r souls/*/dist`.

---

### Task 0: Preflight Current Authority

**Files:**
- Read: `AGENTS.md`
- Read: `docs/architecture.md`
- Read: `docs/protocol.md`
- Read: `docs/runtime.md`
- Read: `docs/soul-authoring.md`
- Read: `docs/testing.md`

- [ ] **Step 1: Re-read repo authority**

Run:

```bash
sed -n '1,240p' AGENTS.md
sed -n '1,220p' docs/architecture.md
sed -n '1,220p' docs/protocol.md
sed -n '1,220p' docs/runtime.md
sed -n '1,180p' docs/soul-authoring.md
sed -n '1,260p' docs/testing.md
```

Expected: docs still define Soul as descriptor-only, `dist/soul.descriptor.json` as install input, and `dist/engine-assets/**` as SDK build output.

- [ ] **Step 2: Run baseline contract gates**

Run:

```bash
bun run docs:check
bun run test:contracts
```

Expected: both commands pass before implementation begins. If dependency resolution fails with a missing package, run `bun install` once and repeat the two commands.

- [ ] **Step 3: Confirm tracked dist baseline**

Run:

```bash
git ls-files 'souls/**/dist/**' | wc -l
```

Expected: nonzero count before migration, currently `79`.

---

### Task 1: Add Official Soul Dist Helper Tests

**Files:**
- Create: `scripts/official-soul-dist.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `scripts/official-soul-dist.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { ensureOfficialSoulDists } from './official-soul-dist'

describe('official Soul dist builder', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aiworker-official-soul-dist-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('runs each official Soul package build before accepting descriptor output', async () => {
    const appRoot = join(root, 'souls', 'aiworker-demo')
    await mkdir(appRoot, { recursive: true })
    await writeFile(
      join(appRoot, 'package.json'),
      JSON.stringify({ name: '@zonease/aiworker-demo', scripts: { build: 'bun scripts/build.ts' } }),
    )

    const commands: string[][] = []
    const results = await ensureOfficialSoulDists({
      definitions: [{ descriptorPath: 'souls/aiworker-demo/dist/soul.descriptor.json', id: 'aiworker-demo' }],
      repoRoot: root,
      runCommand: async (command, context) => {
        commands.push([...command])
        expect(context).toMatchObject({
          appId: 'aiworker-demo',
          cwd: root,
          packageName: '@zonease/aiworker-demo',
        })
        await mkdir(join(appRoot, 'dist'), { recursive: true })
        await writeFile(join(appRoot, 'dist', 'soul.descriptor.json'), '{"protocol":"soul/v1"}\n')
      },
    })

    expect(commands).toEqual([
      ['bun', 'run', '--filter', '@zonease/aiworker-demo', 'build'],
    ])
    expect(results).toEqual([
      {
        appId: 'aiworker-demo',
        descriptorPath: join(root, 'souls/aiworker-demo/dist/soul.descriptor.json'),
        packageName: '@zonease/aiworker-demo',
      },
    ])
    expect(JSON.parse(await readFile(join(appRoot, 'dist', 'soul.descriptor.json'), 'utf8')).protocol).toBe('soul/v1')
  })

  it('fails when a Soul build does not produce its descriptor', async () => {
    const appRoot = join(root, 'souls', 'aiworker-demo')
    await mkdir(appRoot, { recursive: true })
    await writeFile(join(appRoot, 'package.json'), JSON.stringify({ name: '@zonease/aiworker-demo' }))

    await expect(ensureOfficialSoulDists({
      definitions: [{ descriptorPath: 'souls/aiworker-demo/dist/soul.descriptor.json', id: 'aiworker-demo' }],
      repoRoot: root,
      runCommand: async () => undefined,
    })).rejects.toThrow('Official Soul build did not create descriptor for aiworker-demo')
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun test scripts/official-soul-dist.test.ts
```

Expected: FAIL because `scripts/official-soul-dist.ts` does not exist.

---

### Task 2: Implement Official Soul Dist Helper

**Files:**
- Create: `scripts/official-soul-dist.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the helper implementation**

Create `scripts/official-soul-dist.ts`:

```ts
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { OFFICIAL_SOUL_APPS } from '@zonease/aiworker-worker-runtime'

export interface OfficialSoulDistBuildDefinition {
  descriptorPath: string
  id: string
}

export interface OfficialSoulDistBuildResult {
  appId: string
  descriptorPath: string
  packageName: string
}

export interface OfficialSoulDistCommandContext {
  appId: string
  cwd: string
  packageName: string
}

export type OfficialSoulDistCommandRunner = (
  command: readonly string[],
  context: OfficialSoulDistCommandContext,
) => Promise<void>

export interface EnsureOfficialSoulDistsOptions {
  definitions?: readonly OfficialSoulDistBuildDefinition[]
  repoRoot?: string
  runCommand?: OfficialSoulDistCommandRunner
}

const defaultRepoRoot = resolve(import.meta.dirname, '..')

export async function ensureOfficialSoulDists(
  options: EnsureOfficialSoulDistsOptions = {},
): Promise<OfficialSoulDistBuildResult[]> {
  const repoRoot = options.repoRoot ?? defaultRepoRoot
  const definitions = options.definitions ?? OFFICIAL_SOUL_APPS
  const runCommand = options.runCommand ?? runCommandWithInheritedStdio
  const results: OfficialSoulDistBuildResult[] = []

  for (const definition of definitions) {
    const soulRoot = resolve(repoRoot, 'souls', definition.id)
    const packageName = await readSoulPackageName(soulRoot)
    await runCommand(['bun', 'run', '--filter', packageName, 'build'], {
      appId: definition.id,
      cwd: repoRoot,
      packageName,
    })

    const descriptorPath = resolve(repoRoot, definition.descriptorPath)
    try {
      await access(descriptorPath)
    }
    catch {
      throw new Error(`Official Soul build did not create descriptor for ${definition.id}: ${descriptorPath}`)
    }

    results.push({
      appId: definition.id,
      descriptorPath,
      packageName,
    })
  }

  return results
}

async function readSoulPackageName(soulRoot: string): Promise<string> {
  const packagePath = resolve(soulRoot, 'package.json')
  const parsed = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: unknown }
  if (typeof parsed.name !== 'string' || parsed.name.length === 0)
    throw new Error(`Official Soul package is missing a package name: ${packagePath}`)
  return parsed.name
}

async function runCommandWithInheritedStdio(
  command: readonly string[],
  context: OfficialSoulDistCommandContext,
): Promise<void> {
  const proc = Bun.spawn([...command], {
    cwd: context.cwd,
    stderr: 'inherit',
    stdout: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0)
    throw new Error(`Official Soul build failed for ${context.appId}: ${command.join(' ')} exited ${exitCode}`)
}

if (import.meta.main)
  await ensureOfficialSoulDists()
```

- [ ] **Step 2: Add the root script**

Modify `package.json` scripts:

```json
"build:official-souls": "bun scripts/official-soul-dist.ts",
```

Place it near the existing `"build"` script.

- [ ] **Step 3: Run the helper tests**

Run:

```bash
bun test scripts/official-soul-dist.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the real official Soul build helper**

Run:

```bash
bun run build:official-souls
```

Expected: five Soul builds run and leave these descriptors present:

```text
souls/aiworker-freeform/dist/soul.descriptor.json
souls/google-ads/dist/soul.descriptor.json
souls/hr-manager/dist/soul.descriptor.json
souls/product-manager/dist/soul.descriptor.json
souls/software-support/dist/soul.descriptor.json
```

---

### Task 3: Wire CLI Publish Manifest To Build Before Copy

**Files:**
- Modify: `apps/worker-cli/scripts/build-publish-manifest.ts`
- Modify: `apps/worker-cli/scripts/build-publish-manifest.test.ts`
- Modify: `apps/worker-cli/package.json`

- [ ] **Step 1: Write the failing publish-manifest test**

Modify the import in `apps/worker-cli/scripts/build-publish-manifest.test.ts`:

```ts
import { copyDir, copyOfficialApp, copyOfficialApps, shouldSkipOfficialAppResource } from './build-publish-manifest'
```

Add this test after the existing `copies a descriptor-only official Soul dist tree without source hooks or tests` test:

```ts
  it('builds official Soul dist before copying official apps into the publish manifest', async () => {
    const soulsRoot = path.join(root, 'souls')
    const officialAppsRoot = path.join(root, 'dist', 'official-apps')
    const appRoot = path.join(soulsRoot, 'aiworker-demo')
    const calls: string[] = []

    await mkdir(path.join(appRoot, 'engine', 'workspace'), { recursive: true })

    await copyOfficialApps({
      appIds: ['aiworker-demo'],
      ensureOfficialSoulDists: async () => {
        calls.push('ensure')
        mkdirSync(path.join(appRoot, 'dist', 'engine-assets', 'workspace'), { recursive: true })
        await writeFile(path.join(appRoot, 'dist', 'soul.descriptor.json'), JSON.stringify({
          engine: {
            workspaceAssets: { source: 'dist/engine-assets/workspace' },
          },
          identity: {
            id: 'aiworker-demo',
            name: 'Demo',
          },
          protocol: 'soul/v1',
        }))
        await writeFile(path.join(appRoot, 'dist', 'engine-assets', 'workspace', 'AGENTS.md'), '# Demo\n')
      },
      officialAppsRoot,
      soulsRoot,
    })

    expect(calls).toEqual(['ensure'])
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'dist', 'soul.descriptor.json'))).resolves.toBeTruthy()
    await expect(stat(path.join(officialAppsRoot, 'aiworker-demo', 'dist', 'engine-assets', 'workspace', 'AGENTS.md'))).resolves.toBeTruthy()
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun test apps/worker-cli/scripts/build-publish-manifest.test.ts
```

Expected: FAIL because `copyOfficialApps` is not exported yet.

- [ ] **Step 3: Implement `copyOfficialApps` and call it from publish manifest**

Modify `apps/worker-cli/scripts/build-publish-manifest.ts`:

```ts
import { ensureOfficialSoulDists as ensureOfficialSoulDistsFromSource } from '../../../scripts/official-soul-dist'
```

Add this interface near the constants:

```ts
export interface CopyOfficialAppsOptions {
  appIds?: readonly string[]
  ensureOfficialSoulDists?: () => Promise<unknown>
  officialAppsRoot?: string
  soulsRoot?: string
}
```

Replace the official app copy block in `buildPublishManifest()`:

```ts
  await copyOfficialApps()
```

Add the exported helper before `copyDir`:

```ts
export async function copyOfficialApps(options: CopyOfficialAppsOptions = {}): Promise<void> {
  const appIds = options.appIds ?? officialApps
  const destinationRoot = options.officialAppsRoot ?? officialAppsDst

  await (options.ensureOfficialSoulDists ?? (() => ensureOfficialSoulDistsFromSource({ repoRoot })))()
  await rm(destinationRoot, { recursive: true, force: true })
  for (const appId of appIds) {
    await copyOfficialApp(appId, {
      officialAppsRoot: destinationRoot,
      soulsRoot: options.soulsRoot,
    })
  }
}
```

- [ ] **Step 4: Remove the Freeform-only CLI build prebuild**

Modify `apps/worker-cli/package.json`:

```json
"test": "bun run --filter '@zonease/aiworker-freeform' build && bun test --timeout=15000",
"build:bundle": "bun build --target=bun --minify --outfile=dist/aiworker-bun.js src/aiworker.ts && bun scripts/build-publish-manifest.ts",
```

The package test prebuild remains Freeform-only because CLI unit tests install the repo-local Freeform descriptor. The publish build now builds all official Souls through `build-publish-manifest.ts`.

- [ ] **Step 5: Run the focused publish-manifest tests**

Run:

```bash
bun test apps/worker-cli/scripts/build-publish-manifest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the build helper and publish wiring**

Run:

```bash
git add scripts/official-soul-dist.ts scripts/official-soul-dist.test.ts package.json apps/worker-cli/package.json apps/worker-cli/scripts/build-publish-manifest.ts apps/worker-cli/scripts/build-publish-manifest.test.ts
git commit -m "build(soul): 生成 official dist 后再打包"
```

Expected: commit succeeds.

---

### Task 4: Remove Test Dependence On Tracked Repo Dist

**Files:**
- Modify: `tests/architecture/freeform-soul-contract.test.ts`
- Modify: `packages/worker-runtime/src/soul-app/registry.test.ts`
- Modify: `scripts/e2e-soul-sampling.test.ts`

- [ ] **Step 1: Make the Freeform architecture contract build its descriptor**

Modify imports in `tests/architecture/freeform-soul-contract.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, test } from 'bun:test'

import { buildSoul } from '../../packages/soul-sdk/src/index'
import { parseSoulDescriptorV1 } from '../../packages/soul-descriptor/src/index'
```

Add this before `describe('Freeform Soul descriptor contract', () => {`:

```ts
beforeAll(async () => {
  await buildSoul(freeformRoot)
})
```

- [ ] **Step 2: Make worker-runtime registry tests use temp repo dist**

In `packages/worker-runtime/src/soul-app/registry.test.ts`, update the `bootstraps official Freeform without re-enabling disabled apps` test setup:

```ts
    const repoRoot = path.join(dir, 'repo')
    const descriptorRoot = path.join(repoRoot, 'souls', FREEFORM_APP_ID, 'dist')
    mkdirSync(descriptorRoot, { recursive: true })
    writeFileSync(path.join(descriptorRoot, 'soul.descriptor.json'), JSON.stringify(freeformDescriptor))

    const definitions = [{ descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json', id: FREEFORM_APP_ID }]
    const first = await bootstrapOfficialSoulApps({
      definitions,
      hostVersion: '0.19.3',
      now: () => '2026-05-13T12:25:00.000Z',
      repoRoot,
    })
```

Also pass `repoRoot` to the second and third `bootstrapOfficialSoulApps()` calls in the same test:

```ts
      repoRoot,
```

- [ ] **Step 3: Make sampling static tests assert source assets only**

In `scripts/e2e-soul-sampling.test.ts`, replace the Google Ads monthly review assertion with:

```ts
  it('keeps Google Ads monthly review deliverables from collapsing into a short summary', () => {
    const skill = readFileSync(
      'souls/google-ads/engine/skills/client-performance-review/SKILL.md',
      'utf8',
    )

    expect(skill).toContain('最低可交付月报')
    expect(skill).toContain('分区月报草案')
    expect(skill).toContain('不要退化成几段摘要')
    expect(skill).toContain('输出时必须保留这些小节标题')
    expect(skill).toContain('客户健康度')
    expect(skill).toContain('客户可以进入复盘会议的月报草案')
  })
```

Replace the official Soul AGENTS assertion with:

```ts
  it('keeps official Soul answers focused on deliverables instead of internal process narration', () => {
    for (const soul of expectedAppIds) {
      const agents = readFileSync(`souls/${soul}/engine/workspace/AGENTS.md`, 'utf8')

      expect(agents).toContain('不要把内部过程写给用户')
      expect(agents).toContain('直接给结论、交付物、必要假设和下一步')
      expect(agents).toContain('不要用“我会先读取 / 我先检查 / 我将调用”')
    }
  })
```

Replace the official Soul skill assertion loop with:

```ts
  it('keeps official Soul skills from starting user answers with tool-use narration', () => {
    for (const soul of OFFICIAL_SAMPLING_SOULS) {
      for (const skill of soul.skills) {
        const skillText = readFileSync(skill.sourcePath, 'utf8')

        expect(skillText).toContain('回答从结果开始')
        expect(skillText).toContain('不要以“使用 `')
        expect(skillText).toContain('不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”')
      }
    }
  })
```

- [ ] **Step 4: Run the affected focused tests**

Run:

```bash
bun test tests/architecture/freeform-soul-contract.test.ts packages/worker-runtime/src/soul-app/registry.test.ts scripts/e2e-soul-sampling.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the test independence changes**

Run:

```bash
git add tests/architecture/freeform-soul-contract.test.ts packages/worker-runtime/src/soul-app/registry.test.ts scripts/e2e-soul-sampling.test.ts
git commit -m "test(soul): 移除 tracked dist 测试依赖"
```

Expected: commit succeeds.

---

### Task 5: Untrack Generated Soul Dist

**Files:**
- Untrack: `souls/aiworker-freeform/dist/**`
- Untrack: `souls/google-ads/dist/**`
- Untrack: `souls/hr-manager/dist/**`
- Untrack: `souls/product-manager/dist/**`
- Untrack: `souls/software-support/dist/**`
- Modify: `tests/architecture/freeform-soul-contract.test.ts`

- [ ] **Step 1: Add the Git-tracking contract test**

Add this test near the end of `tests/architecture/freeform-soul-contract.test.ts`:

```ts
  test('Soul dist output is generated locally and not tracked by Git', () => {
    const tracked = Bun.spawnSync(['git', 'ls-files', 'souls/**/dist/**'], {
      cwd: repoRoot,
      stderr: 'pipe',
      stdout: 'pipe',
    })

    expect(tracked.exitCode).toBe(0)
    expect(tracked.stdout.toString().trim()).toBe('')
  })
```

- [ ] **Step 2: Run the contract test and verify it fails before untracking**

Run:

```bash
bun test tests/architecture/freeform-soul-contract.test.ts --test-name-pattern "not tracked by Git"
```

Expected: FAIL because Git still tracks `souls/**/dist/**`.

- [ ] **Step 3: Remove generated dist from the Git index only**

Run:

```bash
git rm --cached -r souls/aiworker-freeform/dist souls/google-ads/dist souls/hr-manager/dist souls/product-manager/dist souls/software-support/dist
```

Expected: staged deletions for generated dist files. Local files remain on disk because `--cached` only changes the index.

- [ ] **Step 4: Verify Git no longer tracks Soul dist**

Run:

```bash
git ls-files 'souls/**/dist/**'
```

Expected: no output.

- [ ] **Step 5: Verify generated dist is ignored**

Run:

```bash
git check-ignore -v --no-index souls/aiworker-freeform/dist/soul.descriptor.json
```

Expected: output includes `.gitignore:2:dist/`.

- [ ] **Step 6: Re-run the Git-tracking contract**

Run:

```bash
bun test tests/architecture/freeform-soul-contract.test.ts --test-name-pattern "not tracked by Git"
```

Expected: PASS.

- [ ] **Step 7: Commit the untracking migration**

Run:

```bash
git add tests/architecture/freeform-soul-contract.test.ts
git add -u souls/aiworker-freeform/dist souls/google-ads/dist souls/hr-manager/dist souls/product-manager/dist souls/software-support/dist
git commit -m "chore(soul): 停止跟踪生成的 dist"
```

Expected: commit succeeds.

---

### Task 6: Prove Build And Release Outputs Still Contain Official Souls

**Files:**
- Verify generated output only; no planned source edits.

- [ ] **Step 1: Build all official Souls**

Run:

```bash
bun run build:official-souls
```

Expected: PASS and all five `souls/<id>/dist/soul.descriptor.json` files exist locally but remain ignored by Git.

- [ ] **Step 2: Run focused unit and contract tests**

Run:

```bash
bun test scripts/official-soul-dist.test.ts apps/worker-cli/scripts/build-publish-manifest.test.ts scripts/e2e-soul-sampling.test.ts
bun test packages/worker-runtime/src/soul-app/registry.test.ts
bun run test:contracts
```

Expected: all commands pass.

- [ ] **Step 3: Run CLI package tests that depend on Freeform install**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test
```

Expected: PASS. The package test script builds Freeform before running Bun tests.

- [ ] **Step 4: Build the release dist**

Run:

```bash
bun run build
```

Expected: PASS and `apps/worker-cli/dist/official-apps` contains all five official Soul dist trees.

- [ ] **Step 5: Verify packaged official app resources**

Run:

```bash
test -f apps/worker-cli/dist/official-apps/aiworker-freeform/dist/soul.descriptor.json
test -f apps/worker-cli/dist/official-apps/google-ads/dist/soul.descriptor.json
test -f apps/worker-cli/dist/official-apps/hr-manager/dist/soul.descriptor.json
test -f apps/worker-cli/dist/official-apps/product-manager/dist/soul.descriptor.json
test -f apps/worker-cli/dist/official-apps/software-support/dist/soul.descriptor.json
```

Expected: all commands exit 0.

- [ ] **Step 6: Run release smoke for dist CLI**

Run:

```bash
bun run smoke:dist-release
```

Expected: PASS, including official Freeform catalog/install proof from packaged `official-apps`.

- [ ] **Step 7: Run release packaging smoke**

Run:

```bash
bun run smoke:standalone-release
bun run smoke:npm-package
```

Expected: both commands pass or expose a concrete environment limitation. If an environment limitation occurs, capture the exact failing command and error text in the final report.

- [ ] **Step 8: Verify no generated dist files are staged as additions**

Run:

```bash
git status --short
git ls-files 'souls/**/dist/**'
```

Expected: `git ls-files` prints no output. `git status --short` must not show untracked `souls/<id>/dist/**` files because top-level `dist/` ignores them.

- [ ] **Step 9: Run final hygiene and code-review graph**

Run:

```bash
git diff --check
bun run docs:check
bun run test:contracts
bun run crg:review
```

Expected: all commands pass. `crg:review` reports no material risk or reports actionable findings that must be fixed before completion.

---

## Self-Review

- Spec coverage: Tasks 1-3 implement generated official Soul build and release-copy freshness; Task 4 removes tracked-dist assumptions from tests; Task 5 untracks generated output and adds a Git contract; Task 6 proves release bundles still contain official descriptor bundles.
- Source of truth: Git keeps `soul.config.ts` and `engine/**`; `souls/*/dist/**` becomes generated and ignored.
- User-visible behavior: Worker and CLI still consume `dist/soul.descriptor.json`; npm and standalone packages still ship `official-apps/<id>/dist/**`.
- Protocol boundary: No descriptor v1 shape change, no Host/Soul source read, no Soul UI or app-owned API work.
- Verification: focused tests, contract gates, build, release smoke, Git tracking check, and `crg:review` are included.
