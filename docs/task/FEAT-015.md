# FEAT-015 Process manager replacing AsyncQueue

- **status**: completed
- **priority**: P2
- **owner**: BKD subtask igjbbb7t (reworked after base mismatch)
- **createdAt**: 2026-04-22 09:20
- **completedAt**: 2026-04-22 19:10

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

### Implementation notes (2026-04-22 19:10)

Landed as `bkd/igjbbb7t` commit `7eed7d1`, merged to main in `d2c3be3`.

**First-pass rejection**: the initial dispatch delivered a commit `ae464ac`
forked from `9f2426c` (pre-FEAT-011 baseline) — it would have reverted the
full three-tier profile refactor if merged. Coordinator rejected it and
issued explicit `git fetch origin && git reset --hard origin/main` +
scope-narrowing instructions. The rework landed on base `c519a0a`
(post-FEAT-016) with 15 files / +1367 / −30.

Key design decisions:

1. **Slot budget via independent env vars**, not profile-scoped — `MAX_CONCURRENT_TOTAL` + `MAX_CONCURRENT_<ENGINE_UPPER>` in `apps/api/src/config/worker.ts`. Kept `packages/shared/src/fleet/executor.ts` and `default-profiles.ts` untouched so FEAT-016 could land in parallel without a merge conflict.
2. **Generic `ProcessManager<TMeta>`** — slot / group / priority (3-class: `interactive / default / background`) / stall detection / auto-cleanup / setLimits hot-reload. Generic over engine kind, transport-agnostic, ~676 LOC + 436 LOC tests.
3. **Per-conversation FIFO preserved** — even when slots are free, same-group jobs run sequentially; single-slot-per-conversation invariant maintained from the `AsyncQueue` era.
4. **Priority enum only** (`'interactive' | 'default' | 'background'`) — no integer priority to prevent inflation; channel envelopes go interactive, workspace dispose + cron go background.
5. **Engine modules untouched** — `engines/{claude-code,acp,codex,cursor}` don't import or know about `ProcessManager`. Orchestrator wraps `executor.run()` with `onActivity` (every `AgentEvent` counts as heartbeat) and `cancel` (propagates through `AgentRunInput.signal` to each engine's SIGTERM/SIGKILL path).
6. **Hot-reload safe** — `runtime.processes` survives `reloadRuntime()`; new config just calls `processes.setLimits(envLimits)` to update caps without draining active processes.
7. **`GET /api/worker/runtime/processes/capacity`** — bearer-auth'd, reports `{maxConcurrentTotal, totalActive, totalQueued, availableSlots, perEngine, byState, recentTerminal}`.
8. **`queue.ts` deleted** — 10-line `AsyncQueue` fully replaced.

Verification (coordinator-run after merge):

- `bun run typecheck` — shared / api / web all green.
- `bun test` — shared 12 / 12, api 413 / 413 (+16 ProcessManager + coverage bumps), web 26 / 26.
- `bun run lint` — 0 errors.

Remaining:

- P2: availability probe for claude-code / acp engines still constant `healthy`; now that `ProcessManager` exists it can report `degraded` based on active-process saturation — follow-up.
