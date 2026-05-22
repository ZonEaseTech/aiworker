# FEAT-106 micro-app Host/Soul mounted UI runtime

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-20
- **claimedAt**: 2026-05-20
- **plan**: PLAN-388
- **relatesTo**: ARCH-001, HOST-001, SOUL-001, PROTO-001, IMPORT-001, MOUNT-001, UI-001

## Background

Host/Soul UI migration exposed a boundary problem: Host Web must not recover
vertical Soul App UI by embedding app-specific renderer code under
`apps/web/src/worker/souls`. Host needs a single mounted UI runtime that can
load app-owned product web surfaces while preserving manifest/protocol/broker
ownership.

## Acceptance Criteria

1. Mounted app-owned UI surfaces use `renderer: "micro-app"` and `/micro-app/*`
   entries in shared fixtures and official HR/QA manifests.
2. The daemon resolves `micro-app` surfaces into a micro-app mount payload after
   permission checks and mounted-service readiness.
3. Worker Web renders a generic `<micro-app>` element and passes narrow Host
   context data without importing app-domain UI.
4. HR and QA mounted services serve app-owned `/micro-app/*` HTML while keeping
   action/search/domain routes behind the protocol boundary.
5. App scaffold and mounted-surface smoke helpers generate and validate the
   micro-app contract instead of frame paths.
6. Active architecture, authoring docs, skills, task/plan indexes and changelog
   reflect `MOUNT-001`.
7. Focused shared/API/Web/HR/QA tests, app validate/smoke, boundary/UI/doc
   checks, typecheck and code-review-graph pass or record explicit residual
   risk.

## Completion Notes

- Standardized active Host-mounted app-owned UI on `renderer: "micro-app"` and
  `/micro-app/*` mounted service entries.
- Worker Web now renders a generic `<micro-app>` container with
  `router-mode="pure"` and narrow Host context data; Host no longer embeds the
  HR renderer tree.
- Official HR/QA app manifests, mounted services, CLI scaffold and smoke helper
  use the micro-app contract.
- Added bootstrap repair coverage so stale installed official app rows with
  legacy `sandboxed-frame` manifests refresh from disk before current schema
  parsing.
