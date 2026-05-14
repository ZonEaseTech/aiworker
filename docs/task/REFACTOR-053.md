# REFACTOR-053 Worker Web workspace route contextual navigation

- **status**: done
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 21:18
- **claimedAt**: 2026-05-10 21:18
- **plan**: PLAN-227
- **relatesTo**: apps/web

## Problem

Worker Web always renders the same Soul catalog and workspace creation sidebar.
After the operator enters `/workspaces/:workspaceId` or
`/workspaces/:workspaceId/sessions/:sessionId`, the left rail still behaves
like the product entry screen. This makes the route feel split between a
workspace/session context and a global creation surface.

## Acceptance Criteria

- Home route keeps the Soul catalog, capability templates, and create
  workspace/session form.
- Workspace/session routes switch the left rail to workspace context:
  current Soul, current workspace, selected capability/session metadata,
  workspace session navigation, compact workspace switching, and explicit
  Settings/engine status.
- The create form is not visible inside a workspace/session route.
- Tests cover that session route no longer renders the creation panel and does
  render contextual workspace navigation.
- Focused Web gates and code-review-graph pass.

## Resolution

- Split Worker Web left rail by route context:
  - home route keeps Soul catalog, capability templates, and workspace/session
    creation.
  - workspace/session routes render workspace navigation with current Soul,
    current workspace, capability/session metadata, workspace sessions, and
    same-Soul workspace switching.
- Removed the creation panel from workspace/session route contexts, including
  empty workspace routes with no sessions.
- Updated responsive session-route grid constraints so the contextual sidebar,
  chat surface, and artifact rail do not create horizontal overflow at desktop,
  short desktop, tablet, or narrow mobile widths.
- Added test coverage for session-route navigation and empty workspace-route
  behavior.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser validation against `http://127.0.0.1:9217/`
- Browser viewport validation for 1440x947, 1024x640, 980x720, and 390x844
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
