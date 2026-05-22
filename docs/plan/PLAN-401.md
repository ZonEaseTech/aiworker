# PLAN-401 Worker-scoped native engine invocation API

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 13:26
- **approvedAt**: 2026-05-21 13:26
- **completedAt**: 2026-05-21 13:26
- **relatedTask**: REFACTOR-093

## Current State

Core now exposes `invokeNativeEngine`, and storage exposes
`worker_engine_invocations`. The daemon API still only exposes the old
workspace/session turn routes for engine execution. That keeps callers tied to
below-worker Host concepts even when they only need a native engine bridge.

## Proposal

1. Add `POST /api/local/workers/:workerId/engine/invocations`.
2. Request body:
   - required `cwd`;
   - optional `input`, `engineId`, `engineCommand`, `args`, `metadata`.
3. Resolve defaults from local engine settings when `engineId` or
   `engineCommand` are omitted.
4. Run `invokeNativeEngine` with the native command and raw input.
5. Persist final invocation metadata through `createWorkerEngineInvocation`.
6. Return the stored invocation plus immediate native result stdout/stderr for
   the caller, without storing raw input/output in Host DB.
7. Add OpenAPI metadata and focused API coverage.

## Scope

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `docs/task/REFACTOR-093.md`
- `docs/plan/PLAN-401.md`
- `docs/changelog.md`

## Non-Goals

- Do not replace legacy workspace/session turn routes.
- Do not add Web UI.
- Do not add streaming in this slice.
- Do not store raw prompt/input/context in Host DB.
- Do not interpret engine output as worker-owned product state.

## Verification Plan

- Write the API test first and confirm it fails before implementation.
- Run focused API tests and typecheck.
- Re-run storage and core bridge focused tests.
- Run docs check, diff check and code-review-graph.

## Result

Added `POST /api/local/workers/:workerId/engine/invocations`. The route accepts
native cwd, raw input, optional engine id, native command and args, invokes the
engine through `invokeNativeEngine`, and persists the final
`worker_engine_invocations` metadata row.

The stored invocation row references only the worker and native invocation
metadata. It does not contain workspace id, session id, turn id, prompt, raw
input or context. Immediate stdout/stderr remain in the HTTP response for the
caller and are not persisted into Host DB.

## Verification

- TDD red run:
  `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
  failed first with 404 for the new route.
- Focused API tests:
  `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
  passed with 28 tests and 213 assertions.
- API typecheck:
  `bun run --filter '@zonease/aiworker-api' typecheck` passed.
- Storage regression:
  `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
  passed with 10 tests and 73 assertions.
- Core bridge regression:
  `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
  passed with 3 tests and 21 assertions.
- Whitespace:
  `git diff --check` passed.
- Docs contract:
  `bun run docs:check` passed.
- Code review graph:
  `bun run crg:update` updated 11 files. `bun run crg:review` reported 10
  static test gaps around `bootstrapWorkerApp`, OpenAPI registration and small
  parsing helpers; the focused API test covers the new route through real Hono
  request handling and verifies persisted metadata shape.
