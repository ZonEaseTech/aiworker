# REFACTOR-092 Add worker-scoped native invocation metadata

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21 13:18
- **claimedAt**: 2026-05-21 13:18
- **approvedAt**: 2026-05-21 13:18
- **completedAt**: 2026-05-21 13:18
- **plan**: PLAN-400
- **relatesTo**: HOST-001, DATA-001, ENGINE-001, packages/storage-sqlite

## Background

`REFACTOR-091` proved that core can invoke a native engine with only worker id,
resolved cwd, native command arguments and raw stdin. The next step is to give
that path a Host metadata surface that still does not encode below-worker
product concepts.

The existing `engine_invocations` table is tied to session and turn rows and
stores the full prompt. That is the wrong shape for the native bridge because
the target boundary says Host only recognizes the worker and records invocation
metadata or references.

## Acceptance Criteria

1. Add a worker-scoped native invocation metadata table that references only
   `workers`.
2. The table does not contain workspace id, session id, turn id, prompt, raw
   input or context columns.
3. Repository helpers can create, update, fetch, list and sequence worker
   native invocations by worker id.
4. Existing session-scoped `engine_invocations` behavior remains unchanged.
5. Focused storage tests and migration generation cover the new table and
   indexes.

## Verification

- [x] TDD red run for worker native invocation storage tests
- [x] `bun run db:generate:worker`
- [x] `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- [x] `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- [x] Existing core bridge tests
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Notes

- 2026-05-21 13:18: Claimed as the storage metadata slice after the native core
  bridge spike. Keep this independent from the pending Host output metadata
  boundary task.
- 2026-05-21 13:18: Added `worker_engine_invocations` as Host metadata for
  native engine runs. The table references only `workers` and stores refs plus
  status metadata, not prompt/input/context or session/workspace/turn ids.
- 2026-05-21 13:18: `crg:review` reported six static test gaps for the new
  repository helpers. The focused storage test
  `persists worker-scoped native invocation metadata without session rows`
  directly exercises create/get/list/update/next-seq behavior and the changed
  index/export tests cover the table shape.
