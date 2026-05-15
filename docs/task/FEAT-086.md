# FEAT-086 CLI self-updater

- **status**: in_progress
- **priority**: P1
- **owner**: codex
- **plan**: PLAN-325
- **created**: 2026-05-15
- **updated**: 2026-05-15
- **relatesTo**: docs/superpowers/specs/2026-05-15-cli-self-updater-design.md

## Goal

Add top-level `aiworker update` and `aiworker upgrade` aliases that upgrade the
AIWorker CLI/Host distribution, converge Host metadata for the current
`AIWORKER_HOME`, and preserve worker-scoped update semantics for a future
namespace.

## Scope

- Add CLI self-updater detection, planning, execution, Host convergence and
  safe daemon restart guards.
- Add read-only `--check`, `--dry-run`, `--yes`, `--target`, `--channel` and
  `--pre` behavior.
- Add daily update notices without background binary replacement.
- Document source-specific behavior in CLI and deployment docs.

## Acceptance

- `aiworker update` and `aiworker upgrade` use the same handler.
- `aiworker update --check` is read-only.
- Stable channel is default; preview/prerelease is opt-in.
- npm and Bun global installs produce package-manager upgrade actions.
- source checkout and ephemeral `npx` / `bunx` runs refuse self-modification.
- GitHub tarball/binary upgrades require SHA256 checksums.
- Successful upgrades run Host convergence for the current `AIWORKER_HOME`.
- Only managed background daemons are restarted automatically.
- Future `worker update/upgrade` remains separate and unimplemented.

## Progress

- 2026-05-15: Implementation slice opened from approved Superpowers spec.
