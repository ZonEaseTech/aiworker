# PLAN-123 BUG-075..078 and TODO-028..029 governance follow-up fixes

- **status**: completed
- **createdAt**: 2026-05-06
- **completedAt**: 2026-05-06
- **relatedTask**: BUG-075, TODO-028, BUG-076, BUG-077, BUG-078, TODO-029
- **sourceObjective**: Complete the fixes and optimizations for BUG-075..078 and TODO-028..029.

## Context

1. QA-007 filed six follow-up items after the published 0.9.0 local-worker
   matrix: BUG-075, TODO-028, BUG-076, BUG-077, BUG-078, and TODO-029.
2. Current source confirms the relevant surfaces:
   - `packages/core/src/worker/orchestrator/quality-gate.ts` builds the LLM
     quality prompt, but tests do not protect the actual control-call
     `AgentRunInput` from empty user stdin regressions.
   - `packages/core/src/worker/conversation/router.ts`,
     `packages/core/src/worker/orchestrator/intent-classifier.ts`,
     `quality-gate.ts`, and `service.ts` use suppressed control calls.
     Claude Code control calls currently reuse the task executor path and can
     run with engine-native tools unless the adapter is explicitly put into a
     no-tools mode.
   - `packages/core/src/worker/orchestrator/decision-pipeline-stats.ts`
     explicitly keeps recent stats in process memory only, so `aiworker run`
     cannot be reflected by a later `brain status` process.
   - `packages/core/src/worker/orchestrator/dead-loop.ts` only resets on text
     deltas; successful tool results do not count as progress.
   - `apps/api/src/modes/worker.ts` still documents stale
     `/api/worker/orchestrator/chat` and omits the mounted task/conversation
     routes.
   - `detectAdmissionSuccessClaim()` currently treats benign `pending`
     proposal mentions as bypass claims.

## Proposal

1. Add a best-effort no-tools control mode for Claude Code suppressed
   evaluator calls and pass `tools: []` from control-call sites. The adapter
   will add no-tool CLI flags and deny any tool control request defensively.
2. Strengthen quality-gate tests so the LLM evaluator input always includes a
   non-empty user message containing the request and assistant answer.
3. Persist recent decision-stage samples in `worker.db`, read the latest
   window back in `brain status` / REST summaries, and keep the in-memory
   ring buffer as a fallback for tests or unmigrated databases.
4. Treat tool results and terminal tool lifecycle events as dead-loop progress
   so legitimate multi-tool Codex turns can continue, while true no-progress
   streams still abort.
5. Update Worker OpenAPI registration to document actual task/conversation
   routes and remove the stale chat route.
6. Tighten the admission bypass detector to high-confidence mutation claims
   and include a short redacted claim excerpt in the event payload.
7. Update architecture/changelog/task tracking after focused verification.

## Risks

1. No-tool mode is best-effort because external executor runtimes own their
   native capability model. AIWorker can deny Claude Code control requests and
   pass no-tool flags, but it still does not become an executor sandbox.
2. Persisting decision samples adds a worker.db migration. Existing local
   workers must run migrations before the new table is available; runtime
   recording must therefore be best-effort.
3. Dead-loop tuning must preserve the original BUG-063 guard for repeated
   tool calls without text or results.

## Scope

- Core worker orchestrator decision, classifier, quality gate, dead-loop, and
  bypass observability logic.
- Claude Code adapter control-call no-tool behavior.
- Worker SQLite schema and migrations for decision-stage samples.
- Worker OpenAPI documentation registry.
- Focused tests and task/changelog documentation.

## Non-Scope

- Fleet, gateway, enrollment, fleet UI, and published release execution.
- Full automated Governance Kernel harness; TODO-027 remains separate.
- Executor-native sandbox guarantees beyond best-effort control-call
  projection.

## Validation

Completed gates:

- `bun test packages/core/src/worker/orchestrator/quality-gate.test.ts packages/core/src/worker/conversation/router.test.ts packages/core/src/worker/orchestrator/dead-loop.test.ts packages/core/src/worker/orchestrator/decision-pipeline-stats.test.ts packages/core/src/worker/orchestrator/service.claude-code.test.ts packages/core/src/worker/executor/engines/claude-code/executor.test.ts packages/storage-sqlite/src/worker/index.test.ts apps/api/src/modes/worker.openapi.test.ts` -> 58 pass / 0 fail
- `bun run typecheck` -> pass
- `bun run lint` -> pass
- `bun run test` -> pass

## Progress

- 2026-05-06: Claimed BUG-075, TODO-028, BUG-076, BUG-077, BUG-078, and
  TODO-029 for implementation.
- 2026-05-06: Completed implementation and focused/full validation for all
  six follow-up items.
