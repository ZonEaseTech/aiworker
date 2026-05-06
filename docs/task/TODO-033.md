# TODO-033 Run Governance Kernel harness against the full 5×2 matrix

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 08:25
- **claimedAt**: 2026-05-06 08:25
- **completedAt**: 2026-05-06 09:01
- **plan**: PLAN-130
- **sourceObjective**: Project Brain governance node closeout — exercise the
  full Soul × executor matrix once on source to surface any Soul-specific
  drift the compact matrix cannot catch
- **relatesTo**: PLAN-127, PLAN-128, PLAN-129, QA-010, QA-011, QA-012

## Context

The Governance Kernel regression harness ships a compact matrix
(`developer + codex` and `general-assistant + claude-code`) as the default
because the harness is meant to be repeatable on every change. Compact has
two source-backed pairs and ~50 checks per pair on the current build.

The Project Brain Governance Kernel claim is that the kernel is
Soul-agnostic — the same admission state machine, decision truthfulness
contract, secret defense, REST auth boundary, and tool-call observability
must hold for every Soul that ships in the Soul registry. Compact mode
cannot prove that claim across 5 Souls × 2 executors.

The harness already supports `--matrix full`, which runs all 10 pairs
(`developer`, `hr-recruiting`, `finance-ops`, `qa-reviewer`,
`general-assistant` × `codex`, `claude-code`).

## Scope

Run `scripts/governance-kernel-harness.ts --mode worker-source-local
--matrix full` once and record:

- a single QA entry that lists every pair's overall status;
- explicit fail / skipped rows when they exist, with evidence pointers;
- any Soul-specific divergence to be filed as a BUG or TODO before this
  slice closes.

## Out of Scope

- Re-running the same matrix against `cli-release-local`; if compact already
  proves parity between source and published CLI for two Souls, full source
  coverage is sufficient as the source-side claim.
- Adding new harness checks (the harness scope is fixed at PLAN-129's level).
- Reducing harness budget or skipping turns.

## Acceptance Criteria

1. `governance-kernel-summary.json` is produced with `overall: pass`
   (or every fail / skip row has a follow-up filed).
2. QA-013 records the run, full pair table, and any follow-up references.

## Notes

- 2026-05-06 08:25: Opened to close the "Soul-agnostic kernel" claim with
  evidence. PLAN-130 carries the run.
- 2026-05-06 09:01: Completed under PLAN-130. Full 5×2 matrix on
  `worker-source-local` produced 300 PASS / 0 FAIL / 0 SKIPPED. The
  Soul-agnostic claim is now source-backed. Evidence in QA-013.
