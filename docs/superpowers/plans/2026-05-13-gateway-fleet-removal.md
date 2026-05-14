# Gateway Fleet Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy remote gateway/fleet control plane from active source, package, storage, deployment and documentation surfaces.

**Architecture:** The local Host remains the only control surface. Soul Apps mount through Host registry/protocol, while external engines stay behind session-level adapters. No remote gateway/proto package remains in the workspace.

**Tech Stack:** Bun workspaces, TypeScript, Drizzle SQLite migrations, Vite Worker Web build, PMA docs.

---

### Task 1: PMA And Scope Records

**Files:**
- Create: `docs/task/REFACTOR-076.md`
- Create: `docs/plan/PLAN-297.md`
- Create: `docs/superpowers/specs/2026-05-13-gateway-fleet-removal-design.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] Create and claim the PMA task and plan.
- [x] Record the destructive pre-1.0 removal scope in the Superpowers design.

### Task 2: Workspace Package Removal

**Files:**
- Delete: `packages/gateway/**`
- Delete: `packages/gateway-proto/**`
- Delete: `apps/cli/scripts/smoke-aiworker-fleet.ts`
- Delete: `apps/api/scripts/smoke-gateway-node.ts`
- Modify: `apps/cli/package.json`
- Modify: `apps/api/package.json`
- Modify: `packages/core/package.json`
- Modify: `bun.lock`

- [x] Remove gateway/proto workspaces and dependent smoke scripts.
- [x] Remove gateway/proto package dependencies and regenerate the lockfile.
- [x] Verify no active source imports deleted packages.

### Task 3: Fleet Storage And Shared Type Convergence

**Files:**
- Delete: `packages/storage-sqlite/src/fleet/**`
- Delete: `packages/storage-sqlite/drizzle/fleet/**`
- Delete: `packages/storage-sqlite/drizzle.fleet.config.ts`
- Delete: `packages/shared/src/fleet/**`
- Delete: `packages/shared/src/lib/admin-exposure.ts`
- Delete: `packages/shared/src/lib/admin-exposure.test.ts`
- Modify: `packages/storage-sqlite/package.json`
- Modify: `packages/storage-sqlite/src/index.ts`
- Modify: `packages/shared/src/lib/ids.ts`
- Modify: `packages/shared/src/providers/availability.ts`
- Modify: `packages/shared/src/providers/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/cli/scripts/smoke-aiworker-run.ts`

- [x] Remove fleet DB generation and export surfaces.
- [x] Rehome worker id constants and engine kind typing.
- [x] Replace smoke-only `WorkerConfig` usage with a local narrow shape.
- [x] Add focused tests for worker id minting.

### Task 4: Packaging, Ops And Active Docs

**Files:**
- Delete: `Dockerfile`
- Delete: `docker-compose.yml`
- Delete: `.github/workflows/build-image.yml`
- Delete: `ops/**`
- Delete: `scripts/deploy.ts`
- Delete: `docs/gateway.md`
- Delete: `docs/deployment-public-https.md`
- Modify: `apps/cli/scripts/build-publish-manifest.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/deployment.md`
- Modify: `docs/executor-engines.md`

- [x] Publish only worker migrations and Worker Web static assets.
- [x] Remove legacy Docker/GHCR/compose/Caddy/aissh deployment surfaces.
- [x] Rewrite active deployment docs around local daemon and release package.

### Task 5: Verification And Closure

**Files:**
- Modify: `docs/changelog.md`
- Modify: `docs/task/REFACTOR-076.md`
- Modify: `docs/plan/PLAN-297.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [x] Run package-focused tests and build checks.
- [x] Run root lint, typecheck, test and build.
- [x] Run mounted surface smoke.
- [x] Run diff check and code-review-graph.
- [x] Mark PMA records completed and commit.
