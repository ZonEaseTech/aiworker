# PLAN-227 Worker Web workspace route contextual navigation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 21:18
- **relatedTask**: REFACTOR-053

## Current State

- `WorkerStudio` always renders `aside.soul-sidebar`.
- Session routes only replace the center column with `WorkerSessionChat`; the
  left rail still contains Soul catalog, capability template picker, and the
  workspace creation entry point.
- This violates the intended route hierarchy: home is for choosing a Soul and
  starting work; workspace/session routes should be for operating inside a
  selected workspace.

## Proposal

1. Keep the existing Soul catalog sidebar only on the home route.
2. Add a workspace-context sidebar for workspace/session routes.
3. In the workspace sidebar, show:
   - Back to Soul home action.
   - Current Soul and workspace identity.
   - Selected session/capability metadata.
   - Sessions in the current workspace.
   - Compact switcher for other workspaces in the same Soul.
   - Existing engine/settings/language controls.
4. Keep route navigation client-side and preserve the current chat/artifact
   panes.

## Scope

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/i18n.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs and changelog

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser validation against `http://127.0.0.1:9217/`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

- Home route remains the Soul workspace entry screen.
- Workspace/session routes now replace the global Soul catalog/create rail with
  workspace-context navigation.
- Session routes keep the chat and artifact surfaces while the left rail shows
  current workspace/session context.
- Empty workspace routes no longer fall back to the creation surface.
- Responsive layout was tightened to avoid horizontal overflow in the verified
  desktop, short desktop, tablet, and narrow mobile viewports.
