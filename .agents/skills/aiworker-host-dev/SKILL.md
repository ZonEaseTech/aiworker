---
name: aiworker-host-dev
description: "Use when creating, modifying, or reviewing AIWorker Host platform surfaces such as local daemon API, Worker Web Shell, CLI lifecycle, Host runtime, app registry, thin local adapters, shared Host/Soul protocol, storage metadata, fs layout, or shared UI primitives."
argument-hint: "[surface]"
arguments: [surface]
---

# AIWorker Host Developer

This skill is a route helper, not a parallel architecture contract.

Use it before touching Host platform code or Host-facing docs. Always start
from `docs/architecture.md#constraint-registry`. Host work keeps AIWorker as
Local Shell + Engine Bridge for Soul Apps: start, shell, locate, mount and
bridge.

## Fit Check

Use this skill for:

- `apps/api`: local daemon API, OpenAPI routes, mounted service proxy and Host
  protocol endpoints.
- `apps/web`: Host Web Shell, Settings, Worker Configuration, locator chrome,
  mounted container, shell header and shared Host interaction surfaces.
- `apps/cli`: daemon lifecycle, dev command, app install/enable/disable and
  worker/workspace/session commands.
- `packages/core`: Host runtime, Soul App registry, thin local adapters, engine
  adapter and locator services.
- `packages/shared`: shared Host/Soul App protocol types, manifest schema,
  reference manifests and local workspace schemas.
- `packages/storage-sqlite`: `worker.db` Host metadata schema, migrations,
  repositories and indexes.
- `packages/ui`: shadcn-managed shared UI primitives and theme variables.
- `packages/fs-layout`: Host filesystem layout.
- Host-facing docs: `AGENTS.md`, `README.md`, `docs/architecture.md`,
  `docs/cli.md`, `docs/deployment.md` and `docs/executor-engines.md`.

Use `aiworker-soul-app-dev` when the change belongs to app-owned domain work.
Use it for Soul App manifests, standalone behavior, Host mounted handlers,
app-owned artifacts, app-owned review/profile/capability files or public
authoring surfaces.

## Required Registry Reads

Read these registry IDs in `docs/architecture.md` before Host changes:

- `ARCH-001`
- `HOST-001`
- `CONFIG-001`
- `PROTO-001`
- `IMPORT-001`
- `MOUNT-001`
- `DATA-001`
- `ENGINE-001`
- `UI-001`
- `DOC-001`

Do not restate or reinterpret those rules in this skill. If a boundary question
requires new wording, update `docs/architecture.md#constraint-registry` first.

Before touching Worker Configuration, read `CONFIG-001` directly.

## Read Set

Load only the relevant slice:

| Surface | Read first |
| --- | --- |
| Local daemon/API | `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`, `packages/shared/src/local-workspace.ts` |
| Web Shell | `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/features/local-workspace/api/`, `apps/web/src/features/settings/`, touched component/style files |
| CLI lifecycle | `apps/cli/src/aiworker.ts`, `apps/cli/src/aiworker.test.ts`, `docs/cli.md` |
| Host runtime/registry | `packages/core/src/host/`, `packages/core/src/soul-app/`, matching tests |
| Shared protocol/schema | `packages/shared/src/soul-app/`, `packages/shared/src/local-workspace.ts`, matching tests |
| Storage metadata | `packages/storage-sqlite/src/worker/schema.ts`, `index.ts`, `index.test.ts`, migrations/scripts |
| Shared UI primitives | `packages/ui`, `apps/web/components.json`, touched style/component files |
| Deployment/docs | `docs/deployment.md`, `docs/executor-engines.md`, `README.md`, `AGENTS.md` |

If `$surface` is provided, start there. If the surface is unclear, infer from
file paths and the user request. Ask only when ownership cannot be determined
safely from the architecture contract.

## Workflow

1. Classify the change as daemon/API, Web shell, CLI, core runtime, shared
   protocol, storage metadata, shared UI/layout or docs.
2. Confirm Host owns the platform behavior using the registry IDs above.
3. If the request is app-owned domain work, switch to `aiworker-soul-app-dev`.
4. For non-trivial work, follow PMA after user approval.
5. For Host Web or shared UI work, include Component Library Preflight:
   checked `packages/ui` primitives, app-local UI ownership reason and focused
   UI component check.
6. For frontend Host work, use `pma-web` after PMA approval.
7. For backend/runtime/CLI/storage work, use `pma-bun` after PMA approval.
8. For reviews or audits, use `pma-cr`.
9. Keep edits minimal and aligned with existing package boundaries.

## Contract Sync Rules

- API changes: update zod schemas, OpenAPI metadata, typed/shared client shapes
  and focused API/Web/CLI tests that consume the route.
- Storage changes: update Drizzle schema/migrations through the storage package,
  repository helpers and storage tests.
- Shared protocol changes: update `packages/shared`, affected Host consumers and
  affected Soul App manifests or SDK/runtime packages.
- Web shell changes: keep user-facing language centered on Soul App, Soul
  worker, workspace, session, artifact, profile, review and lesson. Use Host
  internals only in developer or diagnostic surfaces.
- CLI changes: keep `docs/cli.md` and focused CLI tests in sync.

## Validation

Pick the smallest command set that proves the touched Host surface:

| Change | Verification |
| --- | --- |
| API/local daemon | `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts` and API typecheck when types changed |
| Web shell/settings/mounted container | `bun run --filter '@zonease/aiworker-web' test`; build or browser smoke when visible UI changed |
| Web UI local style or component work | `bun run ui:check` plus focused Web test/build when visible behavior changed |
| CLI lifecycle | `bun run --filter '@zonease/aiworker-cli' test` and `build:bundle` when command behavior changed |
| Core runtime/registry/thin adapter | `bun run --filter '@zonease/aiworker-core' test` |
| Shared protocol/schema | `bun run --filter '@zonease/aiworker-shared' test` and downstream focused tests |
| Storage metadata/schema | `bun run --filter '@zonease/aiworker-storage-sqlite' test` and migration generation when schema changed |
| Cross-package contract | focused package tests plus `bun run check`; run `bun run build` when bundles or public entrypoints changed |
| Docs or skill only | `bun run docs:check`, reference search and `git diff --check` |

When code files changed, run:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph only for documentation-only, instruction-only or pure
formatting changes, and state the skip explicitly.

## Completion Checklist

- Name the Host surface changed.
- State why Host owns the behavior.
- State whether any Soul App protocol or app-owned surface is involved.
- Confirm the active boundary source was `docs/architecture.md#constraint-registry`.
- Confirm shared contracts, docs and tests stayed aligned.
- For Web UI work, summarize the Component Library Preflight and UI component
  check result.
- Record validation commands and results.
- Run code-review-graph for code changes or explicitly skip it for docs-only,
  instruction-only or formatting-only work.
