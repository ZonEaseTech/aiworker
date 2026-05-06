# TODO-034 Run Governance Kernel harness against the full 5×2 matrix on `cli-release-local`

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 09:05
- **claimedAt**: 2026-05-06 09:05
- **completedAt**: 2026-05-06 09:46
- **plan**: PLAN-131
- **sourceObjective**: Project Brain governance node closeout — Soul-agnostic
  kernel claim must hold on the published CLI as well as source
- **relatesTo**: TODO-033, PLAN-130, QA-013

## Context

PLAN-130 ran the full 5×2 matrix on `worker-source-local` and produced
300 PASS / 0 FAIL / 0 SKIPPED, proving the Soul-agnostic kernel claim on
source. The published `@zonease/aiworker-cli@0.9.1` was previously verified
on the compact matrix only (QA-009 / QA-011 / QA-012). The black-box claim
that every Soul × executor pair on the published CLI also satisfies the
kernel invariants is currently inferred from compact symmetry, not directly
proven.

## Scope

Run the harness with `--mode cli-release-local --version 0.9.1
--matrix full` on a fresh debug root and record results in QA-014.

## Out of Scope

- New harness checks.
- Re-running the source-local full matrix (already in QA-013).

## Acceptance Criteria

1. `governance-kernel-summary.json` overall is `pass` for all 10 pairs.
2. QA-014 records the run and the published-CLI Soul-agnostic claim.

## Notes

- 2026-05-06 09:05: Opened to extend the Soul-agnostic kernel proof from
  source-local to the published 0.9.1 CLI. PLAN-131 carries the run.
- 2026-05-06 09:46: Completed under PLAN-131. Full 5×2 matrix on
  `cli-release-local` produced 300 PASS / 0 FAIL / 0 SKIPPED. Evidence in
  QA-014.
