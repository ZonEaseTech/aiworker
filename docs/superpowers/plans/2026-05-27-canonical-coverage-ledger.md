# Canonical Coverage Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `tmp/refactor` as an active architecture source by promoting every accepted hard decision into thin canonical docs and guardrails.

**Architecture:** Keep the canonical authority set at five docs plus `AGENTS.md` bootstrap. Use `scripts/check-doc-contract.ts` and `tests/architecture/refactor-contract.test.ts` as the mechanical guardrails. The coverage ledger is an index, not a copied transcript: it names decisions, canonical homes, and tests without moving long temporary reasoning into `docs/`.

**Tech Stack:** Markdown docs, Bun test runner, TypeScript guardrail scripts, existing `docs:check` and `test:contracts` commands.

---

## File Structure

- Modify: `AGENTS.md`
  - Add one short anti-drift rule under `Authority` or `Workflow`.
  - Keep the file at 90 lines or fewer.
- Modify: `docs/architecture.md`
  - Add a compact coverage index that points hard-decision categories to canonical homes.
- Modify: `docs/protocol.md`
  - Expand broker routes and worker configuration envelope details.
- Modify: `docs/runtime.md`
  - Expand projection responsibility, runtime skills/MCP/entry-file CRUD, and B+ bridge hard rules.
- Modify: `docs/soul-authoring.md`
  - Expand SDK convention discovery, build output, and Freeform v1 source contract.
- Modify: `docs/testing.md`
  - Add the canonical coverage ledger and guardrail mapping.
- Modify: `scripts/check-doc-contract.ts`
  - Require the new anti-drift and coverage phrases.
- Modify: `tests/architecture/refactor-contract.test.ts`
  - Assert the coverage ledger and key promoted implementation-contract details.

Do not modify during Tasks 1-4:

- `tmp/refactor/*`
- product runtime files under `apps/*`, `packages/*`, or `souls/*`, unless a later execution step proves a real contradiction that docs/tests alone cannot fix.

Task 5 is the only task allowed to retire `tmp/refactor`, and only after the
ledger proves there are no unexplained `tmp-only` accepted hard decisions.

## Task 1: Add Anti-Drift Guardrails

**Files:**
- Modify: `scripts/check-doc-contract.ts`
- Modify: `tests/architecture/refactor-contract.test.ts`
- Modify: `AGENTS.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add failing docs guard for anti-drift wording**

In `scripts/check-doc-contract.ts`, extend the existing `requireIncludes('AGENTS.md', [...])` block so it requires this phrase:

```ts
  'tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation',
```

Extend the existing `requireIncludes('docs/architecture.md', [...])` block so it requires these phrases:

```ts
  'Decision Coverage Index',
  'tmp/refactor decisions are evidence until promoted',
```

- [ ] **Step 2: Run the docs guard and verify it fails**

Run:

```bash
bun run docs:check
```

Expected: FAIL. The output must mention missing required text in `AGENTS.md` and `docs/architecture.md`.

- [ ] **Step 3: Add failing architecture test for coverage index**

In `tests/architecture/refactor-contract.test.ts`, add this test inside the existing `describe('destructive refactor contract bootstrap', () => { ... })` block:

```ts
  test('canonical architecture records the tmp refactor coverage policy', () => {
    const architecture = readRepoFile('docs/architecture.md')
    const agents = readRepoFile('AGENTS.md')

    expect(architecture).toContain('Decision Coverage Index')
    expect(architecture).toContain('tmp/refactor decisions are evidence until promoted')
    expect(architecture).toContain('docs/protocol.md owns descriptor, broker route, configuration envelope, mounted workbench, and app-owned API contracts')
    expect(architecture).toContain('docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts')
    expect(architecture).toContain('docs/testing.md owns the coverage ledger and guardrail mapping')
    expect(agents).toContain('tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation')
  })
```

- [ ] **Step 4: Run the focused architecture test and verify it fails**

Run:

```bash
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "canonical architecture records the tmp refactor coverage policy"
```

Expected: FAIL. The failure should show the missing `Decision Coverage Index` or missing `tmp/refactor accepted decisions` text.

- [ ] **Step 5: Update `AGENTS.md` with the anti-drift rule**

Add this sentence to the `Workflow` section of `AGENTS.md`, keeping the file under 90 lines:

```markdown
If a task depends on an accepted `tmp/refactor` decision, promote it to canonical docs or tests before implementation; tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation.
```

- [ ] **Step 6: Add the architecture coverage index**

Add this section to `docs/architecture.md` after the `Position` section and before `Ownership`:

```markdown
## Decision Coverage Index

`tmp/refactor` decisions are evidence until promoted. Accepted refactor
decisions become active authority only when they are represented in the
canonical docs, guarded by tests, or both.

- `docs/architecture.md` owns product position, Host/Soul ownership, monorepo
  boundaries, data ownership, Freeform v1 scope, and destructive migration
  constraints.
- `docs/protocol.md` owns descriptor, broker route, configuration envelope,
  mounted workbench, and app-owned API contracts.
- `docs/runtime.md` owns projection, runtime assets CRUD, engine bridge,
  lifecycle, cleanup, and redaction contracts.
- `docs/soul-authoring.md` owns SDK authoring, convention discovery, build
  output, native MCP source layout, and Freeform source contract.
- `docs/testing.md` owns the coverage ledger and guardrail mapping.
```

- [ ] **Step 7: Run focused verification**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "canonical architecture records the tmp refactor coverage policy"
```

Expected: both commands PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add AGENTS.md docs/architecture.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs: 固化 tmp refactor 防漂移规则"
```

## Task 2: Promote Protocol Implementation Details

**Files:**
- Modify: `scripts/check-doc-contract.ts`
- Modify: `tests/architecture/refactor-contract.test.ts`
- Modify: `docs/protocol.md`

- [ ] **Step 1: Add failing docs guard for protocol details**

In `scripts/check-doc-contract.ts`, extend the `requireIncludes('docs/protocol.md', [...])` block with:

```ts
  'GET    /api/app-installation/apps/:appId',
  'POST   /api/app-installation/apps/:appId/archive',
  'DELETE /api/app-installation/apps/:appId',
  'PATCH  /api/workers/:workerId',
  'POST   /api/workers/:workerId/archive',
  'DELETE /api/workers/:workerId',
  'PATCH  /api/workers/:workerId/config/:configKey',
  'POST   /api/workers/:workerId/config/:configKey/archive',
  'PATCH  /api/workspace-locators/:workspaceId',
  'POST   /api/workspace-locators/:workspaceId/archive',
  'DELETE /api/workspace-locators/:workspaceId',
  'PATCH  /api/sessions/:sessionId',
  'POST   /api/sessions/:sessionId/archive',
  'DELETE /api/sessions/:sessionId',
  'configValueJson envelope',
  'kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy',
```

- [ ] **Step 2: Add failing architecture test for promoted protocol details**

Add this test inside `tests/architecture/refactor-contract.test.ts`:

```ts
  test('protocol doc promotes broker methods and worker config envelope details', () => {
    const protocol = readRepoFile('docs/protocol.md')

    for (const route of [
      'GET    /api/app-installation/apps/:appId',
      'POST   /api/app-installation/apps/:appId/archive',
      'DELETE /api/app-installation/apps/:appId',
      'PATCH  /api/workers/:workerId',
      'POST   /api/workers/:workerId/archive',
      'DELETE /api/workers/:workerId',
      'PATCH  /api/workers/:workerId/config/:configKey',
      'POST   /api/workers/:workerId/config/:configKey/archive',
      'PATCH  /api/workspace-locators/:workspaceId',
      'POST   /api/workspace-locators/:workspaceId/archive',
      'DELETE /api/workspace-locators/:workspaceId',
      'PATCH  /api/sessions/:sessionId',
      'POST   /api/sessions/:sessionId/archive',
      'DELETE /api/sessions/:sessionId',
    ]) {
      expect(protocol).toContain(route)
    }

    expect(protocol).toContain('configValueJson envelope')
    expect(protocol).toContain('kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy')
    expect(protocol).toContain('Config values must not contain literal secrets, full native MCP files, full skill bodies, full entry-file contents, Soul domain records, business action state, or artifact content.')
  })
```

- [ ] **Step 3: Run focused checks and verify they fail**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "protocol doc promotes broker methods and worker config envelope details"
```

Expected: both commands FAIL because `docs/protocol.md` does not yet contain the expanded route methods or envelope wording.

- [ ] **Step 4: Expand broker routes in `docs/protocol.md`**

Replace the current broker route block in `docs/protocol.md` with:

```text
POST   /api/app-installation/install
GET    /api/app-installation/apps
GET    /api/app-installation/apps/:appId
POST   /api/app-installation/apps/:appId/enable
POST   /api/app-installation/apps/:appId/archive
DELETE /api/app-installation/apps/:appId

POST   /api/workers
GET    /api/workers
GET    /api/workers/:workerId
PATCH  /api/workers/:workerId
POST   /api/workers/:workerId/archive
DELETE /api/workers/:workerId

GET    /api/workers/:workerId/config
PUT    /api/workers/:workerId/config/:configKey
PATCH  /api/workers/:workerId/config/:configKey
POST   /api/workers/:workerId/config/:configKey/archive

POST   /api/workspace-locators
GET    /api/workspace-locators
GET    /api/workspace-locators/:workspaceId
PATCH  /api/workspace-locators/:workspaceId
POST   /api/workspace-locators/:workspaceId/archive
DELETE /api/workspace-locators/:workspaceId

POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:sessionId
PATCH  /api/sessions/:sessionId
POST   /api/sessions/:sessionId/archive
DELETE /api/sessions/:sessionId
POST   /api/sessions/:sessionId/invocations

GET    /api/engine/targets
GET    /api/engine/targets/:target/readiness
POST   /api/engine/invocations
GET    /api/engine/invocations/:invocationId
GET    /api/engine/invocations/:invocationId/events
POST   /api/engine/invocations/:invocationId/cancel

POST   /api/projections/:target/refresh
GET    /api/projections/receipts/:receiptId
POST   /api/projections/receipts/:receiptId/cleanup

GET    /api/mount/workbench
ANY    /api/apps/:appId/*
```

Add these rules after the route block:

```markdown
Route methods make the local broker deterministic. They do not turn the daemon
into a product backend.

- `enable` creates a worker from an installed descriptor.
- archive operations mark Host metadata unavailable for new work.
- hard delete removes Host metadata and receipt-owned projections only.
- session follow-up always uses `POST /api/sessions/:sessionId/invocations`.
- engine cancel and event stream target an invocation id.
- app-owned API proxy attaches locator context when present and does not
  interpret domain route names.
```

- [ ] **Step 5: Expand the worker config section**

Add this paragraph to the `Configuration` section of `docs/protocol.md`:

```markdown
Worker configuration values use a `configValueJson envelope` with the standard
fields `kind, target, enabled, sourceRef, checksum, options, updatedAt,
updatedBy`. `kind` is one of `engine-selection`, `projection-overlay`,
`skill-overlay`, `mcp-overlay`, `entry-file-overlay`, `workbench-preference`, or
`sdk-extension`. `target` is an engine target, `all`, or `none`. `options` is a
non-secret operational object. `updatedBy` records caller class such as `cli`,
`web`, or `app-owned-api`, not user identity.

Config values must not contain literal secrets, full native MCP files, full
skill bodies, full entry-file contents, Soul domain records, business action
state, or artifact content.
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "protocol doc promotes broker methods and worker config envelope details"
```

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add docs/protocol.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs: 升格 protocol 实现合同细节"
```

## Task 3: Promote Runtime And Bridge Details

**Files:**
- Modify: `scripts/check-doc-contract.ts`
- Modify: `tests/architecture/refactor-contract.test.ts`
- Modify: `docs/runtime.md`

- [ ] **Step 1: Add failing docs guard for runtime details**

In `scripts/check-doc-contract.ts`, extend the `requireIncludes('docs/runtime.md', [...])` block with:

```ts
  'Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.',
  'Runtime skills, MCP, and entry-file CRUD',
  'ENGINE_SESSION_REF_MISSING',
  'ENGINE_CANCEL_FAILED',
  'PROJECTION_RECEIPT_STALE',
  'Allowed bridge event classes',
  'Delayed hard kill must never terminate a newer invocation.',
```

- [ ] **Step 2: Add failing architecture test for runtime details**

Add this test inside `tests/architecture/refactor-contract.test.ts`:

```ts
  test('runtime doc promotes projection, assets CRUD, and bridge hard rules', () => {
    const runtime = readRepoFile('docs/runtime.md')

    expect(runtime).toContain('Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.')
    expect(runtime).toContain('Runtime skills, MCP, and entry-file CRUD')
    expect(runtime).toContain('Worker-scoped overlay records live in Host metadata; projected file contents do not.')
    expect(runtime).toContain('ENGINE_SESSION_REF_MISSING')
    expect(runtime).toContain('ENGINE_CANCEL_FAILED')
    expect(runtime).toContain('PROJECTION_RECEIPT_STALE')
    expect(runtime).toContain('Allowed bridge event classes')
    expect(runtime).toContain('invocation.tool.observed')
    expect(runtime).toContain('process.lost')
    expect(runtime).toContain('Delayed hard kill must never terminate a newer invocation.')
  })
```

- [ ] **Step 3: Run focused checks and verify they fail**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "runtime doc promotes projection, assets CRUD, and bridge hard rules"
```

Expected: both commands FAIL because `docs/runtime.md` does not yet contain the promoted runtime detail.

- [ ] **Step 4: Expand projection in `docs/runtime.md`**

Replace the first paragraph under `## Projection` with:

```markdown
Host orchestrates projection; engine-projection executes projection; SDK and
protocol define projection inputs.

`packages/engine-projection` materializes engine-facing files from descriptor
asset refs and worker-scoped configuration overlays. Host runtime calls it
because Host owns worker, workspace locator, session, selected engine, worker
configuration, and filesystem root facts. Host does not define skill format, MCP
semantics, or domain files.
```

- [ ] **Step 5: Add runtime assets CRUD section**

Add this section after `## Projection`:

```markdown
## Runtime skills, MCP, and entry-file CRUD

Runtime skills, MCP, and entry-file CRUD is a first-class runtime chain.

- CLI, Web, or app-owned UI requests an SDK-standard worker configuration
  action.
- Host validates and stores worker-scoped overlay records.
- Worker-scoped overlay records live in Host metadata; projected file contents
  do not.
- `engine-projection` materializes descriptor assets plus overlays for one
  selected engine target.
- Projection writes a receipt for cleanup, freshness, and diagnostics.

Workspace assets are single-source. Skills are single-source by default with
explicit engine override only when necessary. MCP uses one native file per
engine target, such as Codex `config.toml` and Claude Code `.mcp.json`.
```

- [ ] **Step 6: Expand bridge hard rules**

Add this subsection under `## Engine Bridge`:

```markdown
Failure codes are platform-level and stable enough for tests and diagnostics.
Required codes include `ENGINE_SESSION_REF_MISSING`, `ENGINE_CANCEL_FAILED`,
`PROJECTION_RECEIPT_MISSING`, `PROJECTION_RECEIPT_STALE`,
`WORKSPACE_LOCATOR_MISSING`, `WORKSPACE_ROOT_MISSING`, and
`BRIDGE_REDACTION_FAILED`.

Allowed bridge event classes are generic invocation and process observations:

```text
invocation.started
invocation.progress
invocation.output.delta
invocation.output.snapshot
invocation.tool.observed
invocation.usage.observed
invocation.warning
invocation.error
invocation.completed
invocation.cancelled
process.started
process.exited
process.lost
```

Cancel targets an invocation id. The bridge sends adapter-level protocol cancel
when supported, then soft interrupt, then process-group termination after the
grace period. Delayed hard kill must never terminate a newer invocation.
```

- [ ] **Step 7: Run focused verification**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "runtime doc promotes projection, assets CRUD, and bridge hard rules"
```

Expected: both commands PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add docs/runtime.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs: 升格 runtime bridge 合同细节"
```

## Task 4: Promote Soul Authoring And Coverage Ledger

**Files:**
- Modify: `scripts/check-doc-contract.ts`
- Modify: `tests/architecture/refactor-contract.test.ts`
- Modify: `docs/soul-authoring.md`
- Modify: `docs/testing.md`

- [ ] **Step 1: Add failing docs guard for authoring and ledger details**

In `scripts/check-doc-contract.ts`, extend `requireIncludes('docs/soul-authoring.md', [...])` with:

```ts
  'Convention discovery',
  'product/capabilities/*/prompt.md',
  'engine/workspace/*',
  'engine/skills/*',
  'engine/mcp/codex/config.toml',
  'engine/mcp/claude-code/.mcp.json',
  'dist/engine-assets/',
```

Extend `requireIncludes('docs/testing.md', [...])` with:

```ts
  'Canonical Coverage Ledger',
  'docs+tests',
  'tmp-only',
  'tmp-only is not acceptable for closed hard decisions',
  'Protocol implementation contract',
  'Runtime and bridge contract',
  'Soul authoring contract',
```

- [ ] **Step 2: Add failing architecture test for authoring and ledger details**

Add this test inside `tests/architecture/refactor-contract.test.ts`:

```ts
  test('soul authoring and testing docs expose coverage ledger details', () => {
    const authoring = readRepoFile('docs/soul-authoring.md')
    const testing = readRepoFile('docs/testing.md')

    for (const phrase of [
      'Convention discovery',
      'product/capabilities/*/prompt.md',
      'engine/workspace/*',
      'engine/skills/*',
      'engine/mcp/codex/config.toml',
      'engine/mcp/claude-code/.mcp.json',
      'dist/engine-assets/',
    ]) {
      expect(authoring).toContain(phrase)
    }

    for (const phrase of [
      'Canonical Coverage Ledger',
      'docs+tests',
      'docs-only',
      'tests-only',
      'tmp-only',
      'tmp-only is not acceptable for closed hard decisions',
      'Protocol implementation contract',
      'Runtime and bridge contract',
      'Soul authoring contract',
    ]) {
      expect(testing).toContain(phrase)
    }
  })
```

- [ ] **Step 3: Run focused checks and verify they fail**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "soul authoring and testing docs expose coverage ledger details"
```

Expected: both commands FAIL because `docs/soul-authoring.md` and `docs/testing.md` do not yet contain the promoted authoring details and coverage ledger.

- [ ] **Step 4: Add convention discovery and build output to `docs/soul-authoring.md`**

Add this section after `## Source Layout`:

```markdown
## Convention Discovery

The SDK discovers the common authoring path from:

```text
product/capabilities/*/prompt.md
product/workbench/index.tsx
product/api/index.ts
product/artifacts/*
engine/workspace/*
engine/skills/*
engine/mcp/codex/config.toml
engine/mcp/claude-code/.mcp.json
```

Discovery output must tell the author what the SDK found and which descriptor
sections it generated. `soul.config.ts` owns identity, version, display name,
compatibility overrides, explicit include/exclude choices, advanced build
overrides, and SDK module opt-ins. It must not become a Host integration file, a
handwritten descriptor, or arbitrary Host-readable configuration.

Build output is installed through descriptor references:

```text
dist/
  soul.descriptor.json
  web/
  api/
  engine-assets/
    workspace/
    skills/
    mcp/
      codex/config.toml
      claude-code/.mcp.json
```
```

- [ ] **Step 5: Add coverage ledger to `docs/testing.md`**

Add this section after `## Current Bootstrap Gate`:

```markdown
## Canonical Coverage Ledger

Coverage status values:

- `docs+tests`: preferred for high-risk architecture boundaries.
- `docs-only`: acceptable for explanatory or low-risk guidance.
- `tests-only`: acceptable for mechanical constraints where docs would be noisy.
- `tmp-only`: evidence only. tmp-only is not acceptable for closed hard
  decisions unless the ledger explains that the idea was exploratory or rejected.

| Decision area | Canonical home | Guardrail | Status |
| --- | --- | --- | --- |
| Host shell / locator / mount / bridge | `docs/architecture.md`, `AGENTS.md` | `bun run docs:check`, `bun run test:contracts` | docs+tests |
| Descriptor-only Host/Soul boundary | `docs/protocol.md`, `docs/soul-authoring.md` | `packages/soul-protocol` tests, architecture tests | docs+tests |
| Production mounted workbench routing | `docs/protocol.md`, `docs/runtime.md` | browser Freeform proof, mounted routing contract tests | docs+tests |
| Session lifecycle and invocation state split | `docs/runtime.md` | architecture tests and engine bridge tests | docs+tests |
| Protocol implementation contract | `docs/protocol.md` | docs check and architecture tests | docs+tests |
| Runtime and bridge contract | `docs/runtime.md` | engine bridge and projection tests | docs+tests |
| Soul authoring contract | `docs/soul-authoring.md` | SDK and Freeform contract tests | docs+tests |
| Host metadata and forbidden domain schema | `docs/architecture.md`, `docs/runtime.md` | `forbidden-host-domain-schema.test.ts` | docs+tests |
| Freeform v1 acceptance Soul | `docs/architecture.md`, `docs/soul-authoring.md` | CLI and browser Freeform gates | docs+tests |
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
bun run docs:check
bun test tests/architecture/refactor-contract.test.ts --test-name-pattern "soul authoring and testing docs expose coverage ledger details"
```

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add docs/soul-authoring.md docs/testing.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs: 补齐 authoring coverage ledger"
```

## Task 5: Retire `tmp/refactor` And Final Verification

**Files:**
- Read: `AGENTS.md`
- Read: `docs/architecture.md`
- Read: `docs/protocol.md`
- Read: `docs/runtime.md`
- Read: `docs/soul-authoring.md`
- Read: `docs/testing.md`
- Read: `scripts/check-doc-contract.ts`
- Read: `tests/architecture/refactor-contract.test.ts`
- Delete: tracked `tmp/refactor/*` files after coverage passes
- Delete: ignored local `tmp/refactor/` drafts after coverage passes

- [ ] **Step 1: Run full docs and contract verification**

Run:

```bash
bun run docs:check
bun run test:contracts
git diff --check
```

Expected:

```text
docs contract ok (6 active files, 5 canonical docs)
30 or more architecture tests pass
git diff --check exits 0
```

- [ ] **Step 2: Inventory `tmp/refactor` before retirement**

Run:

```bash
git ls-files tmp/refactor
find tmp/refactor -maxdepth 1 -type f | sort
```

Expected: the command shows any tracked and local ignored temporary drafts that
will be retired after coverage passes. As of plan writing, `git ls-files
tmp/refactor` showed only `tmp/refactor/27-integration-readiness-record.md`;
`tmp/` is ignored by `.gitignore`, so most `tmp/refactor` drafts are local
ignored evidence rather than canonical tracked docs.

- [ ] **Step 3: Confirm no accepted hard decision remains unexplained as tmp-only**

Run:

```bash
rg -n "tmp-only|tmp/refactor decisions are evidence until promoted|Canonical Coverage Ledger|Protocol implementation contract|Runtime and bridge contract|Soul authoring contract" docs AGENTS.md tests/architecture/refactor-contract.test.ts scripts/check-doc-contract.ts
```

Expected: matches appear in `docs/architecture.md`, `docs/testing.md`, `tests/architecture/refactor-contract.test.ts`, and `scripts/check-doc-contract.ts`. There should be no wording that says accepted `tmp/refactor` decisions can be implemented directly from `tmp`.

- [ ] **Step 4: Retire tracked and local `tmp/refactor` drafts**

Run only after Steps 1-3 pass:

```bash
git rm -r --ignore-unmatch tmp/refactor
rm -rf tmp/refactor
```

Expected: tracked temporary refactor files are staged for deletion, and the
ignored local `tmp/refactor` scratch directory is removed from the workspace.
The canonical docs and tests now carry the accepted decision coverage.

- [ ] **Step 5: Re-run final verification after retirement**

Run:

```bash
bun run docs:check
bun run test:contracts
git diff --check
```

Expected:

```text
docs contract ok (6 active files, 5 canonical docs)
30 or more architecture tests pass
git diff --check exits 0
```

- [ ] **Step 6: Check worktree scope**

Run:

```bash
git status --short
```

Expected: only files from this plan are modified or staged, plus retired
`tmp/refactor` tracked deletions. If pre-existing unrelated files such as
`packages/host-daemon/src/modes/worker.ts` remain modified, leave them untouched
and mention them in the handoff.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add AGENTS.md docs/architecture.md docs/protocol.md docs/runtime.md docs/soul-authoring.md docs/testing.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git add -u tmp/refactor
git commit -m "docs: 退役 tmp refactor 架构草稿"
```

- [ ] **Step 8: Final handoff**

Report:

```text
Implemented canonical coverage ledger.
Verification: docs:check pass, test:contracts pass, git diff --check pass.
Canonical docs remain five files.
tmp/refactor has been retired from active architecture authority.
Unrelated pre-existing modified files: list any shown by git status.
```

Do not claim product behavior changed. This plan only changes canonical docs,
guardrails, and retirement of temporary refactor drafts unless a later execution
choice explicitly expands scope.
