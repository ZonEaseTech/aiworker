# PLAN-180 Developer repo worker dogfood campaign

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker already has strong governance-kernel harness coverage. What remains is
product proof: can a real developer repo worker reduce repeated context work,
make outputs more reviewable, and learn safely across executor runs?

Completed 2026-05-09:

- Dogfood evidence is recorded in `docs/task/QA-022.md`.
- The campaign covered pass, Brain Engine review, repair/rerun/hold, Brain Inbox
  admission, and authority preflight on the aiworker source workspace.
- The result supports readiness closeout for the source MVP, but not a 1.0 GA
  release claim by itself.

## Goal

Run a dogfood campaign against the aiworker repo using the 1.0 proof-loop
surfaces from PLAN-174..179.

## Scope

- Define 3-5 representative repo tasks:
  - bug fix with tests;
  - release/harness diagnosis;
  - documentation update;
  - build or validation failure repair;
  - optional executor switch comparison.
- Capture Journal traces, Gate verdicts, rerun/repair lineage, Brain Inbox
  candidates, and admission outcomes.
- Compare against the same task shape without AIWorker governance where useful.
- Record evidence in `docs/task/QA-*.md` or a dedicated report under `tmp/` with
  durable summary in PMA docs.

## Non-Goals

- No production release requirement unless separately approved.
- No HR / finance / legal validation in this campaign.
- No broad performance benchmarking.

## Acceptance Criteria

1. At least one dogfood task exercises pass.
2. At least one dogfood task exercises repair/rerun or hold.
3. At least one lesson candidate reaches admission and is either approved/applied
   or intentionally rejected with evidence.
4. Results identify whether the proof loop reduced context repetition, memory
   drift, or review ambiguity.

## Verification

- `docs/task/QA-022.md`
- `bun test packages/core/src/worker/brain/journal/service.test.ts`
- `bun test packages/core/src/worker/brain/reviewer/service.test.ts`
- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test packages/core/src/worker/brain/inbox/service.test.ts`
- `bun test packages/core/src/worker/brain/authority/service.test.ts`
- `bun test apps/api/src/worker/brain/routes.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun test apps/cli/src/commands/worker/brain-admission.test.ts`
- `bun test apps/cli/src/commands/worker/run.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-174, PLAN-175, PLAN-177, PLAN-178, PLAN-179
- **blocks**: PLAN-181
