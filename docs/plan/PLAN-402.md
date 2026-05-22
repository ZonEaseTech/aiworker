# PLAN-402 Worker-scoped native engine invocation stream

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 13:31
- **approvedAt**: 2026-05-21 13:31
- **completedAt**: 2026-05-21 13:38
- **relatedTask**: REFACTOR-094

## Current State

`POST /api/local/workers/:workerId/engine/invocations` runs a native command and
returns the final result. That proves the bridge path but does not yet provide a
native runtime experience because stdout/stderr/status events are only visible
after completion.

## Proposal

1. Add `POST /api/local/workers/:workerId/engine/invocations/stream`.
2. Reuse the same request shape and native engine resolution as the non-stream
   endpoint.
3. Send SSE frames:
   - `status` when the stream starts;
   - `engine_event` for native bridge stdout/stderr/status/exit events;
   - `result` with the final invocation metadata and immediate native result;
   - `error` if invocation setup or execution fails.
4. Persist only `worker_engine_invocations` metadata after the native process
   finishes.
5. Keep stdout/stderr in the response stream, not in Host DB.

## Scope

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `docs/task/REFACTOR-094.md`
- `docs/plan/PLAN-402.md`
- `docs/changelog.md`

## Non-Goals

- Do not replace legacy session streaming.
- Do not add Web UI.
- Do not add CLI commands.
- Do not persist raw stdout/stderr/input/context.
- Do not interpret engine output as app-owned product state.

## Verification Plan

- Write the stream API test first and confirm it fails before implementation.
- Run focused API tests and typecheck.
- Re-run storage and core bridge focused tests.
- Run docs check, diff check and code-review-graph.

## Result

Added `POST /api/local/workers/:workerId/engine/invocations/stream` as the SSE
entrypoint for worker-scoped native Engine Bridge calls. The route reuses the
same request shape and engine resolution as the non-stream endpoint, sends a
stream `status` frame, forwards native bridge stdout/stderr/status/exit events
as `engine_event`, and sends a final `result` frame after the process exits.

The route persists only the final `worker_engine_invocations` metadata row after
the native process finishes. Raw stdin, stdout and stderr stay in the immediate
HTTP/SSE exchange and are not stored in Host DB.

## Verification

- TDD red run:
  `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
  failed first with 404 for the stream route and missing OpenAPI registration.
- Focused API tests:
  `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
  passed with 29 tests and 232 assertions.
- API typecheck:
  `bun run --filter '@zonease/aiworker-api' typecheck` passed.
- Storage regression:
  `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
  passed with 10 tests and 73 assertions.
- Core bridge regression:
  `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
  passed with 3 tests and 21 assertions.
- Docs contract:
  `bun run docs:check` passed.
- Whitespace:
  `git diff --check` passed.
- Code review graph:
  `bun run crg:update` updated 11 files. `bun run crg:review` reported 14
  static test gaps including `bootstrapWorkerApp`, `event`,
  `readOptionalString`, `readStringArray` and `prepareNativeEngineInvocation`;
  the focused API test exercises the new stream route through real Hono request
  handling, verifies SSE frames and verifies the persisted metadata shape.
