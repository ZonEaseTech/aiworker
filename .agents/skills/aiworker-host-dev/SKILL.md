---
name: aiworker-host-dev
description: "Use when creating, modifying, or reviewing AIWorker Host platform surfaces such as local daemon API, Worker Web Shell, CLI lifecycle, Host runtime, app registry, thin local adapters, shared Host/Soul protocol, storage metadata, fs layout, or shared UI primitives."
argument-hint: "[surface]"
arguments: [surface]
---

# AIWorker Host Developer

Use this skill before touching Host platform code or docs. Host work keeps
AIWorker positioned as a Local Shell + Engine Bridge for Soul Apps: start,
shell, locate, mount and bridge. Host must stay generic and must not interpret
Soul App domain state.

## Fit Check

Use this skill for:

- `apps/api`: local daemon API, OpenAPI routes, mounted service proxy, Host
  protocol endpoints, settings, worker/workspace/session API.
- `apps/web`: Host Web Shell, Settings, Soul App install/enable UX,
  worker/workspace/session workbench, shell header, drawers, shared Host
  interaction surfaces.
- `apps/cli`: daemon lifecycle, dev command, app install/enable/disable,
  worker/workspace/session commands, bundled runtime entrypoints.
- `packages/core`: Host runtime, Soul App registry, thin local adapter
  compatibility helpers, engine adapter and locator services.
- `packages/shared`: shared Host/Soul App protocol types, manifest schema,
  reference manifests, registry projection, local workspace schemas.
- `packages/storage-sqlite`: `worker.db` Host metadata schema, migrations,
  repositories and indexes.
- `packages/ui`: shadcn-managed shared UI primitives and theme variables.
- `packages/fs-layout`: Host filesystem layout.
- Host-facing docs: `AGENTS.md`, `README.md`, `docs/architecture.md`,
  `docs/cli.md`, `docs/deployment.md`, `docs/executor-engines.md`.

Use `aiworker-soul-app-dev` instead for app-owned domain UI/API, app manifests,
standalone behavior, Host mounted handlers, artifact schemas, review rubrics,
capability prompts, packs, app-owned descriptors and app-declared adapter needs.

## Product Contract

Hard constraints live in `docs/architecture.md#constraint-registry`. Apply these
IDs before changing Host behavior:

- `ARCH-001`: keep the default product path centered on AIWorker -> Soul App
  -> workspace -> session -> app-owned work.
- `HOST-001`: Host owns only start, shell, locate, mount and bridge.
- `PROTO-001`: Host routes only declared app surfaces and stops when a surface
  is absent.
- `IMPORT-001`: Host must not import Soul App `src`.
- `MOUNT-001`: Host-mounted app-owned UI/API uses micro-app mount payloads,
  mounted API proxying and narrow context data; Host does not render app-domain
  UI or translate workbench descriptors into product routes.
- `DATA-001`: Host stores local metadata and references, not business facts or
  generic review/proposal/admission state.
- `ENGINE-001`: Host prepares cwd/context/invocation boundaries; external
  engines own tool loop, approval behavior, native sessions and memory.
- `UI-001`: Host Web and official Soul App web are shadcn-first through
  `packages/ui`; Host Web must not make generic artifact/review/broker/governance
  panels the default product surface.
- `DOC-001`: audit docs do not override the active architecture contract.

Practical Host implications:

- If a Soul App does not expose a surface, Host stops instead of fetching,
  inferring or backfilling it.
- App-owned mounted UI is rendered through a generic micro-app container; do not
  add Host-local Soul renderer trees to make a surface appear.
- micro-app replaces the old hand-rolled Host workbench action/search bridge.
  Keep app-owned actions and search inside the mounted app UI or app-owned API
  paths instead of adding Host toolbar controls or `/actions`/`/search` routes.
- Keep any compatibility or adapter records generic: ids, references, status
  and hashes, not domain-specific facts.
- For official HR/QA manifest or shell contract changes, keep app manifests and
  `packages/shared/src/soul-app/fixtures.ts` aligned because Host bootstrap
  consumes shared reference manifests.
- External engines own their tool loop, sandbox, approvals, native sessions,
  auth/profile and plugin ecosystem; Host prepares context and observes/invokes
  at session boundaries.
- Use `packages/ui` as the shadcn-managed source for shared primitives, theme
  variables, preset icons and reusable UI composition. App-local UI should have
  an ownership reason: Host shell behavior, Soul App domain semantics, or a
  temporary migration step.

## Read Set

Load only the relevant slice:

| Surface | Read first |
| --- | --- |
| Local daemon/API | `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`, `packages/shared/src/local-workspace.ts` |
| Web Shell | `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/features/local-workspace/api/`, `apps/web/src/features/settings/`, touched component/style files |
| CLI lifecycle | `apps/cli/src/aiworker.ts`, `apps/cli/src/aiworker.test.ts`, `docs/cli.md` |
| Host runtime/registry | `packages/core/src/host/`, `packages/core/src/soul-app/`, matching tests |
| Thin adapters/compat | mounted service proxy helpers in `apps/api/src/modes/worker.ts`, shared protocol descriptors, and matching tests; treat old broker/security-review/workbench action-search bridge history as audit-only context |
| Shared protocol/schema | `packages/shared/src/soul-app/`, `packages/shared/src/local-workspace.ts`, matching tests |
| Storage metadata | `packages/storage-sqlite/src/worker/schema.ts`, `index.ts`, `index.test.ts`, migrations/scripts |
| Shared UI primitives | `packages/ui`, `apps/web/components.json`, touched style/component files |
| Deployment/docs | `docs/deployment.md`, `docs/executor-engines.md`, `README.md`, `AGENTS.md` |

If `$surface` is provided, start with that row. If the surface is unclear, infer
from file paths and the user request; ask only when Host vs Soul App ownership
cannot be determined safely.

## Workflow

1. Classify the change as daemon/API, Web shell, CLI, core runtime, thin
   adapter compatibility, shared protocol, storage metadata, shared UI/layout
   or docs.
2. Confirm Host owns the platform behavior. If the request is domain-specific,
   switch to `aiworker-soul-app-dev` or design a declared protocol or thin
   adapter surface.
3. For non-trivial work, follow PMA: investigate, proposal, approval,
   implementation, verification and PMA/changelog sync.
4. For Host Web or shared UI work, add a `Component Library Preflight` section
   to the proposal before implementation. It must name checked `packages/ui`
   shadcn primitives, state the app-local UI ownership reason, and include the
   focused UI governance command in verification.
5. For frontend Host work, use `pma-web` after PMA approval.
6. For backend/runtime/CLI/storage work, use `pma-bun` after PMA approval.
7. For reviews or audits, use `pma-cr`.
8. For shadcn/ui work, use `.agents/skills/shadcn/SKILL.md` and the official
   shadcn CLI instead of hand-copying registry files.
   During the shadcn-first migration, closeout also needs the full
   `check-web-ui-components --all --audit` dimensions: class density,
   slotless/native class names, framed shadcn surfaces, semantic theme-token
   usage, custom classes, and light/dark visual evidence. Nested borders,
   oversized radius, font drift, or dark-mode regressions block completion
   unless they are fixed or explicitly classified as domain-owned UI or
   temporary migration debt.
9. Keep edits minimal and aligned with existing package boundaries.

## Contract Sync Rules

- API changes: update zod schemas, OpenAPI metadata, typed/shared client shapes
  and focused API/Web/CLI tests that consume the route.
- Storage changes: update Drizzle schema/migrations through the storage package,
  repository helpers and storage tests.
- Shared protocol changes: update `packages/shared`, `packages/core`, API/Web
  consumers and official app/reference manifest tests when relevant.
- Thin adapter or compatibility changes: prove allowed and denied paths. The
  denied path should fail before contacting mounted Soul App services.
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
| Web UI local style or component work | `bun run ui:check` plus focused Web test/build when visible behavior changed |
| CLI lifecycle | `bun run --filter '@zonease/aiworker-cli' test` and `build:bundle` when command behavior changed |
| Core runtime/registry/thin adapter | `bun run --filter '@zonease/aiworker-core' test` |
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
- For Web UI work, summarize the component-library preflight, app-local UI
  ownership reason and UI governance result.
- Record validation commands and results.
- Sync PMA docs/changelog when project-level impact exists.
- Run code-review-graph for code changes or explicitly skip it for
  instruction-only, docs-only or formatting-only work.
