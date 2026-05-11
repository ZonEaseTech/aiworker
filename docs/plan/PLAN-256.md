# PLAN-256 Workspace route create-session composer

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 17:26
- **relatedTask**: BUG-098

## Current State

- The workspace route currently shows:
  - a workspace overview panel;
  - a selected capability summary;
  - a sessions toolbar and central session grid;
  - the create-session form embedded inside that management section.
- This duplicates page-level management responsibilities that already belong
  to the worker page and side rail.

## Proposal

1. Delete the temporary `WorkspaceIdentityBlock` and `WorkspaceSessionCard`.
2. Add a dedicated `WorkspaceSessionComposer` component for the no-session
   workspace route.
3. Keep the session list only in the workspace side rail.
4. Style the composer after a Codex-like prompt box: centered question,
   large text area, compact bottom controls, and a circular submit button.

## Result

- The no-session workspace route now renders a centered create-session
  composer instead of a workspace management overview.
- The session list remains in the workspace side rail.
- The temporary workspace identity and central session card components were
  removed.
- The composer keeps capability selection, execution settings access, engine
  readiness messaging, and create-session submission.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on
  `http://127.0.0.1:9217/workers/hr-worker/workspaces/b8a15051-14ef-4aad-9c66-5405ce39670f`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`; CRG reported 0 affected flows.
