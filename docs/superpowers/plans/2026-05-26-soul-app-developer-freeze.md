# Soul App Developer Guide Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze `docs/soul-app-developer.md` into a short non-normative quickstart and thin the related Host/Soul route skills so active boundary guidance lives only in `docs/architecture.md#constraint-registry`.

**Architecture:** Treat `docs/architecture.md` as the single Host/Soul contract. Keep the Soul App guide as a link-stable frozen stub, keep skills as route helpers, and update `scripts/check-doc-contract.ts` so future docs checks enforce that posture instead of requiring duplicated contract text.

**Tech Stack:** Markdown active docs, local Superpowers skills, TypeScript doc-contract script run with Bun, git, code-review-graph.

---

## File Structure

- Modify `scripts/check-doc-contract.ts`: change active doc contract assertions so the frozen guide and thin skills are enforced.
- Modify `docs/soul-app-developer.md`: replace the current long guide with a frozen quickstart stub.
- Modify `.agents/skills/aiworker-soul-app-dev/SKILL.md`: make it a short Soul App route helper.
- Modify `.agents/skills/aiworker-host-dev/SKILL.md`: keep Host route and verification guidance while removing duplicated boundary exposition.
- Modify `AGENTS.md`: route Soul App authoring through architecture plus the Soul App skill; describe the guide as frozen quickstart only.
- Modify `README.md`: relabel the guide in the docs map and Developer Route table.
- Modify `README.zh-CN.md`: relabel the guide as frozen quickstart.
- Modify `docs/architecture.md`: remove `docs/soul-app-developer.md` as a normative thin reference, while keeping registry IDs authoritative.
- Do not modify `docs/superpowers/specs/2026-05-26-soul-app-developer-freeze-design.md`.
- Do not modify historical `docs/superpowers/`, `docs/task/`, `docs/plan/`, or `docs/changelog.md` entries except this implementation plan file.

## Task 1: Make Docs Contract Expect A Frozen Guide

**Files:**
- Modify: `scripts/check-doc-contract.ts`

- [ ] **Step 1: Replace the Soul App guide `requireIncludes` block**

In `scripts/check-doc-contract.ts`, replace the current `requireIncludes('docs/soul-app-developer.md', [...])` block with this exact block:

```ts
requireIncludes('docs/soul-app-developer.md', [
  '# Soul App Developer Quickstart (Frozen)',
  'This file is a frozen quickstart during product shaping.',
  'It is not an architecture contract.',
  'The only active Host/Soul App contract is `docs/architecture.md#constraint-registry`.',
  'Do not expand Host/Soul boundary, descriptor, MCP, provider, permission, review, memory, Worker Configuration or configuration semantics here.',
  'aiworker app create <app-id> --dir <target-dir>',
  'aiworker app validate <target-dir>',
  'aiworker app smoke <target-dir>',
  'soul-app.manifest.json',
  'engine-assets/',
  'product/',
  'host-adapter/',
])
```

- [ ] **Step 2: Replace the Host skill `requireIncludes` block**

In `scripts/check-doc-contract.ts`, replace the current `requireIncludes('.agents/skills/aiworker-host-dev/SKILL.md', [...])` block with this exact block:

```ts
requireIncludes('.agents/skills/aiworker-host-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  'This skill is a route helper, not a parallel architecture contract.',
  'Read these registry IDs in `docs/architecture.md` before Host changes:',
  '`ARCH-001`',
  '`HOST-001`',
  '`CONFIG-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
  '`UI-001`',
  '`DOC-001`',
  'Use `aiworker-soul-app-dev` when the change belongs to app-owned domain work.',
  'bun run docs:check',
  'bun run crg:update',
])
```

- [ ] **Step 3: Replace the Soul App skill `requireIncludes` block**

In `scripts/check-doc-contract.ts`, replace the current `requireIncludes('.agents/skills/aiworker-soul-app-dev/SKILL.md', [...])` block with this exact block:

```ts
requireIncludes('.agents/skills/aiworker-soul-app-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  'This skill is a route helper, not a parallel architecture contract.',
  'Read `docs/soul-app-developer.md` only as a frozen quickstart for commands and package shape.',
  '`ARCH-001`',
  '`SOUL-001`',
  '`CONFIG-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
  '`DOC-001`',
  'Use `aiworker-host-dev` when the change belongs to Host platform behavior.',
  'aiworker app validate <app-path>',
  'aiworker app smoke <app-path>',
])
```

- [ ] **Step 4: Run docs check and confirm it fails for the old guide**

Run:

```bash
bun run docs:check
```

Expected: FAIL. The failure should include missing frozen-guide text in `docs/soul-app-developer.md` and missing thin-route text in the two AIWorker skill files.

Do not commit this failing state.

## Task 2: Freeze `docs/soul-app-developer.md`

**Files:**
- Modify: `docs/soul-app-developer.md`

- [ ] **Step 1: Replace the entire guide with the frozen quickstart**

Replace the full contents of `docs/soul-app-developer.md` with:

````markdown
# Soul App Developer Quickstart (Frozen)

This file is a frozen quickstart during product shaping. It is not an
architecture contract and must not grow into a second Host/Soul App boundary
guide.

The only active Host/Soul App contract is
`docs/architecture.md#constraint-registry`. If this file conflicts with
`docs/architecture.md` or `AGENTS.md`, the architecture contract wins.

## Do Not Expand Here

Do not expand Host/Soul boundary, descriptor, MCP, provider, permission, review,
memory, Worker Configuration or configuration semantics here.

Put active boundary rules in `docs/architecture.md#constraint-registry`. Keep
historical exploration in `docs/task`, `docs/plan`, `docs/superpowers` or
`docs/changelog.md` as audit trail only.

## Current Authoring Loop

```bash
aiworker app create <app-id> --dir <target-dir>
aiworker app validate <target-dir>
aiworker app smoke <target-dir>
```

## Package Shape

```text
apps/<app-id>/
  soul-app.manifest.json
  engine-assets/
  product/
  host-adapter/
```

Use `.agents/skills/aiworker-soul-app-dev/SKILL.md` for route selection before
touching Soul App packages or public authoring files. Use
`.agents/skills/aiworker-host-dev/SKILL.md` when a change belongs to Host
platform behavior, daemon API, CLI lifecycle, Worker Web Shell, storage
metadata, Host runtime, app registry or Host/Soul protocol implementation.
````

- [ ] **Step 2: Run docs check and confirm remaining failures are only active references or skills**

Run:

```bash
bun run docs:check
```

Expected: FAIL if `AGENTS.md`, `README.md`, `README.zh-CN.md`, `docs/architecture.md`, `.agents/skills/aiworker-host-dev/SKILL.md`, or `.agents/skills/aiworker-soul-app-dev/SKILL.md` still contain old route language or fail the new skill assertions. The failure should no longer be about missing frozen-guide text inside `docs/soul-app-developer.md`.

## Task 3: Thin The Soul App Route Skill

**Files:**
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

- [ ] **Step 1: Replace the entire Soul App skill with the thin route helper**

Replace the full contents of `.agents/skills/aiworker-soul-app-dev/SKILL.md` with:

````markdown
---
name: aiworker-soul-app-dev
description: "Use when creating, modifying, or reviewing AIWorker Soul Apps under apps/aiworker-* or public Soul App authoring, manifest, SDK, standalone, Host mounted, app-owned artifact, review, profile, capability, scaffold, validate, or smoke surfaces."
argument-hint: "[app-path]"
arguments: [app_path]
---

# AIWorker Soul App Developer

This skill is a route helper, not a parallel architecture contract.

Use it before touching Soul App packages or public authoring surfaces. Always
start from `docs/architecture.md#constraint-registry`. Read
`docs/soul-app-developer.md` only as a frozen quickstart for commands and
package shape.

## Fit Check

Use this skill for:

- `apps/aiworker-*` production Soul App changes.
- `soul-app.manifest.json`, app-owned UI/API, standalone surfaces, Host mounted
  handlers, artifact/profile/review/capability files and app-owned engine
  assets.
- Public authoring surfaces: `packages/soul-app-sdk`,
  `packages/soul-app-runtime`, shared manifest/schema changes, app scaffold,
  `aiworker app validate` and `aiworker app smoke`.

Use `aiworker-host-dev` when the change belongs to Host platform behavior:
local daemon API, CLI lifecycle, Worker Web Shell rendering, storage metadata,
Host runtime, app registry or Host/Soul protocol implementation.

Do not use this as a validation-campaign route for published CLI harnesses,
Coder workspaces or release-debug runs.

## Required Registry Reads

Read these registry IDs in `docs/architecture.md` before Soul App changes:

- `ARCH-001`
- `SOUL-001`
- `CONFIG-001`
- `PROTO-001`
- `IMPORT-001`
- `MOUNT-001`
- `DATA-001`
- `ENGINE-001`
- `DOC-001`

Do not restate or reinterpret those rules in this skill. If a boundary question
requires new wording, update `docs/architecture.md#constraint-registry` first.

## Read Set

Load only what the task needs:

1. `docs/architecture.md`.
2. `docs/soul-app-developer.md` for the frozen command and package-shape
   quickstart.
3. The target app manifest and touched files:
   `soul-app.manifest.json`, `engine-assets/`, `product/`, `host-adapter/` or
   app tests.
4. For official HR/QA manifest or shell changes, also read
   `packages/shared/src/soul-app/fixtures.ts` and shared manifest tests.
5. For SDK/runtime/protocol/schema changes, read the owning package tests before
   editing.

If `$app_path` is provided, start there. If it is missing, infer the target from
the user request or changed files. Ask only when ownership cannot be determined
safely from the architecture contract.

## Workflow

1. Classify the change as app-owned domain work, public authoring contract,
   shared schema/protocol, validation/smoke behavior or docs.
2. Confirm the change belongs to Soul App ownership using the registry IDs
   above.
3. If the requested change modifies Host-owned behavior, switch to
   `aiworker-host-dev`.
4. Keep standalone and Host mounted modes aligned through the app manifest,
   app-owned files and public SDK/runtime surfaces.
5. Keep vertical-user wording visible in app UI and product docs.
6. Keep edits minimal and aligned with existing package boundaries.

## Validation

Pick the smallest command set that proves the touched surface:

| Change | Verification |
| --- | --- |
| Production Soul App | `aiworker app validate <app-path>` and `aiworker app smoke <app-path>` |
| App package code | app package `typecheck` and `test` |
| App-owned web UI | app package `typecheck` and `test`; run `bun run ui:check` for official app web changes |
| Official app manifest/catalog | app validate/smoke, shared tests and affected API/core tests |
| SDK/runtime/protocol/shared schema | focused package tests and typecheck |
| CLI validate/smoke behavior | focused CLI tests and matching docs |
| Instruction-only docs or skill changes | `bun run docs:check`, reference search and `git diff --check` |

When code files changed, run:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph only for documentation-only, instruction-only or pure
formatting changes, and state the skip explicitly.

## Completion Checklist

- Name the target app or authoring surface.
- State the Host/Soul App ownership decision.
- Confirm the active boundary source was `docs/architecture.md#constraint-registry`.
- Confirm no Host-private or sibling app source imports were introduced.
- Record validation commands and results.
- Run code-review-graph for code changes or explicitly skip it for docs-only,
  instruction-only or formatting-only work.
````

- [ ] **Step 2: Run docs check and confirm Soul App skill assertions pass**

Run:

```bash
bun run docs:check
```

Expected: FAIL if other files are still pending. There should be no missing-text issue for `.agents/skills/aiworker-soul-app-dev/SKILL.md`.

## Task 4: Thin The Host Route Skill

**Files:**
- Modify: `.agents/skills/aiworker-host-dev/SKILL.md`

- [ ] **Step 1: Replace the entire Host skill with the thin route helper**

Replace the full contents of `.agents/skills/aiworker-host-dev/SKILL.md` with:

````markdown
---
name: aiworker-host-dev
description: "Use when creating, modifying, or reviewing AIWorker Host platform surfaces such as local daemon API, Worker Web Shell, CLI lifecycle, Host runtime, app registry, thin local adapters, shared Host/Soul protocol, storage metadata, fs layout, or shared UI primitives."
argument-hint: "[surface]"
arguments: [surface]
---

# AIWorker Host Developer

This skill is a route helper, not a parallel architecture contract.

Use it before touching Host platform code or Host-facing docs. Always start
from `docs/architecture.md#constraint-registry`. Host work keeps AIWorker as
Local Shell + Engine Bridge for Soul Apps: start, shell, locate, mount and
bridge.

## Fit Check

Use this skill for:

- `apps/api`: local daemon API, OpenAPI routes, mounted service proxy and Host
  protocol endpoints.
- `apps/web`: Host Web Shell, Settings, Worker Configuration, locator chrome,
  mounted container, shell header and shared Host interaction surfaces.
- `apps/cli`: daemon lifecycle, dev command, app install/enable/disable and
  worker/workspace/session commands.
- `packages/core`: Host runtime, Soul App registry, thin local adapters, engine
  adapter and locator services.
- `packages/shared`: shared Host/Soul App protocol types, manifest schema,
  reference manifests and local workspace schemas.
- `packages/storage-sqlite`: `worker.db` Host metadata schema, migrations,
  repositories and indexes.
- `packages/ui`: shadcn-managed shared UI primitives and theme variables.
- `packages/fs-layout`: Host filesystem layout.
- Host-facing docs: `AGENTS.md`, `README.md`, `docs/architecture.md`,
  `docs/cli.md`, `docs/deployment.md` and `docs/executor-engines.md`.

Use `aiworker-soul-app-dev` when the change belongs to app-owned domain work,
Soul App manifests, standalone behavior, Host mounted handlers, app-owned
artifacts, app-owned review/profile/capability files or public authoring
surfaces.

## Required Registry Reads

Read these registry IDs in `docs/architecture.md` before Host changes:

- `ARCH-001`
- `HOST-001`
- `CONFIG-001`
- `PROTO-001`
- `IMPORT-001`
- `MOUNT-001`
- `DATA-001`
- `ENGINE-001`
- `UI-001`
- `DOC-001`

Do not restate or reinterpret those rules in this skill. If a boundary question
requires new wording, update `docs/architecture.md#constraint-registry` first.

Before touching Worker Configuration, read `CONFIG-001` directly.

## Read Set

Load only the relevant slice:

| Surface | Read first |
| --- | --- |
| Local daemon/API | `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`, `packages/shared/src/local-workspace.ts` |
| Web Shell | `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/features/local-workspace/api/`, `apps/web/src/features/settings/`, touched component/style files |
| CLI lifecycle | `apps/cli/src/aiworker.ts`, `apps/cli/src/aiworker.test.ts`, `docs/cli.md` |
| Host runtime/registry | `packages/core/src/host/`, `packages/core/src/soul-app/`, matching tests |
| Shared protocol/schema | `packages/shared/src/soul-app/`, `packages/shared/src/local-workspace.ts`, matching tests |
| Storage metadata | `packages/storage-sqlite/src/worker/schema.ts`, `index.ts`, `index.test.ts`, migrations/scripts |
| Shared UI primitives | `packages/ui`, `apps/web/components.json`, touched style/component files |
| Deployment/docs | `docs/deployment.md`, `docs/executor-engines.md`, `README.md`, `AGENTS.md` |

If `$surface` is provided, start there. If the surface is unclear, infer from
file paths and the user request. Ask only when ownership cannot be determined
safely from the architecture contract.

## Workflow

1. Classify the change as daemon/API, Web shell, CLI, core runtime, shared
   protocol, storage metadata, shared UI/layout or docs.
2. Confirm Host owns the platform behavior using the registry IDs above.
3. If the request is app-owned domain work, switch to `aiworker-soul-app-dev`.
4. For non-trivial work, follow PMA after user approval.
5. For Host Web or shared UI work, include Component Library Preflight:
   checked `packages/ui` primitives, app-local UI ownership reason and focused
   UI component check.
6. For frontend Host work, use `pma-web` after PMA approval.
7. For backend/runtime/CLI/storage work, use `pma-bun` after PMA approval.
8. For reviews or audits, use `pma-cr`.
9. Keep edits minimal and aligned with existing package boundaries.

## Contract Sync Rules

- API changes: update zod schemas, OpenAPI metadata, typed/shared client shapes
  and focused API/Web/CLI tests that consume the route.
- Storage changes: update Drizzle schema/migrations through the storage package,
  repository helpers and storage tests.
- Shared protocol changes: update `packages/shared`, affected Host consumers and
  affected Soul App manifests or SDK/runtime packages.
- Web shell changes: keep user-facing language centered on Soul App, Soul
  worker, workspace, session, artifact, profile, review and lesson. Use Host
  internals only in developer or diagnostic surfaces.
- CLI changes: keep `docs/cli.md` and focused CLI tests in sync.

## Validation

Pick the smallest command set that proves the touched Host surface:

| Change | Verification |
| --- | --- |
| API/local daemon | `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts` and API typecheck when types changed |
| Web shell/settings/workbench | `bun run --filter '@zonease/aiworker-web' test`; build or browser smoke when visible UI changed |
| Web UI local style or component work | `bun run ui:check` plus focused Web test/build when visible behavior changed |
| CLI lifecycle | `bun run --filter '@zonease/aiworker-cli' test` and `build:bundle` when command behavior changed |
| Core runtime/registry/thin adapter | `bun run --filter '@zonease/aiworker-core' test` |
| Shared protocol/schema | `bun run --filter '@zonease/aiworker-shared' test` and downstream focused tests |
| Storage metadata/schema | `bun run --filter '@zonease/aiworker-storage-sqlite' test` and migration generation when schema changed |
| Cross-package contract | focused package tests plus `bun run check`; run `bun run build` when bundles or public entrypoints changed |
| Docs or skill only | `bun run docs:check`, reference search and `git diff --check` |

When code files changed, run:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph only for documentation-only, instruction-only or pure
formatting changes, and state the skip explicitly.

## Completion Checklist

- Name the Host surface changed.
- State why Host owns the behavior.
- State whether any Soul App protocol or app-owned surface is involved.
- Confirm the active boundary source was `docs/architecture.md#constraint-registry`.
- Confirm shared contracts, docs and tests stayed aligned.
- For Web UI work, summarize the Component Library Preflight and UI component
  check result.
- Record validation commands and results.
- Run code-review-graph for code changes or explicitly skip it for docs-only,
  instruction-only or formatting-only work.
````

- [ ] **Step 2: Run docs check and confirm Host skill assertions pass**

Run:

```bash
bun run docs:check
```

Expected: FAIL if active references are still pending. There should be no missing-text issue for `.agents/skills/aiworker-host-dev/SKILL.md`.

## Task 5: Update Active Entrypoint References

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update Soul App authoring route in `AGENTS.md`**

In `AGENTS.md`, replace:

```markdown
- Soul App authoring：`docs/soul-app-developer.md` 和 `aiworker-soul-app-dev` skill。
```

with:

```markdown
- Soul App authoring：先读 `docs/architecture.md#constraint-registry` 和
  `aiworker-soul-app-dev` skill；`docs/soul-app-developer.md` 只是冻结的命令与目录速查。
```

- [ ] **Step 2: Update the README docs map**

In `README.md`, replace:

```markdown
- `docs/soul-app-developer.md`：Soul App authoring workflow。
```

with:

```markdown
- `docs/soul-app-developer.md`：冻结的 Soul App 命令与目录速查，不是架构合同。
```

- [ ] **Step 3: Update the README Developer Route table**

In `README.md`, replace these two table rows:

```markdown
| 官方 HR/QA Soul App、manifest、standalone、Host mounted、artifact/profile/review/lesson | `docs/soul-app-developer.md` + `.agents/skills/aiworker-soul-app-dev/SKILL.md` |
| 新第三方 Soul App | `aiworker app create` + `docs/soul-app-developer.md` + `.agents/skills/aiworker-soul-app-dev/SKILL.md` |
```

with:

```markdown
| 官方 HR/QA Soul App、manifest、standalone、Host mounted、artifact/profile/review/lesson | `docs/architecture.md#constraint-registry` + `.agents/skills/aiworker-soul-app-dev/SKILL.md`；命令速查见 `docs/soul-app-developer.md` |
| 新第三方 Soul App | `aiworker app create` + `.agents/skills/aiworker-soul-app-dev/SKILL.md`；目录速查见 `docs/soul-app-developer.md` |
```

- [ ] **Step 4: Update the Chinese README pointer**

In `README.zh-CN.md`, replace:

```markdown
- Soul App authoring：`docs/soul-app-developer.md`
```

with:

```markdown
- Soul App authoring：`docs/architecture.md#constraint-registry` + `aiworker-soul-app-dev`；`docs/soul-app-developer.md` 只是冻结速查。
```

- [ ] **Step 5: Update architecture thin references**

In `docs/architecture.md`, replace the `SOUL-001` and `CONFIG-001` table rows with these rows:

```markdown
| `SOUL-001` | Soul App owns domain state, domain UI/API, app-owned outputs, app-owned confirmation actions, standalone product experience and mounted product surface. | Soul App | `aiworker app validate`, `aiworker app smoke`, app package tests | `aiworker-soul-app-dev`, frozen quickstart `docs/soul-app-developer.md` |
| `CONFIG-001` | Host-owned Worker Configuration is scoped to one Soul worker. Its trigger and dialog shell are Host chrome, not Soul-registered UI. Soul Apps may expose manifest/protocol descriptors that Host displays as generic worker-scoped options/status, but workspace/session ids are opaque locator or bridge context only and must not become Host configuration scopes. Domain, workspace and session configuration belongs in Soul-owned micro-app UI or app-owned API. | Host + Soul boundary | Worker Web tests, docs contract, boundary review, code-review-graph when code changes | `AGENTS.md`, Host and Soul App skills, frozen quickstart `docs/soul-app-developer.md` |
```

- [ ] **Step 6: Run docs check and confirm active references pass**

Run:

```bash
bun run docs:check
```

Expected: PASS with:

```text
docs contract ok (11 active files, 11 registry ids)
```

## Task 6: Run Drift Scans And Final Verification

**Files:**
- Inspect only unless a command exposes a miss that must be fixed in files from Tasks 1-5.

- [ ] **Step 1: Scan active docs for old guide-as-workflow wording**

Run:

```bash
rg -n "docs/soul-app-developer\\.md.*workflow|authoring workflow" AGENTS.md README.md README.zh-CN.md docs/architecture.md .agents/skills scripts
```

Expected: no output.

- [ ] **Step 2: Scan active docs for the architecture source phrase**

Run:

```bash
rg -n "The only active Host/Soul App contract is `docs/architecture.md#constraint-registry`|docs/architecture.md#constraint-registry" docs/soul-app-developer.md AGENTS.md README.md README.zh-CN.md .agents/skills/aiworker-soul-app-dev/SKILL.md .agents/skills/aiworker-host-dev/SKILL.md
```

Expected: output includes `docs/soul-app-developer.md`, `AGENTS.md`, `README.zh-CN.md`, and both AIWorker skills. `README.md` may show `Constraint Registry` wording instead of the exact English phrase.

- [ ] **Step 3: Scan high-drift vocabulary**

Run:

```bash
rg -n "generic worker-scoped options|Host can display|MCP plumbing|provider|permission hints|review verdict|memory promotion" docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md .agents/skills/aiworker-host-dev/SKILL.md
```

Expected: at most one output line from `docs/soul-app-developer.md` containing the negative "Do not expand" warning. There should be no output from either AIWorker skill.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Run docs check**

Run:

```bash
bun run docs:check
```

Expected:

```text
docs contract ok (11 active files, 11 registry ids)
```

- [ ] **Step 6: Run code-review-graph because the doc-contract TypeScript script changed**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: commands complete successfully. If `crg:review` reports findings, address only findings related to this change, then repeat `bun run docs:check`, `git diff --check`, `bun run crg:update` and `bun run crg:review`.

- [ ] **Step 7: Review final diff**

Run:

```bash
git diff -- AGENTS.md README.md README.zh-CN.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-host-dev/SKILL.md .agents/skills/aiworker-soul-app-dev/SKILL.md scripts/check-doc-contract.ts
```

Expected: diff only freezes the Soul App guide, thins the two skills, updates active references and updates doc-contract assertions.

## Task 7: Commit

**Files:**
- Commit all files modified by Tasks 1-6.

- [ ] **Step 1: Check status**

Run:

```bash
git status --short
```

Expected: only these files are modified:

```text
 M .agents/skills/aiworker-host-dev/SKILL.md
 M .agents/skills/aiworker-soul-app-dev/SKILL.md
 M AGENTS.md
 M README.md
 M README.zh-CN.md
 M docs/architecture.md
 M docs/soul-app-developer.md
 M scripts/check-doc-contract.ts
?? docs/superpowers/plans/2026-05-26-soul-app-developer-freeze.md
```

If this plan file was already committed before execution, omit it from the expected untracked list.

- [ ] **Step 2: Stage the implementation files**

Run:

```bash
git add AGENTS.md README.md README.zh-CN.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-host-dev/SKILL.md .agents/skills/aiworker-soul-app-dev/SKILL.md scripts/check-doc-contract.ts
```

If the implementation executor is asked to commit this plan file too, also run:

```bash
git add docs/superpowers/plans/2026-05-26-soul-app-developer-freeze.md
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "docs: 冻结 Soul App authoring 入口"
```

Expected: commit succeeds.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short
```

Expected: no output.
