# TODO-028 brain status `recent.samples` ring buffer is not populated by CLI `aiworker run` invocations

- **status**: completed
- **priority**: P3
- **owner**: local
- **createdAt**: 2026-05-05 19:30
- **discoveredAt**: 2026-05-05 19:23
- **completedAt**: 2026-05-06
- **plan**: PLAN-123
- **relatesTo**: BUG-066, BUG-067, BUG-075, QA-007, PLAN-122

## Context

`brain status` exposes a per-decision-stage ring buffer telemetry
struct in 0.9.0, e.g.:

```
intentClassifier.recent: {
  windowSize: 50,
  samples: 0,
  fallbackRate: 0,
  lastFallbackReason: null,
  lastFallbackAt: null
}
```

Operators rely on this struct to spot when an LLM evaluator silently
falls back to heuristic, which is the BUG-066 / BUG-067 truthfulness
contract.

## Observed Behavior

After enabling LLM-backed intent classifier and quality gate on a
qa-reviewer scope and running one `aiworker run` turn that exercised
both decision stages:

- The runtime stream emitted the expected `orchestrator.intent_decision`
  with `source: "intent-llm", evaluator: "llm"`.
- The runtime stream emitted the expected `orchestrator.quality_gate`
  with `evaluator: "heuristic"` plus the documented `lastFallbackReason`
  string in the event.
- `aiworker brain status` immediately after still reports
  `intentClassifier.recent.samples = 0,
   qualityGate.recent.samples = 0,
   conversationClassifier.recent.samples = 0` for every stage.

In other words the live event stream is honest, but the
`recent` ring buffer surfaced via `brain status` and
`/api/worker/brain/summary` is not advanced when a turn is executed via
`aiworker run` rather than via a long-running `aiworker serve` process.

This makes the ring buffer effectively invisible to operators using the
shipping CLI continuity path, even though the underlying
truthfulness signals are computed and emitted.

## Expected Behavior

`recent.samples` and the related `fallbackRate` /
`lastFallbackReason` / `lastFallbackAt` fields should reflect every
decision-stage run regardless of whether the runtime was invoked via
`aiworker run`, `aiworker serve`, the worker REST API, or any other
entrypoint. Either:

- Persist the ring buffer in `worker.db` and re-load it on every CLI
  invocation, or
- Document explicitly that `recent.*` only reflects the current process
  and surface a complementary persisted aggregate (per scope, per
  decision stage) elsewhere.

## Scope of Fix

### P3

1. Decide whether `recent.*` is intended as in-memory-only or as a
   per-scope durable counter. Document the answer in `architecture.md`
   under the Brain Governance Kernel decision pipeline section.
2. If durable, persist samples / fallbackRate / lastFallbackReason
   into `worker.db` and read back on `brain status`.
3. If in-memory-only, add a documented persisted aggregate (e.g.
   `decision_stage_metrics` table or per-day counter) that
   `aiworker brain status` and the REST `/brain/summary` endpoint
   report alongside the in-memory ring buffer.

## Reproducer

Evidence:

- `/home/ben/projects/debug-aiworker-cc/raw/qa-reviewer-cc/run-llm-eval-events.txt`
  — shows `intent_decision.source = "intent-llm"` and
  `quality_gate.evaluator = "heuristic"` with non-trivial reason.
- `/home/ben/projects/debug-aiworker-cc/raw/qa-reviewer-cc/brain-status-after.json`
  — shows all `recent.samples = 0` even after the run.

Minimal repro:

```sh
aiworker config set '<config-with-intentClassifier.evaluator=llm>' --if-match <ver>
aiworker run --message "..." --chat-id "..." --timeout-ms 240000
aiworker brain status   # recent.samples is still 0 across every stage
```

## Validation

After fix:

1. After at least one CLI `run` turn, `brain status` reports
   `intentClassifier.recent.samples >= 1` (and similarly for the other
   stages whose evaluator was actually used).
2. Documentation describes the ring-buffer scope and persistence
   semantics so operators reading the brainSummary endpoint know what
   it represents.

## Completion Evidence

- Added worker.db `decision_pipeline_samples` persistence and migration
  `packages/storage-sqlite/drizzle/worker/0007_solid_bromley.sql`.
- `decision-pipeline-stats.ts` records recent stage samples durably and reads
  the latest worker.db window before falling back to the in-memory buffer.
- `docs/architecture.md` documents recent-window persistence semantics.
- Focused gate: `bun test packages/core/src/worker/orchestrator/decision-pipeline-stats.test.ts packages/storage-sqlite/src/worker/index.test.ts` -> included in 58 pass / 0 fail batch.
