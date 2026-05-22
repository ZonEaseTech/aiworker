# REFACTOR-096 Close Host/Soul micro-app workbench boundary

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-23 00:00
- **claimedAt**: 2026-05-23 00:00
- **completedAt**: 2026-05-23 00:25
- **plan**: PLAN-405
- **relatesTo**: CONFIG-001, MOUNT-001, PROTO-001, IMPORT-001

## Description

Close the Host/Soul micro-app workbench boundary so Host Web mounts all
manifest-declared micro-app workbench routes through one generic path and never
imports or renders Soul App workbench UI directly.

Acceptance criteria:

1. Host Web has no dependency on `@zonease/aiworker-soul-app-workbench`.
2. `universal-workbench` renders through `<micro-app>` like every other
   `renderer: "micro-app"` route.
3. Worker Configuration workbench selection is scoped by Soul worker.
4. HR workers with universal plus domain routes show the projection switch.
5. QA and Custom workers with only universal route do not show the switch.
6. `defineSoulApp(...)` does not silently inject universal workbench routes.
7. Official HR, QA and Custom mounted services serve every declared
   `/micro-app/*` route.
8. Static boundary checks reject Host Web imports of the Soul App workbench
   package.
9. Host does not expose workbench action/search/configuration product APIs.

## ActiveForm

Closing the Host/Soul micro-app workbench boundary.

## Dependencies

- **blocked by**: (none)
- **blocks**: (none)

## Notes

- 2026-05-23 00:00: Claimed after explicit user approval. Implementation follows
  `docs/superpowers/specs/2026-05-22-host-soul-micro-app-boundary-design.md`
  and the active architecture constraint registry.
- 2026-05-23 00:25: Completed strict micro-app boundary closure. Host Web now
  mounts universal/domain workbench routes only through manifest-declared
  micro-app surfaces, Worker Configuration route preference is worker-scoped,
  SDK no longer injects universal routes, and official/scaffold apps explicitly
  declare and serve their mounted routes.
