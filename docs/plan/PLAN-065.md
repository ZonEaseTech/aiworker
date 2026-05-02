# PLAN-065 Worker Admin SSE keepalive for slow replies

- **status**: completed
- **createdAt**: 2026-05-02 20:54
- **approvedAt**: 2026-05-02 20:54
- **completedAt**: 2026-05-02 21:02
- **relatedTask**: BUG-043

## Current State

1. `aiworker serve` starts the worker HTTP server with Bun's default HTTP
   `idleTimeout`.
2. `GET /api/worker/events/stream` uses Hono `streamSSE` and writes only when
   the worker event bus emits an event.
3. Worker Admin Chat subscribes with `fetch` + `ReadableStream` because the
   route requires bearer auth; its SSE parser already ignores blocks without a
   `data:` field.
4. Gateway-hosted worker SSE already writes `: connected` and `: keepalive`
   comment frames, but the direct worker API stream does not.
5. Real local validation found slow Codex-backed replies persisted to
   `worker.db` while the browser missed the live update after the idle stream
   timed out.

## Proposal

1. Add direct worker SSE initial/heartbeat comment frames under
   `apps/api/src/worker/events/routes.ts`.
2. Keep heartbeat cleanup tied to request abort / stream abort so long-lived
   Worker Admin sessions do not leak timers.
3. Add focused API coverage for a long idle stream that receives no
   intermediate text events before a later worker bus event.
4. Add Web subscribe coverage that heartbeat comment blocks are ignored and a
   later event still reaches the caller.
5. Keep Chat UI behavior unchanged; no conversation-continuation fixes in this
   plan.

## Risks

1. Heartbeat intervals can leak if the stream cleanup path is incomplete.
2. Timing-based tests can be flaky if they depend on production intervals.
3. A heartbeat interval above Bun's HTTP idle timeout would not fix the bug.
4. The real Codex-backed smoke can fail for local auth or executor
   availability reasons outside this source change.

## Scope

- `apps/api/src/worker/events/routes.ts`
- focused API tests for worker events stream behavior
- focused Web tests for Worker Admin SSE parsing/subscription behavior
- `docs/task/BUG-043.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Out Of Scope

- `BUG-044` selected-conversation continuation behavior.
- `BUG-045` task lifecycle row status updates.
- Gateway WS protocol changes.
- Executor timeout/probe behavior.
- Public admin no-token UX polish.

## Verification

- Passed: `bun test apps/api/src/worker/events/routes.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-api' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bunx eslint apps/api/src/worker/events/routes.ts apps/api/src/worker/events/routes.test.ts apps/web/src/worker/api.ts apps/web/src/worker/api.test.ts`
- Passed: temporary real Worker Admin smoke with a Codex-backed worker on
  `127.0.0.1:9327`; `BUG043_LIVE_OK` appeared live after a slow reply without
  reloading the page.
- Passed: `bun run --filter '@zonease/aiworker-api' test`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `git diff --check`

## Result

- Direct worker SSE streams now write `: connected` and periodic
  `: keepalive` comment frames while waiting for worker bus events.
- Worker Admin's existing fetch-based SSE parser ignores those comment frames
  and still delivers later business events.
- Slow Codex-backed Worker Admin Chat replies can update the page live after
  Bun's default 10 second HTTP idle window.
