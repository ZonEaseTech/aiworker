# PLAN-414 Real E2E P2/P3 repair batch

- **status**: pending
- **createdAt**: 2026-05-25
- **relatedTask**: BUG-157
- **superpowersSpec**: docs/superpowers/specs/2026-05-25-real-e2e-p2-p3-repair-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-p2-p3-repair.md

## Context

The approved design groups the six findings from `tmp/real-e2e-audit-2026-05-25/` into one boundary-scoped repair batch. The batch spans session lifecycle, mounted universal workbench recovery, universal composer default state, Host Web worker locator and Worker Configuration layout, and the HR app-owned legacy artifact probe.

## Proposal

1. Mark successful one-turn sessions completed in `LocalWorkerRuntime.startTurn` and align API stream/list/detail expectations.
2. Make the mounted universal workbench preserve the created session and refresh details after stream errors.
3. Initialize universal workbench template selection from the first available declared template.
4. Fix Worker Configuration narrow layout and add stable worker row identity metadata for duplicate names.
5. Remove the HR app-owned legacy `/api/local/artifacts` boot request unless a declared app-owned artifact API replaces it.
6. Verify with focused tests, UI governance, boundary checks, rebuilt mounted client bundles, browser evidence, and code-review-graph.

## Risks

- Session completion semantics can affect follow-up-turn behavior if callers expect the session container to stay `active`.
- Stream recovery must not retry POST requests or create duplicate engine turns.
- Worker row metadata must stay Host-owned and must not interpret Soul App domain objects.
- Removing the artifact probe must not silently hide a currently used HR app-owned artifact feature.
- UI fixes can satisfy document-level overflow while still leaving nested controls unreachable; browser regression must inspect inner elements.

## Scope

- `packages/core/src/worker/runtime.ts`
- `packages/core/src/worker/runtime.test.ts`
- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- `apps/web/src/worker/worker-workbench-tree.tsx`
- `apps/web/src/worker/worker-configuration-dialog.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `apps/aiworker-hr/product/web/people-workbench/api.ts`
- `apps/aiworker-hr/product/web/people-workbench/api.test.ts`
- `docs/task/BUG-157.md`
- `docs/task/index.md`
- `docs/plan/PLAN-414.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run --filter '@zonease/aiworker-hr' build:client`
- `bun run --filter '@zonease/aiworker-qa' build:client`
- Browser regression under `tmp/real-e2e-p2-p3-repair-2026-05-25/`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
