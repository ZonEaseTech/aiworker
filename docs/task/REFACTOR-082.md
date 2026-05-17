# REFACTOR-082 Soul App scaffold workbench design migration

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-18
- **claimedAt**: 2026-05-18
- **completedAt**: 2026-05-18
- **plan**: PLAN-353
- **relatesTo**: apps/cli/src/aiworker.ts, apps/cli/src/aiworker.test.ts, docs/soul-app-developer.md

## Background

The Host/Soul contract now treats Host header actions as platform-owned chrome.
Official app manifests already moved to `ui.workbench` and
`ui.workspaceContext`, but new Soul Apps created by `aiworker app create` also
need to start from the same design.

## Acceptance Criteria

- The scaffolded Soul App manifest includes app-owned `ui.workbench`
  action/search/settings descriptors.
- The scaffolded Soul App manifest includes `ui.workspaceContext.terminal` for
  Host-owned workspace process context.
- The generated Host-mounted service implements the protocol endpoints needed
  by those workbench descriptors.
- `aiworker app smoke` verifies declared workbench action/search protocol
  wiring for generated and official apps.
- Authoring docs describe the migrated scaffold and smoke behavior.

## Implementation Plan

- Covered by `PLAN-353`.

## Outcome

Migrated Soul App authoring/scaffold design to the current Host-owned header
contract. New generated apps now declare `ui.workbench` and
`ui.workspaceContext`, implement the matching mounted action/search protocol,
and get workbench protocol smoke coverage by default.
