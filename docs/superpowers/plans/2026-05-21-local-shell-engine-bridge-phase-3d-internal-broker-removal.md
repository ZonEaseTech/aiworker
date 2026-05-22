# Local Shell Engine Bridge Phase 3D Internal Broker Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining internal Host broker permission kernel while preserving declared app-owned mounted action, search and surface routing.

**Architecture:** Host remains a local shell, locator, mounter and engine bridge. `requiredPermissions` may remain manifest metadata, but Host no longer interprets it as an authorization gate before calling a declared mounted Soul App surface.

**Tech Stack:** Bun workspaces, TypeScript, Hono daemon API, core/shared package tests.

---

## Task 1: API Behavior Becomes Declaration-Based

**Files:**
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `apps/api/src/modes/worker.ts`

- [x] **Step 1: Write failing API test**

Update the existing permission-denial regression so it expects declared
action/search descriptors with mismatched `requiredPermissions` to reach the
mounted service. The test should prove Host only requires app existence,
enabled status and descriptor declaration.

- [x] **Step 2: Verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: the updated test fails while the old broker decision code still
returns `403`.

- [x] **Step 3: Remove API broker decision helpers**

Remove `createSoulAppBroker` import and delete the helper path that parses and
decides descriptor permissions. Keep scope parsing only as mounted context data.
Mounted surfaces should return declared mount payloads without a broker
permission decision.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
```

Expected: both pass.

## Task 2: Delete Core And Shared Broker Modules

**Files:**
- Delete: `packages/core/src/soul-app/broker.ts`
- Delete: `packages/core/src/soul-app/broker.test.ts`
- Delete: `packages/core/src/soul-app/provider-registry.ts`
- Modify: `packages/core/src/index.ts`
- Delete: `packages/shared/src/soul-app/provider.ts`
- Delete: `packages/shared/src/soul-app/provider.test.ts`
- Modify: `packages/shared/src/soul-app/index.ts`
- Modify: `packages/shared/src/index.ts`

- [x] **Step 1: Remove core broker exports and files**

Delete the old core broker/provider registry implementation and remove the
public barrel export.

- [x] **Step 2: Remove shared broker provider schema**

Delete the shared provider registry schema and its barrel exports after
confirming no live code consumes it.

- [x] **Step 3: Verify packages**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-core' typecheck
bun run --filter '@zonease/aiworker-shared' test
bun run --filter '@zonease/aiworker-shared' typecheck
```

Expected: all pass.

## Task 3: Closeout

**Files:**
- Modify: `docs/task/REFACTOR-086.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-394.md`
- Modify: `docs/plan/index.md`
- Modify: this plan

- [x] **Step 1: Run final gates**

Run:

```bash
bun run docs:check
git diff --check
bun run crg:update
bun run crg:review
```

- [x] **Step 2: Mark tracking complete**

Record verification, mark REFACTOR-086/PLAN-394 complete, and check off this
implementation plan.

- [x] **Step 3: Commit**

Commit with:

```bash
git commit -m "refactor: 移除内部 broker 权限内核"
```
