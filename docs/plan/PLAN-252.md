# PLAN-252 Worker list rail scroll ownership

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 16:24
- **relatedTask**: BUG-094

## Current State

- `.worker-list-panel` was sized as `flex: 0 0 auto`.
- `.worker-list-rail` had a fixed `max-height: 188px`.
- The worker list is the primary left-rail navigation, but visually behaved as
  a small auxiliary card.

## Proposal

1. Let `.worker-list-panel` fill the remaining sidebar height.
2. Keep the panel body as a bounded flex column.
3. Make `.worker-list-rail` the internal scroll area and remove its hard
   max-height.

## Result

- Worker list section now expands into the available rail space.
- The list rows scroll inside `.worker-list-rail`.
- The section header and sidebar footer remain stable.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/worker/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Browser result: worker list section expanded to 708px high and the listbox
  owns a 595px internal scroll region at 1280x900.
- code-review-graph result: risk score `0.00`, 0 affected flows, 0 test gaps.
