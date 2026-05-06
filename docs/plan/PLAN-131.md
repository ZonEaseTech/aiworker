# PLAN-131 Governance Kernel harness — full 5×2 matrix on cli-release-local

- **status**: pending
- **createdAt**: 2026-05-06 09:05
- **relatedTask**: TODO-034

## Context

PLAN-130 / QA-013 proved the Soul-agnostic Brain Governance Kernel claim on
`worker-source-local` mode (10 pairs × 30 source-backed checks = 300 PASS).
For published-CLI symmetry the existing record is compact-only:
QA-009 / QA-011 / QA-012 each ran two pairs against
`@zonease/aiworker-cli@0.9.1`. Running the full matrix on
`cli-release-local` once closes the published-CLI side of the claim.

## Proposal

1. Run `scripts/governance-kernel-harness.ts --mode cli-release-local
   --version 0.9.1 --matrix full` on a fresh debug root with a non-overlapping
   `--port-base`.
2. Record results in `docs/task/QA-014.md` with the full pair table and any
   non-pass rows as follow-up references.
3. If a pair regresses on the published CLI but passes on source, file a
   BUG against the published CLI (do not weaken the harness assertion).

## Risks

- Same as PLAN-130: ~70-100 minutes wall clock; LLM jitter may push some
  turns near the 240s timeout. The published 0.9.1 CLI matches source on the
  compact matrix, so a clean full run is the expected outcome.
- npm install path is exercised once per debug root; transient network
  failures should retry but a flaky failure must surface as a `fail` row in
  the report rather than be retried silently.

## Scope

- No code change unless a real defect surfaces.
- `docs/plan/PLAN-131.md`, `docs/task/TODO-034.md`, `docs/task/QA-014.md`,
  `docs/plan/index.md`, `docs/task/index.md`.

## Alternatives

- Skip the full published-CLI run and rely on compact published runs +
  source-side full coverage. Rejected: the goal asks for both source-local
  and `cli-release-local` validation; symmetric full coverage forecloses
  the question of source-only kernel parity.

## Validation

- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode cli-release-local --version 0.9.1 --matrix full --debug-root
  /home/ben/projects/debug-aiworker/qa-2026-05-06-governance-full-cli
  --timeout-ms 240000 --port-base 19560`.
- Inspect `governance-kernel-summary.json` and `governance-kernel-report.md`.
- Record results in `docs/task/QA-014.md`.

## Annotations

- 2026-05-06 09:05: Approved under the active Project Brain governance
  objective. Verification-only run; no product behavior or release-only
  paths touched.
