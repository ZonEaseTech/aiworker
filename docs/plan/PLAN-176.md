# PLAN-176 Brain Engine reviewer contract

- **status**: draft
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker has control executor paths and quality-gate evaluator support, but the
product contract for Brain Engine as reviewer / evaluator / lesson extractor is
not yet explicit enough for 1.0.

## Goal

Define and implement a bounded Brain Engine reviewer contract that reviews task
results without becoming another executor or bypassing Kernel authority.

## Scope

- Define reviewer input:
  - task goal;
  - selected scope / Soul rubric;
  - Journal summary;
  - artifact/evidence refs;
  - executor final output;
  - authority mode and hard invariant signals.
- Define reviewer output schema:
  - quality assessment;
  - evidence gaps;
  - unsupported claims;
  - rerun/repair suggestion;
  - lesson candidates;
  - confidence and source/mode.
- Run reviewer with tools disabled and bounded context.
- Keep reviewer output advisory until Kernel Gate consumes it.

## Non-Goals

- Brain Engine does not execute tools.
- Brain Engine does not write canonical Brain.
- Brain Engine does not make final high-risk authorization decisions.

## Acceptance Criteria

1. Brain Engine review output is structured and schema-validated.
2. Reviewer failures fall back truthfully without blocking unrelated hard-invariant
   checks.
3. Gate verdict can cite Brain Engine review reasons separately from hard
   invariant reasons.
4. Tests cover valid review, invalid JSON/schema drift, timeout/fallback, and
   no-tools behavior.

## Verification

- Focused core tests for reviewer contract.
- Existing quality-gate / decision-pipeline tests remain passing.
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-173
- **blocks**: PLAN-175, PLAN-178
