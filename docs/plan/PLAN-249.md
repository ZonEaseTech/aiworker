# PLAN-249 Component package library structure

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 13:51
- **relatedTask**: REFACTOR-066

## Current State

REFACTOR-065 created `packages/component`, but the package still behaved like a
single Worker Studio extraction:

- `packages/component/src/studio.tsx` owned layout, dialog, and select in one
  file.
- The package did not expose an explicit primitive component vocabulary.
- Worker Web feature modules still hand-rolled representative button, card,
  field, and nav markup.

## Proposal

1. Split the component package by library responsibility:
   - `primitives`: button, card/action-card, dialog, field, header, nav, badge,
     select.
   - `layout`: app shell/sidebar/main and studio main frame.
   - `patterns`: composed but business-agnostic flows such as creation dialog.
   - `studio`: compatibility exports for the current Worker Web imports.
   - `utils`: class-name composition helpers.

2. Keep existing app CSS class contracts stable in this pass.

3. Migrate representative Worker Web surfaces to consume the primitives:
   - creation dialogs use `Button`, `Field`, `FieldGroup`, and `StudioSelect`.
   - project cards use `ActionCard`.
   - worker identity uses `Card`.
   - settings navigation/actions/forms use `NavItemButton`, `Button`, `Field`,
     and `ActionCard`.

## Scope

In scope:

- `packages/component` internal library architecture.
- Worker Web consumers already touched by REFACTOR-065.
- Focused Web verification and CRG review.

Out of scope:

- Full design-token rewrite.
- Replacing every remaining one-off button in `worker-studio.tsx`.
- Public package publishing.

## Result

- Removed the package-level `studio.tsx` monolith.
- Added a component-library skeleton with primitives, layout, patterns, studio,
  and utils modules.
- Kept compatibility exports while making the root package export the primitive
  component vocabulary.
- Updated Worker Web feature components to consume the primitives without
  changing visual class names.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-component' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/worker/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- code-review-graph result: risk score `0.40`, 0 affected flows.
