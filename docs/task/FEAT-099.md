# FEAT-099 Host/Soul shared component library

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-367
- **relatesTo**: ARCH-001, HOST-001, SOUL-001, IMPORT-001, REFACTOR-083

## Background

`packages/component` exists, but it is still closer to a Worker Web extraction
than a complete Host/Soul component library. Components import React structure
from the package while styles still live mostly under `apps/web/src/styles/*`.
That lets new Web work drift back to handcrafted app-local CSS.

## Acceptance Criteria

1. `packages/component` exports package-owned styles through
   `@zonease/aiworker-component/styles.css`.
2. Host Web imports the package style entrypoint and keeps its shell/workbench
   visually stable.
3. The component package includes a catalog with implemented/planned components
   and a migration queue.
4. `AGENTS.md` requires new Host/Soul UI to start from `packages/component` and
   records the app-local CSS exception rule.
5. Reusable UI from settings, shell/rail, session chat/detail/progress, and HR
   workbench is promoted where it is generic.
6. A real official Soul App Web proof imports shared components and styles.
7. Shared components do not fetch Host/Soul data and do not encode HR/QA domain
   semantics.
8. Focused package, Host Web, Soul App proof, browser, CRG, and diff checks pass.

## Notes

- This is a shared Host/Soul Web component-library delivery.
- It does not change Host/Soul protocol, manifest, broker, storage, or domain
  data semantics.
- CRG baseline was rebuilt on branch `codex/aiworker-component-library` before
  implementation.

## Completion

Task 8 adds the exact completion evidence after implementation and verification
commands pass. Until then this task remains `in_progress`.
