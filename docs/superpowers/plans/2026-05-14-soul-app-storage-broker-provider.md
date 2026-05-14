# Soul App Storage Broker Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host storage a provider-backed broker capability and prove HR/QA create actions can persist app-owned draft records through the public broker path.

**Architecture:** `packages/core` exposes a `SoulAppStorageProvider` interface with a SQLite default provider. `createSoulAppBroker` uses that provider instead of direct storage calls. Host forwards action scope into signed mount context, and HR/QA mounted services use the SDK broker client to write draft records when Host context is available.

**Tech Stack:** Bun workspaces, TypeScript, Hono local daemon, Soul App SDK, mounted service context headers, SQLite-backed Host metadata, bun:test, PMA docs, code-review-graph.

---

## Scope Check

This plan implements `docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md` stage FEAT-075.

Do not add real S3, GCP, Logto, vault or connector marketplace code in this plan.
Do not make Host understand HR people profile fields or QA release gate fields.

## File Structure

- Create `docs/task/FEAT-075.md`
  - PMA task for this implementation.
- Create `docs/plan/PLAN-307.md`
  - PMA plan record.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
  - Track and close this work.
- Modify `docs/architecture.md`, `docs/soul-app-developer.md`
  - Document storage provider boundary and app-owned broker content.
- Create `packages/core/src/soul-app/storage-provider.ts`
  - Define provider interface and default SQLite implementation.
- Modify `packages/core/src/soul-app/broker.ts`, `packages/core/src/index.ts`
  - Use provider-backed storage and export provider types.
- Modify `packages/core/src/soul-app/broker.test.ts`
  - Verify broker can use an injected storage provider.
- Modify `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`
  - Forward action request `scope` into permission checks and signed mount context.
- Modify `packages/soul-app-sdk/src/index.ts`, `packages/soul-app-sdk/src/index.test.ts`
  - Add typed broker storage response helpers only if current client typing blocks app code.
- Modify `apps/aiworker-hr/src/host-mounted.ts`, `apps/aiworker-qa/src/host-mounted.ts`
  - Persist app-owned draft records through SDK broker storage when Host context is present.
- Modify `apps/aiworker-hr/src/index.test.ts`, `apps/aiworker-qa/src/index.test.ts`
  - Verify mounted create actions call the Host broker storage route when Host context headers exist.
- Modify `apps/web/src/features/local-workspace/api/workspace-data.ts`, `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Send action scope as `scope`, not app-owned `input`, so Host can enforce scope before forwarding.

### Task 1: PMA And Contract Tracking

- [ ] Create `docs/task/FEAT-075.md` with status `in_progress`, P0 priority, goals, non-goals and verification section.
- [ ] Create `docs/plan/PLAN-307.md` with decision, slices and verification plan.
- [ ] Append `FEAT-075` and `PLAN-307` to their indexes as in progress.
- [ ] Add a top changelog entry for FEAT-075.
- [ ] Add the storage provider rule to architecture and Soul App developer docs:
  `Host storage broker providers own app-scoped namespaces and access control; Soul Apps own stored value semantics.`

### Task 2: Storage Provider Interface

- [ ] Create `packages/core/src/soul-app/storage-provider.ts` with `SoulAppStorageProvider`, `SoulAppStoragePutInput` and `createSqliteSoulAppStorageProvider`.
- [ ] Update `packages/core/src/soul-app/broker.ts` so `SoulAppBrokerContext` accepts `storageProvider?: SoulAppStorageProvider`.
- [ ] Replace direct `get/list/upsertSoulAppStorageRecord` calls in broker storage methods with the resolved provider.
- [ ] Export provider types from `packages/core/src/index.ts`.
- [ ] Add a broker test that injects an in-memory fake provider and verifies `put/get/list` go through it after permission and scope checks.

### Task 3: Action Scope Forwarding

- [ ] Update the local action API to parse body `{ input?: Record<string, unknown>, scope?: { operatorId?: string, workerId?: string, workspaceId?: string, sessionId?: string } }`.
- [ ] Use request `scope` when checking descriptor permissions.
- [ ] Include request `scope` in `x-aiworker-mount-context`.
- [ ] Keep query params as fallback for backward compatibility with existing direct API callers.
- [ ] Add an API test that sends action `scope`, decodes mounted context in the fake mounted service, and verifies worker/workspace/session ids arrive there.

### Task 4: HR/QA Draft Persistence Through Broker

- [ ] Extend HR/QA `MountContext` with `hostUrl`, `operatorId`, `workerId`, `workspaceId` and `sessionId`.
- [ ] When `peopleProfiles.create` runs with Host context, call `createSoulAppClient({ appId, baseUrl: hostUrl }).broker.storage.put('drafts/people-profile', value, scope)`.
- [ ] When `releaseGates.create` runs with Host context, call the analogous QA broker storage key `drafts/release-gate`.
- [ ] Keep direct mounted-service tests passing when Host context is absent by returning the existing action result without broker writes.
- [ ] Add HR/QA tests with a fake Host server to verify the expected broker storage path, body and scope query are used.

### Task 5: Web Scope Payload

- [ ] Change `invokeSoulAppAction` to send `{ input, scope }`.
- [ ] Change `runShellAction` to pass selected worker/workspace/session ids as `scope`.
- [ ] Update the Worker Web test to assert the action body contains `scope.workerId` and no longer puts Host scope inside app `input`.

### Task 6: Verification And Closeout

- [ ] Run focused tests:
  - `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
  - `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
  - `bun run --filter '@zonease/aiworker-hr' test`
  - `bun run --filter '@zonease/aiworker-qa' test`
  - `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [ ] Run focused typechecks:
  - `bun run --filter '@zonease/aiworker-core' typecheck`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-hr' typecheck`
  - `bun run --filter '@zonease/aiworker-qa' typecheck`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
- [ ] Run app validation:
  - `bun run --filter '@zonease/aiworker-hr' validate`
  - `bun run --filter '@zonease/aiworker-qa' validate`
- [ ] Run `bun run lint`, `git diff --check`, `bun run crg:update`, and `bun run crg:review`.
- [ ] Mark PMA docs completed, update changelog result, and commit with `feat: 接通 Soul App 存储 broker provider`.

## Result

Completed inline with `superpowers:executing-plans`. FEAT-075 / PLAN-307 was
implemented and verified. The code changes keep Host as the storage capability
provider and Soul Apps as owners of stored value semantics.
