# REFACTOR-089 Remove official Soul App workbench protocol defaults

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21
- **claimedAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **plan**: PLAN-397
- **relatesTo**: HOST-001, SOUL-001, PROTO-001, MOUNT-001, apps/aiworker-hr, apps/aiworker-qa

## Background

The generated Soul App scaffold now defaults to micro-app surfaces and app-owned
mounted API paths. The official HR and QA Soul Apps still carry default
`ui.workbench`, `host-descriptor`, `/protocol/actions` and `/protocol/search`
surfaces. That keeps the old hand-rolled protocol layer alive inside the
reference apps.

## Acceptance Criteria

1. Official HR and QA manifests no longer declare default `ui.workbench`.
2. Official HR and QA mounted routes use `renderer: "micro-app"` and
   `/micro-app/*` entries. Host-descriptor route/panel defaults are removed.
3. Official HR and QA mounted services expose app-owned API paths for create and
   search behavior instead of `/protocol/actions` and `/protocol/search`.
4. Shared reference fixtures stay aligned with the app manifests.
5. Focused app/shared/API/Web tests and app validate/smoke checks prove the
   official apps still mount through Host.

## Verification

- [x] `bun run --filter '@zonease/aiworker-hr' test`
- [x] `bun run --filter '@zonease/aiworker-hr' typecheck`
- [x] `bun run --filter '@zonease/aiworker-qa' test`
- [x] `bun run --filter '@zonease/aiworker-qa' typecheck`
- [x] `bun run --filter '@zonease/aiworker-shared' test -- soul-app`
- [x] `bun run --filter '@zonease/aiworker-api' test -- worker.local`
- [x] `bun run --filter '@zonease/aiworker-web' test -- worker-studio`
- [x] `bun ../../apps/cli/src/aiworker.ts app validate .` from each official app
- [x] `bun ../../apps/cli/src/aiworker.ts app smoke .` from each official app
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Resolution

Official HR and QA manifests now default to micro-app mounted surfaces and
app-owned mounted API paths. Their mounted services no longer expose default
host-descriptor surfaces or workbench protocol endpoints, while shared official
fixtures and focused Host API/Web tests follow the same boundary.
