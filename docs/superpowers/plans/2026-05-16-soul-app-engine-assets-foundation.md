# Soul App Engine Assets Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of Soul App authoring layout v2 by making workspace files and native skills app-owned `engine-assets` projected by shared runtime code.

**Architecture:** Add `engineAssets` and projection receipt types in `packages/shared`, expose them through the SDK, and replace the one-off native skill projection with a core engine-asset projection service. HR becomes the first official app using `engine-assets/workspace` and `engine-assets/skills`; `packages/soul-app-runtime` uses the same projection path so standalone and mounted tests match Host runtime behavior.

**Tech Stack:** TypeScript, Bun test runner, Zod manifest schemas, AIWorker local runtime, Soul App SDK/runtime, file-backed Markdown templates.

---

## File Structure

- Create: `packages/core/src/worker/engine-assets.ts`
  - Owns static file discovery, template substitution, workspace file projection,
    native skill fan-out, `.aiworker/projections.json`, and safe overwrite
    checks.
- Modify: `packages/core/src/worker/native-skills.ts`
  - Delete after callers move to `engine-assets.ts`.
- Modify: `packages/core/src/worker/profile-ledger.ts`
  - Keep profile ledger directories, git bootstrap and review promotion.
  - Remove hardcoded `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore` and
    `evidence/README.md` source content from this file once engine assets own
    those files.
- Modify: `packages/core/src/worker/runtime.ts`
  - Replace `nativeSkillSource` with `engineAssetSource`.
  - Project engine assets during workspace creation and repair.
- Modify: `packages/core/src/worker/runtime.test.ts`
  - Convert existing native skill tests to v2 engine asset tests.
- Modify: `packages/shared/src/soul-app/manifest.ts`
  - Add engine target, engine assets and projection receipt schemas.
  - Add `engineAssets` to `soulAppManifestSchema`.
- Modify: `packages/shared/src/soul-app/index.ts`
  - Export new schemas and types.
- Modify: `packages/shared/src/soul-app/fixtures.ts`
  - Add `engineAssets` to HR and QA reference manifests.
- Modify: `packages/shared/src/soul-app/manifest.test.ts`
  - Add schema validation coverage for engine assets.
- Modify: `packages/soul-app-sdk/src/index.ts`
  - Re-export engine asset types and add a small helper for typed declarations.
- Modify: `packages/soul-app-sdk/src/index.test.ts`
  - Cover the helper if needed by type/runtime tests.
- Modify: `packages/soul-app-runtime/src/index.ts`
  - Accept `appSourceRoot` and pass `engineAssetSource` into core runtime.
- Modify: `packages/soul-app-runtime/src/index.test.ts`
  - Create a file-backed demo app source root and assert projection parity.
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
  - Add `engineAssets` section.
- Modify: `apps/aiworker-hr/skills/**`
  - Move to `apps/aiworker-hr/engine-assets/skills/**`.
- Create: `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`
- Create: `apps/aiworker-hr/engine-assets/workspace/CLAUDE.md`
- Create: `apps/aiworker-hr/engine-assets/workspace/README.md`
- Create: `apps/aiworker-hr/engine-assets/workspace/.gitignore`
- Create: `apps/aiworker-hr/engine-assets/workspace/evidence/README.md`
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Create: `apps/aiworker-qa/engine-assets/workspace/AGENTS.md`
- Create: `apps/aiworker-qa/engine-assets/workspace/CLAUDE.md`
- Create: `apps/aiworker-qa/engine-assets/workspace/README.md`
- Create: `apps/aiworker-qa/engine-assets/workspace/.gitignore`
- Create: `apps/aiworker-qa/engine-assets/workspace/evidence/README.md`
- Modify: `docs/task/FEAT-088.md`, `docs/plan/PLAN-331.md`,
  `docs/changelog.md`
  - Keep PMA status and verification in sync.

## Task 1: Shared Manifest And Projection Schema

**Files:**
- Modify: `packages/shared/src/soul-app/manifest.ts`
- Modify: `packages/shared/src/soul-app/index.ts`
- Modify: `packages/shared/src/soul-app/fixtures.ts`
- Modify: `packages/shared/src/soul-app/manifest.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Add these assertions to `packages/shared/src/soul-app/manifest.test.ts`:

```ts
it('requires official reference manifests to declare engine assets', () => {
  expect(hrSoulAppManifest.engineAssets.workspace.source).toBe('./engine-assets/workspace')
  expect(hrSoulAppManifest.engineAssets.skills).toEqual({
    source: './engine-assets/skills',
    targets: ['codex', 'claude-code'],
  })
  expect(qaSoulAppManifest.engineAssets.workspace.source).toBe('./engine-assets/workspace')
  expect(qaSoulAppManifest.engineAssets.skills?.targets).toEqual(['codex', 'claude-code'])
})

it('rejects engine asset paths that escape the app root', () => {
  const manifest = cloneManifest(hrSoulAppManifest) as SoulAppManifest & { engineAssets?: unknown }
  manifest.engineAssets = {
    workspace: { source: '../outside' },
    skills: { source: './engine-assets/skills', targets: ['codex'] },
  }

  const result = validateSoulAppManifest(manifest, {
    availableConnectorIds: ['ats', 'calendar'],
    hostVersion: '0.12.1',
  })

  expect(result.status).toBe('invalid')
  expect(result.issues).toContainEqual(expect.objectContaining({
    code: 'unsafe_engine_asset_source',
    path: 'engineAssets.workspace.source',
  }))
})
```

- [ ] **Step 2: Run the shared manifest test and verify RED**

Run:

```bash
bun test packages/shared/src/soul-app/manifest.test.ts
```

Expected: FAIL because `engineAssets` does not exist on `SoulAppManifest`.

- [ ] **Step 3: Add shared schemas**

In `packages/shared/src/soul-app/manifest.ts`, add these schemas near the other
manifest section schemas:

```ts
export const soulAppEngineTargetSchema = zod.enum(['codex', 'claude-code'])
export type SoulAppEngineTarget = z.infer<typeof soulAppEngineTargetSchema>

export const soulAppEngineAssetSourceSchema = zod.string().min(1)
export type SoulAppEngineAssetSource = z.infer<typeof soulAppEngineAssetSourceSchema>

export const soulAppWorkspaceEngineAssetsSchema = zod.object({
  source: soulAppEngineAssetSourceSchema,
})
export type SoulAppWorkspaceEngineAssets = z.infer<typeof soulAppWorkspaceEngineAssetsSchema>

export const soulAppSkillEngineAssetsSchema = zod.object({
  source: soulAppEngineAssetSourceSchema,
  targets: zod.array(soulAppEngineTargetSchema).min(1).readonly(),
})
export type SoulAppSkillEngineAssets = z.infer<typeof soulAppSkillEngineAssetsSchema>

export const soulAppMcpClientEngineAssetsSchema = zod.object({
  source: soulAppEngineAssetSourceSchema,
  target: soulAppEngineTargetSchema,
})
export type SoulAppMcpClientEngineAssets = z.infer<typeof soulAppMcpClientEngineAssetsSchema>

export const soulAppMcpServerTransportSchema = zod.enum(['stdio', 'http'])
export type SoulAppMcpServerTransport = z.infer<typeof soulAppMcpServerTransportSchema>

export const soulAppMcpServerEngineAssetsSchema = zod.object({
  id: soulAppIdSchema,
  package: zod.string().min(1),
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
  transport: soulAppMcpServerTransportSchema,
})
export type SoulAppMcpServerEngineAssets = z.infer<typeof soulAppMcpServerEngineAssetsSchema>

export const soulAppEngineAssetsSchema = zod.object({
  mcpClients: zod.array(soulAppMcpClientEngineAssetsSchema).readonly().optional(),
  mcpServers: zod.array(soulAppMcpServerEngineAssetsSchema).readonly().optional(),
  skills: soulAppSkillEngineAssetsSchema.optional(),
  workspace: soulAppWorkspaceEngineAssetsSchema,
})
export type SoulAppEngineAssets = z.infer<typeof soulAppEngineAssetsSchema>

export const soulAppProjectionKindSchema = zod.enum(['workspace-file', 'native-skill', 'mcp-client'])
export type SoulAppProjectionKind = z.infer<typeof soulAppProjectionKindSchema>

export const soulAppProjectionReceiptEntrySchema = zod.object({
  appId: soulAppIdSchema,
  engineTarget: soulAppEngineTargetSchema.optional(),
  generatedAt: zod.string().min(1),
  kind: soulAppProjectionKindSchema,
  sha256: zod.string().regex(/^[a-f0-9]{64}$/),
  source: zod.string().min(1),
  target: zod.string().min(1),
})
export type SoulAppProjectionReceiptEntry = z.infer<typeof soulAppProjectionReceiptEntrySchema>

export const soulAppProjectionReceiptSchema = zod.object({
  appId: soulAppIdSchema,
  generatedAt: zod.string().min(1),
  projections: zod.array(soulAppProjectionReceiptEntrySchema).readonly(),
  version: zod.literal(1),
})
export type SoulAppProjectionReceipt = z.infer<typeof soulAppProjectionReceiptSchema>
```

- [ ] **Step 4: Add `engineAssets` to the manifest schema**

In `soulAppManifestSchema`, add:

```ts
engineAssets: soulAppEngineAssetsSchema,
```

In `validateSoulAppManifest`, add explicit issues for unsafe source paths so the
test can assert stable issue codes. Keep path safety here, not in zod `refine`,
otherwise malformed sources would be converted to generic zod issues before
`unsafe_engine_asset_source` can be reported.

```ts
for (const [path, source] of [
  ['engineAssets.workspace.source', manifest.engineAssets.workspace.source],
  ...(manifest.engineAssets.skills ? [['engineAssets.skills.source', manifest.engineAssets.skills.source] as const] : []),
  ...(manifest.engineAssets.mcpClients ?? []).map((client, index) => [`engineAssets.mcpClients.${index}.source`, client.source] as const),
]) {
  if (!source.startsWith('./') || source.includes('..')) {
    issues.push({
      code: 'unsafe_engine_asset_source',
      message: 'engine asset source must be a relative app-local path.',
      path,
      severity: 'error',
    })
  }
}
```

Also add `unsafe_engine_asset_source` to `soulAppManifestIssueCodeSchema`.

- [ ] **Step 5: Export new schemas and types**

In `packages/shared/src/soul-app/index.ts`, export every new schema and type from
Step 3.

- [ ] **Step 6: Update fixtures**

In `packages/shared/src/soul-app/fixtures.ts`, add this to both HR and QA fixture
objects:

```ts
engineAssets: {
  skills: {
    source: './engine-assets/skills',
    targets: ['codex', 'claude-code'],
  },
  workspace: {
    source: './engine-assets/workspace',
  },
},
```

- [ ] **Step 7: Run shared tests and typecheck**

Run:

```bash
bun test packages/shared/src/soul-app/manifest.test.ts
bun run --filter '@zonease/aiworker-shared' typecheck
```

Expected: both pass.

- [ ] **Step 8: Stage self-review**

Check:

```bash
rg -n "engineAssets|unsafe_engine_asset_source|ProjectionReceipt" packages/shared/src/soul-app
```

Expected: schema, exports, fixtures and tests all reference the new contract.

## Task 2: SDK Authoring Exports

**Files:**
- Modify: `packages/soul-app-sdk/src/index.ts`
- Modify: `packages/soul-app-sdk/src/index.test.ts`

- [ ] **Step 1: Write SDK helper test**

Add this test to `packages/soul-app-sdk/src/index.test.ts`:

```ts
import { defineSoulAppEngineAssets } from './index'

it('defines engine asset declarations without runtime side effects', () => {
  const assets = defineSoulAppEngineAssets({
    skills: {
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  })

  expect(assets.workspace.source).toBe('./engine-assets/workspace')
  expect(assets.skills?.targets).toEqual(['codex', 'claude-code'])
})
```

- [ ] **Step 2: Run SDK test and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test
```

Expected: FAIL because `defineSoulAppEngineAssets` is not exported.

- [ ] **Step 3: Implement SDK helper and exports**

In `packages/soul-app-sdk/src/index.ts`, import and re-export the shared type:

```ts
import type {
  SoulAppEngineAssets,
  SoulAppManifest,
  SoulAppManifestValidationOptions,
  SoulAppProtocolHandlers,
} from '@zonease/aiworker-shared'
```

Add to the existing type export block:

```ts
SoulAppEngineAssets,
SoulAppEngineTarget,
SoulAppMcpClientEngineAssets,
SoulAppMcpServerEngineAssets,
SoulAppProjectionReceipt,
SoulAppProjectionReceiptEntry,
SoulAppSkillEngineAssets,
SoulAppWorkspaceEngineAssets,
```

Add the helper:

```ts
export function defineSoulAppEngineAssets(input: SoulAppEngineAssets): SoulAppEngineAssets {
  return input
}
```

- [ ] **Step 4: Run SDK tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test
bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck
```

Expected: both pass.

## Task 3: Core Engine Asset Projection Service

**Files:**
- Create: `packages/core/src/worker/engine-assets.ts`
- Modify: `packages/core/src/worker/native-skills.ts`
- Modify: `packages/core/src/worker/profile-ledger.ts`
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: Write failing runtime projection test**

In `packages/core/src/worker/runtime.test.ts`, replace the setup in
`bootstraps profile workspace ledger and projects app-owned native skills`. First
rename `runtimeWithNativeSkills` to `runtimeWithEngineAssets`, and change its
runtime option to:

```ts
engineAssetSource: {
  appId: 'aiworker-hr',
  sourceRoot,
},
```

Then replace the old `skills/*` fixture setup so it creates v2 source files:

```ts
await mkdir(join(appRoot, 'engine-assets', 'workspace', 'evidence'), { recursive: true })
await writeFile(join(appRoot, 'engine-assets', 'workspace', 'AGENTS.md'), [
  '# {{workerName}} Workspace Instructions',
  '',
  '- Soul id: {{soulId}}',
  '- Workspace profile: {{workspaceName}}',
  '- When a session is started from a Soul App action, treat that action as an explicit skill selection.',
  '- Do not silently switch to another skill.',
  '',
].join('\n'))
await writeFile(join(appRoot, 'engine-assets', 'workspace', 'CLAUDE.md'), '@AGENTS.md\n')
await writeFile(join(appRoot, 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n\nNo approved profile revision yet.\n')
await writeFile(join(appRoot, 'engine-assets', 'workspace', '.gitignore'), [
  'AGENTS.md',
  'CLAUDE.md',
  '.aiworker/sessions/',
  '.aiworker/projections.json',
  '.agents/skills/aiworker-*',
  '.claude/skills/aiworker-*',
  'evidence/raw/',
  '',
].join('\n'))
await writeFile(join(appRoot, 'engine-assets', 'workspace', 'evidence', 'README.md'), '# Evidence\n')
await mkdir(join(appRoot, 'engine-assets', 'skills', 'candidate-profile'), { recursive: true })
await writeFile(join(appRoot, 'engine-assets', 'skills', 'candidate-profile', 'SKILL.md'), [
  '---',
  'name: candidate-profile',
  'description: Maintain a source-backed candidate profile.',
  '---',
  '',
  '# Candidate Profile',
  '',
].join('\n'))
```

Update assertions to read `.aiworker/projections.json` instead of
`.aiworker/native-skill-projections.json`:

```ts
const receipt = JSON.parse(await readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')) as {
  appId: string
  projections: Array<{ kind: string, source: string, target: string, sha256: string }>
}
expect(receipt.appId).toBe('aiworker-hr')
expect(receipt.projections).toEqual(expect.arrayContaining([
  expect.objectContaining({ kind: 'workspace-file', source: 'engine-assets/workspace/AGENTS.md', target: 'AGENTS.md' }),
  expect.objectContaining({ kind: 'native-skill', source: 'engine-assets/skills/candidate-profile/SKILL.md', target: '.agents/skills/aiworker-hr-candidate-profile/SKILL.md' }),
  expect.objectContaining({ kind: 'native-skill', source: 'engine-assets/skills/candidate-profile/SKILL.md', target: '.claude/skills/aiworker-hr-candidate-profile/SKILL.md' }),
]))
expect(receipt.projections.every(item => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true)
```

- [ ] **Step 2: Run runtime test and verify RED**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
```

Expected: FAIL because core still looks for `skills/*/SKILL.md` and writes the
old native skill manifest.

- [ ] **Step 3: Implement `engine-assets.ts`**

Create `packages/core/src/worker/engine-assets.ts` with focused exports:

```ts
import type { SoulAppProjectionReceipt, SoulAppProjectionReceiptEntry } from '@zonease/aiworker-shared'

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const PROJECTION_RECEIPT = path.posix.join('.aiworker', 'projections.json')

export interface EngineAssetSource {
  appId: string
  sourceRoot: string
}

export interface EngineAssetProjectionInput {
  appId: string
  now: string
  sourceRoot: string
  variables: Record<string, string>
  workspaceRoot: string
}

export async function projectEngineAssetsToWorkspace(input: EngineAssetProjectionInput): Promise<SoulAppProjectionReceipt> {
  const sourceRoot = path.resolve(input.sourceRoot)
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const generatedAt = input.now
  const projections: SoulAppProjectionReceiptEntry[] = []

  await mkdir(path.join(workspaceRoot, '.aiworker'), { recursive: true })
  projections.push(...await projectWorkspaceFiles({ ...input, generatedAt, sourceRoot, workspaceRoot }))
  projections.push(...await projectNativeSkills({ ...input, generatedAt, sourceRoot, workspaceRoot }))

  const receipt: SoulAppProjectionReceipt = {
    appId: input.appId,
    generatedAt,
    projections,
    version: 1,
  }
  await writeFile(path.join(workspaceRoot, ...PROJECTION_RECEIPT.split('/')), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return receipt
}

export function engineAssetProjectionReceiptPath(): string {
  return PROJECTION_RECEIPT
}
```

In the same file, add helpers:

```ts
async function projectWorkspaceFiles(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  const root = path.join(input.sourceRoot, 'engine-assets', 'workspace')
  const files = await listFiles(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    const source = path.posix.join('engine-assets', 'workspace', relative)
    const content = renderTemplate(await readFile(file, 'utf8'), input.variables)
    await writeProjectedFile(input.workspaceRoot, relative, content)
    entries.push(receiptEntry(input, 'workspace-file', source, relative, content))
  }
  return entries
}

async function projectNativeSkills(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  const root = path.join(input.sourceRoot, 'engine-assets', 'skills')
  const skillDirs = await readdirOrEmpty(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  for (const dirent of skillDirs) {
    if (!dirent.isDirectory() || !SKILL_ID_RE.test(dirent.name))
      continue
    const file = path.join(root, dirent.name, 'SKILL.md')
    if (!await isFile(file))
      continue
    const content = await readFile(file, 'utf8')
    const projectionId = `${input.appId}-${dirent.name}`
    const targets = [
      { engineTarget: 'codex' as const, path: path.posix.join('.agents', 'skills', projectionId, 'SKILL.md') },
      { engineTarget: 'claude-code' as const, path: path.posix.join('.claude', 'skills', projectionId, 'SKILL.md') },
    ]
    for (const target of targets) {
      await writeProjectedFile(input.workspaceRoot, target.path, content)
      entries.push(receiptEntry(input, 'native-skill', path.posix.join('engine-assets', 'skills', dirent.name, 'SKILL.md'), target.path, content, target.engineTarget))
    }
  }
  return entries
}
```

Add small helpers in the same file:

```ts
function receiptEntry(
  input: { appId: string, generatedAt: string },
  kind: SoulAppProjectionReceiptEntry['kind'],
  source: string,
  target: string,
  content: string,
  engineTarget?: SoulAppProjectionReceiptEntry['engineTarget'],
): SoulAppProjectionReceiptEntry {
  return {
    appId: input.appId,
    generatedAt: input.generatedAt,
    kind,
    sha256: createHash('sha256').update(content).digest('hex'),
    source,
    target,
    ...(engineTarget ? { engineTarget } : {}),
  }
}

function renderTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_, key: string) => variables[key] ?? '')
}

async function writeProjectedFile(root: string, relativePath: string, content: string): Promise<void> {
  const targetPath = path.join(root, ...relativePath.split('/'))
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content, 'utf8')
}
```

Add `listFiles`, `readdirOrEmpty`, `isFile`, and `isNoEntryError` helpers by
adapting the existing helpers from `native-skills.ts`.

- [ ] **Step 4: Update runtime types and calls**

In `packages/core/src/worker/runtime.ts`:

```ts
import type { EngineAssetSource } from './engine-assets'
import { engineAssetProjectionReceiptPath, projectEngineAssetsToWorkspace } from './engine-assets'
```

Replace `nativeSkillSource?: NativeSkillSource | null` with:

```ts
engineAssetSource?: EngineAssetSource | null
```

Replace `nativeSkills` layout result with:

```ts
engineAssets: SoulAppProjectionReceipt | null
```

Inside `prepareWorkspaceLayout`, project engine assets before bootstrapping the
profile ledger when `engineAssetSource` exists, so app-owned `README.md`,
`.gitignore` and `evidence/README.md` are present before the initial git commit:

```ts
  const engineAssets = this.#engineAssetSource
  ? await projectEngineAssetsToWorkspace({
      appId: this.#engineAssetSource.appId,
      now: this.#now(),
      sourceRoot: this.#engineAssetSource.sourceRoot,
      variables: {
        appId: this.#engineAssetSource.appId,
        soulId: this.#workerInput.soulId,
        workerName: this.#workerInput.name,
        workspaceName: input.name,
      },
      workspaceRoot: input.rootPath,
    })
  : null
```

Store metadata with:

```ts
engineAssetProjection: engineAssets
  ? {
      projectionCount: engineAssets.projections.length,
      projectionManifestPath: engineAssetProjectionReceiptPath(),
    }
  : null,
```

- [ ] **Step 5: Keep profile ledger focused**

In `packages/core/src/worker/profile-ledger.ts`, remove `renderAgentsFile`,
`renderInitialProfileReadme`, `renderEvidenceReadme` and the writes for
`AGENTS.md`, `CLAUDE.md`, `README.md`, `evidence/README.md`, `.gitignore` from
the app-owned path. Add an optional `seedProfileFiles?: boolean` input to
`bootstrapProfileWorkspace`; pass `false` from `LocalWorkerRuntime` when
`engineAssetSource` is present, and keep the existing minimal fallback content
only when `seedProfileFiles` is not `false`.

Keep directory creation and git bootstrap. For generic runtimes without
`engineAssetSource`, keep a minimal fallback path so existing non-app tests can
still create a usable workspace.

In `prepareWorkspaceLayout`, pass the seed switch explicitly:

```ts
const profile = await bootstrapProfileWorkspace({
  name: input.name,
  now: this.#now(),
  rootPath: input.rootPath,
  seedProfileFiles: !this.#engineAssetSource,
  soulId: this.#workerInput.soulId,
  workerName: this.#workerInput.name,
})
```

- [ ] **Step 6: Remove old native-skill module usage**

Delete `packages/core/src/worker/native-skills.ts` after no imports remain.

Run:

```bash
rg -n "nativeSkill|native-skill-projections|projectNativeSkills" packages/core/src
```

Expected: no production references remain, except historical docs/tests that are
updated in later steps.

- [ ] **Step 7: Run focused core test**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-core' typecheck
```

Expected: both pass.

- [ ] **Step 8: Stage self-review**

Check:

```bash
rg -n "renderAgentsFile|native-skill-projections|\\.aiworker/projections.json|engineAsset" packages/core/src/worker
```

Expected: no hardcoded AGENTS renderer remains; projection receipt path is the
new runtime metadata path.

## Task 4: HR App Engine Assets Migration

**Files:**
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
- Create: `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`
- Create: `apps/aiworker-hr/engine-assets/workspace/CLAUDE.md`
- Create: `apps/aiworker-hr/engine-assets/workspace/README.md`
- Create: `apps/aiworker-hr/engine-assets/workspace/.gitignore`
- Create: `apps/aiworker-hr/engine-assets/workspace/evidence/README.md`
- Move: `apps/aiworker-hr/skills/*` to `apps/aiworker-hr/engine-assets/skills/*`
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Create: `apps/aiworker-qa/engine-assets/workspace/*`

- [ ] **Step 1: Create official app workspace source files**

Create `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`:

```md
# {{workerName}} Workspace Instructions

This workspace belongs to an AIWorker Soul App profile ledger.

## Workspace Identity

- Soul worker: {{workerName}}
- Soul id: {{soulId}}
- Workspace profile: {{workspaceName}}

## Accepted State

- README.md is the accepted profile state for this workspace.
- Do not directly update `README.md` during an agent session.
- If a result should change the accepted profile, write a reviewable artifact and request human review.
- Human review plus Soul App policy is the only path that may promote an artifact into `README.md`.

## Action and Skill Binding

- When a session is started from a Soul App action, treat that action as an explicit skill selection.
- Follow the selected skill purpose, expected inputs, output shape, and review boundary.
- Do not silently switch to another skill.
- If the request appears to require a different skill, explain the mismatch and ask the user to confirm whether to continue, switch, or start a new action.
- When no action or skill is explicitly selected, choose the most relevant available Soul skill when useful.
- If no skill fits, continue as a general Soul workspace session and keep outputs within the same artifact and review rules.

## Session Output

- Write durable session outputs under `artifacts/<sessionId>/`.
- Keep facts, assumptions, evidence gaps, risks, review notes, and next actions separated.
- Text-only clarification is allowed; do not create a fake artifact just to satisfy the protocol.
- Available native skills may be empty. When skills exist, use `.agents/skills/` or `.claude/skills/` according to the active engine.

## Review Boundary

- Agent output is a proposal until a human review accepts it.
- Sensitive facts, hiring or employment decisions, and memory candidates require explicit review.
- Do not store secrets, connector credentials, bearer tokens, or raw sensitive evidence in `README.md`, artifacts, reviews, logs, prompts, or skill files.
```

Create `CLAUDE.md`:

```md
@AGENTS.md
```

Create `README.md`:

```md
# {{workspaceName}}

> Canonical accepted profile for this Soul workspace. Session outputs remain proposals until review.

## Current Profile Summary

No approved profile revision yet.

## Evidence And Review

- Proposed changes live in `artifacts/`.
- Human review records live in `reviews/`.
- Evidence descriptors live in `evidence/descriptors/`.

## Revision Notes

Approve a profile revision to update this README.
```

Create `.gitignore`:

```gitignore
AGENTS.md
CLAUDE.md
.aiworker/sessions/
.aiworker/projections.json
.agents/skills/aiworker-*
.claude/skills/aiworker-*
evidence/raw/
```

Create `evidence/README.md`:

```md
# Evidence

Store source descriptors in `descriptors/`. Keep raw sensitive evidence in `raw/`, which is ignored by the profile git ledger by default.
```

Create the same five workspace files for `apps/aiworker-qa/engine-assets/workspace`,
with QA/release evidence wording. QA may declare an empty
`engine-assets/skills` source in this phase; the projection service must keep a
Soul App without native skills valid.

- [ ] **Step 2: Move HR skills**

Run:

```bash
mkdir -p apps/aiworker-hr/engine-assets
mv apps/aiworker-hr/skills apps/aiworker-hr/engine-assets/skills
```

Expected: the five HR `SKILL.md` files now live under
`apps/aiworker-hr/engine-assets/skills`.

- [ ] **Step 3: Add manifest sections**

In `apps/aiworker-hr/soul-app.manifest.json`, add:

```json
"engineAssets": {
  "skills": {
    "source": "./engine-assets/skills",
    "targets": [
      "codex",
      "claude-code"
    ]
  },
  "workspace": {
    "source": "./engine-assets/workspace"
  }
},
```

Add it near `exports` or after `description`, matching the sorted style used by
the manifest file.

Add the same `engineAssets` section to
`apps/aiworker-qa/soul-app.manifest.json`.

- [ ] **Step 4: Run HR path checks**

Run:

```bash
test ! -d apps/aiworker-hr/skills
test -f apps/aiworker-hr/engine-assets/skills/candidate-profile/SKILL.md
test -f apps/aiworker-hr/engine-assets/workspace/AGENTS.md
```

Expected: all commands exit 0.

## Task 5: Soul App Runtime Parity

**Files:**
- Modify: `packages/soul-app-runtime/src/index.ts`
- Modify: `packages/soul-app-runtime/src/index.test.ts`

- [ ] **Step 1: Write failing runtime parity test**

In `packages/soul-app-runtime/src/index.test.ts`, update the `fs/promises`
import and create a helper:

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
```

```ts
async function writeDemoEngineAssets(appRoot: string): Promise<void> {
  await mkdir(path.join(appRoot, 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(appRoot, 'engine-assets', 'skills', 'demo-report'), { recursive: true })
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# {{workerName}}\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'CLAUDE.md'), '@AGENTS.md\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', '.gitignore'), '.aiworker/projections.json\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'skills', 'demo-report', 'SKILL.md'), '# Demo Report Skill\n')
}
```

Add assertions to the standalone test:

```ts
const appRoot = path.join(root, 'app')
await writeDemoEngineAssets(appRoot)
const standalone = await createStandaloneSoulAppRuntime(app, {
  appHome: root,
  appSourceRoot: appRoot,
  executor,
  hostVersion: '0.12.1',
  now,
  workerId: 'demo-worker',
  workerName: 'Demo Worker',
})
```

After workspace creation:

```ts
await expect(readFile(path.join(workspace.rootPath, 'README.md'), 'utf8')).resolves.toContain('# Standalone workspace')
await expect(readFile(path.join(workspace.rootPath, '.agents', 'skills', 'demo-soul-app-demo-report', 'SKILL.md'), 'utf8')).resolves.toContain('Demo Report Skill')
await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('workspace-file')
```

- [ ] **Step 2: Run runtime test and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-runtime' test
```

Expected: FAIL because runtime options do not accept or pass `appSourceRoot`.

- [ ] **Step 3: Add runtime option**

In `packages/soul-app-runtime/src/index.ts`, add to both runtime option
interfaces:

```ts
appSourceRoot?: string
```

Pass it through `createRuntimeForApp` and into core runtime:

```ts
engineAssetSource: input.appSourceRoot
  ? {
      appId: input.app.manifest.id,
      sourceRoot: input.appSourceRoot,
    }
  : null,
```

- [ ] **Step 4: Run runtime tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-runtime' test
bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck
```

Expected: both pass.

## Task 6: Host Runtime Registry Wiring

**Files:**
- Modify: `packages/core/src/host/runtime.ts`

- [ ] **Step 1: Update source selection**

Replace `nativeSkillSourceForWorker` with `engineAssetSourceForWorker`:

```ts
private engineAssetSourceForWorker(worker: WorkerRow): LocalWorkerRuntimeOptions['engineAssetSource'] {
  const app = getHostedSoulApp(worker.soulId)
  if (!app || app.status !== 'enabled' || app.sourceKind !== 'manifest-path')
    return null
  return {
    appId: app.appId,
    sourceRoot: path.dirname(app.sourceRef),
  }
}
```

Use it in `createRuntimeForWorker`:

```ts
engineAssetSource: this.engineAssetSourceForWorker(worker),
```

- [ ] **Step 2: Run core host/runtime tests**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-core' typecheck
```

Expected: both pass.

## Task 7: Validation, Docs, And PMA Closeout

**Files:**
- Modify: `docs/task/FEAT-088.md`
- Modify: `docs/plan/PLAN-331.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
bun test packages/shared/src/soul-app/manifest.test.ts
bun run --filter '@zonease/aiworker-shared' typecheck
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-core' typecheck
bun run --filter '@zonease/aiworker-soul-app-runtime' test
bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck
bun run --filter '@zonease/aiworker-soul-app-sdk' test
bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck
bun run lint
git diff --check
```

Expected: all exit 0.

- [ ] **Step 2: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: review completes. Record any residual test gaps in the final response
or fix them before closeout if they indicate real risk.

- [ ] **Step 3: Update PMA docs**

In `docs/task/FEAT-088.md` and `docs/plan/PLAN-331.md`, set status to
`completed` and add the exact verification commands run.

In `docs/changelog.md`, prepend:

```md
## 2026-05-16 [completed] FEAT-088 / PLAN-331 — Soul App Engine Assets Foundation

Implemented Phase 1 of Soul App authoring layout v2. HR workspace seed files
and native skills now originate from `engine-assets`, core/runtime write a
unified `.aiworker/projections.json` receipt, and shared schema, SDK exports and
soul-app-runtime understand the same engine asset contract.

Verification passed: ...
```

- [ ] **Step 4: Final self-review**

Run:

```bash
rg -n "apps/aiworker-hr/skills|native-skill-projections|renderAgentsFile|engineAssets|projections.json" apps packages docs/task/FEAT-088.md docs/plan/PLAN-331.md docs/changelog.md
git status --short
```

Expected:

- no active source points to `apps/aiworker-hr/skills`;
- no hardcoded AGENTS renderer remains;
- `native-skill-projections` appears only in historical docs/changelog or is
  fully removed from active source;
- working tree shows only intentional FEAT-088 changes.

## Execution Notes

- This plan intentionally absorbs the uncommitted FEAT-087 runtime changes rather
  than reverting them.
- Use TDD for schema, runtime projection and soul-app-runtime behavior.
- Commit at the end of the phase after all checks pass, unless the operator asks
  to inspect before commit.
