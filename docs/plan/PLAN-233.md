# PLAN-233 Worker-first registry and storage contract

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **approvedAt**: 2026-05-11 01:11
- **completedAt**: 2026-05-11 01:16
- **relatedTask**: REFACTOR-056

## Current State

- Product docs already define worker as the top-level Soul runtime.
- Storage currently has a unique Soul index on `workers.soul_id`.
- API and CLI seed one deterministic worker per available Soul.
- Web still selects Soul first and derives the worker from the selected Soul.

## Proposal

1. Remove the storage-level uniqueness assumption on `workers.soul_id`.
2. Add a reusable worker creation path that accepts `workerId`, `soulId`, name,
   status, default engine, and metadata.
3. Keep workspace/session rows owned by explicit `workerId`.
4. Update seed helpers so tests can create multiple workers for the same Soul.

## Scope

- `packages/storage-sqlite/src/worker/schema.ts`
- `packages/storage-sqlite/drizzle/worker/*`
- `packages/storage-sqlite/src/worker/index.ts`
- `packages/core/src/worker/runtime.ts`
- focused tests where needed

## Risks

- Existing pre-1.0 local DBs may need recreation after the unique-index change.
- Avoid making worker creation a fleet/admin concept; this is local daemon
  worker registry only.

## Verification Plan

- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `git diff --check`

## Implementation

- Removed the one-worker-per-Soul storage constraint.
- Preserved a non-unique Soul lookup index for worker list/filter use cases.
- Added storage and runtime tests proving same-Soul workers isolate their
  workspaces through explicit `workerId`.

## Verification Results

- Passed: `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- Passed: `bun run --filter '@zonease/aiworker-core' test`
