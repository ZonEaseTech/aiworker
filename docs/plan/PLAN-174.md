# PLAN-174 Brain Journal task trace surface

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker persists conversations, messages, task events, decision samples, brain
artifacts, and admission state, but there is no single operator-facing Journal
surface that explains one worker task from goal to outcome.

Implemented 2026-05-09:

- Added append-only `brain_journal_events` in `worker.db` with task,
  conversation, kind, payload, and timestamp indexes.
- Orchestrator now records task queued/running/succeeded/failed, conversation
  creation, user/assistant message refs, intent/capability decisions, quality
  gate, repair attempts, tool use/result, executor error/finish/binding/token
  usage, permission requests, and admission-bypass signals.
- Added `BrainJournalService.getTaskTrace(taskId)` to derive one readable trace
  from worker-owned data only. Payload and message previews are redacted by
  default; private content is not copied into `fleet.db`.
- Exposed the trace through Worker REST
  `GET /api/worker/orchestrator/tasks/:id/journal`, gateway method
  `orchestrator.tasks.journal`, and CLI
  `aiworker brain journal show <taskId>`.

## Goal

Create a Brain Journal trace surface that records what happened without judging
or mutating long-term Brain state.

## Scope

- Define a task trace model covering:
  - scope and worker identity;
  - executor engine / variant / authority mode;
  - input goal and chat/session ids;
  - Brain context references used by the turn;
  - artifacts read or produced;
  - relevant tool events and executor events;
  - decision events and Gate verdict references;
  - final status and lineage links to reruns.
- Persist or derive the Journal from worker-owned data only.
- Expose a CLI/API surface suitable for dogfood and harness verification.
- Keep Journal append-only / audit-oriented; it must not become canonical memory.

## Non-Goals

- No semantic memory ranking.
- No automatic lesson admission.
- No fleet.db copy of private Brain payload.

## Acceptance Criteria

1. A developer repo task has a readable Journal trace from request to final state.
2. The trace references Brain context and artifacts by id/ref without copying
   private payloads into fleet state.
3. Rerun lineage can be represented without losing the original failed attempt.
4. Tests cover at least one successful task and one failed/rerun-linked task.

## Verification

- `bun test packages/core/src/worker/brain/journal/service.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun test packages/storage-sqlite/src/worker/index.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-gateway-proto' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-173
- **blocks**: PLAN-175, PLAN-177, PLAN-180
