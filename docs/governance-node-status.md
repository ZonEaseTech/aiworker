# Project Brain Governance Node — Status (2026-05-07)

> Sanitized status snapshot. Companion artifact to `docs/architecture.md`'s
> "Brain Governance Kernel 决策" section. Anchored to evidence in
> `docs/task/QA-*.md`. Not a marketing document; read it as an audit.

## What this document answers

The active worker objective is "make AIWorker worker a stable, verifiable,
shippable Project Brain governance node". This file records, with concrete
evidence pointers, where the worker conforms to that target and where the
boundary or risk remains.

It is rewritten when the underlying claim changes; do not append history
inline.

## Conformance summary

| Dimension | Status | Source-backed evidence |
|---|---|---|
| Admission positive invariant (durable Brain mutation flows through admission) | conforming | QA-011 — `pending → approved → applied` writes canonical memory + MEMORY.md index; brief projection picks it up. Source + published 0.9.1 both pass. |
| Admission negative invariant (rejected proposals never write canonical memory) | conforming | QA-012 — `pending → rejected` records audit decision, no memory file; source + published 0.9.1 both pass. |
| Pre-compaction generated memory boundary | conforming in source | BUG-085 / PLAN-143 — suppressed executor output creates a pending `memory-add` proposal in `brain_admission_proposals`, never a direct `BrainProvider.writeMemory()` call; compaction audit metadata records `status='proposed'`. |
| Secret defense at materialization (BUG-055 regression line) | conforming | QA-012 — `apply --commit` with default `block` policy refuses bodies matching `scanBodyForSecrets`, returns `outcome.kind='blocked-by-secret-scan'` with exit 1, leaves proposal `approved`, no `applied` decision row, no canonical memory file. Source + published 0.9.1. |
| Truthfulness contract (decision events expose `source` / `mode` / `evaluator` / `fallback`) | conforming | QA-009 / QA-010 / QA-011 — every `orchestrator.intent_decision`, `orchestrator.capability_decision`, `orchestrator.quality_gate` carries source-tagged truthfulness fields, persisted to `decision_pipeline_samples`. |
| LLM bypass detection | conforming | QA-009 / QA-010 / QA-011 — assistants that claim admission was submitted while `brain_admission_proposals` shows no row trigger `brain.governance.bypass_suspected` events, asserted via the `admission claim vs DB` harness check. |
| Executor session continuity (same `chat-id` continuation across both supported executors) | conforming | QA-009 / QA-010 / QA-011 — six same-`chat-id` turns produce one conversation row and 12 messages per pair; both Codex and Claude Code. |
| Multi-conversation isolation across `chat-id` boundaries inside one worker | conforming in source | TODO-036 / PLAN-144 — source compact harness creates a distinct alternate `chat-id` per pair and asserts primary/alternate conversation ids are separate in `worker.db`; both compact pairs PASS. |
| Executor tool-call observability | conforming for both engines | QA-009 / QA-010 / QA-011 — `orchestrator.tool_call` events emitted by Codex (28 typical) and Claude Code (7 typical); harness asserts non-zero on Codex and accepts emitted-or-not on Claude Code per executor contract. |
| Risk-policy signal (high-risk verbs surface `risk=high`) | conforming | QA-009 / QA-010 / QA-011 — turn 4 high-risk prompt produces `orchestrator.intent_decision` with `risk=high` for both pairs. |
| Worker REST surface auth boundary | conforming | QA-009 / QA-010 / QA-011 — `/health=200`, authenticated `/api/worker/info=200`, unauthenticated and bad-bearer `/api/worker/info=401`, `/api/worker/brain/summary=200`, OpenAPI path count > 0, SSE connects, `/admin/=200`. |
| Operator-trust surfaces (init secret handling, doctor PASS/WARN/INFO consistency) | conforming | PLAN-119 implementation; QA-006 / QA-007 evidence; PLAN-112 doctor noise closeout. |
| Onboarding polish (CLI command groups, executor recommendation, MCP arg passthrough) | conforming | PLAN-120 implementation; TODO-026 contract; BUG-051 / BUG-073 fixes. |
| Regression validation (repeatable harness covering above invariants) | conforming | `scripts/governance-kernel-harness.ts` with 35 source-backed checks per pair; PLAN-127 (initial harness), PLAN-128 (positive roundtrip), PLAN-129 (reject + secret-scan-block), PLAN-130 (full 5×2 matrix evidence), PLAN-144 (cross `chat-id` isolation). |
| Soul-agnostic kernel (every Soul × executor satisfies same invariants) | conforming on source + published | QA-013 — full 5×2 matrix on source-local: 300 PASS / 0 FAIL / 0 SKIPPED; QA-014 — same matrix on `cli-release-local` 0.9.1: 300 PASS / 0 FAIL / 0 SKIPPED. |
| Long-running `aiworker serve` REST multi-turn (orchestrator persistence + bearer auth) | conforming | QA-015 — POST /tasks unauth → 401, authenticated submit → 201 + agent_tasks.status=succeeded, POST /conversations/:id/messages → second task succeeded on same conversation, GET /conversations/:id/messages → ≥4 messages. Both pairs PASS. |

## Boundary and residual risk

These are explicit non-claims, written so the conformance table above is not
read as a stronger statement than the evidence supports.

- **Single-LLM-decider opt-in**: heavy Brain LLM decider is not enabled by
  default. Decision events are `evaluator=heuristic` and `mode=observe_only`
  unless the operator explicitly opts in. Truthfulness is enforced; behavior
  is not.
- **Executor capability ownership**: tool loop, MCP server selection, engine
  plugins, sandbox, approval, native session, auth, model/provider routing
  remain owned by the external executor. AIWorker's `executor-capabilities.json`
  is overlay/hint only. We do not claim isolation or canonical capability
  source-of-truth. BUG-086 / PLAN-145 removed the Claude Code default model pin
  so `claude-code/default` now uses the external CLI default unless the operator
  explicitly configures a model hint.
- **Materializer scope**: only `kind=memory-add` is materialized. Other
  proposal kinds emit `unsupported` outcomes and write a `failed` decision
  row. Rollback after `apply --commit` is not implemented in the materializer
  — the rollback CLI rejects pre-apply only.
- **Soul / scope cross-contamination**: Project Brain memory is per-scope on
  the filesystem, not enforced by hard logic at runtime. The harness uses
  one scope per pair; it does not test cross-scope isolation.
- **Compact harness matrix as the recurring default**: PLAN-127's compact
  matrix uses `developer + codex/default` and
  `general-assistant + claude-code/default`. Compact remains the default for
  routine repeatable runs because the full matrix is heavier. The full 5 ×
  2 matrix has been run once on source-local (QA-013); compact + occasional
  full is the recommended cadence.
- **Secret-body redact / raw paths**: `--allow-secret-body redact` and
  `--allow-secret-body raw` are unit-tested in
  `packages/core/src/worker/brain/admission/service.test.ts` but are not in
  the harness, since the regression risk is at the CLI surface for the
  default `block` policy.
- **Worker process restart between turns**: each `aiworker run` invocation is
  a fresh process; the long-lived `aiworker serve` orchestrator is now
  exercised via the multi-turn REST block (QA-015). Cross-restart of the
  serve process itself (kill + relaunch + same conversation continues) is
  not yet covered by harness assertions.

## Evidence catalog

- `docs/task/QA-009.md` — Governance Kernel harness, `cli-release-local`
  0.9.1 compact, all source-backed checks PASS.
- `docs/task/QA-010.md` — Governance Kernel harness, `worker-source-local`
  compact, all source-backed checks PASS.
- `docs/task/QA-011.md` — Admission positive roundtrip evidence, source +
  `cli-release-local` 0.9.1, all 14 new roundtrip checks PASS.
- `docs/task/QA-012.md` — Admission negative paths (reject +
  secret-scan-block) evidence, source + `cli-release-local` 0.9.1, all 8 new
  negative-path checks PASS.
- `docs/task/QA-013.md` — Full 5×2 matrix evidence on source-local: 10
  pairs × 30 checks = 300 PASS / 0 FAIL / 0 SKIPPED, proving the
  Soul-agnostic kernel claim for every Soul on every supported executor on
  the source build.
- `docs/task/QA-014.md` — Full 5×2 matrix evidence on `cli-release-local`
  0.9.1: 300 PASS / 0 FAIL / 0 SKIPPED, extending the Soul-agnostic kernel
  claim to the published CLI.
- `docs/task/QA-015.md` — Long-running `serve` multi-turn REST regression
  evidence: 4 new orchestrator REST checks per pair (unauth boundary,
  submit, continue, read), all PASS on both compact pairs.
- `docs/task/BUG-085.md` / `docs/plan/PLAN-143.md` — pre-compaction generated
  memory no-direct-write fix; focused source tests assert pending admission
  proposal creation and no canonical memory write.
- `docs/task/TODO-036.md` / `docs/plan/PLAN-144.md` — cross `chat-id`
  isolation check added to the Governance Kernel harness; final source compact
  run passed 70 / 70 checks.
- `docs/task/BUG-086.md` / `docs/plan/PLAN-145.md` — Claude Code default
  profile no longer forces a volatile model alias; model/provider routing
  remains executor-owned by default.
- `docs/architecture.md` — canonical Brain Governance Kernel decision and
  ownership table.
- `scripts/governance-kernel-harness.ts` — repeatable harness; the canonical
  way to re-verify the claims in this document.

## How to re-verify

1. `bun run lint && bun run typecheck && bun run test` for the code-side
   gate; nothing in this status document is product behavior, so the
   commands above remain unchanged.
2. `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts \
   --mode worker-source-local --matrix compact --debug-root <fresh path>`
   for the source-backed regression run.
3. `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts \
   --mode cli-release-local --version <published version> --matrix compact \
   --debug-root <fresh path>` for the published-CLI black-box run.
4. Inspect each pair's `governance-kernel-summary.json` for any non-`pass`
   row; non-`pass` rows must either be classified as environment-limited
   (`skipped`, with explicit operator-side reason) or filed as a BUG / TODO
   under `docs/task/`.

If any conformance row above moves to `not conforming`, the residual-risk
section must be updated and a new PMA slice filed before this document is
re-marked.
