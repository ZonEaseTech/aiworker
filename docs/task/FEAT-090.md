# FEAT-090 Soul App Host Adapter Layout Migration

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-16
- **plan**: PLAN-331
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-host-adapter-layout-migration.md
- **relatesTo**: apps/aiworker-hr, apps/aiworker-qa, packages/shared, docs/soul-app-developer.md

## Context

After Phase 2, HR and QA product assets live under `product/`, but Host adapter
code still lives under `src/`. Phase 3 completes the app-level separation by
moving protocol handlers, mounted services and standalone entrypoints into
`host-adapter/`.

## Goals

- Move HR/QA app definition and protocol adapter code into `host-adapter/`.
- Update manifest `api`, `exports`, `modes` and mounted service commands.
- Update package scripts and active authoring docs.
- Preserve standalone and Host-mounted smoke behavior.

## Non-Goals

- Do not move product assets again.
- Do not add MCP adapters.
- Do not change protocol behavior or broker routes.

## Acceptance Criteria

- HR and QA manifests no longer point at `./src/*`.
- HR and QA package scripts build/serve from `host-adapter/`.
- HR and QA tests and validate pass.
- Active docs show `host-adapter/` as the default adapter surface.

## Verification

- `bun test packages/shared/src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Claimed after completing FEAT-089 / PLAN-330.
- 2026-05-16: Completed. HR/QA Host adapter files moved into
  `host-adapter/`, manifests/shared fixtures/package scripts/docs updated, and
  Phase 3 verification passed.
