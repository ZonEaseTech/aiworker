# PLAN-205 Worker Web Open Design source parity

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 00:31
- **completedAt**: 2026-05-10 01:43
- **relatedTask**: REFACTOR-039

## Current State

The Worker Web bundle is now greenfield and worker-only, but the home screen
still behaves like an internal worker execution dashboard. It surfaces review,
lessons, run events, and artifact preview immediately. That makes the first
screen less clear than Open Design's home, where users start from project
creation and recent project cards.

## Proposal

Replace the home screen with direct Open Design source parity, not an adapted
dashboard:

1. Port the Open Design source structure for entry shell, brand rail, new
   project panel, designs toolbar/grid, pet rail, and settings dialog.
2. Keep visible text and interaction affordances aligned with Open Design first;
   defer AIWorker-specific vocabulary to later refinement.
3. Preserve only the minimal local API bridge: create a prototype through local
   briefs/runs and show existing briefs as design cards.
4. Tests should assert the new regions and explicitly guard against Review,
   Lessons, or Artifact canvas returning to the home screen.

## Implementation Status

| Batch | Status | Scope | Evidence |
| --- | --- | --- | --- |
| H1 source parity shell | completed | `apps/web/src/worker/worker-studio.tsx`, `studio.css`, OD assets | OD-aligned `entry`, `newproj`, `design-card`, `pet-rail`, `modal-settings`, `agent-card` structure |
| H2 tests and docs | completed | Web tests, PMA, changelog | Worker Studio tests cover OD home/settings and reject review/lessons/canvas |
| H3 verification | completed | Web gates, browser | Focused Web gates pass; browser verified settings/home at 1280px and 2048px |

## Verification Plan

```sh
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
git diff --check
bun run crg:update
bun run crg:review
```

Browser proof must open `http://127.0.0.1:5173/worker/` and confirm the new
home reads as a project launcher with no review/lessons home regions.

## Verification Result

Completed so far:

- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-api' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run check`
- `bun run test`
- `git diff --check`
- Browser review of `http://127.0.0.1:5173/worker/` with 0 console errors.
- `bun run crg:update && bun run crg:review` reported 0 affected flows, 18
  test gaps, and risk score 0.55.

Note: aggregate `bun run build` was terminated after its Web `vite build`
subprocess stalled, while the equivalent package-level API/Web/CLI build
commands all passed.
