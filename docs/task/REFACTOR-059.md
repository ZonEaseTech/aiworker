# REFACTOR-059 Worker capability and session selection alignment

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **claimedAt**: 2026-05-11 01:29
- **plan**: PLAN-236
- **relatesTo**: packages/shared, apps/api, apps/web, apps/cli

## Background

Capability templates are currently global rows filtered by Soul id. The target
model is Soul catalog -> worker enabled capabilities -> workspace inheritance ->
session active capability.

## Goal

Align session creation and metadata with worker-owned capability selection
without overbuilding custom capability management in this slice.

## Acceptance Criteria

- Worker-scoped template routes expose templates through the selected worker.
- Session creation validates capability ownership through worker id.
- Web creates sessions from a workspace route and explicitly selects the active
  capability.
- Metadata and prompts preserve `workerId`, `workspaceId`, `sessionId`, and
  `capabilityTemplateId` provenance.

## Outcome

- Worker-scoped API helpers and daemon routes expose templates, workspaces,
  sessions, messages, files, and artifacts through worker ids.
- Session creation validates the selected capability against the selected
  worker/Soul and uses worker-scoped REST/SSE paths.
- Worker Web moved capability selection into the workspace session creation
  surface instead of selecting a capability before workspace creation.
- CLI workspace/session/file/artifact commands now require or infer a worker
  id, preserving worker provenance through workspace and session operations.

## Verification

- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
