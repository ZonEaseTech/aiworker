# REFACTOR-026 Executor non-interference boundary

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-09 16:20
- **claimedAt**: 2026-05-09 16:20
- **plan**: PLAN-192
- **sourceObjective**: Stop AIWorker from silently interfering with external
  executor lifecycle, approval, session, and control-plane behavior by default.
- **relatesTo**: GOALS.md, docs/architecture.md, FEAT-052, FEAT-056,
  FEAT-058, BUG-087

## Context

Live dogfood against a Codex-backed worker showed a task failing after roughly
120 seconds with `codex child exited unexpectedly`. The root cause was not a
native Codex crash: AIWorker killed the `codex app-server` child through its
per-turn hard timeout and surfaced the result as a child-process failure.

That failure exposed a broader architectural drift from the product north star:
AIWorker says external executors own tool loop, permission policy, sandbox,
native session, model routing, and task execution, but several default runtime
paths still modify or terminate executor work.

## Problem

The current default runtime can interfere with executor-native behavior:

- Codex / Claude Code / ACP / Cursor profiles and adapters impose native-turn
  hard timeouts unless operators manually override them.
- Codex forces `approvalPolicy=never` and auto-allows permission requests.
- Claude Code forces `--dangerously-skip-permissions` and defaults to
  auto-approve control responses.
- ACP defaults to yolo / auto-approve.
- The ProcessManager stall watchdog defaults to canceling running tasks.
- The dead-loop detector defaults to returning executor failure from observed
  tool-call patterns.
- Suppressed control-plane calls reuse the task executor when no dedicated
  control executor is configured.

## Expected

AIWorker should be observation-first around native executors:

- no default native-turn kill timer;
- no default executor-native permission override or auto-approval;
- no default reuse of task executor for control-plane LLM calls;
- dead-loop and stall signals are visible but do not stop executor work unless
  an operator explicitly configures a watchdog or cancels the task;
- task failures are durably visible in Chat / Case surfaces.

## Acceptance Criteria

1. Native executor adapters do not install a per-turn kill timer unless
   `timeoutMs` is explicitly configured.
2. Codex does not force approval policy and does not auto-allow permission
   requests by default.
3. Claude Code does not force `--dangerously-skip-permissions` by default and
   does not auto-approve control requests unless an explicit policy is wired.
4. ACP does not default to yolo / auto-approve.
5. ProcessManager stall timeout is disabled by default and remains opt-in by
   env configuration.
6. Dead-loop detection records warning signals but does not abort executor
   output.
7. LLM control-plane calls require a dedicated
   `orchestrator.decisionPipeline.executor`; otherwise they fall back to
   heuristic / observe-only behavior.
8. Executor errors write a durable assistant failure message so Worker Admin
   Chat can show the failure after refresh or missed SSE.
9. Tests and docs encode the non-interference contract.

## Notes

- 2026-05-09 16:20: Claimed after the user confirmed the full audit proposal.
  This is a P0 boundary correction because the current defaults make AIWorker
  compete with or override native executors.

## Validation

- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts src/worker/management/info.test.ts src/worker/orchestrator/decision-pipeline-stats.test.ts src/worker/orchestrator/service.history.test.ts src/worker/orchestrator/service.claude-code.test.ts src/worker/executor/engines/claude-code/protocol.test.ts src/worker/executor/engines/claude-code/executor.test.ts src/worker/executor/engines/codex/executor.test.ts src/worker/executor/engines/acp/harness.test.ts src/worker/executor/engines/cursor/executor.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/executor/default-profiles.test.ts src/worker/executor/engines/claude-code/executor.test.ts src/worker/executor/engines/codex/executor.test.ts src/worker/executor/engines/acp/harness.test.ts src/worker/orchestrator/service.history.test.ts src/worker/management/info.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/worker/brain/routes.test.ts src/worker/management/routes.test.ts src/modes/worker.reload.test.ts src/modes/worker.bearer-auth.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/brain-brief.test.ts src/commands/worker/serve.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
