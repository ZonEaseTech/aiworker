# REFACTOR-084 Remove legacy component package

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21
- **claimedAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **plan**: PLAN-392
- **relatesTo**: UI-001, FEAT-105, BUG-148, packages/component, packages/ui

## Background

`packages/component` was the pre-shadcn shared UI package. The active
architecture now makes `packages/ui` the shadcn-managed shared primitive,
theme, icon and SessionComposer source. Current app and package source no
longer has live imports from `@zonease/aiworker-component` after the
SessionComposer consolidation.

The remaining component-package footprint is structural and documentary:

- the `packages/component` workspace package and its lockfile entry;
- legacy-package detection in `scripts/check-web-ui-components.ts`;
- architecture and agent guidance that still describe `packages/component` as
  legacy migration debt;
- historical PMA / Superpowers audit records, which should remain as history.

## Acceptance Criteria

1. `packages/component` is removed from the active workspace and lockfile.
2. Active app, package and script code has no dependency on
   `@zonease/aiworker-component`.
3. UI governance still blocks future reintroduction of
   `@zonease/aiworker-component` imports while no longer scanning a removed
   package source tree.
4. Active docs and agent guidance describe `packages/ui` as the only shared UI
   target and mention `packages/component` only as historical retired context.
5. Historical task, plan, changelog and Superpowers records are not rewritten.
6. Focused package graph, UI governance, docs, tests and build checks pass.

## Non-Goals

- Do not rewrite old PMA or Superpowers history that references
  `packages/component`.
- Do not move chat, timeline or session view-model code during the removal.
- Do not delete `packages/ui` SessionComposer or shadcn primitives.
- Do not introduce a compatibility shim package for
  `@zonease/aiworker-component`.

## Resolution

Removed `packages/component` from the active workspace and regenerated
`bun.lock`. The retired package is no longer present on disk and no longer has a
workspace lockfile entry.

UI governance now treats `@zonease/aiworker-component` as a forbidden retired
package rather than as migration debt. The migration-queue plumbing and
`packages/component/src` scanning were removed, and a regression test now
creates a temporary Web file to prove reintroducing the retired import fails.

Active architecture, root agent guidance and Host developer skill guidance now
name `packages/ui` as the shared UI target and explicitly block reintroducing
the retired package. Historical PMA, changelog and Superpowers records were left
unchanged.

## Verification

- `bun install --lockfile-only`
- `rg "packages/component|@zonease/aiworker-component" bun.lock package.json apps packages`
- `test ! -d packages/component`
- `bun test scripts/check-web-ui-components.test.ts`
- `bun scripts/check-web-ui-components.ts --all --audit`
- `bun run docs:check`
- `bun run typecheck`
- `bun run --filter '@zonease/aiworker-ui' test src/components/session-composer.test.tsx`
- `bun run --filter '@zonease/aiworker-hr' test -- product/web/component-proof.test.tsx product/web/people-workbench/api.test.ts`
- `bun run --filter '@zonease/aiworker-qa' test -- product/web/component-proof.test.tsx`
- `bun run --filter '@zonease/aiworker-web' test -- src/features/local-workspace/components/session-composer.test.tsx src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun eslint apps/aiworker-hr/product/web/people-workbench/api.test.ts apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx apps/aiworker-qa/product/web/component-proof.test.tsx apps/web/src/features/local-workspace/components/session-composer.tsx apps/web/src/worker/session-turn-composer.tsx packages/ui/src/components/session-composer.test.tsx scripts/check-web-ui-components.ts scripts/check-web-ui-components.test.ts`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review` (risk score 0.50; no affected flows)

`bun run lint` was attempted and still fails on existing repo-wide lint debt in
files outside this removal slice, including HR people-workbench app/columns,
micro-app runtime, Worker Studio, shared micro-app exports, and generated
shadcn UI source import ordering. Touched files were checked with focused ESLint;
only the intentional Fast Refresh warning remains in `profile-composer.tsx`
because it exports the tested helper beside the component.
