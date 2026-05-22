# REFACTOR-095 WorkerStudio mounted-first Host shell boundary

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21 18:05
- **claimedAt**: 2026-05-21 18:05
- **plan**: PLAN-403
- **relatesTo**: ARCH-001, HOST-001, PROTO-001, MOUNT-001, UI-001

## Background

The active architecture keeps Host as the Local Shell + Engine Bridge for Soul
Apps. Host may keep workspace and session locators, but default product work
belongs to the mounted Soul App surface. Recent slices removed generic
review/lesson flows and added the worker-scoped native engine bridge. The
remaining Worker Web shell still renders Host-owned session composer, chat and
detail surfaces on workspace/session routes.

## Acceptance Criteria

1. `WorkerStudio` prefers declared `micro-app` routes for worker, workspace and
   session routes.
2. Workspace and session ids are passed only as locator/context to mounted Soul
   App surfaces in the default path.
3. Host-owned `WorkspaceSessionComposer`, `WorkerSessionChat` and
   `SessionDetail` are removed from the default WorkerStudio surface.
4. The no-mounted-surface fallback stays generic and does not start Host-owned
   session turns or interpret app-owned output.
5. Focused WorkerStudio tests cover mounted-first routing and absence of legacy
   Host session product UI.

## Verification

- [x] Focused WorkerStudio tests
- [x] Web typecheck
- [x] Web lint
- [x] Web UI governance check
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Notes

- 2026-05-21 18:05: Claimed after the operator approved implementation and
  clarified that older session/product logic must not be brought back under a
  new abstraction.
- 2026-05-21 18:31: Completed mounted-first WorkerStudio boundary. Remaining
  workspace/session routes without a mounted surface now show a generic locator
  fallback instead of creating or continuing Host-owned sessions.
