# FEAT-015 Process manager replacing AsyncQueue

- **status**: pending
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-22 09:20

## Description

Replace `apps/api/src/worker/orchestrator/queue.ts` (10-line FIFO, serial) with
a generic `ProcessManager<TMeta>` borrowed in spirit from bkd's
`engines/process-manager.ts`. The new manager owns:

- per-engine concurrency slots (`maxConcurrent` per engine, global cap),
- group keys (one group per `conversationId`),
- lifecycle states (`spawning → running → completed | failed | cancelled`),
- `autoCleanupDelayMs` + periodic GC,
- `killTimeoutMs` (graceful interrupt → SIGKILL),
- stall detection (no stdout activity beyond N ms) with escalating actions.

Unlike bkd, when slots are full the manager **enqueues** with priority
(cron-/background-class jobs yield to interactive channel jobs) instead of
throwing. Priority is a small enum — default, background, interactive — not
an arbitrary int.

Acceptance:

- `apps/api/src/worker/orchestrator/process-manager.ts` (new) replaces
  `AsyncQueue`, exported under the same `Orchestrator` surface.
- Per-engine slot budgets configurable through a new optional field in the
  worker config (e.g. `executor.variants[].maxConcurrent`).
- New REST surface `GET /api/worker/runtime/processes/capacity` reports
  per-engine in-flight, queued, and slot budget — consumed by the dashboard
  for UI disable state.
- Stall detection unit-tested with a fake spawned process.
- Existing end-to-end channel tests keep passing; ordering of messages on a
  single conversation is unchanged (single-slot-per-conversation invariant
  preserved).

## ActiveForm

Replacing the async queue with a slot-aware process manager.

## Dependencies

- **blocked by**: FEAT-011, FEAT-012 (needs real spawned processes to
  manage), FEAT-014 (variant metadata feeds slot budgets)
- **blocks**: (none)

## Notes

- Related plan: `docs/plan/PLAN-007.md`.
- Do not expose an arbitrary integer priority; keep the API constrained to
  named classes to avoid priority inflation.
- This task re-touches hot-path orchestrator code; land it behind FEAT-012
  so the process manager has real engines to babysit.
