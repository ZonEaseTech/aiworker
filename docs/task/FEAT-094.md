# FEAT-094 HR native skill artifact boundary

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-17 10:26
- **plan**: PLAN-343
- **spec**: docs/superpowers/specs/2026-05-17-hr-native-skill-artifact-boundary-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-17-hr-native-skill-artifact-boundary.md
- **relatesTo**: apps/aiworker-hr/engine-assets, apps/aiworker-hr/product/artifacts

## Context

HR already has a profile ledger where `README.md` is the accepted People Profile,
session outputs are artifacts, and reviewed artifacts can be promoted. The
native skills still read as independent task templates and do not clearly
separate artifact production from HR product-owned interpretation and promotion.

## Goals

- Keep native skills focused on producing reviewable artifacts.
- Keep HR product logic responsible for artifact taxonomy, validation and
  promotion into the accepted People Profile.
- Make the workspace instruction explain the artifact-first loop without
  leaking README promotion duties into every skill.
- Preserve Host, runtime, manifest and shared protocol behavior.

## Non-Goals

- Do not change shared manifest or protocol schema.
- Do not change Host runtime or promotion plumbing.
- Do not make README a generic Soul App assumption.
- Do not add Web UI behavior in this slice.

## Acceptance Criteria

- HR workspace instructions describe artifact-first execution and product-owned
  promotion.
- All five HR native skills describe artifact output duties and avoid owning
  accepted profile state.
- HR product-owned material documents artifact taxonomy and promotion meaning.
- Focused validation passes for HR app instructions and projection-sensitive
  files.

## Verification

- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-core' test src/worker/engine-assets.test.ts src/worker/runtime.test.ts`
- `git diff --check`

## ActiveForm

- 2026-05-17 10:26: Claimed for implementation from the approved
  Superpowers design spec.
- 2026-05-17: Completed HR native skill artifact boundary landing. Workspace
  instructions now explain the product-owned artifact loop, five HR native
  skills are artifact-producer focused, and HR product material owns taxonomy
  and promotion policy.
- 2026-05-17: Verification passed: HR app validate/typecheck/test, focused core
  engine-assets/runtime tests, and `git diff --check`.
