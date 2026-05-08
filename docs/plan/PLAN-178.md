# PLAN-178 Brain Inbox lesson admission flow

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker supports Brain admission materialization for memory and Brain skills,
but lesson candidates from task outcomes are not yet presented as a deliberate
Brain Inbox product surface.

Implemented 2026-05-09:

- Added `BrainInboxService.proposeFromTask(taskId)` to read Brain Engine
  `lessonCandidates` from Journal and create pending `memory-add` admission
  proposals.
- Candidate proposals include source event evidence, candidate evidence refs,
  scope/soul, risk, confidence, target, payload body, and rollback.
- Exposed the flow through Worker REST
  `POST /api/worker/brain/inbox/from-task/{taskId}` and CLI
  `aiworker brain inbox propose <taskId>`.
- Rejected candidates remain rejected admission rows and never mutate canonical
  Brain memory.

## Goal

Create a Brain Inbox flow that turns selected task lessons into reviewable
admission proposals without silently writing long-term memory.

## Scope

- Define lesson candidate types:
  - repo fact;
  - architecture decision;
  - build/release procedure;
  - recurring failure pattern;
  - executor reliability note;
  - Brain skill improvement.
- Extract candidates from Brain Engine review and Journal evidence.
- Show candidate source, scope, risk, expiry/retention, confidence, target file,
  and rollback plan.
- Bridge approved candidates into existing Brain admission.
- Keep candidate review batch-friendly and low interruption.

## Non-Goals

- No automatic canonical memory write.
- No general vector memory system.
- No cross-scope memory promotion.

## Acceptance Criteria

1. A completed task can produce zero or more Brain Inbox candidates.
2. Each candidate has evidence refs, scope, risk, expiry/retention, and rollback.
3. Operator can approve/apply through the existing admission path.
4. Rejected candidates do not alter canonical Brain.

## Verification

- `bun test packages/core/src/worker/brain/inbox/service.test.ts`
- `bun test apps/api/src/worker/brain/routes.test.ts`
- `bun test apps/cli/src/commands/worker/brain-admission.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-174, PLAN-176
- **blocks**: PLAN-180, PLAN-181
