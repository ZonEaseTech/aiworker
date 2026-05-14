# Soul App Permission Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose manifest permissions, connector needs and descriptor `requiredPermissions` before a Soul App is enabled, then let Settings enable or disable apps through generic Host lifecycle actions.

**Architecture:** `packages/core` builds a Host-owned security review projection from the installed app manifest and registry context. `apps/api` exposes that projection before app code runs and returns it from lifecycle mutations. `apps/web` renders the review inside Settings and calls generic enable/disable endpoints without adding HR/QA-specific logic.

**Tech Stack:** Bun workspaces, TypeScript, Hono local daemon, React 19, Worker Web Settings, Vitest/bun:test, PMA docs, code-review-graph.

---

## Scope Check

This plan implements `docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md` stage FEAT-076.

Do not add connector marketplace, real cloud providers, Logto, S3, GCP or vault dependencies in this plan.
Do not make Host understand HR people profile fields or QA release gate fields.

## File Structure

- Create `docs/task/FEAT-076.md`
  - PMA task for this implementation.
- Create `docs/plan/PLAN-308.md`
  - PMA plan record.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
  - Track and close this work.
- Modify `docs/architecture.md`, `docs/soul-app-developer.md`
  - Document enablement review as Host-owned platform projection.
- Create `packages/core/src/soul-app/security-review.ts`
  - Build `SoulAppSecurityReview` from `HostedSoulApp` plus registry context.
- Modify `packages/core/src/host/runtime.ts`, `packages/core/src/index.ts`
  - Expose `reviewAppSecurity(appId)`.
- Modify `packages/core/src/soul-app/registry.test.ts`
  - TDD coverage for permissions, connectors and descriptor required permissions.
- Modify `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`
  - Add review route, lifecycle response review payloads and OpenAPI path.
- Modify `apps/web/src/features/local-workspace/api/types.ts`,
  `apps/web/src/features/local-workspace/api/workspace-data.ts`,
  `apps/web/src/features/local-workspace/api/index.ts`
  - Add review types and lifecycle helpers.
- Modify `apps/web/src/features/settings/components/settings-dialog.tsx`
  - Render review details and generic enable/disable actions.
- Modify `apps/web/src/features/i18n/types.ts`,
  `apps/web/src/features/i18n/locales/{en,zh-CN,ja,de}.ts`
  - Add localized Settings copy.
- Modify `apps/web/src/styles/settings.css`
  - Add compact review rows consistent with the existing Settings design.
- Modify `apps/web/src/worker/worker-studio.tsx`,
  `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Pass refresh callback into Settings and verify review + enable flow.

### Task 1: PMA And Plan Tracking

- [x] Create `docs/task/FEAT-076.md` with status `in_progress`, goals, non-goals and verification section.
- [x] Create `docs/plan/PLAN-308.md` with decision, slices and verification plan.
- [x] Append `FEAT-076` and `PLAN-308` to indexes as in progress.
- [x] Add a top changelog entry for FEAT-076.

### Task 2: Core Security Review Projection

- [x] Add a failing test in `packages/core/src/soul-app/registry.test.ts` that installs HR with available but disabled connectors and expects:
  - `manifestPermissions.length > 0`
  - required connector `ats` with `enabled: false`
  - descriptor permission `storage:write:aiworker-hr`
  - a missing connector warning
- [x] Run `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts` and verify the new test fails because `reviewSoulAppSecurity` does not exist.
- [x] Implement `packages/core/src/soul-app/security-review.ts` with a small pure projection:
  - copy manifest permissions;
  - map required/optional connectors with available/enabled flags;
  - collect shell action/search/settings and mounted surface `requiredPermissions`;
  - summarize counts and warnings.
- [x] Export the review builder from `packages/core/src/index.ts`.
- [x] Add `HostRuntime.reviewAppSecurity(appId)` that calls the builder with current registry context.
- [x] Re-run the focused core test and verify it passes.

### Task 3: Local Daemon Review API

- [x] Add a failing API test that calls `GET /api/local/apps/aiworker-hr/security-review` before enable and expects the generic review payload.
- [x] Run `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts` and verify the new test fails with missing route or missing payload.
- [x] Add `GET /api/local/apps/:appId/security-review` in `apps/api/src/modes/worker.ts`.
- [x] Include `{ review }` in enable/disable route responses.
- [x] Add `/api/local/apps/{appId}/security-review` to OpenAPI path registration.
- [x] Re-run the focused API test and verify it passes.

### Task 4: Worker Web Settings Review UI

- [x] Add a failing Worker Studio test that opens Settings -> Soul Apps, sees connector/permission/descriptor review rows for disabled QA, clicks the generic enable button, and verifies the enable endpoint plus refresh.
- [x] Run `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx` and verify the new expectations fail.
- [x] Add web types and API helpers for review, enable and disable.
- [x] Pass `onAppsChanged` from Worker Studio into SettingsDialog.
- [x] Render compact review sections inside each Soul App settings row:
  - permissions count and sample permissions;
  - required connector status;
  - descriptor required permission count;
  - lifecycle button.
- [x] Keep the UI generic and use existing Settings/Button primitives.
- [x] Re-run the focused Web test and verify it passes.

### Task 5: Documentation And Closeout

- [x] Update architecture and Soul App developer docs to name enablement security review as a Host-owned projection.
- [x] Run focused typechecks for core/API/Web.
- [x] Run lint, `git diff --check`, `bun run crg:update`, and `bun run crg:review`.
- [x] Mark FEAT-076 / PLAN-308 completed, update changelog result, and commit with `feat: 增加 Soul App 启用前权限 review`.

## Result

Completed. Host now exposes a generic Soul App security review before
enablement, Settings renders the review before generic enable/disable actions,
and the contract remains platform-owned without interpreting HR/QA domain data.
