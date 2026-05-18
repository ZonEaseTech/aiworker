# PLAN-365 Compact operator CLI surface

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-098

## Current State

`aiworker --help` currently lists every registered command: lifecycle commands,
Soul App authoring commands, diagnostic commands, low-level object inspection
commands and compatibility aliases. The same full list appears in
`aiworker commands`.

The most-used real operator commands are `aiworker daemon start` and
`aiworker daemon stop`, but there is no `daemon restart`. The update flow also
adds a `daemon-restart` action to the upgrade plan while the actual CLI hook
only prints a manual restart message.

`aiworker update` already parses as apply mode by default, but the plan marks
write actions as requiring `--yes`, so the default command does not actually
perform the update. This is unlike normal CLI update behavior such as
`claude update`, where the manual update command executes the update.

`aiworker dev` is a source-checkout convenience alias for `daemon foreground`.
The repository already has `bun run dev` and `dev:*` scripts for local
development, so the published CLI should not present `dev` as a normal operator
command.

## Proposal

Keep the existing command handlers callable, but change command discovery so
the default surface is compact and operator-oriented.

Default surface:

- `daemon start|stop|restart|status|logs`
- `open`
- `doctor`
- `update`
- `app list|show|install|enable|bootstrap`
- `worker create|list|select`
- `workspace create|list`
- `session start|list|show`
- `turn send`

Advanced surface, callable but hidden from default discovery:

- `init`
- `dev`
- `upgrade`
- `daemon foreground|check`
- `app disable|doctor|permissions|create|validate|smoke`
- `soul list`
- `template list`
- `worker show`
- `workspace show`
- `files list|show`
- `artifacts list|show|open`
- `profile promote`
- `review list|show`
- `lessons list|propose|accept|reject`
- `settings list`
- `engine select`
- `commands --all`

Add `daemon restart` as a first-class operator command. It should stop a running
managed daemon, wait briefly for the process to exit, and then start a fresh
daemon with the requested host/port. If the daemon is not running, an explicit
`daemon restart` may start it; the update path is stricter and only restarts a
daemon that was running before the update.

Change `aiworker update` so apply mode executes without `--yes`. Keep
`--check` and `--dry-run` as read-only modes. Keep unsupported install-source
guards as the safety boundary. When a managed daemon is running for the same
home, update should automatically stop and start it after package/bundle update
and Host convergence.

## Scope

- `apps/cli/src/aiworker.ts`
- `apps/cli/src/updater.ts`
- `apps/cli/src/aiworker.test.ts`
- `apps/cli/src/updater.test.ts`
- `docs/cli.md`
- `docs/task/FEAT-098.md`
- `docs/task/index.md`
- `docs/plan/PLAN-365.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Non-Goals

- Do not remove callable commands in this plan.
- Do not redesign the local daemon API or Host/Soul protocol.
- Do not move Soul App authoring commands out of the CLI package.
- Do not add a second stable machine API on top of the CLI.
- Do not change release publishing scripts.

## Risks

- Hidden commands may surprise existing users who relied on `--help` as a full
  reference. Mitigation: provide `aiworker --help --all` and
  `aiworker commands --all`.
- Automatic daemon restart can accidentally touch a developer foreground
  process. Mitigation: use the existing managed-daemon predicate and require the
  pid-file home to match the current `AIWORKER_HOME`.
- Restarting immediately after `SIGTERM` can race with port release.
  Mitigation: wait for the previous pid to exit before starting the new daemon.
- Removing `--yes` as a required gate increases the importance of install-source
  detection. Mitigation: source checkout, ephemeral and unknown sources remain
  non-writing.

## Implementation Plan

1. Add focused CLI tests for compact command discovery, full command discovery,
   `daemon restart`, and default update apply semantics.
2. Refactor daemon lifecycle helpers so `stop`, `restart` and update-triggered
   restarts can share stop/start behavior without duplicate JSON output.
3. Add `daemon restart` registration and keep it in the default command surface.
4. Replace default `commands` output and top-level help command sections with
   compact operator discovery; keep `--all` for full command discovery.
5. Remove the `--yes` requirement from update planning while preserving
   `--check`, `--dry-run` and unsupported source behavior.
6. Replace the update restart hook with a real managed-daemon restart.
7. Move `aiworker dev` out of the default docs and mark it as a source-checkout
   compatibility/development alias.
8. Run focused CLI/updater tests, typecheck, `git diff --check`, and
   code-review-graph.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-cli' test src/updater.test.ts src/aiworker.test.ts`.
- Passed: `bun run --filter '@zonease/aiworker-cli' typecheck`.
- Passed: `bun run --filter '@zonease/aiworker-cli' test`.
- Passed: `bun run --filter '@zonease/aiworker-cli' build:bundle`.
- Passed: `bun apps/cli/dist/aiworker-bun.js commands`.
- Passed: `bun apps/cli/dist/aiworker-bun.js --help`.
- Passed: `bun apps/cli/dist/aiworker-bun.js commands --all`.
- Passed: `bun run docs:check`.
- Passed: `git diff --check`.
- Passed: `bun run lint`.
- Passed: `bun run crg:update`.
- Passed with advisory gaps: `bun run crg:review` exited 0 with risk score
  `0.55`; it reported static test gaps for private daemon/update helpers while
  the changed public CLI discovery and updater plan semantics are covered by
  focused CLI tests, package tests, typecheck and dist command smoke output.
