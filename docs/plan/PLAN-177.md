# PLAN-177 Repair and rerun orchestration

- **status**: draft
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker can run executor turns and persist conversations/tasks, but repair and
rerun are not yet a first-class proof-loop concept tied to Gate verdicts and
Journal lineage.

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

- Focused orchestrator tests for repair/rerun/hold.
- Harness extension for one compact repair/rerun path if feasible.
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-174, PLAN-175
- **blocks**: PLAN-180
