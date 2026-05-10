# REFACTOR-056 Worker-first registry and storage contract

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **claimedAt**: 2026-05-11 01:11
- **completedAt**: 2026-05-11 01:16
- **plan**: PLAN-233
- **relatesTo**: packages/storage-sqlite, packages/core, apps/api, apps/cli, docs/architecture.md

## Background

The product contract is worker-first: one host daemon manages many Soul-bound
workers, each worker owns workspaces/projects and sessions. Current code still
seeds one deterministic worker per available Soul and enforces
`workers.soul_id` uniqueness, so "create worker" cannot become a real product
action.

## Goal

Allow explicit local worker creation while preserving one Soul binding per
worker. Multiple workers may bind the same Soul, and first-run defaults must not
silently create every available Soul worker.

## Acceptance Criteria

- Storage no longer enforces one worker per Soul.
- Core/API/CLI can create worker runtimes from user-provided worker identity.
- Existing deterministic starter workers remain readable, but new code does not
  rely on `soulId -> workerId`.
- Workspaces and sessions continue to carry `workerId`.
- Focused storage/core/API/CLI tests cover multiple workers for the same Soul.

## Investigation

- `docs/architecture.md` and `GOALS.md` already define
  `host -> daemon -> Soul worker -> workspace/project -> session`.
- `packages/storage-sqlite/src/worker/schema.ts` currently has
  `uniqueIndex('workers_soul_idx').on(table.soulId)`.
- `apps/api/src/modes/worker.ts` and `apps/cli/src/aiworker.ts` both seed
  deterministic worker ids from Soul ids.
- `apps/web/src/worker/worker-studio.tsx` still derives the active worker from
  selected Soul.

## Risks

- Existing local DBs may contain the unique index. Because this is pre-1.0, the
  migration can be breaking, but tests should use the new schema from scratch.
- Runtime maps must be keyed by explicit `workerId`, not by Soul.
- Starter data should not obscure empty-state worker creation UX.

## Resolution

- Changed `workers_soul_idx` from a unique index to a normal lookup index.
- Updated the initial worker migration snapshot to allow multiple workers per
  Soul.
- Added storage coverage for two HR workers with isolated workspaces.
- Added runtime coverage for two HR workers using separate workspace roots.

## Verification

- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
