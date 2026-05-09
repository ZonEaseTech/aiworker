# PLAN-190 Case-driven Project Brain learning loop validation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 15:00
- **approvedAt**: 2026-05-09 15:00
- **task**: FEAT-058

## Context

The current implementation shipped a Worker Case surface, but real manual use
showed the surface can still behave like an executor harness:

- `BrainJournalService.getTaskTrace()` merges every event in the conversation
  into every task trace, so Case File projection can pick later task outcomes.
- `BrainCaseService` chooses the latest assistant message in the conversation
  instead of the task's recorded `assistantMessageId`.
- Review Decision maps a heuristic observe-only pass to `ready_to_ship`, which
  makes the Case surface look more certain than the evidence supports.
- Codex current-protocol native sessions persist extended history, while the
  adapter still replays full AIWorker conversation history on resumed turns.

The product thesis only survives if Case is a task-scoped evidence unit and
Brain learning is admission-gated from Case evidence, not from generic chat
claims.

## Proposal

1. Make Brain Journal task trace task-scoped by default:
   - only task-owned Journal events participate in the trace;
   - message refs are narrowed to the task's assistant message window when
     `assistantMessageId` exists;
   - failed tasks without an assistant message fall back to the task time window.
2. Make Case outcome selection exact:
   - prefer `agent_tasks.result.assistantMessageId`;
   - do not use the latest assistant message from the whole conversation.
3. Make Review Decision truthful:
   - pure heuristic pass is `needs_review`;
   - Brain Engine reviewed pass can remain `ready_to_ship`;
   - failed/cancelled tasks remain `needs_rerun`.
4. Make Codex native resume native-first:
   - fresh current/legacy turns still receive the existing worker-rendered
     context for bootstrap/recovery;
   - resumed current native threads receive only system/Project Brain messages
     plus the latest user message.
5. Record the source validation and product conclusion in QA-024.

## Scope

- `packages/core/src/worker/brain/journal/service.ts`
- `packages/core/src/worker/brain/cases/service.ts`
- `packages/core/src/worker/executor/engines/codex/executor.ts`
- focused tests for the files above
- GOALS / architecture wording only if needed to prevent future drift
- PMA task / plan / changelog / QA records

## Risks

- Some older traces that recorded only conversation-scoped events may show less
  evidence. That is preferable to cross-task evidence pollution.
- Native resume prompt minimization depends on Codex thread continuity. Stale
  binding fallback must still restore full DB-rendered context on a new thread.
- This plan validates source behavior only. It should not be called release
  readiness unless package and harness validation are run separately.

## Verification

- `bun test packages/core/src/worker/brain/journal/service.test.ts` — 9 pass / 0 fail.
- `bun test packages/core/src/worker/brain/cases/service.test.ts` — 5 pass / 0 fail.
- `bun test packages/core/src/worker/executor/engines/codex/executor.test.ts` — 12 pass / 0 fail.
- `bun test apps/cli/src/commands/worker/case.test.ts apps/api/src/worker/cases/routes.test.ts` — 8 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-core' test` — 674 pass / 0 fail.
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run test` — pass.

## Progress

- 2026-05-09 15:00：计划创建并进入 implementing。用户已明确要求按建议进入 goal-mode 实施验证，因此本计划视为已批准。
- 2026-05-09 15:50：完成 task-scoped Journal / Case projection、Review Decision truthfulness、Codex native resume prompt 最小实现；同步 FEAT-058 / QA-024 证据。
- 2026-05-09 15:52：聚焦测试、core 包级测试、全仓 typecheck / lint / test 全部通过，本计划关闭。
