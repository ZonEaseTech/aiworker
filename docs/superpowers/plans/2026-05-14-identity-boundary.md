# Identity Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move local bearer auth behind a Host auth provider interface and pass
operator identity to Soul Apps through signed mount context and broker scope.

**Architecture:** `packages/core` owns the auth provider contract and local
bearer implementation. `apps/api` uses the provider for `/api/local/*`
middleware and stores the authenticated identity for downstream broker/mount
context projection. Mounted Soul Apps receive identity as signed context only.

**Tech Stack:** Bun workspaces, TypeScript, Hono local daemon, HMAC mount
context, bun:test, PMA docs, code-review-graph.

---

## Scope Check

This plan implements `docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md` stage FEAT-078.

Do not add Logto SDKs, user DB tables, tenant modeling or RBAC UI in this plan.

## File Structure

- Create `docs/task/FEAT-078.md`
- Create `docs/plan/PLAN-310.md`
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
- Modify `docs/architecture.md`, `docs/soul-app-developer.md`
- Create `packages/core/src/host/identity-provider.ts`
- Create `packages/core/src/host/identity-provider.test.ts`
- Modify `packages/core/src/index.ts`
- Modify `apps/api/src/modes/worker.ts`
- Modify `apps/api/src/modes/worker.local.test.ts`

### Task 1: PMA And Plan Tracking

- [x] Create FEAT-078 and PLAN-310 records.
- [x] Append index entries as in progress.
- [x] Add top changelog entry.
- [x] Record this implementation plan.

### Task 2: Core Auth Provider

- [x] Add a failing core test for local bearer auth success, deny and anonymous-open behavior.
- [x] Implement Host identity types, auth provider interface and `createLocalBearerAuthProvider()`.
- [x] Export the provider contract from core.
- [x] Re-run focused core test.

### Task 3: API Identity Integration

- [x] Add failing API assertions for authenticated identity in broker scope and signed mount context.
- [x] Replace inline token comparison with the core local bearer auth provider.
- [x] Store request identity for downstream helpers.
- [x] Prefer authenticated identity over query-provided `operatorId`.
- [x] Re-run focused API test.

### Task 4: Docs And Closeout

- [x] Update architecture and Soul App developer docs.
- [x] Run focused core/API typechecks.
- [x] Run lint, diff check, CRG update/review.
- [x] Mark FEAT-078 / PLAN-310 completed and commit with `feat: 增加 Host identity provider boundary`.

## Result

Completed. Host authentication now has a provider boundary, and mounted Soul
Apps receive authenticated local identity through signed context plus broker
scope instead of raw caller auth headers.
