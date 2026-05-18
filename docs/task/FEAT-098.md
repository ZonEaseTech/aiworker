# FEAT-098 Compact operator CLI surface

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-365
- **relatesTo**: FEAT-086, FEAT-083, ARCH-001, OPERATOR-001

## Background

The current CLI exposes too many product, authoring, diagnostic and low-level
inspection commands in the same default surface. That makes the CLI feel like an
internal API dump instead of an operator entrypoint.

The active architecture contract says an operator can be either a human or an
external runtime. The CLI should therefore stay useful for lifecycle and locator
work, while the fine-grained app/domain operation surface belongs to the local
daemon API and manifest/protocol/action/search descriptors.

## Acceptance Criteria

1. Default CLI help and `aiworker commands` present a compact operator command
   surface, not the full internal command list.
2. `daemon start`, `daemon stop`, `daemon restart`, `daemon status` and
   `daemon logs` are first-class default operator commands.
3. Advanced authoring, diagnostics and low-level inspection commands remain
   callable but move out of the default command index.
4. `aiworker update` defaults to executing safe update actions; `--check` and
   `--dry-run` remain the non-writing modes.
5. `aiworker update` automatically restarts a running managed daemon for the
   same `AIWORKER_HOME`; it must not start a daemon that was not running.
6. `aiworker dev` is removed from the default operator surface and documented
   as a source-checkout compatibility/development alias only.
7. `docs/cli.md`, focused CLI tests, PMA docs and changelog stay synchronized.

## Notes

- This is a Host CLI lifecycle and locator change.
- This does not change Host/Soul protocol schemas, Soul App manifests, or app
  domain semantics.
- Unsupported update sources such as source checkout, `npx`/`bunx` ephemeral
  paths and unknown installs must remain conservative and refuse self-modifying
  writes.

## Completion

Implemented the compact operator CLI surface:

- Default `aiworker --help` and `aiworker commands` now show the compact
  operator command list.
- `aiworker --help --all` and `aiworker commands --all` expose the full
  authoring, diagnostics, inspection and compatibility command list.
- Added `aiworker daemon restart` as a first-class daemon lifecycle command.
- Changed update planning so `aiworker update` executes safe apply actions by
  default while `--check` and `--dry-run` remain non-writing.
- Replaced the update restart hook with a real managed-daemon restart. It
  restarts only a running managed daemon for the same `AIWORKER_HOME`.
- Moved `aiworker dev` out of the default operator surface and documented it as
  a source-checkout compatibility alias.

Verification completed:

- `bun run --filter '@zonease/aiworker-cli' test src/updater.test.ts src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun apps/cli/dist/aiworker-bun.js commands`
- `bun apps/cli/dist/aiworker-bun.js --help`
- `bun apps/cli/dist/aiworker-bun.js commands --all`
- `bun run docs:check`
- `git diff --check`
- `bun run lint`
- `bun run crg:update`
- `bun run crg:review`
