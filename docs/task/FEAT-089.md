# FEAT-089 Soul App Product Layout Migration

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-16
- **plan**: PLAN-332
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-product-layout-migration.md
- **relatesTo**: apps/aiworker-hr, apps/aiworker-qa, packages/shared, docs/soul-app-developer.md

## Context

Phase 1 established `engine-assets/` for engine-facing workspace files and
native skills. The remaining official app layout still keeps product-owned
prompts, rubrics, schemas, profile packs, review policies and Web surfaces
scattered across top-level `capabilities/`, `review/`, `schemas/`, `packs/` and
`src/ui/`.

## Goals

- Move HR and QA product-owned files under `product/`.
- Keep Host adapter files in `src/` for Phase 3.
- Update manifest refs, shared fixtures and tests so official manifests teach
  the v2 product layout.
- Preserve app validate/smoke behavior.

## Non-Goals

- Do not move protocol handlers, mounted services or standalone entrypoints.
- Do not change artifact schema contents or domain behavior.
- Do not implement MCP client/server layout.

## Acceptance Criteria

- HR and QA prompts/review rubrics live under `product/workflows/`.
- HR and QA artifact schemas live under `product/artifacts/schemas/`.
- HR and QA artifact review policies live under `product/reviews/`.
- HR and QA profile/SOUL pack files live under `product/profiles/`.
- HR and QA UI contribution refs point at `product/web/`.
- Official app validate/test and shared manifest tests pass.

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

- 2026-05-16: Claimed after completing FEAT-088 / PLAN-331.
- 2026-05-16: Completed HR/QA product layout migration. Official app manifests,
  shared fixtures and active authoring docs now point to `product/`.
