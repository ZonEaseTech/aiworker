# PLAN-036 Keep aiworker serve in foreground

- **status**: completed
- **createdAt**: 2026-04-29 09:03
- **approvedAt**: 2026-04-29 09:55
- **relatedTask**: BUG-035

## Context

`apps/cli/src/aiworker.ts` registers `serve` as an async CAC action that awaits
`runServe()` and then returns to `runCli()`. The CLI entrypoint calls
`process.exit(await runCli(process.argv))`, so a resolved `runServe()` causes an
immediate successful process exit.

`apps/cli/src/commands/serve.ts` starts the worker `Bun.serve()` HTTP server,
optionally starts the gateway client, and installs SIGTERM/SIGINT handlers, but
then returns. `apps/cli/src/aim/commands/gateway.ts` already uses the desired
foreground pattern by awaiting an unresolved promise after installing signal
handlers.

The failure was reproduced locally with a clean `AIWORKER_HOME`: `aiworker serve
--port <port> --host 127.0.0.1 --no-serve-web` logs successful worker startup
and exits with code 0.

## Proposal

1. Add the same foreground wait used by `gateway start` to `runServe()` after
   the signal handlers are registered.
2. Add a CLI integration regression test that starts `aiworker serve`, waits for
   `/health`, verifies the process is still alive after startup, then sends
   SIGTERM and expects a clean exit.
3. Run focused CLI tests plus a direct foreground smoke command.
4. Record completion in `BUG-035`, `PLAN-036`, and the changelog.

## Risks

`runServe()` becomes intentionally non-resolving after successful startup. Any
future in-process caller that expected `runServe()` to return after binding must
use a child process or add an explicit lifecycle hook, but the current CLI
contract is foreground service behavior.

## Scope

Expected files:

- `apps/cli/src/commands/serve.ts`
- one new focused CLI integration test under `apps/cli/src/commands/`
- PMA task/plan/changelog records

## Alternatives

Move the foreground wait to the `serve` CAC action instead of `runServe()`. This
would fix the binary entrypoint, but it would leave `runServe()` with surprising
service-lifecycle semantics and would not match the existing `gateway start`
pattern.

## Annotations

- 2026-04-29 10:01: Implemented and verified. Remote test-fleet OTP
  enrollment reached approval successfully after the fix; real Codex chat
  continuity exposed a separate executor reconnect failure, recorded as
  `BUG-036`.
