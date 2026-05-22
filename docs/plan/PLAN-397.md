# PLAN-397 Official Soul App micro-app defaults

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: REFACTOR-089

## Current State

The active Host/Soul boundary says app-owned mounted UI/API should be exposed as
micro-app surfaces and app-owned mounted API paths. The official HR and QA apps
still preserve the old workbench protocol defaults:

- `ui.workbench` action/search/configuration descriptors in both manifests.
- `host-descriptor` panel/route surfaces in official manifests and shared
  fixtures.
- mounted service handlers for `/protocol/actions`, `/protocol/search` and
  `/protocol/capabilities`.

## Proposal

1. Update HR app tests and implementation so HR exposes only micro-app mounted
   surfaces plus `/api/people-profiles` and `/api/people-profiles/search`.
2. Update QA app tests and implementation so QA exposes only micro-app mounted
   surfaces plus `/api/release-gates` and `/api/release-gates/search`.
3. Align `packages/shared/src/soul-app/fixtures.ts` and focused shared tests so
   official manifests no longer carry default workbench or host-descriptor
   surfaces.
4. Keep shared `ui.workbench` schema compatibility in this slice; only remove it
   from official app defaults.
5. Use subagent-driven development for the independent HR and QA app slices,
   with the controller owning shared fixtures, docs, final verification and the
   commit.

## Scope

- `apps/aiworker-hr/soul-app.manifest.json`
- `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- `apps/aiworker-hr/host-adapter/index.test.ts`
- `apps/aiworker-qa/soul-app.manifest.json`
- `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
- `apps/aiworker-qa/host-adapter/index.test.ts`
- `packages/shared/src/soul-app/fixtures.ts`
- `packages/shared/src/soul-app/manifest.test.ts`
- affected Host API/Web tests when official fixture assumptions change
- `docs/task/REFACTOR-089.md`
- `docs/plan/PLAN-397.md`
- `docs/changelog.md`

## Non-Goals

- Do not remove the shared `ui.workbench` schema or compatibility tests yet.
- Do not remove generic Host artifacts/reviews/lessons storage in this slice.
- Do not redesign HR or QA domain UI.

## Verification Plan

- Focused HR and QA tests/typechecks.
- Shared manifest tests.
- Focused API/Web tests that cover mounted surfaces and app-owned API proxying.
- Official app validate/smoke.
- Docs check, whitespace check and code-review-graph.

## Result

The official HR and QA Soul Apps no longer preserve old workbench protocol
defaults. Their manifests and shared fixtures use micro-app route/widget
surfaces, their mounted services expose app-owned create/search/capability API
paths, and old Host descriptor/protocol endpoints are covered as not found.

## Verification

- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-shared' test -- soul-app`
- `bun run --filter '@zonease/aiworker-api' test -- worker.local`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun ../../apps/cli/src/aiworker.ts app validate .` from HR and QA
- `bun run smoke` from HR and QA
- `bun run docs:check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
