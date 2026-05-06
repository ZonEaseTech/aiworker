# TODO-031 Extend Governance Kernel harness with admission roundtrip evidence

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 07:30
- **claimedAt**: 2026-05-06 07:30
- **completedAt**: 2026-05-06 07:45
- **plan**: PLAN-128
- **sourceObjective**: Project Brain governance node closeout — durable Brain
  mutation must go through admission, and admission must work
- **relatesTo**: TODO-027, PLAN-127, QA-009, QA-010

## Context

The Governance Kernel regression harness landed under PLAN-127 / TODO-027 with
two compact pairs and 22 source-backed checks. It proves the negative Project
Brain invariant: a `pending` admission proposal does not write canonical memory
under `<projectScope>/.aiworker/memories/`.

It does not yet prove the positive invariant: that an `approved` admission
proposal, when applied with `--commit`, actually:

1. writes the canonical memory file under
   `<projectScope>/.aiworker/memories/<topic>.md`;
2. appends an index entry to `<projectScope>/.aiworker/MEMORY.md`;
3. flips `brain_admission_proposals.status` from `approved` to `applied`;
4. writes a `brain_admission_decisions` row with `decision='applied'`;
5. is reflected in `aiworker brain brief` output (so admitted memory is
   visible to downstream consumers, not just on disk).

Without these checks, the regression harness cannot detect a regression in the
admission materializer pipeline. That pipeline is the load-bearing path for
"durable Brain mutation must go back through AIWorker admission"; the harness
should fail loudly the moment apply stops being source-backed.

## Scope

- Extend `scripts/governance-kernel-harness.ts` to:
  - Run `brain admission approve <id> --decided-by harness` against the direct
    fixture proposal already created per pair.
  - Verify approval evidence: proposal status flips to `approved` and a
    `brain_admission_decisions` row with `decision='approved'` exists.
  - Run `brain admission apply <id> --commit --decided-by harness`.
  - Verify apply evidence: outcome JSON `kind='applied'`; canonical memory file
    at `memories/<target>.md`; MEMORY.md index entry appended; proposal status
    `applied`; new decision row `decision='applied'`.
  - Verify projection: `brain brief --task <probe>` includes the new memory
    body or topic identifier.
  - Update the existing canonical memory boundary check to reflect that after
    apply the directory has exactly one expected file (the just-applied
    fixture), so the negative invariant continues to be enforced on every
    other LLM-claimed memory write.
- Keep the existing pre-apply assertion (no canonical memory before apply) so
  ordering is part of the source-backed evidence.

## Out of Scope

- New CLI flags or product behavior changes.
- Apply support for non `memory-add` admission kinds (still flagged unsupported
  by the materializer; harness must keep using `memory-add`).
- Rollback / revert path: not yet implemented in the materializer; track
  separately if needed.

## Acceptance Criteria

1. Harness compact source-local run completes with `overall: pass` for both
   pairs after the new roundtrip checks are added.
2. The new checks have explicit evidence pointers (log file paths or
   filesystem paths) and structured detail strings, matching the existing
   harness check style.
3. PMA QA task records the source-backed run; if apply is also run against the
   published CLI, the published-CLI run is recorded in the same QA task or a
   sibling QA entry.
4. PLAN-128 is closed only after the harness pass is recorded with evidence;
   no skipped or fail rows in the new section.

## Notes

- 2026-05-06 07:30: Opened to close the positive admission roundtrip evidence
  gap surfaced while reading the QA-010 source-local report. PLAN-128 will
  carry the implementation slice.
- 2026-05-06 07:45: Completed under PLAN-128. The harness now runs
  `pending → approved → applied` per pair and verifies canonical memory
  filesystem writes, MEMORY.md index entry, DB transitions, and brain brief
  projection. Source-local compact run passed with no skipped or failed
  checks; evidence in QA-011.
