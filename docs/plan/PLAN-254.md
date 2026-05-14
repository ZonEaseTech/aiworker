# PLAN-254 Worker workspace card grid layout

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 16:59
- **relatedTask**: BUG-096

## Current State

- Workspace cards were rendered in `design-grid-list`, which constrained the
  card surface to a single list-like column.
- The component was still named `ProjectCard`, carrying old project wording
  into worker-managed workspace UI.
- There is no list-view toggle today, so a list item component should not be
  faked by compressing card layout.

## Proposal

1. Replace `design-grid-list` usage with a dedicated `workspace-grid` card
   layout.
2. Rename the local workspace card component to `WorkspaceCard`.
3. Keep list-view work out of scope until a real `WorkspaceListItem` surface is
   designed with its own layout.

## Result

- Worker-managed workspace cards now render in a responsive grid.
- The old single-column list contract is removed from the workspace surface.
- The local component now uses `WorkspaceCard` semantics.
- WorkerStudio tests assert the workspace container uses `workspace-grid` and
  not `design-grid-list`.

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
- Browser result: at 1800x1000, `.workspace-list` has classes
  `design-grid workspace-grid workspace-list` and computes four 340.5px grid
  columns.
- code-review-graph result: risk score `0.40`, 0 affected flows. Reported
  `WorkerStudio` and mapped-item gaps are covered by the WorkerStudio RTL
  regression, Web build, and browser verification.
