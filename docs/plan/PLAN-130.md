# PLAN-130 Governance Kernel harness — full 5×2 matrix run

- **status**: completed
- **createdAt**: 2026-05-06 08:25
- **approvedAt**: 2026-05-06 08:25
- **completedAt**: 2026-05-06 09:01
- **relatedTask**: TODO-033

## Context

PLAN-127 / PLAN-128 / PLAN-129 built and extended a repeatable Governance
Kernel regression harness with positive and negative admission paths,
truthfulness assertions, executor parity checks, and REST surface smoke. The
default mode is compact (2 pairs) because the harness is meant to be
re-runnable on every change.

The "Soul-agnostic Governance Kernel" claim says every Soul in the Soul
registry — `developer`, `hr-recruiting`, `finance-ops`, `qa-reviewer`,
`general-assistant` — must hit the same kernel invariants on both supported
executors (`codex`, `claude-code`). Compact runs cannot prove that.

## Proposal

1. Run the harness once with `--mode worker-source-local --matrix full`.
2. Record results in `docs/task/QA-013.md` with the full pair table, the
   number of `pass` / `fail` / `skipped` rows per pair, and any
   Soul-specific divergence as follow-up references.
3. If a fail row indicates a real defect, file a BUG and pause this slice
   until the BUG is closed.
4. If every row is `pass`, close PLAN-130 and TODO-033 with the QA-013
   evidence pointer.

## Risks

- Full matrix runtime is ~10 pairs × (6 LLM turns + admission roundtrip +
  reject + secret-scan-block + REST smoke). Real LLM call time dominates;
  expect 60-90 minutes wall clock with current Codex / Claude Code latency.
  Use a fresh debug root and a high `--timeout-ms` to absorb LLM jitter.
- Real LLM responses for less-exercised Souls (`hr-recruiting`,
  `finance-ops`, `qa-reviewer`) may surface Soul-specific behavior that the
  compact matrix never observed (e.g., Soul guard refusal style, risk
  classification edge cases). Treat divergence as a finding to file, not a
  reason to weaken the assertion.

## Scope

- Run `scripts/governance-kernel-harness.ts` (no code change unless a real
  defect surfaces).
- `docs/plan/PLAN-130.md`, `docs/task/TODO-033.md`, `docs/task/QA-013.md`,
  `docs/plan/index.md`, `docs/task/index.md`.

## Alternatives

- Skip the full run and rely on compact only. Rejected: the
  Soul-agnostic claim cannot be proven on two Souls, and the goal contract
  asks for evidence-based final state, not best-effort coverage.
- Run full on `cli-release-local` instead of source. Rejected: source is
  the canonical regression boundary; published CLI parity is already
  established by QA-009 / QA-011 / QA-012 compact runs.

## Validation

- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode worker-source-local --matrix full --debug-root
  /home/ben/projects/debug-aiworker/qa-2026-05-06-governance-full
  --timeout-ms 240000 --port-base 19540`.
- Inspect `governance-kernel-summary.json` and `governance-kernel-report.md`.
- Record results in `docs/task/QA-013.md`.

## Annotations

- 2026-05-06 08:25: Approved under the active Project Brain governance
  objective. The slice is a verification-only run; no product behavior or
  release-only paths are touched.
- 2026-05-06 09:01: Completed. Full 5×2 matrix on source-local: 10 pairs,
  30 source-backed checks each, 300 PASS / 0 FAIL / 0 SKIPPED. Evidence in
  QA-013.
