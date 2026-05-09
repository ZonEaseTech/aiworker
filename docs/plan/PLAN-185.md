# PLAN-185 Worker Case REST and CLI surface

- **status**: pending
- **owner**: unassigned
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

Operators should not need to know raw Journal routes for normal task review.
Worker Case becomes the default read path; Journal remains a debug surface.

## Proposal

Expose:

- `GET /api/worker/cases`
- `GET /api/worker/cases/:taskId`
- `POST /api/worker/cases/:taskId/rerun`
- `POST /api/worker/cases/:taskId/lessons/propose`
- `aiworker case list`
- `aiworker case show <task-id>`
- `aiworker case rerun <task-id>`
- `aiworker lessons propose <task-id>`

## Scope

- Worker REST routes.
- Gateway bridge only if needed for worker-hosted UI.
- CLI commands and tests.
- Keep `brain journal show` and `brain inbox propose` as lower-level commands.

## Risks

- Route duplication can confuse operators if docs do not clearly mark raw Journal
  as debug.
- Rerun must remain operator-triggered and capped by existing proof-loop rules.

## Verification

- API route tests.
- CLI focused tests.
- CLI bundle smoke.
