# PLAN-413 Real E2E P2 regression repair batch

- **status**: completed
- **createdAt**: 2026-05-25
- **approvedAt**: 2026-05-25
- **completedAt**: 2026-05-25
- **relatedTask**: BUG-156
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-p2-repair.md

## Context

The approved design in `docs/superpowers/specs/2026-05-25-real-e2e-p2-repair-design.md` groups four P2 findings from `tmp/real-e2e-regression-2026-05-24/` into one repair batch.

Investigation found these ownership boundaries:

- HR hydration mismatch belongs to the HR app-owned route in `apps/aiworker-hr`.
- Narrow universal workbench layout and stale terminal-turn status belong to `packages/soul-app-workbench`.
- Worker Configuration narrow layout belongs to Host Web in `apps/web`.

## Proposal

1. Fix the HR profile board description so server markup and client hydrate render the same initial text tree.
2. Make the universal workbench root responsive so the sidebar, main workspace/session area, and detail rail stack instead of squeezing each other on narrow screens.
3. Suppress stale running activity/status events for terminal turns in the timeline view model.
4. Make Worker Configuration dialog use a single-column narrow layout with the overlay editor below the asset list.
5. Run focused tests, UI governance, boundary audit, browser regression, and code-review-graph.

## Risks

- Narrow layout changes can accidentally hide detail content or make desktop layout less dense.
- The timeline must not remove legitimate running status from active turns.
- Worker Configuration must not reintroduce workspace projection or become a workspace/session configuration scope.
- `ui:check` can expose unrelated historical debt; any unrelated finding must be separated from this repair batch.

## Scope

- `apps/aiworker-hr/product/web/component-proof.test.tsx`
- `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`
- `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `apps/web/src/worker/worker-configuration-dialog.tsx`
- `docs/task/BUG-156.md`
- `docs/plan/PLAN-413.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- Browser regression on desktop and 390px viewports
- `bun run crg:update`
- `bun run crg:review`

## Verification Results

Focused gates passed:

- `bun run --filter '@zonease/aiworker-hr' test` — 28 pass, 0 fail (`tmp/real-e2e-p2-repair-2026-05-25/logs/hr-test.log`).
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test` — 15 pass, 0 fail (`tmp/real-e2e-p2-repair-2026-05-25/logs/soul-app-workbench-test.log`).
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck` — exit 0 after correcting the selected-session test fixture to use a valid session-level `active` status (`tmp/real-e2e-p2-repair-2026-05-25/logs/soul-app-workbench-typecheck.log`).
- `bun run --filter '@zonease/aiworker-web' test` — 11 files / 65 tests passed (`tmp/real-e2e-p2-repair-2026-05-25/logs/web-test.log`).
- `bun run ui:check` — component governance ok (`tmp/real-e2e-p2-repair-2026-05-25/logs/ui-check.log`).
- `bun scripts/check-soul-app-boundaries.ts --completion-audit` — exit 0 (`tmp/real-e2e-p2-repair-2026-05-25/logs/soul-app-boundaries.log`).
- `git diff --check` — exit 0 (`tmp/real-e2e-p2-repair-2026-05-25/logs/git-diff-check.log`).

Mounted client bundles were rebuilt before browser verification because official HR/QA mounted services serve ignored `dist/web/*client.js` assets:

- `bun run --filter '@zonease/aiworker-hr' build:client` — rebuilt `hr-home-client.js` and `universal-workbench-client.js`.
- `bun run --filter '@zonease/aiworker-qa' build:client` — rebuilt `universal-workbench-client.js`.

Browser regression passed with zero assertion failures:

- Evidence summary: `tmp/real-e2e-p2-repair-2026-05-25/browser/summary.json`.
- Screenshots:
  - `tmp/real-e2e-p2-repair-2026-05-25/screenshots/hr-home-worker-web-desktop.png`
  - `tmp/real-e2e-p2-repair-2026-05-25/screenshots/hr-universal-narrow.png`
  - `tmp/real-e2e-p2-repair-2026-05-25/screenshots/qa-universal-narrow.png`
  - `tmp/real-e2e-p2-repair-2026-05-25/screenshots/hr-session-detail-narrow.png`
  - `tmp/real-e2e-p2-repair-2026-05-25/screenshots/worker-configuration-narrow.png`
- Browser MCP was unavailable because the shared browser profile was locked; the regression used repository Playwright automation instead (`tmp/real-e2e-p2-repair-2026-05-25/browser/browser-mcp-fallback.txt`).

Code review graph:

- `bun run crg:update` — updated graph for the current workspace.
- `bun run crg:review` — uncommitted closeout docs only, risk 0.00.
- `uvx code-review-graph detect-changes --repo . --base a33de4ac` — code batch risk 0.55 with graph-level test-gap warnings. These warnings were reviewed against focused tests and browser evidence because the graph did not associate all component-level render tests with the changed React functions.

Residual note:

- The HR `hr-home` browser capture no longer emits React hydration mismatch text. It still records a `GET /api/local/artifacts` 404 console resource error from the existing HR data-loading path; that endpoint contract is outside this P2 repair batch and should be handled separately if it becomes a product acceptance criterion.
