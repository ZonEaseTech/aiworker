# PLAN-251 Worker Web readiness rail simplification

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 16:16
- **relatedTask**: BUG-093

## Current State

- The left rail showed a persistent `readiness-card ready` block for execution
  status and a Settings shortcut.
- The same configuration flow already exists in the header Settings button,
  the footer execution pill, and the Settings dialog execution section.
- Session creation already shows blocked execution detail inline when the
  selected engine cannot run turns.

## Proposal

1. Remove the left-rail readiness section from `WorkerStudio`.
2. Keep the inline blocked-state warning near the session creation submit
   action.
3. Remove obsolete readiness-card CSS and the now-unused `executionReady`
   locale key.

## Result

- The left rail no longer renders the redundant readiness card.
- Execution configuration remains available through Settings entrypoints.
- Blocked execution remains visible where it affects the session creation
  workflow.
- Removed obsolete rail readiness styles and locale copy.

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
- code-review-graph result: risk score `0.40`, 0 affected flows. Reported
  `WorkerStudio` test gap is covered by the existing WorkerStudio RTL suite,
  Web build, and browser verification.
