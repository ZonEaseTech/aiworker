# Soul App / Host Hybrid Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge Soul Apps into real app-level standalone products and complete Host mounted interaction through a scoped protocol boundary.

**Architecture:** HR and QA move to `apps/*` and own their manifests, app scripts and protocol entrypoints. Standalone mode embeds the public local runtime; mounted mode uses Host discovery, launch/connect, scoped context and brokered shared capabilities.

**Tech Stack:** Bun workspaces, TypeScript, Hono/OpenAPIHono local daemon, Vite/React where UI smoke is needed, zod manifest validation, SQLite worker metadata, bun:test, ESLint.

---

## File Structure

- Create `apps/aiworker-hr/` and `apps/aiworker-qa/` as runnable Soul App workspaces.
- Modify `packages/soul-app-sdk/src/index.ts` so app-origin runtime identity uses `manifest.id`.
- Modify `apps/cli/src/aiworker.ts` so scaffold, validate and smoke work against app-owned manifests and mounted service metadata.
- Modify `apps/api/src/modes/worker.ts` so Host can proxy mounted app API calls to enabled local app services and broker contexts are scoped.
- Modify `packages/core/src/soul-app/broker.ts` so Host write paths validate scope ownership.
- Modify `eslint.config.ts` to enforce Soul App import boundaries.
- Update `docs/task/FEAT-066.md`, `docs/plan/PLAN-291.md`, `docs/changelog.md`, and developer docs.

## Tasks

### Task 1: Record PMA tracking and design

- [x] **Step 1: Add design spec**

Create `docs/superpowers/specs/2026-05-13-soul-app-host-hybrid-autonomy-design.md` with the hybrid autonomy decision, B/C scope, non-goals and acceptance criteria.

- [x] **Step 2: Add implementation plan**

Create this plan file at `docs/superpowers/plans/2026-05-13-soul-app-host-hybrid-autonomy.md`.

- [x] **Step 3: Add PMA task and plan**

Create `docs/task/FEAT-066.md` and `docs/plan/PLAN-291.md`, append both indexes, and mark them in progress because the user approved goal-mode execution.

### Task 2: Move reference Soul Apps to app workspaces

- [x] **Step 1: Create app-owned files**

Move HR and QA app package files from `packages/aiworker-hr` and `packages/aiworker-qa` to `apps/aiworker-hr` and `apps/aiworker-qa`. Add app-owned `soul-app.manifest.json`, `src/standalone.ts`, `src/host-mounted.ts`, `schemas/`, `capabilities/`, `review/`, `packs/`, and keep `src/index.ts` as the shared app definition.

- [x] **Step 2: Update package scripts**

Each app `package.json` must expose `dev`, `build`, `serve`, `validate`, `smoke`, `typecheck`, and `test`.

- [x] **Step 3: Run focused app checks**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' typecheck
bun run --filter '@zonease/aiworker-qa' test
```

Expected: all commands exit 0.

### Task 3: Fix identity and validation contracts

- [x] **Step 1: Add failing identity coverage**

Update SDK tests to assert standalone and mounted app-origin workers use `manifest.id` as `worker.soulId`, catalog Soul id and template Soul id.

- [x] **Step 2: Fix runtime identity**

Update SDK runtime bootstrap to set `worker.soulId = app.manifest.id` and keep `manifest.soul.id` as domain metadata only.

- [x] **Step 3: Update CLI validate/smoke**

Make `aiworker app validate <path>` require app-owned files declared by the manifest. Make HR/QA app paths pass and fixture-only package paths fail clearly.

- [x] **Step 4: Run focused checks**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test
bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr
bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa
bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr
bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa
```

Expected: SDK test exits 0 and all four CLI commands report pass.

### Task 4: Enforce import isolation

- [x] **Step 1: Add lint rules**

Update `eslint.config.ts` so `apps/aiworker-*` cannot import other `apps/aiworker-*`, Host apps, `packages/core`, or `packages/storage-sqlite`; Host packages cannot import `apps/aiworker-*/src/*`.

- [x] **Step 2: Add focused tests or static fixture checks**

Extend CLI validation or lint coverage with one negative case that imports a Host-private module and one negative case that imports another Soul App.

- [x] **Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: exits 0 for the repository and fails in the negative validation fixture.

### Task 5: Complete Host mounted API interaction

- [x] **Step 1: Extend manifest-mounted runtime metadata**

Add host-mounted service metadata that can express a local service URL, health route and API base route without requiring Host source imports.

- [x] **Step 2: Implement launch/connect or proxy path**

Update local daemon app routes so enabled apps with a healthy mounted service proxy scoped API calls instead of returning `SOUL_APP_API_NOT_LOADED`.

- [x] **Step 3: Add mounted service smoke**

HR and QA `serve` commands must expose a health route, a basic app API route, and a broker client call path.

- [x] **Step 4: Run API focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: mounted app API proxy tests pass.

### Task 6: Harden broker scope validation

- [x] **Step 1: Add failing broker tests**

Add tests proving broker review/memory/storage writes reject context where worker/workspace/session do not belong together or do not belong to the enabled app worker.

- [x] **Step 2: Implement scope resolver**

Use Host metadata lookup before broker writes. Allow app-local storage without workspace scope, but validate workspace/session/worker when those ids are supplied.

- [x] **Step 3: Run core broker tests**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts
```

Expected: broker tests pass, including mismatch denial cases.

### Task 7: Update Web and docs surface

- [x] **Step 1: Surface app-level mounted status**

Update Worker Web types and rail/workbench status copy to distinguish installed manifest, standalone app, and mounted service health.

- [x] **Step 2: Update developer docs**

Refresh `docs/soul-app-developer.md` to describe app directory layout, standalone runtime, Host mounted service, broker-only shared calls and lint boundaries.

- [x] **Step 3: Run Web focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: focused Web tests pass.

### Task 8: Full verification and record

- [x] **Step 1: Run root gates**

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

Expected: commands exit 0 or the failure is recorded with exact blocker evidence.

- [x] **Step 2: Complete PMA status**

Mark FEAT-066 and PLAN-291 completed only after verification is done. Add changelog entry with commands and residual risks.
