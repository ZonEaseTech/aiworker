# Official Soul App Broker Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the official HR/QA Soul Apps prove Host broker search and security-review lifecycle gating through real code paths.

**Architecture:** Host keeps generic protocol, broker and security-review ownership. HR/QA declare search permissions and use SDK broker helpers to publish non-authoritative descriptors while keeping domain meaning inside the app. Worker Web Settings consumes Host security review before enablement.

**Tech Stack:** Bun workspaces, TypeScript, Hono local daemon, React Worker Web, Soul App SDK, bun:test, PMA docs, code-review-graph.

---

## Scope Check

This plan implements FEAT-080 / PLAN-312. It closes the official-app proof gap
found after FEAT-079. It does not add persistent search storage, full-text
ranking, a global search UI or a complete standalone app shell.

## File Structure

- Modify `docs/task/index.md` and `docs/plan/index.md` for PMA tracking.
- Modify `docs/changelog.md` for the progress record.
- Modify `apps/api/src/modes/worker.ts` and `apps/api/src/modes/worker.local.test.ts` for descriptor `search` permission parity.
- Modify `apps/aiworker-hr/soul-app.manifest.json`, `apps/aiworker-hr/src/host-mounted.ts`, and HR tests for broker-backed descriptors.
- Modify `apps/aiworker-qa/soul-app.manifest.json`, `apps/aiworker-qa/src/host-mounted.ts`, and QA tests for broker-backed descriptors.
- Modify `apps/web/src/features/settings/components/settings-dialog.tsx`, Web API helpers if needed, and Worker Web tests for security-review gating.

### Task 1: PMA And Plan Tracking

- [x] **Step 1: Create FEAT-080, PLAN-312, Superpowers spec and implementation plan.**

Create the task and plan files that describe the proof closure.

- [x] **Step 2: Append PMA index entries and changelog progress entry.**

Update `docs/task/index.md`, `docs/plan/index.md`, and `docs/changelog.md`.

### Task 2: API Permission Parser

- [x] **Step 1: Write a failing API regression test.**

Add a test case proving a mounted search descriptor with
`requiredPermissions: ['search:read:aiworker-hr']` is accepted and reaches the
mounted service when the manifest declares search read permission.

- [x] **Step 2: Run the API test and verify RED.**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: fail because `search` is rejected by the API descriptor parser.

- [x] **Step 3: Add `search` to the API permission-kind guard.**

Modify `apps/api/src/modes/worker.ts` so `isSoulAppPermissionKind()` accepts the
same permission kind vocabulary as the shared manifest schema.

- [x] **Step 4: Re-run the API test and verify GREEN.**

Run the same focused API test command and confirm it passes.

### Task 3: Official HR/QA Broker Search

- [x] **Step 1: Write failing HR and QA mounted tests.**

Add tests that run mounted actions with a broker context, assert the action
persists app-owned drafts, then query mounted search and observe broker-indexed
results.

- [x] **Step 2: Run HR/QA tests and verify RED.**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
```

Expected: fail because official apps do not declare/use search broker.

- [x] **Step 3: Add official search permissions and SDK broker writes.**

Update HR/QA manifests with `search:read/write:<appId>`. Update mounted action
handlers to upsert descriptor records through SDK broker search helpers when a
Host broker context is available. Update mounted search to query broker index
first and fallback to app-local descriptors when broker context is absent.

- [x] **Step 4: Re-run HR/QA tests and verify GREEN.**

Run the same HR/QA test commands and confirm they pass.

### Task 4: Worker Web Security Review Gate

- [x] **Step 1: Write a failing Web test.**

Add or extend Worker Web Settings tests so a disabled app with
`securityReview.canEnable=false` cannot invoke enable and surfaces review
issues.

- [x] **Step 2: Run Web tests and verify RED.**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: fail because Settings currently calls enable directly.

- [x] **Step 3: Consume security-review in Settings enable lifecycle.**

Use the app review already present in hosted app data or fetch
`/security-review` before enable. Disable/reject enable when `canEnable=false`
without adding app-specific approval logic.

- [x] **Step 4: Re-run Web tests and verify GREEN.**

Run the same Web test command and confirm it passes.

### Task 5: Validation And Closeout

- [x] **Step 1: Run Soul App validate and smoke.**

Run:

```bash
bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr
bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa
bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr
bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa
```

- [x] **Step 2: Run root gates.**

Run:

```bash
bun run check
bun run build
bun run test
```

- [x] **Step 3: Run code-review-graph.**

Run:

```bash
bun run crg:update
bun run crg:review
```

- [x] **Step 4: Complete PMA records and commit.**

Mark FEAT-080 and PLAN-312 completed, update changelog with verification
evidence, and commit with:

```bash
git commit -m "feat: 闭环官方 Soul App broker 证明"
```
