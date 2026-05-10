# REFACTOR-050 Host home lifecycle and project-scope removal

- **status**: in_progress
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

Pending.
