# TODO-047 Audit API/CLI/shared Host/Soul boundary leftovers

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-23
- **relatesTo**: apps/api, apps/cli, packages/shared, apps/web

## Context

`apps/web` boundary cleanup identified API/CLI/shared surfaces that may still
carry older Host-owned workbench or session compatibility concepts.

## Scope

- Decide whether global session turn API routes remain as engine bridge
  compatibility or should become worker-scoped only.
- Decide whether shared manifest `host-descriptor` and `ui.workbench`
  descriptor support should be removed or retained for authoring compatibility.
- Audit CLI scaffold output for wording that could imply Host-owned workbench
  actions/search/configuration.

## Acceptance

- Active architecture remains the source of truth.
- Follow-up changes are planned separately before implementation.
