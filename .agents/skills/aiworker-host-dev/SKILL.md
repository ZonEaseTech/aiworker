---
name: aiworker-host-dev
description: "Use when creating, modifying, or reviewing AIWorker Host platform surfaces such as local daemon API, Worker Web Shell, CLI lifecycle, Host runtime, app registry, brokers, auth/security review, shared Host/Soul protocol, storage metadata, fs layout, or shared UI primitives."
argument-hint: "[surface]"
arguments: [surface]
---

# AIWorker Host Developer

Use this skill before touching Host platform code or docs. Host work keeps
AIWorker positioned as a local-first vertical Soul App host: platform locator,
capability shell, daemon, registry, brokers, auth, settings, shared shell and
protocol boundary. Host must stay generic and must not interpret Soul App domain
state.

## Fit Check

Use this skill for:

- `apps/api`: local daemon API, OpenAPI routes, mounted service proxy, Host
  protocol endpoints, settings, worker/workspace/session API.
- `apps/web`: Host Web Shell, Settings, Soul App install/enable UX,
  worker/workspace/session workbench, shell header, drawers, shared Host
  interaction surfaces.
- `apps/cli`: daemon lifecycle, dev command, app install/enable/disable,
  worker/workspace/session commands, bundled runtime entrypoints.
- `packages/core`: Host runtime, Soul App registry, brokers, provider registry,
  identity provider, security review, engine adapter, search index.
- `packages/shared`: shared Host/Soul App protocol types, manifest schema,
  reference manifests, registry projection, local workspace schemas.
- `packages/storage-sqlite`: `worker.db` Host metadata schema, migrations,
  repositories and indexes.
- `packages/component` and `packages/fs-layout`: shared UI primitives and Host
  filesystem layout.
- Host-facing docs: `AGENTS.md`, `README.md`, `docs/architecture.md`,
  `docs/cli.md`, `docs/deployment.md`, `docs/executor-engines.md`.

Use `aiworker-soul-app-dev` instead for app-owned domain UI/API, app manifests,
standalone behavior, Host mounted handlers, artifact schemas, review rubrics,
capability prompts, packs, app-owned descriptors, and app-scoped broker use.

## Product Contract

Hard constraints live in `docs/architecture.md#constraint-registry`. Apply these
IDs before changing Host behavior:

- `ARCH-001`: keep the default product path centered on Host-installed Soul
  Apps, workers, workspaces and sessions.
- `HOST-001`: Host owns platform capability, not domain meaning.
- `PROTO-001`: Host consumes only protocol/grant-exposed app surfaces.
- `IMPORT-001`: Host must not import Soul App `src`.
- `DATA-001`: Host stores metadata and descriptors, not full business facts.
- `BROKER-001`: brokers are app/workspace/grant scoped.
- `DOC-001`: audit docs do not override the active architecture contract.

Practical Host implications:

- If a Soul App does not expose a surface, Host stops instead of fetching,
  inferring or backfilling it.
- Keep broker records generic: ids, references, status, hashes and platform
  audit, not domain-specific facts.
- For official HR/QA manifest or shell contract changes, keep app manifests and
  `packages/shared/src/soul-app/fixtures.ts` aligned because Host bootstrap
  consumes shared reference manifests.
- External engines own their tool loop, sandbox, approvals, native sessions,
  auth/profile and plugin ecosystem; Host prepares context and observes/invokes
  at session boundaries.

## Read Set

Load only the relevant slice:

| Surface | Read first |
| --- | --- |
| Local daemon/API | `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`, `packages/shared/src/local-workspace.ts` |
| Web Shell | `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/features/local-workspace/api/`, `apps/web/src/features/settings/`, touched component/style files |
| CLI lifecycle | `apps/cli/src/aiworker.ts`, `apps/cli/src/aiworker.test.ts`, `docs/cli.md` |
| Host runtime/registry | `packages/core/src/host/`, `packages/core/src/soul-app/`, matching tests |
| Brokers/security | `packages/core/src/soul-app/broker.ts`, `security-review.ts`, provider/search/storage helpers and tests |
| Shared protocol/schema | `packages/shared/src/soul-app/`, `packages/shared/src/local-workspace.ts`, matching tests |
| Storage metadata | `packages/storage-sqlite/src/worker/schema.ts`, `index.ts`, `index.test.ts`, migrations/scripts |
| Shared UI primitives | `packages/component`, `apps/web/src/shared/components/ui/`, `DESIGN.md` |
| Deployment/docs | `docs/deployment.md`, `docs/executor-engines.md`, `README.md`, `AGENTS.md` |

If `$surface` is provided, start with that row. If the surface is unclear, infer
from file paths and the user request; ask only when Host vs Soul App ownership
cannot be determined safely.

## Workflow

1. Classify the change as daemon/API, Web shell, CLI, core runtime, broker,
   security, shared protocol, storage metadata, shared UI/layout or docs.
2. Confirm Host owns the platform behavior. If the request is domain-specific,
   switch to `aiworker-soul-app-dev` or design a protocol/broker surface.
3. For non-trivial work, follow PMA: investigate, proposal, approval,
   implementation, verification and PMA/changelog sync.
4. For frontend Host work, use `pma-web` after PMA approval.
5. For backend/runtime/CLI/storage work, use `pma-bun` after PMA approval.
6. For reviews or audits, use `pma-cr`.
7. Keep edits minimal and aligned with existing package boundaries.

## Contract Sync Rules

- API changes: update zod schemas, OpenAPI metadata, typed/shared client shapes
  and focused API/Web/CLI tests that consume the route.
- Storage changes: update Drizzle schema/migrations through the storage package,
  repository helpers and storage tests.
- Shared protocol changes: update `packages/shared`, `packages/core`, API/Web
  consumers and official app/reference manifest tests when relevant.
- Broker/security changes: prove allowed and denied paths. The denied path
  should fail before contacting mounted Soul App services.
- Web shell changes: keep user-facing language centered on Soul App, Soul
  worker, workspace, session, artifact, profile, review and lesson. Use Host
  internals only in developer/diagnostic surfaces.
- CLI changes: keep `docs/cli.md` and focused CLI tests in sync.

## Validation

Pick the smallest command set that proves the touched Host surface:

| Change | Verification |
| --- | --- |
| API/local daemon | `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts` and API typecheck when types changed |
| Web shell/settings/workbench | `bun run --filter '@zonease/aiworker-web' test`; build or browser smoke when visible UI changed |
| CLI lifecycle | `bun run --filter '@zonease/aiworker-cli' test` and `build:bundle` when command behavior changed |
| Core runtime/registry/broker | `bun run --filter '@zonease/aiworker-core' test` |
| Shared protocol/schema | `bun run --filter '@zonease/aiworker-shared' test` and downstream focused tests |
| Storage metadata/schema | `bun run --filter '@zonease/aiworker-storage-sqlite' test` and migration generation when schema changed |
| Cross-package contract | focused package tests plus `bun run check`; run `bun run build` when bundles or public entrypoints changed |
| Docs/skill only | frontmatter parse, reference search and `git diff --check` |

When production code changed, run:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph for documentation-only, instruction-only or pure
formatting changes, and state that skip explicitly.

## Completion Checklist

- Name the Host surface changed.
- State why Host owns the behavior.
- State whether any Soul App protocol or app-owned surface is involved.
- Confirm Host did not infer domain meaning or import Soul App internals.
- Confirm shared contracts, docs and tests stayed aligned.
- Record validation commands and results.
- Sync PMA docs/changelog when project-level impact exists.
- Run code-review-graph for code changes or explicitly skip it for
  instruction-only, docs-only or formatting-only work.
