# PLAN-255 Workspace route management layout alignment

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 17:11
- **relatedTask**: BUG-097

## Current State

- Worker route layout has a stable management rhythm:
  - worker overview panel;
  - workspace collection toolbar;
  - workspace card grid.
- Workspace route layout has a different rhythm:
  - create-session form;
  - passive empty/session summary block.
- That makes `workspaces/[workspace_id]` feel like a form page rather than a
  management page under the same Worker Web architecture.

## Proposal

1. Add a `WorkspaceIdentityBlock` that reuses the existing overview-card
   styling pattern.
2. Add a `WorkspaceSessionCard` for central session collection entries.
3. Restructure the workspace route body into:
   - workspace overview panel;
   - workspace sessions section with toolbar;
   - create-session form;
   - session card grid or empty state.
4. Keep session detail route behavior unchanged.

## Result

- Workspace route now mirrors the worker route's overview-plus-collection
  structure.
- Session entries have their own card component instead of relying only on the
  side rail.
- Create-session remains available inside the workspace sessions section.
- Tests cover the revised workspace page and duplicate central/rail session
  entrypoints.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on
  `http://127.0.0.1:9217/workers/hr-worker/workspaces/b8a15051-14ef-4aad-9c66-5405ce39670f`
  confirmed the workspace overview and session management surfaces.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`; CRG also reported 0 affected flows for the
  10-file delta.
