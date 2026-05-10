# PLAN-226 Worker Web streamed turn visibility and Codex warning cleanup

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 20:50
- **relatedTask**: BUG-088

## Current State

- The session stream sends `session_event` frames only.
- Runtime creates a real turn row immediately, but the stream does not expose
  it to Web until the final result refresh.
- Web clears the composer optimistically, which makes the operator message look
  swallowed during the run.
- Codex CLI may emit a non-fatal featured plugin cache 403 warning on stderr.
  The adapter currently forwards the raw HTML warning into the visible engine
  log stream.

## Proposal

1. Emit real `LocalTurn` rows through the SSE stream as `turn` frames whenever
   runtime reports a turn status update.
2. Track streamed turns in Worker Web and merge them with loaded turns.
3. Add a local optimistic turn immediately on submit, and clear it once a real
   streamed turn arrives or the final refresh completes.
4. Filter known non-fatal Codex plugin warm/cache warnings from live stderr
   chunks and final tool output.

## Scope

- `packages/core/src/worker/runtime.ts`
- `apps/api/src/modes/worker.ts`
- `apps/web/src/worker/api.ts`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `packages/core/src/worker/executor.ts`
- PMA docs and changelog

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser validation against `http://127.0.0.1:9217/`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

- Added streamed `turn` SSE frames so Worker Web can render the real turn row
  before final refresh.
- Added a local optimistic pending turn so the submitted operator message never
  disappears during engine execution.
- Filtered the known Codex featured plugin cache 403 warning from visible
  engine logs without mutating raw invocation logs.
- Verified with focused core/API/Web gates, production Web build, browser
  validation against the local daemon, and code-review-graph.
