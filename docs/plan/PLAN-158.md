# PLAN-158 Source-local full Governance Kernel matrix after 0.10.0

- **status**: completed
- **createdAt**: 2026-05-07 12:56
- **approvedAt**: 2026-05-07 12:56
- **completedAt**: 2026-05-07 14:11
- **relatedTask**: QA-020

## Current State

1. `@zonease/aiworker-cli@0.10.0` is published and verified through QA-019.
2. QA-018 proved the new Brain Skill admission roundtrip on the source compact
   matrix: 80 PASS / 0 FAIL / 0 SKIPPED.
3. The source full 5×2 matrix has not yet been repeated after adding
   `brain-skill-add` materialization coverage.

## Proposal

Run `scripts/governance-kernel-harness.ts` in `worker-source-local` mode with
`--matrix full` to validate the 5 Soul × 2 executor matrix against the current
source bundle.

## Risks

1. Full matrix is expensive and may fail because an external executor runtime
   is temporarily unavailable or slow.
2. A failure may be environment-limited; classify failures from logs before
   filing a product BUG.
3. If a real regression appears, stop and open the matching BUG / fix plan
   instead of marking this QA completed.

## Scope

- `docs/task/QA-020.md`
- `docs/plan/PLAN-158.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- `docs/governance-node-status.md`

## Validation

- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts --mode worker-source-local --matrix full --debug-root <path> --port-base <port> --timeout-ms 240000`
- Inspect `governance-kernel-summary.json`.
- `git diff --check`

## Progress

- 2026-05-07 12:56: Opened after published CLI 0.10.0 compact validation
  passed. Full source matrix run is next.
- 2026-05-07 13:32: First full run produced 394 PASS / 6 FAIL. The failures
  were isolated to two Codex turns hitting the executor adapter's 120s hard
  cap, so BUG-087 / PLAN-159 was opened and fixed before accepting the QA.
- 2026-05-07 14:11: Final full source matrix run passed: 400 PASS / 0 FAIL /
  0 SKIPPED.
