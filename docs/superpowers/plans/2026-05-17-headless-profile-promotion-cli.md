# Headless Profile Promotion CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe headless `aiworker profile promote` path that reuses shared accepted-profile README draft validation.

**Architecture:** Keep profile meaning in the Soul App while moving generic fenced README extraction and proposal-state rejection into `@zonease/aiworker-shared`. CLI, Web, and runtime all call the same helper before promotion writes `README.md`.

**Tech Stack:** Bun, TypeScript, PMA docs, `@zonease/aiworker-shared`, `@zonease/aiworker-core`, CLI tests, Vitest/Web tests.

---

### Task 1: Shared Profile Promotion Helper

**Files:**
- Create: `packages/shared/src/profile-promotion.ts`
- Create: `packages/shared/src/profile-promotion.test.ts`
- Modify: `packages/shared/src/index.ts`

- [x] **Step 1: Write failing shared tests**

Run: `bun run --filter '@zonease/aiworker-shared' test src/profile-promotion.test.ts`

Expected: FAIL because `prepareProfileMarkdownForPromotion` does not exist.

- [x] **Step 2: Implement shared helper**

Add functions to extract `aiworker-profile-readme` fences, reject empty drafts,
reject proposal-state phrases, and prepare markdown with `requireFencedDraft`.

- [x] **Step 3: Export helper and verify green**

Run: `bun run --filter '@zonease/aiworker-shared' test src/profile-promotion.test.ts`

Expected: PASS.

### Task 2: Runtime And Web Integration

**Files:**
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Write failing runtime/Web tests**

Run runtime and Web focused tests and verify failures for missing shared behavior
where applicable.

- [x] **Step 2: Use shared helper**

Runtime validates the final markdown before `README.md` writes. Worker Web
reuses the shared extractor instead of a local parser.

- [x] **Step 3: Verify green**

Run focused runtime and Web tests.

### Task 3: CLI `profile promote`

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`
- Modify: `docs/cli.md`

- [x] **Step 1: Write failing CLI tests**

Cover successful fenced artifact promotion, missing fence rejection, pending
state rejection, and explicit `--profile-markdown` promotion.

- [x] **Step 2: Implement command**

Add `profile promote` command with `--worker`, `--workspace`, `--artifact`,
`--verdict`, `--profile-markdown`, `--finding`, `--risk`, and `--tag`.

- [x] **Step 3: Verify green**

Run: `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`

Expected: PASS.

### Task 4: Debug And Closeout

**Files:**
- Modify: `docs/task/TODO-046.md`
- Modify: `docs/plan/PLAN-347.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run isolated debug rounds**

Use an isolated `AIWORKER_HOME` and source CLI to verify success, missing fence
rejection, pending-state rejection, and explicit markdown promotion.

- [x] **Step 2: Run final gates**

Run focused tests, typechecks, lint, `git diff --check`, `crg:update`, and
`crg:review`.

- [x] **Step 3: Complete PMA and commit**

Mark TODO/PLAN complete, update changelog, commit with a Chinese conventional
commit message.
