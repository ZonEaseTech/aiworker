# TODO-035 Harness — long-running serve multi-turn REST regression

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 09:55
- **claimedAt**: 2026-05-06 09:55
- **completedAt**: 2026-05-06 10:08
- **plan**: PLAN-133
- **sourceObjective**: Project Brain governance node closeout — the
  long-running `aiworker serve` REST surface must keep the same admission /
  conversation / chat-id continuity invariants as the per-turn `aiworker run`
  CLI invocation
- **relatesTo**: PLAN-127, PLAN-128, PLAN-129, PLAN-130, PLAN-131,
  REL-018, BUG-035, BUG-043, BUG-044

## Context

The Governance Kernel harness drives the canonical six-turn conversation via
`aiworker run` per turn. Each invocation is a fresh CLI process; same-`chat-id`
continuation is therefore proven across **process boundaries** but the
verification path bypasses the long-running `aiworker serve` REST API.

The `serve` mode is the production-facing surface for the Worker Admin UI
and Fleet Web UI. Its multi-turn behavior depends on a single long-lived
orchestrator process holding executor sessions, conversation state, and
admission DB connections continuously. Defects in that path
(BUG-035 `serve` exit, BUG-043 chat event stream timeout, BUG-044 selected
conversation continuation) have surfaced before. The harness should have
source-backed regression coverage of:

1. `POST /api/worker/orchestrator/tasks` accepts an authenticated prompt
   submission and returns a task id; the long-lived orchestrator drives the
   selected executor and persists `agent_tasks.status='succeeded'` plus a
   conversation row;
2. `POST /api/worker/orchestrator/conversations/:id/messages` continues the
   same conversation with a second prompt; the same orchestrator process
   resumes the executor session and appends to `messages`;
3. `GET /api/worker/orchestrator/conversations/:id/messages` returns >= 4
   messages (2 user + 2 assistant) for the same conversation row;
4. The bearer auth boundary still holds: an unauthenticated POST to
   `/tasks` returns 401 and never enqueues a task.

## Scope

- Extend `scripts/governance-kernel-harness.ts`'s `restSmoke` block (or a
  new helper called after the existing REST evidence collection) to run the
  multi-turn REST regression while the same `aiworker serve` process is
  alive.
- Add 4 new harness checks per pair:
  - `${pairId} REST orchestrator submit` (POST /tasks → task succeeds, DB
    rows present);
  - `${pairId} REST orchestrator continue` (POST /conversations/:id/messages
    → task 2 succeeds);
  - `${pairId} REST orchestrator messages` (GET /conversations/:id/messages
    → >= 4 messages, same conversation id);
  - `${pairId} REST orchestrator unauth boundary` (POST /tasks without
    bearer → 401, no DB enqueue).
- Preserve the redact rules so prompts and assistant text are sanitized in
  any logged report.

## Out of Scope

- Channel-bound REST flows (Telegram / WhatsApp / Lark / web channel are
  covered by their own webhook tests).
- SSE-driven progress event verification beyond the existing connect smoke.
- Worker Admin UI multi-turn smoke (out of harness scope; covered by web
  app e2e tests).

## Acceptance Criteria

1. Harness compact source-local run completes with `overall: pass` for both
   pairs after the new REST multi-turn block is added.
2. Each new check has explicit evidence pointers (HTTP status code, parsed
   JSON, DB query, log path) and uses source-backed assertions.
3. PMA QA task (QA-015) records the run.

## Notes

- 2026-05-06 09:55: Opened to extend the regression harness to the
  long-running `serve` REST multi-turn surface.
- 2026-05-06 10:08: Completed under PLAN-133. Source-local compact run
  added 4 REST orchestrator checks per pair (8 total), all PASS. Evidence
  in QA-015.
