# App-Owned Search Index Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Soul Apps push non-authoritative searchable descriptors into a
Host broker while keeping domain meaning inside each app.

**Architecture:** `packages/shared` expands the permission vocabulary with
`search`. `packages/core` adds an app-scoped search index broker guarded by
manifest permissions. `apps/api` exposes public broker routes, and
`packages/soul-app-sdk` adds helpers for app authors.

**Tech Stack:** Bun workspaces, TypeScript, Hono local daemon, Soul App SDK,
bun:test, PMA docs, code-review-graph.

---

## Scope Check

This plan implements `docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md` stage FEAT-079.

Do not add full-text search, embeddings, global search UI, persistence migration
or HR/QA-specific result interpretation.

## File Structure

- Create `docs/task/FEAT-079.md`
- Create `docs/plan/PLAN-311.md`
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
- Modify `docs/architecture.md`, `docs/soul-app-developer.md`
- Modify `packages/shared/src/soul-app/manifest.ts`, `packages/shared/src/soul-app/manifest.test.ts`
- Create `packages/core/src/soul-app/search-index.ts`
- Modify `packages/core/src/soul-app/broker.ts`, `packages/core/src/soul-app/broker.test.ts`
- Modify `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`
- Modify `packages/soul-app-sdk/src/index.ts`, `packages/soul-app-sdk/src/index.test.ts`

### Task 1: PMA And Plan Tracking

- [x] Create FEAT-079 and PLAN-311 records.
- [x] Append index entries as in progress.
- [x] Add top changelog entry.
- [x] Record this implementation plan.

### Task 2: Permission Contract

- [x] Add failing shared tests for `search:read/write:<appId>` manifest permissions and descriptor `requiredPermissions`.
- [x] Extend shared permission kind and required permission regex.
- [x] Re-run focused shared test.

### Task 3: Core Broker

- [x] Add failing core broker test for search index upsert/query and permission denial.
- [x] Implement app-scoped in-memory search index records with non-authoritative metadata.
- [x] Wire `broker.search.upsert()` and `broker.search.query()` behind `search` permissions.
- [x] Re-run focused core test.

### Task 4: API And SDK

- [x] Add failing API assertions for broker search upsert/query.
- [x] Add local daemon routes and SDK helpers.
- [x] Re-run API and SDK focused tests.

### Task 5: Docs And Closeout

- [x] Update architecture and Soul App developer docs.
- [x] Run focused typechecks for shared/core/API/SDK.
- [x] Run lint, diff check, CRG update/review.
- [x] Mark FEAT-079 / PLAN-311 completed and commit with `feat: 增加 Soul App search index broker`.

## Result

Completed. Soul Apps can now publish non-authoritative search descriptors
through Host broker routes while retaining domain result meaning.
