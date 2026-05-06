# TODO-037 Harness — serve process restart continuity regression

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-07 00:58
- **claimedAt**: 2026-05-07 00:58
- **completedAt**: 2026-05-07 01:12
- **plan**: PLAN-147
- **sourceObjective**: Close the remaining worker-only governance harness gap
  where the long-running `aiworker serve` process is killed and relaunched
  between REST turns, while the same persisted conversation must continue.
- **relatesTo**: TODO-035, PLAN-133, QA-015, TODO-036, PLAN-144,
  docs/governance-node-status.md

## Context

`scripts/governance-kernel-harness.ts` already proves two related continuity
paths:

1. `aiworker run --chat-id ...` preserves one conversation across fresh CLI
   processes.
2. `aiworker serve` preserves submit/continue/messages behavior across two
   REST turns while the same serve process stays alive.

`docs/governance-node-status.md` still lists the next residual: kill and
relaunch the `serve` process between REST turns, then continue the same
conversation id through the restarted process. This is a worker-data-plane
invariant: conversation and task state must be in `worker.db`, not only in
an in-memory orchestrator.

## Scope

- Extend `scripts/governance-kernel-harness.ts` so the existing REST
  multi-turn block stops the active `serve` process after turn 1 succeeds,
  relaunches `serve` on the same project/port, waits for `/health`, and then
  posts turn 2 to the same conversation id.
- Add a dedicated harness check per pair:
  `${pairId} REST serve restart continuity setup`.
- Update `docs/governance-node-status.md` after validation so the residual
  matches the new source-backed assertion.

## Out of Scope

- Fleet-hosted Worker Admin continuation.
- Gateway reconnect semantics.
- Executor isolation or executor-native session ownership changes.
- Product behavior changes outside the harness.

## Acceptance Criteria

1. Compact source-local Governance Kernel harness run passes with the new
   restart check for both compact pairs.
2. The existing REST submit / continue / messages checks still pass after the
   restart is inserted between turn 1 and turn 2.
3. Evidence logs identify the pre-restart serve log, restarted serve log,
   HTTP statuses, task ids, and DB-derived conversation id.
4. PMA status, changelog, and governance-node status are synchronized.

## Notes

- 2026-05-07 00:58: Opened after REL-022 / PLAN-146 published 0.9.6. This is
  the next worker-only lightweight-Brain hardening slice.
- 2026-05-07 01:12: Completed under PLAN-147. Source-local compact harness
  passed 72 / 72 checks, including the new REST serve restart continuity
  setup check for both compact pairs. Evidence in QA-016.

## Validation

- `bun scripts/governance-kernel-harness.ts --help` PASS.
- `bun run lint` PASS.
- `bun build --target=bun --outfile=tmp/governance-kernel-harness-plan147-check.js
  scripts/governance-kernel-harness.ts` PASS.
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode worker-source-local --matrix compact --debug-root
  tmp/governance-kernel-plan147-source --port-base 19720 --timeout-ms
  240000` PASS: overall pass, 72 PASS / 0 FAIL / 0 SKIPPED.
