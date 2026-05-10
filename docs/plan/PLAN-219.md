# PLAN-219 Worker session data contract

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **relatedTask**: REFACTOR-047

## Investigation

Current source still uses the old model:

- `packages/shared/src/local-workspace.ts` defines `LocalProject`,
  `LocalRun`, and `LocalRunEvent`.
- `packages/storage-sqlite/src/worker/schema.ts` creates `projects`, `runs`,
  and `run_events`.
- `packages/core/src/worker/runtime.ts` exposes `createProject()` and
  `startRun()`.
- `packages/core/src/worker/executor.ts` ships an internal workspace template
  runner, which makes the product look functional while bypassing the external
  engine boundary.

The approved architecture requires the engine to start at the session layer and
allows only internal `engine_invocation` audit records below a turn.

## Proposal

Implement a destructive greenfield data contract:

1. Add `workers` as the Soul-bound runtime boundary.
2. Reinterpret `workspaces` as business workspaces/projects under a worker.
3. Add `sessions` as the external-engine handoff thread.
4. Add `turns` as the user-visible interaction unit.
5. Add `engine_invocations` as internal audit/debug state for each engine call.
6. Add `session_events` for timeline/event replay.
7. Move artifact/review links from `run_id` to
   `session_id` / `turn_id` / `invocation_id`.
8. Replace the template runner with a real external-engine adapter plus BYOK
   provider path.

## Scope

In scope: shared local schemas/types, worker SQLite schema/repository/migration,
core runtime/executor contract, and focused tests.

Out of scope: Web route wiring, CLI lifecycle cleanup, browser preview, and root
verification.

## Verification

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`

## Status

Completed on 2026-05-10.

Delivered:

- `worker.db` greenfield schema now uses workers, workspaces, sessions, turns,
  engine invocations, and session events.
- Artifacts and reviews now link to session/turn/invocation, not run.
- Core runtime creates workspace folders, materializes session context, invokes
  an external engine adapter, and records turn artifacts/reviews/lessons.
- The internal template runner is removed from the default execution path.

Verification:

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
