# FEAT-092 Soul App Scaffold And Legacy Layout Removal

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-16
- **plan**: PLAN-333
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-scaffold-legacy-removal.md
- **relatesTo**: apps/cli, docs/soul-app-developer.md, packages/soul-app-sdk, packages/soul-app-runtime

## Context

After Phases 1-4, official apps use `engine-assets/`, `product/` and
`host-adapter/`, but `aiworker app create` still generates the pre-v2
`src/`, `schemas/`, `capabilities/`, `review/` and `packs/` layout. The CLI
validator also scans only `src/`, which misses the new adapter/product source
directories.

## Goals

- Update `aiworker app create` to generate the v2 layout.
- Update scaffold package scripts and manifest refs to v2 paths.
- Make validation scan app production source under `host-adapter/`, `product/`
  and legacy `src/` when present.
- Update active docs/tests so the old scattered layout is no longer the default
  authoring model.

## Non-Goals

- Do not rewrite historical PMA or old Superpowers audit docs.
- Do not create real product UI behavior beyond scaffold placeholders.
- Do not remove package-internal `src/` directories for normal monorepo packages.

## Acceptance Criteria

- A new scaffold contains `engine-assets/`, `product/` and `host-adapter/`.
- A new scaffold validates and smokes successfully.
- Validator catches Host-private imports and raw Web Storage in v2 directories.
- Active authoring docs no longer teach the old scattered layout as default.

## Verification

- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Claimed after FEAT-091 / PLAN-332 checkpoint.
- 2026-05-16: Completed v2 scaffold convergence. `aiworker app create` now
  writes `engine-assets/`, `product/` and `host-adapter/`; validation scans
  v2 production source directories while retaining legacy `src/` coverage.
- 2026-05-16: Verification passed: scaffold/SDK/runtime/publish fixture tests,
  CLI/SDK/runtime typecheck, CLI bundle build, lint, diff check, and
  code-review-graph review.
