# PLAN-400 Worker-scoped native invocation metadata

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 13:18
- **approvedAt**: 2026-05-21 13:18
- **completedAt**: 2026-05-21 13:18
- **relatedTask**: REFACTOR-092

## Current State

The old `engine_invocations` storage path is session-scoped:

- `engine_invocations.session_id` and `turn_id` are required foreign keys.
- `prompt` stores the full generated prompt.
- sequence helpers are scoped by session id.
- session events reference this old table.

That shape is still needed by the existing `LocalWorkerRuntime` tests, so this
slice should not mutate or repurpose it.

## Proposal

1. Add a new `worker_engine_invocations` schema table.
   - Required: `id`, `worker_id`, `seq`, `engine_id`, `status`, `cwd`.
   - Optional metadata refs: `engine_command`, `input_ref`, `stdout_ref`,
     `stderr_ref`, `exit_code`, `signal`, `metadata_json`, timestamps.
   - No workspace/session/turn/prompt/raw-input/context columns.
2. Add repository helpers:
   - `createWorkerEngineInvocation`
   - `getWorkerEngineInvocation`
   - `updateWorkerEngineInvocation`
   - `listWorkerEngineInvocations`
   - `nextWorkerEngineInvocationSeq`
3. Generate the Drizzle worker migration after schema changes.
4. Add focused storage tests that prove the new table works without creating a
   workspace, session or turn.

## Scope

- `packages/storage-sqlite/src/worker/schema.ts`
- `packages/storage-sqlite/src/worker/index.ts`
- `packages/storage-sqlite/src/worker/index.test.ts`
- `packages/storage-sqlite/drizzle/worker/*`
- `docs/task/REFACTOR-092.md`
- `docs/plan/PLAN-400.md`
- `docs/changelog.md`

## Non-Goals

- Do not wire `invokeNativeEngine` into storage yet.
- Do not replace old session-scoped `engine_invocations`.
- Do not add API routes in this slice.
- Do not store raw prompt/input/context in Host metadata.

## Verification Plan

- Write storage tests first and confirm they fail before implementation.
- Implement schema and repository helpers.
- Generate Drizzle migration with `bun run db:generate:worker`.
- Run focused storage tests, storage typecheck, core bridge tests, docs check,
  diff check and code-review-graph.

## Result

Added `worker_engine_invocations` as the worker-scoped metadata table for the
native Engine Bridge path. It references only `workers`, keeps per-worker
sequence numbers, and stores native runtime metadata such as engine id, command,
resolved cwd, input/log refs, status, exit code, signal and timestamps. It does
not store workspace id, session id, turn id, prompt, raw input or context.

Repository helpers now create, update, fetch, list and sequence worker native
invocation rows without requiring any below-worker Host rows. The existing
session-scoped `engine_invocations` table and runtime behavior remain
unchanged.

Drizzle migration generation added `0004_great_shotgun.sql` for
`worker_engine_invocations`.

## Verification

- TDD red run:
  `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
  failed first because `workerEngineInvocations` was not exported.
- Migration generation:
  `bun run db:generate:worker` generated `0004_great_shotgun.sql`.
- Focused storage tests:
  `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
  passed with 10 tests and 73 assertions.
- Storage typecheck:
  `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck` passed.
- Core bridge regression:
  `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
  passed with 3 tests and 21 assertions.
- Docs contract:
  `bun run docs:check` passed.
- Whitespace:
  `git diff --check` passed.
- Code review graph:
  `bun run crg:update` updated 8 files. `bun run crg:review` reported 6 static
  test gaps for the new repository helpers; the focused storage test directly
  exercises create/get/list/update/next-seq behavior, and index/export tests
  cover the table shape.
