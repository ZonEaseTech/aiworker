# PLAN-229 Session invocation result semantics

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 22:05
- **relatedTask**: REFACTOR-054

## Current State

- `LocalWorkerRuntime.startTurn` already creates `turn` and
  `engine_invocation` rows.
- `captureResult` can persist zero or more artifacts, but the current executor
  forces exactly one artifact before returning success.
- API streaming sends live `session_event` and `turn` frames, but it does not
  expose an OD-style replay endpoint for event cursors.

## Proposal

1. Treat assistant text as a valid successful turn result.
2. Treat artifact files as optional produced outputs indexed after the engine
   finishes.
3. Preserve `engine_invocation` as the internal equivalent of OD run, not a
   user-facing product object.
4. Add session event replay support where it fits the existing API shape so Web
   can recover from refresh/reconnect without losing engine process events.
5. Update API tests around stream frames and event replay.

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' build`

## Result

- Assistant text is now a valid successful turn result; artifacts are optional.
- Artifact registration discovers markdown files actually produced under
  `artifacts/<sessionId>/` for the active turn.
- Added replay endpoint `GET /api/local/sessions/:sessionId/events`.
- Added streamed initial-session creation at
  `POST /api/local/workspaces/:workspaceId/sessions/stream`.
- API tests cover both existing follow-up stream and initial session stream.
