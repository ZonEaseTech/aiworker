# PLAN-012 Core extraction — move worker/** into @aiworker/core (PLAN-011 phase 1b)

- **status**: draft
- **createdAt**: 2026-04-24 12:30
- **relatedTask**: REFACTOR-003

## Context

PLAN-011 phase 1a ([PLAN-011.md](PLAN-011.md) §"Execution split") delivered `@aiworker/storage-sqlite` + the `aiw` CLI shell. It intentionally deferred the 107-file physical move of `apps/api/src/worker/**` into a new `packages/core/src/worker/**` because the tree carries cross-cutting helper imports (`config/worker`, `config/common`, `shared/lib/ids`, `shared/AppError`) that deserve an independent review cycle.

Post-1a state:

- The worker runtime is already transport-agnostic (see `apps/api/src/worker/runtime.ts`) — phase 1b is a file move + import sweep, not a redesign.
- `apps/cli` reaches the runtime through `@aiworker/api/lib` (an explicit re-export surface added in 1a). Phase 1b will retarget those imports to `@aiworker/core` and delete the intermediate `apps/api/src/lib.ts` surface.
- Hot-reload correctness (from CLAUDE.md §"Architecture Constraints") must survive the move: route closures bind `() => state.runtime`; old runtime's `dispose()` unhooks observer + proposer + any long connections.

## Proposal (sketch — to be finalised when phase 1a is merged)

- New workspace package **`@aiworker/core`**:
  - `src/worker/{brain,executor,channels,orchestrator,events,evolution,config,secrets,workspaces,bootstrap,conversation,management}/**` — direct move.
  - Re-export surface `src/index.ts` with `buildWorkerRuntime`, `WorkerRuntime`, `WorkerEventBus`, `OrchestratorDeps`, etc.
  - Dependencies: `@aiworker/shared`, `@aiworker/storage-sqlite`, `drizzle-orm`, `zod`, `consola`. **Not** `hono` (enforced by ESLint rule below).
- Cross-cutting helpers:
  - Move `apps/api/src/config/worker.ts` → `packages/core/src/config/worker.ts` (already lazy post-1a).
  - Move `apps/api/src/config/common.ts` → `packages/core/src/config/common.ts`.
  - `apps/api/src/shared/lib/ids.ts` → evaluate: move to `@aiworker/shared` (preferred — it's pure) or `packages/core/src/lib/ids.ts`.
  - `apps/api/src/shared/AppError` → same decision; lean toward `@aiworker/shared`.
- Transport adapters stay in `apps/api`: `modes/worker.ts`, `modes/dashboard.ts`, `worker/*/routes.ts`, `worker/management/bearer-auth.ts`, Hono middleware in `shared/middleware/`.
- Delete `apps/api/src/lib.ts` re-exports; `apps/cli` imports directly from `@aiworker/core`.
- ESLint `no-restricted-imports` in `packages/core`: forbid `apps/**`, `hono`, `@hono/*`, `@scalar/*`.

## Acceptance criteria

- `bun run check` clean across the monorepo.
- `bun run --filter '@aiworker/api' test` — 450 pass (phase-1a baseline) unchanged.
- `bun run --filter '@aiworker/cli' smoke:aiw-run` still green.
- New hot-reload regression test: `aiw serve` + `PUT /api/worker/config` → next request routed through the new runtime, old runtime's `dispose()` called exactly once, observer + proposer unhooked.
- `apps/api/src/lib.ts` deleted.
- `@aiworker/core` has zero `hono` imports (verified by the new ESLint rule + grep check in CI).

## Risks

- **R1** (P1) — hot-reload capture regression when factories are relocated. Any `new X(runtime)` that captures `runtime.brain` or `runtime.bus` eagerly would break atomic swap. Mitigation: add a regression test before the move; audit every factory.
- **R2** (P1) — ESLint sort-imports churn (as seen in 1a) will produce a large diff; don't confuse it with semantic changes during review.
- **R3** (P2) — the cross-cutting helper decision (`AppError` / `mintWorkerId` → shared vs core) is reversible but visible in external APIs. Make a single consistent call and document.
- **R4** (P2) — Dockerfile `COPY` paths + `bun.lock` shape change; prod image build must stay green in the same PR.

## Scope

- Move ~107 files (worker tree) + ~4 helpers.
- Add ~3 package scaffolds (`packages/core/package.json`, `tsconfig.json`, `src/index.ts`).
- Edit ~5 files in `apps/api` (modes + route builders updating their imports).
- Edit ~6 files in `apps/cli` (switch import source).
- Net file count roughly unchanged.

## Alternatives (rejected during 1a)

- **Keep `apps/api/src/lib.ts` forever** — works, but defeats the CLI-first goal: core should be the package boundary, not an app with a lib subpath.
- **Move in smaller increments** (e.g. `brain/` → core first, `executor/` next) — introduces transient states where `apps/api` imports cross the package boundary repeatedly. Single atomic move is cleaner.

## Decision

Draft. Awaiting phase-1a merge + approval before refining the move order and opening PRs.
