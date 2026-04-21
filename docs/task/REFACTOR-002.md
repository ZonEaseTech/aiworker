# REFACTOR-002 Refactor AIWorker into a multi-worker fleet runtime

- **status**: completed
- **priority**: P1
- **owner**: coordinator
- **createdAt**: 2026-04-21 07:00
- **startedAt**: 2026-04-21 07:40
- **completedAt**: 2026-04-21 11:48

## Description

Reposition AIWorker from a single-instance Agent Runtime to a **fleet runtime** that hosts many independent workers managed through one dashboard.

Driver: the current direction (REFACTOR-001 / PLAN-002) built a *single* worker whose Brain + Executor are wired from global env variables. "aiworker" semantically refers to a **group of workers**, not one — each worker should have its own Brain, its own Executor, its own pluggable skill set, and be fully isolated from other workers on the same node.

Acceptance criteria:

- `workers` is the primary entity: CRUD through the API, one row per worker, each with independent `brainProviderType + brainConfig` and `executorProviderType + executorConfig` (secrets encrypted at rest).
- All runtime tables (`agent_tasks`, `conversations`, `messages`, `execution_logs`, `skill_conflicts`, `sync_events`) carry a `workerId` FK; every query scopes by worker.
- Skills are pluggable per worker via `worker_skill_bindings` — a worker enables a subset of Brain or local skills, each with its own config.
- Orchestrator runs a per-worker queue; no cross-worker tool calls, no cross-worker memory writes, no cross-worker task visibility.
- Global `getBrainProvider()` / `getExecutorProvider()` singletons are replaced by a `WorkerRegistry` that materializes providers from the worker config row (LRU cache, invalidation on worker update).
- Frontend root is a Workers list; existing Dashboard / Skills / Memory / Execution / Orchestrator / Config pages become per-worker routes under `/workers/:slug/...` with a worker switcher.
- Deployment to the `aiwork` server (id `<aissh-server-id-redacted>`) happens through the `aissh` CLI with a scripted deploy / update flow (build → upload → restart).
- `bun run check` clean; orchestrator E2E test adapted to the per-worker scope.

## ActiveForm

Refactoring AIWorker into a multi-worker fleet runtime

## Dependencies

- **blocked by**: (none)
- **blocks**: (none)

## Notes

Related plans: PLAN-003 (phase 1 scaffold — committed 9e38180) and PLAN-004 (final distributed architecture — commits e2a20c8..3abc332). Builds on the Provider-shaped core delivered by REFACTOR-001. Pre-release project — destructive DB migration was acceptable; existing deployed instance will be redeployed with a fresh schema as part of FEAT-009.

Delivery: 13-subtask BKD worktree dispatch (5t0fo920) under project `aiworker` (`lded7ogt`); all subtasks `done`. End-to-end smoke green (`apps/api/scripts/smoke-plan-004.ts`). `bun run check` clean.

Refactor acceptance criteria met except for the **deployment to the `aiwork` server via aissh CLI** line, which was deferred on explicit user direction during PLAN-003 scoping and is tracked in FEAT-009. Closing this task `completed` with deployment explicitly captured downstream.
