# PLAN-237 Worker-first workflow validation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **approvedAt**: 2026-05-11 01:11
- **claimedAt**: 2026-05-11 01:30
- **relatedTask**: QA-031

## Current State

The refactor crosses storage, runtime, API, CLI, and Web. Focused test coverage
must be paired with a browser workflow because the primary risk is product IA
drift, not only type errors.

## Proposal

1. Run focused package gates after each major slice.
2. Run full typecheck/lint/test/build if focused gates pass.
3. Validate browser flow:
   - create worker;
   - enter worker;
   - create workspace/project;
   - create session with capability;
   - continue session;
   - inspect artifact/review panels;
   - check mobile overflow.
4. Run code-review-graph update/review before final response.

## Verification Plan

- Focused storage/core/API/CLI/Web gates.
- Root `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`
  if feasible.
- Browser validation against local Worker Web.
- `bun run crg:update`
- `bun run crg:review`

## Result

- Focused package validation and root validation passed.
- Follow-up validation found and fixed a real upgraded-database regression:
  existing `worker.db` files could retain a legacy unique `workers_soul_idx`,
  causing `POST /api/local/workers` to fail when creating another worker for the
  same Soul. Worker migrations now repair that index before runtime use.
- Browser validation exercised the worker-first product flow on a real local
  daemon: create worker, enter worker route, create workspace, create session
  with capability selection, continue session, inspect artifact/review panels,
  and verify the canonical `/workers/:workerId/workspaces/:workspaceId/sessions/:sessionId`
  route.
- Follow-up Playwright MCP validation on `http://127.0.0.1:9217/` clicked
  through create worker, create workspace, create session, and observed a
  successful engine run with 1 artifact and pending review state.
- Mobile viewport validation at `390x844` reported no horizontal overflow.
- code-review-graph found 0 affected flows and reported risk score `0.60`
  with broad impact-radius truncation; the highest-priority review points are
  worker/session guard helpers and session response builders.
