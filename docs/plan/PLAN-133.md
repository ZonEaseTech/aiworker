# PLAN-133 Harness — long-running serve multi-turn REST regression

- **status**: completed
- **createdAt**: 2026-05-06 09:55
- **approvedAt**: 2026-05-06 09:55
- **completedAt**: 2026-05-06 10:08
- **relatedTask**: TODO-035

## Context

The Governance Kernel harness exercises six same-`chat-id` turns per pair
via `aiworker run`, where each turn is a fresh CLI process. That validates
admission / conversation persistence across process boundaries but does not
exercise the long-lived `aiworker serve` orchestrator over multi-turn REST
traffic. Past defects in `serve` (BUG-035 / BUG-043 / BUG-044) showed that
the long-lived path has its own failure modes.

The Worker REST API exposes:

- `POST /api/worker/orchestrator/tasks` — submit a free-form prompt; returns
  `{ task: { id } }`. The orchestrator runs the task asynchronously and
  flips `agent_tasks.status` from `queued` → `running` → `succeeded` /
  `failed` / `cancelled`.
- `POST /api/worker/orchestrator/conversations/:id/messages` — continue an
  existing conversation by id with a new prompt; returns
  `{ task: { id } }`.
- `GET /api/worker/orchestrator/conversations/:id/messages` — return all
  persisted messages for the conversation.

These routes already enforce bearer auth via `buildBearerAuth`. The harness
already starts `aiworker serve`, knows the bootstrap token, and runs
authenticated GET smoke (health / info / brain summary / OpenAPI / SSE /
admin mount). Multi-turn REST regression is a natural extension.

## Proposal

1. Inside `restSmoke`, after the existing REST evidence collection and
   before the `serve.kill` finally block, run a new sequence:
   - POST unauthenticated to `/api/worker/orchestrator/tasks` → expect 401.
   - POST authenticated with `{ prompt: "Long-running serve probe ..." }` →
     get task id `t1`.
   - Poll `agent_tasks` directly via sqlite for `status='succeeded'` on
     `t1` (timeout: 90s).
   - Read the conversation id linked to `t1` from `agent_tasks.conversationId`.
   - POST authenticated to `/api/worker/orchestrator/conversations/:id/messages`
     → get task id `t2`. Poll for completion.
   - GET authenticated `/api/worker/orchestrator/conversations/:id/messages`
     → assert array length ≥ 4.
2. Add 4 new harness checks per pair using existing helpers:
   `runCommand`, `sqlite`, `parseFirstJsonObject`, `fetchText`. No new
   dependencies.
3. Keep the existing kill / log dump / redaction logic. The redact regex
   already covers `Authorization: Bearer ...` and `wtk_*` tokens.
4. Run the harness on source-local compact mode and record results in
   QA-015.

## Risks

- LLM call time per turn: with `codex-cli` and `claude-code` the
  authenticated `submitTask` may take 20–60s. Two turns plus polling can
  add 60–120s per pair. Use 90s polling timeout per turn and 5s polling
  interval.
- Failure mode: if the orchestrator finishes the task but the harness loses
  track of the conversation id, the second turn would fail. Pin the
  conversation id from the first task's DB row before posting turn 2.
- Risk that the harness inflates LLM cost. Each pair adds 2 LLM calls.
  Compact runs add 4 total LLM calls per harness invocation. Acceptable
  budget.

## Scope

- `scripts/governance-kernel-harness.ts`
- `docs/plan/PLAN-133.md`, `docs/task/TODO-035.md`, `docs/task/QA-015.md`
- `docs/plan/index.md`, `docs/task/index.md`

## Alternatives

- Drive the multi-turn REST sequence from a separate script in `apps/cli`
  that runs alongside the harness. Rejected: harness is the canonical
  governance regression boundary; orchestrator REST regression should live
  next to existing REST smoke checks.
- Use SSE event filtering for completion instead of DB polling. Rejected:
  DB polling is simpler and source-backed; SSE has its own readiness window
  and the existing connect smoke already covers SSE health. Mixing the two
  would inflate the slice scope.

## Validation

- `bun run lint` for `scripts/governance-kernel-harness.ts`.
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode worker-source-local --matrix compact --debug-root
  /home/ben/projects/debug-aiworker/qa-2026-05-06-governance-rest-multi
  --timeout-ms 240000 --port-base 19580`.
- Record results in `docs/task/QA-015.md`. Optional sibling
  `cli-release-local` 0.9.2 run.

## Annotations

- 2026-05-06 09:55: Approved under the active Project Brain governance
  objective. The slice is harness-only; no product behavior or release-only
  paths are touched.
- 2026-05-06 10:08: Completed. Harness `restSmoke` extended with a
  multi-turn REST regression block; source-local compact run passed for
  both pairs with the new four checks each (unauth boundary, submit,
  continue, messages). Evidence in QA-015.
