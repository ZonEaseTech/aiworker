# PLAN-270 Worker item trailing status dot

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 02:07
- **relatedTask**: BUG-112

## Context

- `WorkerStudio` currently renders each worker item with `<strong>{worker.name}</strong>`,
  a `status-dot` beside the name, and a `.worker-list-item-meta` block containing Soul and
  localized status text.
- Worker list items are now grouped by Soul, so the Soul label in each item duplicates the
  group header.
- Tests currently locate worker options partly by checking item text for `Active`.

## Proposal

1. Keep the existing worker option button and selection behavior.
2. Render `.worker-list-item-main` with the worker name only.
3. Render `status-dot` as the trailing grid column.
4. Remove `.worker-list-item-meta` usage and CSS.
5. Update WorkerStudio tests to assert item text no longer contains `Active` and to select
   workers by name instead of status label text.

## Risks

- Option accessible names change from including `Active` to worker name only.
- Tests that previously relied on status text must be updated to match the new UI contract.

## Scope

- In scope: Worker home list item markup, related CSS, WorkerStudio tests, PMA docs.
- Out of scope: group headers, worker status semantics, API data, settings engine cards.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `CI=1 bunx vitest run --testTimeout=15000 src/worker/__tests__/worker-studio.test.tsx --reporter=verbose`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/workers/hr-playwright-worker-1740-31ce9d16`
  returned 5 worker items, 5 trailing status dots, `0` `.worker-list-item-meta`,
  and no Active/活跃 item labels.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review` (risk `0.40`, `0` affected flows, WorkerStudio covered by focused test)
- Passed: code-review-graph MCP `get_minimal_context`, `detect_changes`, and `get_affected_flows`
  for the changed Web files.
