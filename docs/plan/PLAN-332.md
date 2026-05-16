# PLAN-332 Soul App Product Layout Migration

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16
- **relatedTask**: FEAT-089
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-product-layout-migration.md

## Decision

Implement Phase 2 of Soul App authoring layout v2 by moving official HR and QA
product semantics into `product/` while leaving Host adapter files in place for
Phase 3.

## Scope

- Move `capabilities/*/{prompt,review}.md` to `product/workflows/*/`.
- Move `schemas/*.schema.json` to `product/artifacts/schemas/`.
- Move `review/*.md` to `product/reviews/`.
- Move `packs/*/SOUL.md` to `product/profiles/*/SOUL.md`.
- Move `src/ui/*.tsx` to `product/web/...` and update manifest refs.
- Update shared fixtures and manifest tests.
- Update active authoring docs that still teach the old scattered layout.

## Out Of Scope

- Moving `src/protocol`, `src/host-mounted.ts`, `src/standalone.ts` or package
  entrypoints.
- MCP client and server config.
- Runtime behavior changes beyond path references.

## Stage Review Gates

1. Layout review: no active official app manifest points to old product paths.
2. Product/Host boundary review: Host adapter files remain out of `product/`.
3. Validation review: official HR/QA validate and app tests pass.
4. Docs review: active authoring docs describe v2 layout.

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

- 2026-05-16: Drafted as Phase 2 after the engine-assets checkpoint commit.
- 2026-05-16: Completed with HR/QA app tests, app validate commands, shared
  manifest tests, lint, diff check and CRG self-review.
