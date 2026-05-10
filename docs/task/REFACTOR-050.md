# REFACTOR-050 Host home lifecycle and project-scope removal

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **claimedAt**: 2026-05-10 18:01
- **plan**: PLAN-222
- **relatesTo**: apps/cli, packages/fs-layout, README.md

## Background

The old CLI and fs-layout still support project-scope `.aiworker/` discovery
and `aiworker init` materializes files in an arbitrary current directory. The
new product contract is host-local: the daemon works from `~/.aiworker`, creates
workers and workspaces there, and exposes one local Web URL.

## Goal

Remove the default project-scope initializer and converge CLI/debug lifecycle on
host-home daemon state.

## Acceptance Criteria

- CLI init no longer creates `<cwd>/.aiworker`.
- AIWorker home defaults to `~/.aiworker` unless explicitly overridden by env or
  flag-level configuration.
- Worker workspaces are created under
  `~/.aiworker/workers/<workerId>/workspaces/<workspaceId>`.
- CLI commands use workspace/session/turn terminology, not run terminology.
- Focused CLI/fs-layout tests pass.

## Evidence

Completed on 2026-05-10 18:38 CST.

- `aiworker init` now initializes host-local Soul workers under
  `AIWORKER_HOME` / `~/.aiworker`; it no longer creates `<cwd>/.aiworker`.
- `packages/fs-layout` no longer exports or tests project-scope initializer
  APIs. Scope resolution ignores cwd markers and returns only explicit/env/user
  host homes.
- Worker init creates only `workers/<workerId>/workspaces`; worker identity,
  Soul binding, enabled capabilities, settings, reviews, and memory metadata
  live in `aiworker.db`.
- Default local daemon paths are now `~/.aiworker/aiworker.db` and
  `~/.aiworker/workers`.
- CLI command surface is workspace/session/turn/artifact oriented and includes
  `aiworker dev` for single-daemon Web/API foreground debugging.
- Local daemon serves the built Worker Web at `/`, so source debugging no
  longer needs separate API and Vite processes.

Verification passed:

- `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
