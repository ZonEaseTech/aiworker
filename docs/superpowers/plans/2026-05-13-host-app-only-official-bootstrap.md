# Host App-Only Official Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Host-owned business Soul built-ins from runtime catalog and make official HR/QA available through an idempotent first-party Soul App bootstrap.

**Architecture:** Host catalog becomes a projection of installed Soul Apps only. A small official allowlist points at first-party manifests and calls normal install/enable lifecycle, preserving disabled app intent while keeping fresh Host startup useful.

**Tech Stack:** Bun workspaces, TypeScript, Hono/OpenAPIHono local daemon, zod manifest validation, SQLite worker metadata, React Worker Web, bun:test, ESLint, PMA docs.

---

## File Structure

- Create `packages/core/src/soul-app/official.ts` for official app allowlist and idempotent bootstrap orchestration.
- Modify `packages/core/src/soul-app/registry.ts` so catalog lookup is app-only and no longer imports built-in business catalog constants.
- Modify `packages/core/src/soul-app/registry.test.ts` to assert empty catalog without installed apps, official bootstrap install/enable, and disabled app preservation.
- Modify `packages/core/src/index.ts` to export official bootstrap helpers.
- Modify `apps/api/src/modes/worker.ts` to run official bootstrap during local daemon startup before catalog-dependent endpoints serve data.
- Modify `apps/api/src/modes/worker.local.test.ts` to use app-projected IDs and verify disabled official apps are not re-enabled on runtime reload.
- Modify `apps/cli/src/aiworker.ts` to add `aiworker app bootstrap official`, update app/soul copy, and remove legacy built-in assumptions.
- Modify `apps/cli/src/aiworker.test.ts` to cover explicit official bootstrap and legacy `hr` rejection.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx` and related Web data mocks only where built-in catalog assumptions appear.
- Modify or remove `packages/shared/src/vertical-soul.ts` exports and tests if they expose runtime built-in business catalog as public Host behavior.
- Update `docs/task/FEAT-069.md`, `docs/plan/PLAN-294.md`, indexes and `docs/changelog.md`.

## Tasks

### Task 1: Record Design And PMA Tracking

**Files:**
- Create: `docs/superpowers/specs/2026-05-13-host-app-only-official-bootstrap-design.md`
- Create: `docs/superpowers/plans/2026-05-13-host-app-only-official-bootstrap.md`
- Create: `docs/task/FEAT-069.md`
- Create: `docs/plan/PLAN-294.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] **Step 1: Save the approved design spec**

  Write the approved no-built-in-soul design to `docs/superpowers/specs/2026-05-13-host-app-only-official-bootstrap-design.md`.

- [x] **Step 2: Save this implementation plan**

  Write this task-by-task plan to `docs/superpowers/plans/2026-05-13-host-app-only-official-bootstrap.md`.

- [x] **Step 3: Create and claim PMA tracking**

  Add `docs/task/FEAT-069.md` with `status: in_progress`, owner `codex`, and acceptance criteria matching the spec. Add `docs/plan/PLAN-294.md` with `status: implementing`, link it to FEAT-069, and append both index entries as `[-]`.

### Task 2: Make Core Catalog App-Only

**Files:**
- Modify: `packages/core/src/soul-app/registry.ts`
- Modify: `packages/core/src/soul-app/registry.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/vertical-soul.ts`
- Modify: `packages/shared/src/vertical-soul.test.ts`
- Modify: `packages/shared/src/soul-workbench.test.ts`

- [x] **Step 1: Write failing catalog tests**

  Add tests that install no apps and assert `listHostSoulCatalog().souls` and `templates` are empty, `findHostSoul('hr')` is undefined, and a disabled installed app is projected as `coming_soon` but does not contribute templates.

- [x] **Step 2: Remove runtime built-in fallback**

  Update `registry.ts` to remove `BUILTIN_VERTICAL_SOULS`, `BUILTIN_CAPABILITY_TEMPLATES`, `findVerticalSoul` and `findCapabilityTemplate` imports. Return only app-projected souls and enabled app templates from `listHostSoulCatalog()`.

- [x] **Step 3: De-publicize built-in business catalog**

  Keep vertical Soul schemas and types, but stop exporting `BUILTIN_VERTICAL_SOULS`, `BUILTIN_CAPABILITY_TEMPLATES` and finder helpers through `packages/shared/src/index.ts` if they are no longer required by runtime consumers. Adjust tests to treat any remaining data as local fixture-only behavior.

- [x] **Step 4: Run focused tests**

  Run:

  ```bash
  bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
  bun run --filter '@zonease/aiworker-shared' test src/vertical-soul.test.ts src/soul-workbench.test.ts
  ```

  Expected: the new app-only assertions pass, with no built-in catalog fallback.

### Task 3: Add Official App Bootstrap

**Files:**
- Create: `packages/core/src/soul-app/official.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/soul-app/registry.test.ts`

- [x] **Step 1: Write official bootstrap tests**

  Add tests using a temporary worker DB that call the bootstrap helper and assert HR/QA are installed and enabled, a second call is idempotent, and a previously disabled HR app remains disabled.

- [x] **Step 2: Implement allowlist and bootstrap helper**

  Create an allowlist with `aiworker-hr` and `aiworker-qa` manifest paths. Implement `bootstrapOfficialSoulApps(context)` so it resolves paths from the repo root, installs missing apps, revalidates installed/error apps, enables non-disabled apps, and preserves disabled apps.

- [x] **Step 3: Export helper**

  Export the helper and result types from `packages/core/src/index.ts`.

- [x] **Step 4: Run focused tests**

  Run:

  ```bash
  bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
  ```

  Expected: official bootstrap tests pass and disabled preservation is covered.

### Task 4: Wire API Startup To Official Bootstrap

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [x] **Step 1: Add failing API startup coverage**

  Update local API tests so a fresh runtime snapshot exposes `aiworker-hr` and `aiworker-qa`, `POST /api/local/workers` rejects `soulId: "hr"`, and accepts `soulId: "aiworker-hr"`.

- [x] **Step 2: Add disabled preservation coverage**

  In an isolated runtime test, disable `aiworker-hr`, reload/recreate the local daemon runtime, and assert HR remains unavailable for new workers until explicitly enabled again.

- [x] **Step 3: Call bootstrap during startup**

  Call `bootstrapOfficialSoulApps(...)` after DB/bootstrap initialization and before routes serve catalog-dependent data. Use existing connector context helpers so manifest validation semantics stay consistent.

- [x] **Step 4: Run API focused tests**

  Run:

  ```bash
  bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
  ```

  Expected: startup bootstrap and disabled preservation pass.

### Task 5: Update CLI Lifecycle

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`

- [x] **Step 1: Add CLI tests**

  Add tests for `aiworker app bootstrap official`, idempotent output, and legacy `worker create --soul hr` failure when only app-only catalog exists.

- [x] **Step 2: Implement command**

  Add `app bootstrap official` under the existing app command group. The command calls `bootstrapOfficialSoulApps(...)` and prints each official app outcome with lifecycle status and health.

- [x] **Step 3: Update command copy**

  Replace copy that says `soul list` lists built-in vertical Souls with copy that says it lists installed/enabled app-projected Souls. Ensure `app list/show/install/enable/disable/doctor` copy remains lifecycle-based.

- [x] **Step 4: Run CLI focused tests**

  Run:

  ```bash
  bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
  ```

  Expected: official bootstrap command passes and legacy built-in assumptions are gone.

### Task 6: Update Web And Remaining Runtime Assumptions

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `apps/web/src/features/local-workspace/api/workspace-data.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Search-only: `apps`, `packages`, `docs` for legacy built-in catalog assumptions.

- [x] **Step 1: Replace Web mock catalog IDs**

  Change Web mock data and assertions from legacy `hr`/`qa` built-ins to app-projected `aiworker-hr`/`aiworker-qa` where the UI is exercising available Souls.

- [x] **Step 2: Preserve empty-state behavior**

  Ensure Worker Web renders a usable empty state when `souls` is empty and does not assume `pm/devops` are present.

- [x] **Step 3: Search and update remaining assumptions**

  Run `rg -n "built-in|BUILTIN_VERTICAL_SOULS|BUILTIN_CAPABILITY_TEMPLATES|soulId: 'hr'|soulId === 'hr'|--soul hr|devops|pm" apps packages docs/task docs/plan docs/changelog.md` and update only runtime/test assumptions affected by this feature.

- [x] **Step 4: Run Web focused tests**

  Run:

  ```bash
  bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
  ```

  Expected: focused Worker Web tests pass with app-projected catalog IDs.

### Task 7: Record, Verify, And Close

**Files:**
- Modify: `docs/task/FEAT-069.md`
- Modify: `docs/plan/PLAN-294.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused app validation**

  Run:

  ```bash
  bun apps/cli/src/aiworker.ts app bootstrap official
  bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr
  bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa
  bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr
  bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa
  ```

  Expected: all commands exit 0 and official bootstrap reports HR/QA lifecycle state.

- [x] **Step 2: Run root gates**

  Run:

  ```bash
  bun run typecheck
  bun run lint
  bun run test
  bun run build
  git diff --check
  bun run crg:update
  bun run crg:review
  ```

  Expected: all commands exit 0, except known non-fatal Web chunk-size warnings may remain in build output.

- [x] **Step 3: Complete PMA tracking**

  Mark FEAT-069 and PLAN-294 completed, append changelog results, and include residual risks such as legacy persisted workers with old Soul IDs.

- [ ] **Step 4: Commit**

  Commit the completed slice with a Chinese Conventional Commit message:

  ```bash
  git add docs/superpowers/specs/2026-05-13-host-app-only-official-bootstrap-design.md docs/superpowers/plans/2026-05-13-host-app-only-official-bootstrap.md docs/task/FEAT-069.md docs/plan/PLAN-294.md docs/task/index.md docs/plan/index.md docs/changelog.md packages/core/src/soul-app packages/core/src/index.ts packages/shared/src apps/api/src/modes apps/cli/src apps/web/src
  git commit -m "feat: 移除 Host 内置 Soul 并引入官方 App bootstrap"
  ```
