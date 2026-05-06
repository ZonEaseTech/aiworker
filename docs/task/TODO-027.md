# TODO-027 Create Governance Kernel regression harness

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 03:15
- **claimedAt**: 2026-05-06 06:25
- **completedAt**: 2026-05-06 06:47
- **sourcePlan**: PLAN-115
- **plan**: PLAN-127

## Context

PLAN-115 intentionally closed the pre-DOC-005 broad validation harness entry and
said a new harness should be opened only after the P1 truthfulness, admission
governance, and executor parity slices were implemented.

PLAN-116 through PLAN-120 have now closed the retained post-decision defects:

- decision truthfulness and classifier fallback diagnostics;
- admission proposal entry point and bypass warning;
- Codex chat-id continuity and tool-call observability;
- init secret / doctor status operator trust;
- CLI onboarding polish.

## Scope

Build a repeatable regression harness around the Brain Governance Kernel
contract, not around old broad "Soul brain executor validation" wording.

The harness should verify at least:

- decision events expose truthful `source`, `evaluator`, and `mode`;
- admission proposal claims correspond to a worker.db admission delta, or emit a
  bypass warning;
- engine-native memory writes are not represented as canonical AIWorker Brain;
- same `chat-id` continuity is stable across supported executors;
- Codex current protocol emits tool-call observability comparable enough for
  audit;
- Soul boundary / risk-policy behavior remains source-backed and does not turn
  Brain Kernel into a hardcoded domain workflow engine.

## Acceptance Criteria

1. The harness can be run locally against a published CLI version and records
   DB / event-stream evidence.
2. The output separates source-backed pass/fail from environment-limited or
   fixture-bound checks.
3. The harness covers at least claude-code and codex when both are available,
   and skips with explicit evidence when an executor is unavailable.
4. Results are written into a single QA task or report file with enough command
   evidence to reproduce failures.

## Notes

- This is a follow-up validation entry, not a blocker for the current PLAN-115
  implementation closeout.
- Do not resurrect the rejected TODO-008 wording without aligning it to
  DOC-005 / Brain Governance Kernel.
- 2026-05-06 06:25: Claimed under PLAN-127. This slice will add a repeatable
  local harness, run it once against the current published CLI, and record the
  resulting evidence in one QA task.
- 2026-05-06 06:47: Completed under PLAN-127. Added
  `scripts/governance-kernel-harness.ts`, documented it in `aiworker-validate`,
  and recorded the passing CLI 0.9.1 compact run in QA-009. The passing report
  is
  `/home/ben/projects/debug-aiworker/qa-2026-05-06-governance-harness-0.9.1-r2/reports/governance-kernel-report.md`.
