# REFACTOR-094 Add worker-scoped native engine invocation stream

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21 13:31
- **claimedAt**: 2026-05-21 13:31
- **approvedAt**: 2026-05-21 13:31
- **completedAt**: 2026-05-21 13:38
- **plan**: PLAN-402
- **relatesTo**: HOST-001, DATA-001, ENGINE-001, apps/api

## Background

The native Engine Bridge now has a worker-scoped HTTP endpoint, but the final
product experience must feel like a native engine runtime. That means callers
need the engine's live output stream instead of only a finished JSON response.

## Acceptance Criteria

1. Add `POST /api/local/workers/:workerId/engine/invocations/stream`.
2. The route streams native bridge events from `invokeNativeEngine` as SSE.
3. The route persists the same worker-scoped invocation metadata as the
   non-stream endpoint.
4. The route does not create workspace, session or turn rows, and does not store
   raw prompt/input/context in Host DB.
5. OpenAPI metadata and focused API tests cover the new stream route.

## Verification

- [x] TDD red run for the focused API stream test
- [x] `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- [x] `bun run --filter '@zonease/aiworker-api' typecheck`
- [x] `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- [x] `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Notes

- 2026-05-21 13:31: Claimed after user reiterated that the final experience
  must be native engine runtime. Keep this slice stream-only and worker-scoped.
- 2026-05-21 13:38: Added the SSE route and focused API coverage. CRG reported
  14 static test gaps across the cumulative changed files; focused API coverage
  proves the new stream route, SSE frames and worker-scoped persistence.
