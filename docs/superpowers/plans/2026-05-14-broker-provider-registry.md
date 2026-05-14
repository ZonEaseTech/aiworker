# Broker Provider Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host broker providers enumerable through a typed registry so Soul
Apps and operators can see which platform capabilities are local, configured,
enabled or future-planned without importing Host internals.

**Architecture:** `packages/shared` owns the public provider registry schema.
`packages/core` projects provider metadata from Host defaults plus connector
settings. `apps/api` exposes the registry through the existing app-scoped broker
surface. `packages/soul-app-sdk` adds a public helper to read the registry.

**Tech Stack:** Bun workspaces, TypeScript, Zod, Hono local daemon, Soul App SDK,
bun:test, PMA docs, code-review-graph.

---

## Scope Check

This plan implements `docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md` stage FEAT-077.

Do not add cloud SDKs, real vault integration, new DB tables or app-specific
provider branches in this plan.

## File Structure

- Create `docs/task/FEAT-077.md`
  - PMA task for provider registry.
- Create `docs/plan/PLAN-309.md`
  - PMA plan record.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
  - Track and close FEAT-077.
- Modify `docs/architecture.md`, `docs/soul-app-developer.md`
  - Document provider registry as Host-owned platform metadata.
- Create `packages/shared/src/soul-app/provider.ts`
  - Public provider registry schema/type.
- Create `packages/shared/src/soul-app/provider.test.ts`
  - Shape and no-secret metadata tests.
- Modify `packages/shared/src/soul-app/index.ts`, `packages/shared/src/index.ts`
  - Export provider registry contract.
- Create `packages/core/src/soul-app/provider-registry.ts`
  - Pure projection for storage, connector, audit and secret providers.
- Modify `packages/core/src/soul-app/broker.ts`
  - Expose `broker.providers.list()`.
- Modify `packages/core/src/soul-app/broker.test.ts`
  - Verify local/future providers and connector settings projection.
- Modify `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`
  - Add app-scoped provider registry route and OpenAPI path.
- Modify `packages/soul-app-sdk/src/index.ts`, `packages/soul-app-sdk/src/index.test.ts`
  - Add `client.broker.providers.list()`.

### Task 1: PMA And Plan Tracking

- [x] Create FEAT-077 and PLAN-309 records.
- [x] Append index entries as in progress.
- [x] Add top changelog entry.
- [x] Record this implementation plan.

### Task 2: Shared Provider Registry Contract

- [x] Add a failing shared test for provider registry shape and secret-safe metadata.
- [x] Implement shared zod schemas and exported types for provider kind/status/descriptor/registry.
- [x] Export the contract from shared soul-app and package indexes.
- [x] Re-run focused shared test.

### Task 3: Core Registry Projection

- [x] Add a failing core broker test for storage/audit/secret/connector provider metadata.
- [x] Implement `listSoulAppBrokerProviders()` as a pure projection.
- [x] Wire connector settings into broker context and expose `broker.providers.list()`.
- [x] Re-run focused core test.

### Task 4: API And SDK Surface

- [x] Add a failing API assertion for `/api/local/apps/{appId}/broker/providers`.
- [x] Add local daemon route and OpenAPI registration.
- [x] Add SDK `client.broker.providers.list()`.
- [x] Re-run API and SDK focused tests.

### Task 5: Docs And Closeout

- [x] Update architecture and Soul App developer docs.
- [x] Run focused typechecks for shared/core/API/SDK.
- [x] Run lint, diff check, CRG update/review.
- [x] Mark FEAT-077 / PLAN-309 completed and commit with `feat: 增加 Soul App broker provider registry`.

## Result

Completed. Host broker providers are now visible through a typed, app-scoped
metadata registry without exposing raw credentials or adding cloud dependencies.
