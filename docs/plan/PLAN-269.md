# PLAN-269 Worker list Soul grouping

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 01:59
- **relatedTask**: BUG-111

## Context

- `WorkerStudio` renders the Worker home rail as a flat `data.workers.map(...)` list.
- Worker items already resolve `displaySoul(...)` for metadata, so the grouping can reuse
  existing i18n helpers without adding new copy keys.
- `apps/web/src/styles/rail.css` owns the worker rail layout and scroll behavior.
- Existing WorkerStudio tests already exercise worker switching through `role="option"`.

## Proposal

1. Derive Soul groups from `data.souls` order plus any unknown `worker.soulId` fallback.
2. Add local collapsed group state keyed by `soulId`.
3. Render each group with a compact header button showing `Soul name (N)` and a chevron.
4. Keep existing worker item markup and selection behavior inside expanded groups.
5. Add CSS for grouped rail sections and update WorkerStudio tests.

## Risks

- The grouped structure must preserve keyboard-accessible controls and worker options.
- Collapsing a group should not mutate selected worker state or route state.
- The rail must keep its existing vertical scroll ownership.

## Scope

- In scope: Worker home left rail grouping, collapsible state, CSS, tests, PMA docs.
- Out of scope: changing worker data model, dialogs, workspace/session rails, or Soul catalog behavior.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `CI=1 bunx vitest run --testTimeout=15000 src/worker/__tests__/worker-studio.test.tsx --reporter=verbose`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/workers/hr-playwright-worker-1740-31ce9d16`
  returned 4 Soul groups, collapse `aria-expanded=false`, worker items from 5 to 3,
  and expand restored 5 worker items.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review` (risk `0.40`, `0` affected flows, grouped rail covered by focused test)
- Passed: code-review-graph MCP `get_minimal_context`, `detect_changes`, and `get_affected_flows`
  for the changed Web files.
