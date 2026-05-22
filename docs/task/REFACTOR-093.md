# REFACTOR-093 Add worker-scoped native engine invocation API

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21 13:26
- **claimedAt**: 2026-05-21 13:26
- **approvedAt**: 2026-05-21 13:26
- **completedAt**: 2026-05-21 13:26
- **plan**: PLAN-401
- **relatesTo**: HOST-001, DATA-001, ENGINE-001, apps/api

## Background

`REFACTOR-091` added a native process bridge and `REFACTOR-092` added
worker-scoped native invocation metadata. The daemon still has no local API
entrypoint that uses these pieces together. The next bridge slice should expose
a worker-scoped invocation endpoint without replacing or widening the legacy
workspace/session routes.

## Acceptance Criteria

1. Add `POST /api/local/workers/:workerId/engine/invocations`.
2. The route requires only worker id, cwd, raw input and native engine command
   data.
3. The route runs through `invokeNativeEngine` and persists
   `worker_engine_invocations` metadata.
4. Stored metadata does not include workspace id, session id, turn id, prompt,
   raw input or context.
5. OpenAPI metadata and focused API tests cover the new route.

## Verification

- [x] TDD red run for the focused API test
- [x] `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- [x] `bun run --filter '@zonease/aiworker-api' typecheck`
- [x] `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- [x] `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Notes

- 2026-05-21 13:26: Claimed after user asked to continue the native Engine
  Bridge migration. Keep the route worker-scoped and avoid session/workspace
  compatibility changes in this slice.
- 2026-05-21 13:26: Added the worker-scoped native invocation endpoint and
  focused API coverage. The route stores only worker-level invocation metadata
  and immediate native result output is returned to the caller, not persisted as
  Host product data.
- 2026-05-21 13:26: `crg:review` reported static gaps for the route registration
  function and small parsing helpers. The focused API test exercises the new
  route through real HTTP request handling and verifies persisted metadata.
