# REFACTOR-081 Host/Soul workbench contract cleanup

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-18
- **claimedAt**: 2026-05-18
- **completedAt**: 2026-05-18
- **plan**: PLAN-352
- **relatesTo**: packages/shared/src/soul-app/manifest.ts, apps/web/src/worker/worker-studio.tsx, docs/architecture.md

## Background

The approved Host shell layout makes the Host header a fixed platform chrome.
Soul Apps still need protocol-based coordination with Host for workbench
actions, search, settings and future workspace terminal context, but those
descriptors must no longer be framed as Host header slots.

## Acceptance Criteria

- `ui.shell` is no longer accepted as the current Soul App manifest contract.
- App-owned actions/search/settings move to `ui.workbench` and use neutral
  action `role` semantics instead of header `slot` semantics.
- Soul Apps can declare workspace context metadata for future Host-owned web
  terminal entry through `ui.workspaceContext`.
- Host API/Web/Security Review consume the new contract without app-specific
  branches.
- Architecture and Soul App authoring docs state the new constraints.

## Implementation Plan

- Covered by `PLAN-352`.

## Outcome

Retired Host header slot semantics from the current Soul App manifest contract:

- replaced `ui.shell` with `ui.workbench` for app-owned action/search/settings
  descriptors;
- replaced header placement `slot` with intent `role`;
- added `ui.workspaceContext.terminal` for future Host-owned terminal workspace
  context;
- updated Host daemon API, Worker Web bridge, security review, HR/QA manifests
  and docs to use the new boundary.
