# REFACTOR-088 Modernize Soul App scaffold around micro-app defaults

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21
- **claimedAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **plan**: PLAN-396
- **relatesTo**: HOST-001, SOUL-001, MOUNT-001, PROTO-001, apps/cli, docs/cli.md

## Background

`aiworker app create` still scaffolds legacy Host workbench descriptors,
host-descriptor surfaces, `/protocol/actions`, `/protocol/search` handlers and
broker-flavored sample text. That default conflicts with the current micro-app
boundary: newly generated Soul Apps should start with app-owned micro-app UI and
app-owned mounted API paths, not a Host-translated workbench protocol bridge.

## Acceptance Criteria

1. The generated starter manifest no longer includes `ui.workbench`.
2. The generated starter route surface uses `renderer: "micro-app"` and a
   `/micro-app/*` route entry.
3. The generated Host-mounted service serves micro-app HTML and app-owned API
   paths, without `/protocol/actions`, `/protocol/search`, `/broker/*`, or
   host-descriptor route defaults.
4. `aiworker app smoke` no longer reports workbench action/search smoke fields.
5. Active CLI/Soul App docs describe scaffold defaults as micro-app plus
   app-owned mounted API, with `ui.workbench` treated only as compatibility
   metadata.

## Verification

- [x] `bun run --filter '@zonease/aiworker-cli' test`
- [x] `bun run --filter '@zonease/aiworker-cli' typecheck`
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Resolution

`aiworker app create` now generates a micro-app route/widget and app-owned
mounted API starter instead of default `ui.workbench`, host-descriptor,
`/protocol/actions`, `/protocol/search` or `/broker/*` paths. `aiworker app
smoke` no longer reports workbench action/search fields, and active docs now
describe the scaffold default as micro-app plus app-owned mounted API.
