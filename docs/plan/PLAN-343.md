# PLAN-343 HR native skill artifact boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17 10:26
- **approvedAt**: 2026-05-17 10:26
- **completedAt**: 2026-05-17
- **relatedTask**: FEAT-094

## Current State

HR workspace instructions already say `README.md` is accepted profile state and
session outputs should be reviewable artifacts. The five projected HR native
skills each define useful output shapes, but their wording does not make the
layering explicit: native skills produce artifacts, while HR product logic owns
artifact interpretation, validation and promotion into the accepted People
Profile.

## Proposal

1. Update HR workspace `AGENTS.md` so it names the artifact-first loop and
   keeps promotion decisions in HR product review.
2. Update the five HR native skills so each skill names its produced artifact
   and avoids claiming responsibility for accepted profile writes.
3. Add `apps/aiworker-hr/product/artifacts/README.md` as the HR-owned taxonomy
   and promotion policy for product maintainers.
4. Run focused HR app validation and projection-sensitive core tests.

## Risks

- Over-specifying native skills could reintroduce product-state coupling. Keep
  README references in workspace/product guidance, not generic skill duties.
- Under-specifying promotion policy could leave the loop subjective. Keep the
  taxonomy explicit in HR product-owned docs.
- Because engine assets project into real workspaces, wording mistakes can
  directly shape executor behavior. Run HR validation and projection-sensitive
  tests.

## Scope

- `apps/aiworker-hr/engine-assets/workspace/AGENTS.md`
- `apps/aiworker-hr/engine-assets/skills/*.md`
- `apps/aiworker-hr/product/artifacts/README.md`
- PMA task, plan and changelog docs

## Alternatives

- HR-only skill README wording was rejected because it would make skills appear
  responsible for accepted profile state.
- Shared manifest/protocol descriptors were deferred because this slice does not
  require framework changes and other Soul Apps can already define product logic
  in app-owned material.

## Verification

- `bun run --filter '@zonease/aiworker-hr' validate` passed with no asset,
  manifest, private import or Web Storage issues.
- `bun run --filter '@zonease/aiworker-hr' typecheck` passed.
- `bun run --filter '@zonease/aiworker-hr' test` passed with 4 tests.
- `bun run --filter '@zonease/aiworker-core' test src/worker/engine-assets.test.ts src/worker/runtime.test.ts`
  passed with 14 tests.
- `git diff --check` passed.

## Annotations

- 2026-05-17 10:26: User approved the boundary that native skills produce
  artifacts and Soul App product logic owns artifact use, validation and
  promotion.
