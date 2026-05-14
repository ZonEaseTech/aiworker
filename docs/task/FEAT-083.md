# FEAT-083 Dev home isolation

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14
- **plan**: PLAN-318
- **relatesTo**: apps/cli, packages/fs-layout, packages/core, scripts/dev-local.sh, scripts/dev-apps.sh, scripts/dev-status.sh, scripts/dev-clean.sh, docs/cli.md, docs/deployment.md, README.md

## Context

Source-checkout development and packaged preview usage can both default to
`~/.aiworker`. That makes local development compete with operator preview state
for `aiworker.db`, app registry rows, selected workers, workspaces, pid files
and daemon logs.

## Goals

- Source-checkout CLI defaults to `~/.aiworker-dev` when no explicit
  `AIWORKER_HOME` is set.
- Packaged/dist/npm CLI defaults remain `~/.aiworker`.
- Explicit `AIWORKER_HOME` and `WORKER_DB_PATH` keep priority in all modes.
- Root dev scripts use `~/.aiworker-dev`.
- Docs explain source versus packaged defaults.

## Non-Goals

- No migration from `/tmp/aiworker-dev`.
- No migration from `~/.aiworker`.
- No project-root `.aiworker/` detection.
- No profile UI or channel manager.
- No Host interpretation of Soul App domain data.

## Acceptance Criteria

- `bun apps/cli/src/aiworker.ts init` with no explicit `AIWORKER_HOME` reports
  `~/.aiworker-dev`.
- `apps/cli/dist/aiworker.js init` with no explicit `AIWORKER_HOME` reports
  `~/.aiworker`.
- Explicit `AIWORKER_HOME` wins over source and packaged defaults.
- Explicit `WORKER_DB_PATH` wins over the derived DB path.
- Root dev scripts print and use `~/.aiworker-dev`.
- Release smoke still uses temporary homes and passes.
- PMA docs, source docs and changelog are synchronized.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `rg -n '/tmp/aiworker-dev|~/.aiworker-dev|\\.aiworker-dev' package.json scripts README.md docs/cli.md docs/deployment.md`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

This task remains open until implementation records final verification evidence.
