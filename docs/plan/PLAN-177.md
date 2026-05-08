# PLAN-177 Repair and rerun orchestration

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker can run executor turns and persist conversations/tasks, but repair and
rerun are not yet a first-class proof-loop concept tied to Gate verdicts and
Journal lineage.

Implementation started 2026-05-09:

- Keep automatic behavior bounded to the existing single repair attempt.
- Add explicit operator-triggered rerun with parent/child task lineage.
- Refuse hidden autonomous loops through a small rerun cap and operator-visible
  AppError outcomes.

Implemented 2026-05-09:

- Added `orchestrator.rerunTask(taskId, { prompt? })` to create a bounded
  proof-loop child task from the parent Gate verdict.
- Recorded `rerun.requested`, child `task.queued` lineage payloads, and
  `task.held` Journal events for quality-gate block mode.
- Exposed rerun through Worker REST, gateway method `orchestrator.tasks.rerun`,
  gateway bridge, and worker node handlers.
- Added a retry cap of 3 child reruns per parent task; exceeding it returns a
  typed AppError instead of looping.

## Goal

Implement bounded repair/rerun orchestration so a failed Gate verdict can feed a
clear failure reason back to the executor without losing traceability or looping
forever.

## Scope

- Support Gate-driven actions:
  - `repair`: same executor, same task lineage, targeted correction prompt;
  - `rerun`: new executor turn with failure reasons and evidence requirements;
  - `switch-executor`: optional executor change when configured and available;
  - `hold`: stop and require operator action.
- Persist lineage from original attempt to repair/rerun attempts.
- Add retry caps and loop guards.
- Surface operator-visible status and next action.

## Non-Goals

- No autonomous infinite task planning.
- No generalized workflow builder.
- No automatic high-risk approval.

## Acceptance Criteria

1. A Gate verdict can produce a repair/rerun request with explicit reasons.
2. Rerun lineage is visible in the Journal trace.
3. Retry caps prevent runaway loops.
4. Operator can distinguish executor failure, Gate failure, and held tasks.

## Verification

- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-gateway' typecheck`
- `bun run --filter '@zonease/aiworker-gateway-proto' typecheck`
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-174, PLAN-175
- **blocks**: PLAN-180
