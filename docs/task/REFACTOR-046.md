# REFACTOR-046 Worker Web theme switching and dark mode readiness

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-10 11:55
- **claimedAt**: 2026-05-10 12:00
- **completedAt**: 2026-05-10 12:25
- **plan**: PLAN-217
- **relatesTo**: apps/web, Worker Web settings

## Background

Worker Web already persists `appearance` as `system | light | dark` through
local settings and exposes it in the Settings dialog, but the setting does not
drive the rendered theme. The current CSS token layer defines only light-mode
variables, so choosing Dark or System has no visible effect and the interface is
not production-ready for dark environments.

## Goal

Ship a production-ready Worker Web appearance mode:

- apply the persisted setting to the app shell as `light`, `dark`, or `system`;
- react to operating-system preference changes when `system` is selected;
- provide complete light and dark token coverage for the current Soul workspace
  surface, Settings dialog, controls, artifact preview, and status states;
- keep the implementation local to the Worker Web theme boundary without
  changing product semantics or executor/Brain/runtime behavior.

## Acceptance Criteria

- Settings Appearance choices visibly switch between light and dark themes.
- `system` follows `prefers-color-scheme` and updates when the media query
  changes.
- Theme choice remains persisted through `/api/local/settings` and is restored
  after reload.
- Dark mode keeps readable contrast across the left rail, center grid, artifact
  rail, modal, forms, segmented controls, status chips, and previews.
- Focus, disabled, hover, selected, success, warning, and error states remain
  visible in both themes.
- Focused Web tests cover theme application and settings persistence.
- Web typecheck, test, lint, build, browser preview, and code-review-graph
  review pass before completion.

## Evidence

Completed in `apps/web/src/worker/worker-studio.tsx`,
`apps/web/src/worker/studio.css`, and
`apps/web/src/worker/__tests__/worker-studio.test.tsx`.

Verification passed:

- `git diff --check`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test` — 1 file, 6 tests
- `bun run --filter '@zonease/aiworker-web' lint` — 0 errors, existing five
  `react-hooks-extra/no-direct-set-state-in-use-effect` warnings
- `bun run --filter '@zonease/aiworker-web' build` — Vite build and Worker
  Studio CSS quality check passed
- `bun run check`
- `bun run build`
- Browser validation at `http://127.0.0.1:5179/worker/` with local daemon on
  `9217`: UI clicks persisted Light/Dark/System through
  `/api/local/settings`, `data-appearance` and `data-theme` updated without
  reload, system mode responded to `colorScheme` changes, console warnings and
  errors were 0, and token contrast samples passed for light and dark themes.
- code-review-graph: `bun run crg:update` and `bun run crg:review` completed;
  review reported 0 affected flows and risk score 0.55. MCP review context
  marked the Worker Studio component context as high-impact but did not flag
  Brain, Executor, Fleet, DB schema, runtime, or security boundary changes.
