# TODO-032 Harness — admission reject and secret-scan-block coverage

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 07:55
- **claimedAt**: 2026-05-06 07:55
- **completedAt**: 2026-05-06 08:14
- **plan**: PLAN-129
- **sourceObjective**: Project Brain governance node closeout — admission state
  machine and secret defense must have source-backed regression evidence
- **relatesTo**: TODO-031, PLAN-128, QA-011, BUG-055

## Context

PLAN-128 added positive admission roundtrip evidence
(`pending → approved → applied`). The harness still does not exercise:

1. **Reject path** — `pending → rejected`. The materializer must record a
   `decision='rejected'` row, leave the proposal at `status='rejected'`, and
   never produce a canonical memory file. Without harness coverage we cannot
   detect a regression where rejected proposals slip through to the
   filesystem.
2. **Secret-scan block path** — BUG-055 P0 fix. When a proposal body matches
   the `scanBodyForSecrets` rules and the operator runs `apply --commit`
   without `--allow-secret-body`, the materializer must return
   `outcome.kind='blocked-by-secret-scan'`, leave the proposal at
   `status='approved'`, write no decision row, and never touch the canonical
   memory filesystem. Unit tests in
   `packages/core/src/worker/brain/admission/service.test.ts` cover the
   service layer; the harness does not yet cover the CLI plumbing.

These are the two highest-leverage transitions still missing from the
Governance Kernel regression harness.

## Scope

Extend `scripts/governance-kernel-harness.ts` per pair, after the existing
positive roundtrip (PLAN-128 block) and before the REST smoke step:

- Reject sub-block:
  - Create a sibling fixture `harness-${pairId}-reject` with a clean,
    deterministic body and a distinct `topic`.
  - Run `brain admission propose`, `brain admission reject`.
  - Verify proposal status flips to `rejected`, a decision row with
    `decision='rejected'` exists, and no canonical memory file is written for
    the reject fixture topic.
- Secret-scan block sub-block:
  - Create a sibling fixture `harness-${pairId}-secret` with a body
    containing a synthetic `apiKey=sk-LIVE-fake...` token that triggers
    `scanBodyForSecrets`.
  - Run `propose`, `approve`, then `apply --commit` (default policy `block`).
  - Verify outcome `kind='blocked-by-secret-scan'`, proposal status stays
    `approved`, no `decision='applied'` decision row is written, and the
    canonical memory file for the secret fixture topic does not exist.

## Out of Scope

- `--allow-secret-body redact` and `--allow-secret-body raw` paths: covered
  by service-layer unit tests; not added here to keep the harness compact.
- Rollback / revert after apply: not yet implemented in the materializer.

## Acceptance Criteria

1. Harness compact source-local run completes with `overall: pass` for both
   pairs after the new reject and secret-scan blocks are added.
2. Each new check has explicit evidence pointers (log file paths and DB query
   logs) and uses source-backed assertions (DB query, filesystem, parsed CLI
   JSON), not assistant self-report.
3. PMA QA task (QA-012) records the run.

## Notes

- 2026-05-06 07:55: Opened to extend the regression harness to the remaining
  state transitions and the BUG-055 secret defense. PLAN-129 carries the
  slice.
- 2026-05-06 08:14: Completed under PLAN-129. Harness now covers
  `pending → rejected` and `approved → blocked-by-secret-scan` end-to-end on
  the CLI surface. Source-local compact run passed for both pairs after the
  exit-code assertion was corrected. Evidence in QA-012.
