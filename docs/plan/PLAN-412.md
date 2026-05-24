# PLAN-412 Local settings engines endpoint contract

- **status**: approved
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-155

## Proposal

1. Add `GET /api/local/settings/engines` next to the existing settings routes.
2. Return `{ engineId, engines, executionMode }` from persisted local settings.
3. Add the OpenAPI path.
4. Clarify docs that the endpoint does not spawn CLIs or read secret contents.

## Verification

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `git diff --check`
