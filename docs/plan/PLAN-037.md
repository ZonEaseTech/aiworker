# PLAN-037 Tolerate Codex app-server reconnect notifications

- **status**: completed
- **createdAt**: 2026-04-29 10:20
- **approvedAt**: 2026-04-29 10:20
- **relatedTask**: BUG-036

## Context

`BUG-036` was found after `BUG-035` fixed `aiworker serve` foreground
lifecycle. A temporary local `codex/default` worker successfully stayed online
and joined the test fleet through OTP, but the first real chat turn emitted
`finishReason=error`. The worker logs showed both the conversation classifier
and the main orchestrator turn failing with `Reconnecting... 2/5`.

Current call chain:

1. `packages/core/src/worker/orchestrator/service.ts` resolves an existing
   conversation and calls `classifyContinuation(...)`.
2. `packages/core/src/worker/conversation/router.ts` runs the same configured
   executor for the classifier. Any `AgentEvent.error` throws and logs
   `[conversation] classifier error, defaulting to continue: ...`.
3. The main orchestrator run then calls `executor.run(...)` through
   `collectAssistantText(...)`; any `AgentEvent.error` returns `ok=false` and
   logs `[orchestrator] executor error: ...`.
4. `packages/core/src/worker/executor/engines/codex/normalize.ts` maps current
   app-server notification method `error` directly to `AgentEvent.error`.

Local investigation on 2026-04-29:

- `codex-cli 0.125.0` is installed at `/home/ben/.npm-global/bin/codex`.
- A direct JSON-RPC probe using full shell env completed
  `initialize -> thread/start -> turn/start` with `turn/completed`.
- The same direct probe using AIWorker-equivalent safe child env also completed
  successfully.
- The real project `CodexExecutor` completed a one-turn prompt with
  `engine_binding`, assistant text, token usage, and `finish:stop`.
- The real project `CodexExecutor` also resumed a current-protocol binding and
  preserved native thread continuity across two turns.

These checks rule out local Codex authentication, basic current-protocol
compatibility, safe env filtering, and the happy-path binding resume logic. The
remaining narrow failure mode is that Codex app-server can emit a transient
current-protocol `error` notification while reconnecting, before the final
`turn/completed` terminal status. AIWorker currently treats that notification
as fatal immediately and tears down the child process, so Codex never gets to
finish its built-in reconnect sequence.

## Proposal

1. Add a focused current-protocol regression to the Codex stub/executor tests:
   emit an `error` notification with message `Reconnecting... 2/5`, then emit
   assistant output and `turn/completed` with `status=completed`. The expected
   executor result should be `finish:stop`, not `finish:error`.
2. Update Codex current-protocol normalization so known transient reconnect
   notifications do not produce `AgentEvent.error`. Final failure should still
   come from `turn/completed` with `status=failed` or from JSON-RPC request
   rejection.
3. Keep legacy `codex/event/error` behavior unchanged unless evidence shows
   legacy app-server uses the same transient shape.
4. Run focused Codex tests plus the real local `CodexExecutor` smoke and resume
   smoke.
5. Record completion in `BUG-036`, `PLAN-037`, and `docs/changelog.md`.

## Risks

Filtering too broadly could hide real Codex failures. The filter should match
only the observed transient reconnect wording and continue to surface terminal
turn failures from `turn/completed`.

The current bug was transient in the local fleet validation and did not
reproduce during direct probes. The regression therefore needs a stubbed
notification sequence rather than relying on a live network reconnect.

## Scope

Expected files:

- `packages/core/src/worker/executor/engines/codex/normalize.ts`
- `packages/core/src/worker/executor/engines/codex/normalize.test.ts`
- `packages/core/src/worker/executor/engines/codex/executor.test.ts`
- `packages/core/test-fixtures/cli/codex-stub.mjs`
- `docs/task/BUG-036.md`
- `docs/plan/PLAN-037.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Alternatives

1. Retry the full Codex executor turn when the error text matches
   `Reconnecting...`. This is heavier, can duplicate side effects, and works
   against Codex app-server's own reconnect loop.
2. Treat all current-protocol `error` notifications as non-fatal. This is too
   broad because app-server may use the same notification method for real
   non-terminal but unrecoverable errors.
3. Skip code changes and classify the finding as transient local Codex state.
   Direct probes make the environment look healthy now, but the existing
   immediate-fail behavior is still a concrete bug when app-server emits
   recoverable reconnect progress.

## Annotations

- 2026-04-29 10:56: Implemented and verified. Current-protocol Codex
  `error` notifications that exactly match transient reconnect progress
  (`Reconnecting... n/n`) are ignored so the executor waits for the terminal
  `turn/completed` result. Non-transient current errors and failed
  `turn/completed` results remain fatal. Focused Codex tests, root gates, real
  local Codex executor smoke/resume checks, and the test-fleet local Codex
  worker E2E all passed.
