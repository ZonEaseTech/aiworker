# PLAN-192 Executor non-interference boundary

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 16:20
- **approvedAt**: 2026-05-09 16:20
- **relatedTask**: REFACTOR-026

## Current State

The architecture and GOALS documents already define the right boundary:
AIWorker owns Project Brain, governance evidence, Case state, and worker/fleet
operations; external executors own task execution, approval, sandbox, native
session, and tool loop.

Source audit found the implementation still violates that boundary in default
paths:

1. Native executor adapters install hard kill timers by default.
2. Codex / Claude Code / ACP force or auto-answer permission behavior.
3. ProcessManager and dead-loop detection can cancel or fail native executor
   runs from AIWorker-side heuristics.
4. Control-plane LLM calls reuse the task executor when no dedicated control
   executor is configured.
5. Executor failures are not durably reflected back into Chat messages.

## Proposal

Implement an observation-first boundary in one focused slice:

1. Make native executor kill timers opt-in by explicit `timeoutMs`; keep HTTP /
   generic CLI request timeouts unchanged.
2. Remove default executor-native permission overrides and auto-approval from
   Codex, Claude Code, and ACP.
3. Disable ProcessManager stall cancellation by default while retaining the
   opt-in env knob.
4. Convert dead-loop detection from abort/fail to warning-only journal and bus
   signal.
5. Stop default control-plane reuse of the task executor; without a configured
   control executor, use heuristic / fallback behavior.
6. Persist a concise assistant failure message on executor error.
7. Update docs and focused tests.

## Scope

- `packages/core/src/worker/executor/*`
- `packages/core/src/worker/orchestrator/*`
- `packages/core/src/worker/runtime.ts`
- `packages/core/src/worker/management/*`
- `packages/core/src/config/worker.ts`
- `packages/shared/src/fleet/*`
- focused tests for executor defaults, runtime control executor resolution,
  dead-loop behavior, config schema, and worker info
- `docs/task/REFACTOR-026.md`
- `docs/plan/PLAN-192.md`
- `docs/executor-engines.md`
- `docs/architecture.md`
- `docs/changelog.md`

## Risks

- Worker Admin Chat will become less useful as a direct task runner for
  engines that require interactive native permissions. This is intentional:
  Admin Chat is a management/debug surface, not the primary native executor
  product path.
- Long-running hung executor processes can remain active without an explicit
  watchdog. Operators can still set `PROCESS_STALL_TIMEOUT_MS` or executor
  `timeoutMs` when they want a managed watchdog.
- Some tests encoded the previous MVP behavior and must be rewritten to guard
  the new product boundary instead of preserving old compatibility.

## Verification

- `bun run --filter '@zonease/aiworker-core' test`
- focused CLI / API tests touched by config or worker info changes
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`

## Progress

- 2026-05-09 16:20: Plan created from the confirmed executor interference
  audit. Implementation started immediately after approval.
- 2026-05-09 17:05: Implemented executor non-interference defaults: native
  watchdogs are opt-in, permission auto-approval defaults were removed,
  task executor reuse for control-plane LLM calls was stopped, dead-loop
  detection became warning-only, and executor failures now persist a Chat
  assistant failure message.
- 2026-05-09 17:15: Final verification passed across typecheck, lint, full
  test suite, production build, and diff whitespace checks.
