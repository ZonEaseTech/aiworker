# PLAN-236 Worker capability and session selection alignment

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **approvedAt**: 2026-05-11 01:11
- **claimedAt**: 2026-05-11 01:29
- **relatedTask**: REFACTOR-059

## Current State

- Templates are global and filtered by Soul id.
- Session creation validates capability by checking template Soul against the
  workspace worker.
- Web currently selects capability before workspace creation.

## Proposal

1. Expose templates through worker-scoped API helpers.
2. Move session creation capability selection into workspace context.
3. Keep enabled capabilities as derived from bound Soul for this slice, but name
   the surface as worker capabilities.
4. Preserve provenance metadata on session and turn creation.

## Verification Plan

- API tests for worker-scoped template/session validation.
- Web tests for create-session capability selection.
- CLI tests for session creation with worker id.

## Result

- Worker-scoped daemon routes and Web API helpers are available for templates,
  workspace/session creation, follow-up messages, files, and artifacts.
- Web session creation happens from the workspace route with explicit
  capability selection.
- API and CLI tests cover explicit worker creation/selection and worker-scoped
  workspace/session operations.

## Verified

- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
