# PLAN-297 Remove legacy gateway and fleet surfaces

- **status**: completed
- **createdAt**: 2026-05-13 17:13
- **approvedAt**: 2026-05-13 17:13
- **relatedTask**: REFACTOR-076

## Context

The current architecture contract is Host / Soul App dual autonomy:

```text
host -> local daemon -> Soul worker -> workspace/project -> session
-> turn -> business artifact -> review -> durable org memory
```

`packages/gateway` and `packages/gateway-proto` implement the older remote
operator/gateway/node control plane. Current source runtime code under
`apps/cli/src`, `apps/api/src` and `packages/core/src` no longer imports those
packages. The remaining active references are:

- package manifest dependencies in CLI/API/core;
- dead gateway smoke scripts in CLI/API;
- fleet DB schema, migrations and Drizzle generation;
- Docker image, compose, Caddy and aissh deployment surfaces that still target
  gateway;
- `packages/shared/src/fleet` exports, mostly no longer used by current code;
- README and deployment docs that still describe gateway/fleet as runnable
  operator paths.

## Proposal

1. Remove the gateway and gateway-proto workspace packages.
2. Remove dead gateway smoke scripts and package manifest dependencies.
3. Remove fleet DB schema/migrations/generation and publish only worker
   migrations and Worker Web static assets.
4. Remove legacy Docker/GHCR/compose/Caddy/aissh gateway deployment surfaces.
5. Move the small current shared type surface out of `fleet`:
   - keep worker id minting constants under `packages/shared/src/lib/ids.ts`;
   - keep `EngineKind` with engine availability contracts under
     `packages/shared/src/providers/availability.ts`;
   - replace the one legacy smoke-only `WorkerConfig` import with a local shape.
6. Update active docs to reflect the local daemon / Host / Soul App deployment
   path.

## Scope

In scope:

- workspace package removal;
- package manifests, lockfile and build scripts;
- active docs and deployment docs;
- focused shared/storage tests for moved utility surfaces;
- PMA, changelog and Superpowers tracking docs.

Out of scope:

- editing historical `docs/task/*`, `docs/plan/*` and old changelog entries
  purely because they mention gateway/fleet;
- implementing a new remote control plane replacement;
- adding Docker support for the new local daemon path.

## Risks

- **Hidden runtime imports.** Full typecheck/build must prove no current path
  still imports deleted packages.
- **Release packaging regression.** CLI bundle packaging must still include
  worker migrations and Worker Web assets.
- **Over-deleting shared types.** Shared `fleet` types are historical, but any
  still-current type must be rehomed before deletion.
- **Docs drift.** Active deployment docs must stop pointing operators to deleted
  gateway/Docker surfaces.

## Verification

- `bun install --frozen-lockfile`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run web:smoke:mounted-surfaces`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-13 17:13: Created and claimed after current-reference investigation.
- 2026-05-13 17:28: Removed active gateway/fleet packages, scripts, storage,
  deployment surfaces and docs; kept worker-only migrations and local Host /
  Soul App packaging path.

## Verification Results

- `bun install` passed and removed the deleted workspace packages from
  `bun.lock`.
- Focused gates passed:
  `bun run --filter '@zonease/aiworker-shared' typecheck`,
  `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`,
  `bun run --filter '@zonease/aiworker-cli' typecheck`,
  `bun run --filter '@zonease/aiworker-api' typecheck`,
  `bun run --filter '@zonease/aiworker-shared' test`,
  `bun run --filter '@zonease/aiworker-storage-sqlite' test`,
  `bun run --filter '@zonease/aiworker-cli' build:bundle`.
- Root gates passed: `bun run typecheck`, `bun run lint`, `bun run test`,
  `bun run build`.
- Runtime smoke passed: `bun run web:smoke:mounted-surfaces`.
- code-review-graph passed: `bun run crg:update`, `bun run crg:review`.
  Review reported overall risk 0.35 and one static test-gap hint for
  `configureWorker`; current CLI/full test gates cover the changed smoke
  configuration path.
