# Worker Web Soul App First-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Worker Web first-run start from enabled Soul Apps instead of an unexplained empty worker state.

**Architecture:** Keep backend APIs and route model unchanged. Add first-run presentation and interaction logic inside Worker Studio, reuse existing worker creation APIs, and collapse technical Soul App diagnostics behind a disclosure.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Worker Web local daemon APIs.

---

### Task 1: PMA And Design Records

**Files:**
- Create: `docs/task/REFACTOR-078.md`
- Create: `docs/plan/PLAN-299.md`
- Create: `docs/superpowers/specs/2026-05-13-worker-web-soul-app-first-run-design.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] Create and claim PMA task and plan.
- [x] Record the approved Soul App first-run design.

### Task 2: First-Run Tests

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] Add failing tests for no-worker home copy, HR/QA app cards, hidden developer diagnostics and HR start action opening worker creation.
- [x] Run `bun run --filter '@zonease/aiworker-web' test` and confirm the new tests fail before implementation.

### Task 3: Worker Studio First-Run UI

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/features/i18n/locales/en.ts`
- Modify: `apps/web/src/features/i18n/locales/zh-CN.ts`
- Modify: `apps/web/src/features/i18n/locales/ja.ts`
- Modify: `apps/web/src/styles/rail.css`
- Modify: `apps/web/src/styles/workspace.css`

- [x] Render Soul App first-run cards in the home surface when there are no workers.
- [x] Wire start card actions to the existing create-worker dialog with the chosen Soul preselected.
- [x] Collapse technical Soul App rail details behind `Developer details`.
- [x] Keep existing worker, workspace and session routes unchanged.

### Task 4: Verification And Closure

**Files:**
- Modify: `docs/changelog.md`
- Modify: `docs/task/REFACTOR-078.md`
- Modify: `docs/plan/PLAN-299.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/superpowers/plans/2026-05-13-worker-web-soul-app-first-run.md`

- [x] Run focused Worker Web test/typecheck/build.
- [x] Run root lint/test/build, mounted surface smoke, browser smoke, diff check and code-review-graph.
- [x] Mark records completed and commit.
