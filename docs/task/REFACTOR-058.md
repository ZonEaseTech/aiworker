# REFACTOR-058 Worker-first Web information architecture

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **claimedAt**: 2026-05-11 01:26
- **plan**: PLAN-235
- **relatesTo**: apps/web, apps/api, packages/shared

## Background

Worker Web currently shows worker identity but still uses Soul rail selection as
the top-level entry. The intended flow is worker list, worker detail,
workspace/project list, workspace sessions, then session interaction.

## Goal

Refactor Worker Web to use workers as the top-level route and interaction
object while preserving the current visual system and session experience.

## Acceptance Criteria

- Home route shows a worker list and create-worker surface.
- Worker route shows worker identity, bound Soul/domain system, enabled
  capability templates, and workspace/project management.
- Workspace route shows workspace details and session management.
- Session route keeps the current chat/timeline/artifact/review layout.
- Responsive behavior preserves the current no-horizontal-overflow standard.

## Outcome

- Worker Web now resolves `/workers/:workerId`,
  `/workers/:workerId/workspaces/:workspaceId`, and
  `/workers/:workerId/workspaces/:workspaceId/sessions/:sessionId` as canonical
  routes.
- The home/worker surface uses the worker list as the top-level entry, exposes
  create-worker controls, shows worker identity, and creates workspaces under
  the selected worker.
- Workspace routes now keep contextual navigation and render session creation
  in the workspace context.
- Session routes preserve the existing chat, timeline, artifact, review, and
  memory surfaces.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
