# PLAN-250 Worker Web icon button size convergence

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 15:06
- **relatedTask**: BUG-092

## Current State

- Add buttons used `icon-only` with a 34px box.
- Settings/refresh controls used `settings-trigger` with a 30px box.
- The size divergence undermined the component-library architecture because
  visually related controls were still controlled by unrelated classes.
- The first `IconButton` primitive incorrectly reused `.icon-btn`, which is a
  text action class with 34px min-height and horizontal padding.

## Proposal

1. Add `IconButton` to `packages/component/src/primitives/button.tsx`.
2. Introduce `--icon-button-size` and `--icon-button-icon-size` tokens.
3. Apply the same tokenized class to add, settings, and refresh controls.
4. Keep legacy `.settings-trigger` and `.icon-only` selectors as compatibility
   aliases so existing styles do not break.

## Result

- Add/settings/refresh icon controls now use `IconButton`.
- Icon button boxes share `--icon-button-size: 30px`.
- Icons share `--icon-button-icon-size: 16px`.
- `IconButton` now emits `icon-button` without inheriting `.icon-btn`.
- Worker Web tests now assert chrome icon buttons keep the compact primitive
  class without the legacy text-action class.
- Legacy selectors remain aligned with the shared token for compatibility.

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
- code-review-graph result: risk score `0.55`, 0 affected flows.
