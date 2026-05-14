# PLAN-272 Session route return-to-worker alignment

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 00:00
- **approvedAt**: 2026-05-12 00:00
- **relatedTask**: BUG-113

## Current State

- `worker-studio.tsx` branches the workspace context card:
  - workspace route uses `copy.workspace.backToWorker` and navigates to
    `/workers/:workerId`;
  - session route uses `copy.workspace.backToWorkspace` and navigates to
    `/workers/:workerId/workspaces/:workspaceId`.
- `session-chat.tsx` also labels the header action as `backToWorkspace` and
  receives an `onBackToWorkspace` callback from `WorkerStudio`.
- Existing WorkerStudio tests still assert that session route does not show
  “Back to worker” and does show “Back to workspace”.

## Proposal

1. Remove the session/workspace branch for the context-card return action and
   always render `backToWorker`, navigating to `/workers/:workerId`.
2. Rename the session chat callback to `onBackToWorker` and update its label /
   accessible name to `backToWorker`.
3. Update focused WorkerStudio tests to assert session route:
   - shows “Back to worker”;
   - does not show “Back to workspace”;
   - clicking the context-card action navigates to `/workers/hr-worker`.

## Scope

In scope:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs/changelog.

Out of scope:

- API or route shape changes.
- Workspace/session data model changes.
- Visual redesign beyond the label/action alignment.

## Risks

- There may be multiple “Back to worker” buttons on session route after this
  change. Tests should scope clicks to the context card where the exact expected
  behavior matters.
- Existing “New session” navigation still needs to remain available from the
  workspace sessions section.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser smoke on `http://127.0.0.1:9217`
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator on 2026-05-12 through the direct correction request.

## Progress

- 2026-05-12 00:00: Created after locating the session-only return branch in
  `WorkerStudio` and the header action in `WorkerSessionChat`.
- 2026-05-12 02:44: Updated the session route context-card action and
  `WorkerSessionChat` header action to use the worker-level return target.
- 2026-05-12 02:44: Added focused WorkerStudio coverage for the selected-session
  return action.
- 2026-05-12 02:46: Verified the selected-session route in the browser: the
  return label is “返回 worker”, “返回工作区” is absent, and the click returns to
  `/workers/hr-worker`.

## Result

- Session route now presents “Back to worker” instead of “Back to workspace” in
  both return surfaces.
- Clicking the selected-session context-card return action navigates to
  `/workers/:workerId`, matching the workspace route behavior.
