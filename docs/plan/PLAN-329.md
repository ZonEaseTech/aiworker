# PLAN-329 Soul App Engine Assets Foundation

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16
- **relatedTask**: FEAT-088
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-engine-assets-foundation.md

## Decision

Implement Phase 1 of Soul App authoring layout v2. This phase establishes
`engine-assets.workspace` and `engine-assets.skills` as the official source
layout for engine-facing assets and makes shared schema, SDK exports,
soul-app-runtime and core runtime understand the same projection contract.

## Scope

- Shared manifest and projection receipt schema.
- SDK type/helper exports.
- Core projection service for workspace files and native skills.
- Soul App runtime parity for standalone and mounted test harnesses.
- HR app migration from root `skills/` and hardcoded workspace renderers to
  `engine-assets`.
- QA app workspace templates, so official app bootstrap does not rely on schema
  fixtures alone.

## Out Of Scope

- Product layout migration.
- Host adapter layout migration.
- MCP client/server adapter implementation.
- Product-specific QA native skills beyond the current empty skill source.

## Implementation Plan

The detailed implementation plan is
`docs/superpowers/plans/2026-05-16-soul-app-engine-assets-foundation.md`.

## Stage Review Gates

1. Shared/SDK self-review: schema and types are explicit, no optional official
   app ambiguity.
2. Runtime projection self-review: Host/runtime does not infer Soul product
   meaning and does not overwrite unowned files.
3. Official app migration self-review: a developer can inspect
   `apps/aiworker-hr` and `apps/aiworker-qa` and see engine-facing assets
   without reading core code.
4. Verification self-review: focused tests, lint, diff check and
   code-review-graph are recorded before completion.

## Verification

- `bun test packages/shared/src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Implementing Phase 1 under the long-running goal for Soul App
  authoring layout v2.
- 2026-05-16: Completed Phase 1 with shared/runtime/sdk/core verification and
  official HR/QA engine asset sources.
- 2026-05-16: CRG self-review reported residual static gaps on Host/private
  helper symbols, but focused Host and worker runtime tests exercise the
  manifest-path projection path and app-owned workspace bootstrap.
