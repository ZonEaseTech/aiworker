# Settings Configuration Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Host Platform Settings from Soul App Configuration across protocol, Worker Web behavior, official apps, scaffold output, and docs.

**Architecture:** Keep Host `/api/local/settings` as the platform settings route. Rename the app-owned workbench descriptor to `ui.workbench.configuration`, map it to a `configure` action role in Worker Web, and ensure successful app-owned configuration actions do not open the Host settings dialog.

**Tech Stack:** TypeScript, React 19, Vite 8, Bun workspaces, Vitest, Zod, Hono, AIWorker Soul App manifest protocol.

---

### Task 1: PMA And Design Records

**Files:**
- Create: `docs/task/BUG-140.md`
- Create: `docs/plan/PLAN-376.md`
- Create: `docs/superpowers/specs/2026-05-19-settings-configuration-boundary-design.md`
- Create: `docs/superpowers/plans/2026-05-19-settings-configuration-boundary.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] **Step 1: Claim PMA task**

Append `BUG-140` to `docs/task/index.md` as `[-]` and create
`docs/task/BUG-140.md` with status `in_progress`.

- [x] **Step 2: Create PMA plan**

Append `PLAN-376` to `docs/plan/index.md` as `[-]` and create
`docs/plan/PLAN-376.md` with status `implementing`.

- [x] **Step 3: Save Superpowers design and implementation plan**

Save the approved design and this implementation plan under `docs/superpowers`.

### Task 2: RED Worker Web Regression

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Write the failing test**

Update the HR workbench test so the app configuration button is named
`Configure HR`, calls `/api/local/apps/aiworker-hr/actions/configure-hr`, shows
the returned app message, and asserts the Platform Settings dialog is not open.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because the current implementation still uses `settings`,
`hr-settings`, and opens Host settings.

### Task 3: Rename Shared Protocol Descriptor

**Files:**
- Modify: `packages/shared/src/soul-app/manifest.ts`
- Modify: `packages/shared/src/soul-app/fixtures.ts`
- Modify: `packages/shared/src/soul-app/manifest.test.ts`
- Modify: `packages/shared/src/soul-app/registry.test.ts`

- [x] **Step 1: Rename schema**

Change the workbench descriptor from `settings` to `configuration` and the
app-owned action role from `settings` to `configure`.

- [x] **Step 2: Update official fixtures and tests**

Use `configure-hr` / `Configure HR` / `configuration.open` and
`configure-qa` / `Configure QA` / `configuration.open`.

- [x] **Step 3: Verify shared package**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test
```

Expected: PASS.

### Task 4: Update Runtime Consumers

**Files:**
- Modify: `packages/core/src/soul-app/security-review.ts`
- Modify: `packages/core/src/soul-app/registry.test.ts`
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`

- [x] **Step 1: Update descriptor collection and action resolution**

Include `workbench.configuration` where runtime code previously consumed
`workbench.settings`.

- [x] **Step 2: Update scaffold and smoke**

Generated Soul Apps should emit `ui.workbench.configuration`, README copy
should say configuration, and mounted smoke should include the configuration
descriptor as a workbench action candidate.

- [x] **Step 3: Verify runtime consumers**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: PASS.

### Task 5: Update Worker Web Behavior

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Modify: `apps/web/src/features/i18n/locales/en.ts`
- Modify: `apps/web/src/features/i18n/locales/zh-CN.ts`
- Modify: `apps/web/src/features/i18n/locales/ja.ts`
- Modify: `apps/web/src/features/i18n/locales/de.ts`
- Modify: `apps/web/src/features/i18n/types.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Map app configuration to a configure action**

Push `workbenchContract.configuration` into workbench actions with
`role: "configure"`.

- [x] **Step 2: Stop app configuration from opening Host settings**

Remove the HR workbench `role === "settings"` fallthrough to `onOpenSettings`.
Successful app configuration should show the app result message through the
existing status area.

- [x] **Step 3: Rename Host settings copy**

Fixed Host settings entries should use Platform Settings copy and accessible
names.

- [x] **Step 4: Verify web behavior**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run ui:check
```

Expected: PASS.

### Task 6: Update Official Apps And Docs

**Files:**
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
- Modify: `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Modify: `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-qa/host-adapter/index.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`
- Modify: `packages/soul-app-sdk/README.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Update official app manifests and mounted handlers**

Use `configuration` descriptors and `configuration.open` protocol actions.

- [x] **Step 2: Update docs**

Document the three-layer boundary and the new descriptor name.

- [x] **Step 3: Verify apps and docs**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
bun run docs:check
git diff --check
```

Expected: PASS.

### Task 7: Final Review

**Files:**
- Review all changed files.

- [x] **Step 1: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: exit 0, with no blocking findings.

- [x] **Step 2: Complete PMA records**

Mark `BUG-140` and `PLAN-376` completed, fill verification records, and update
index markers to `[x]`.
