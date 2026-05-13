# Host Bounded Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host a first-class shared runtime boundary while keeping API, CLI and Web as adapters.

**Architecture:** Add a focused Host facade under `packages/core/src/host/runtime.ts`. The facade composes existing Soul App registry, official app bootstrap, worker storage and local runtime primitives, then API/CLI delegate Host decisions to it.

**Tech Stack:** Bun workspaces, TypeScript, `bun:test`, Hono API adapter, local worker SQLite storage.

---

### Task 1: Tracking And Design Records

**Files:**
- Create: `docs/task/REFACTOR-077.md`
- Create: `docs/plan/PLAN-298.md`
- Create: `docs/superpowers/specs/2026-05-13-host-bounded-context-design.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] Create and claim the PMA task and plan.
- [x] Record the Host bounded context design.

### Task 2: Host Contract Tests

**Files:**
- Create: `packages/core/src/host/runtime.test.ts`

- [x] Add a failing test that bootstraps official apps through the Host facade, rejects legacy `hr`, creates an `aiworker-hr` worker and rejects duplicate worker ids.
- [x] Add a failing test that validates a worker-owned capability template and enriches session metadata with app-scoped Soul metadata.
- [x] Run `bun run --filter '@zonease/aiworker-core' test` and confirm the new tests fail because the Host facade does not exist yet.

### Task 3: Host Runtime Facade

**Files:**
- Create: `packages/core/src/host/runtime.ts`
- Modify: `packages/core/src/index.ts`

- [x] Implement `createHostRuntime` and `HostRuntime` methods for app lifecycle, official bootstrap, catalog lookup, worker creation, runtime creation, template validation and metadata enrichment.
- [x] Export the Host facade from `@zonease/aiworker-core`.
- [x] Run `bun run --filter '@zonease/aiworker-core' test` and confirm the Host contract tests pass.

### Task 4: API Adapter Refactor

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Test: `apps/api/src/modes/worker.local.test.ts`

- [x] Add the Host facade to `LocalDaemonState`.
- [x] Delegate app lifecycle, official bootstrap, worker creation, runtime creation, soul/template lookup and metadata enrichment to the Host facade.
- [x] Run `bun run --filter '@zonease/aiworker-api' test`.

### Task 5: CLI Adapter Refactor

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Test: `apps/cli/src/aiworker.test.ts`

- [x] Add a local Host facade factory after DB initialization.
- [x] Delegate app lifecycle, official bootstrap, worker creation, runtime creation, soul/template lookup and metadata enrichment to the Host facade.
- [x] Run `bun run --filter '@zonease/aiworker-cli' test`.

### Task 6: Verification And Closure

**Files:**
- Modify: `docs/changelog.md`
- Modify: `docs/task/REFACTOR-077.md`
- Modify: `docs/plan/PLAN-298.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/superpowers/plans/2026-05-13-host-bounded-context.md`

- [x] Run focused core/API/CLI typechecks and tests.
- [x] Run root `lint`, `test`, `build`, mounted surface smoke, diff check and code-review-graph.
- [x] Mark PMA and Superpowers records completed.
- [x] Commit with a Chinese conventional commit message.
