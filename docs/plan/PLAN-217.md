# PLAN-217 Worker Web theme switching and dark mode readiness

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 11:55
- **relatedTask**: REFACTOR-046

## Current State

Investigation found a partial theme pipeline:

- `packages/shared/src/local-workspace.ts` defines `appearance` as
  `system | light | dark`.
- `apps/api/src/modes/worker.ts` defaults `appearance` to `system` and persists
  settings through `/api/local/settings`.
- `apps/web/src/worker/worker-studio.tsx` renders an Appearance Settings section
  with System, Light, and Dark options.
- `apps/web/src/worker/studio.css` defines global color variables only on
  `:root`, so all rendering stays in the light palette regardless of saved
  appearance.
- Existing Web tests verify settings autosave in general, but they do not assert
  theme application, system preference behavior, or reload restoration.

The change is UI-scoped but production-relevant because the visible app can
claim a persisted appearance preference that currently has no effect.

## Proposal

1. Introduce a small Worker Web theme runtime near `WorkerStudio`:
   - resolve `light | dark` from persisted `settings.appearance`;
   - observe `prefers-color-scheme: dark` when `system` is selected;
   - write stable `data-theme` and `data-appearance` attributes on the app root;
   - avoid duplicating theme state in Zustand or backend storage.
2. Extend `studio.css` into a two-theme token layer:
   - keep current light variables as the canonical light theme;
   - add dark variable overrides under the app theme attribute;
   - replace remaining hard-coded component colors that break dark mode with
     semantic variables.
3. Improve the Appearance settings affordance:
   - keep the three existing explicit choices;
   - surface the resolved mode in compact UI text without adding instructional
     product copy.
4. Add focused tests:
   - initial `system` resolves from `matchMedia`;
   - selecting Dark updates the DOM theme and persists through the existing
     settings endpoint;
   - switching System responds to media-query changes.
5. Verify with focused Web gates, then run browser preview checks for both
   themes and code-review-graph review after code edits.

## Risks

- `FEAT-059` / `PLAN-216` is currently in progress for Worker Web
  localization and likely touches `worker-studio.tsx`; theme implementation
  should wait for that slice to settle or be rebased on its final localization
  catalog to avoid duplicate text edits.
- Dark mode can expose hard-coded colors in less common controls; run a CSS color
  scan and browser preview before closeout.
- Existing active PMA items `REFACTOR-044` and `QA-027` are still marked in
  progress even though PLAN-212 says superseded; avoid touching those records
  unless the user asks for status cleanup.
- Browser preview needs a local daemon or mocked data path; if the daemon cannot
  start cleanly, use the existing focused test harness plus static preview
  evidence and record the limitation.

## Scope

In scope:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- focused PMA docs and changelog updates

Out of scope:

- new design language migration beyond the current Cohere-based `DESIGN.md`
  surface;
- backend settings schema changes beyond using the existing `appearance` field;
- Fleet UI, admin routes, executor configuration semantics, Brain memory, or
  project/artifact model changes.

## Alternatives

- CSS-only `@media (prefers-color-scheme: dark)` would make System work but
  would not support explicit Light/Dark override.
- Persisting a second resolved theme field in backend settings would add state
  drift; the app can derive it from the stored preference and system media query.

## Implementation Status

Completed on 2026-05-10.

Delivered:

- `WorkerStudio` now resolves persisted `appearance` into a stable light/dark
  theme, follows `prefers-color-scheme` for `system`, and exposes
  `data-appearance` plus `data-theme` on the Worker Web shell and loading/error
  shells.
- Settings Appearance controls persist through the existing
  `/api/local/settings` PATCH path and update the active theme without reload.
- `studio.css` now has a light/dark token layer for shell, panels, modals,
  settings controls, artifact surfaces, status colors, overlays, icons, shadows,
  and primary actions.
- Primary action colors are decoupled from warm accent tokens to keep contrast
  production-safe in both themes while preserving `DESIGN.md` near-black/on-dark
  CTA semantics.
- Focused tests cover system media-query resolution, live system preference
  changes, and dark-mode persistence/application.

Verification:

- `git diff --check`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' lint` — exits 0 with the existing
  five Worker Studio effect-setState warnings
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run check`
- `bun run build`
- Browser validation at `http://127.0.0.1:5179/worker/`: Light/Dark/System UI
  clicks updated persisted settings and shell attributes, system mode followed
  emulated dark/light OS preference, console warnings/errors were 0, and sampled
  contrast ratios passed (`light` text/bg 16.71, muted/panel 4.86,
  primary-action 17.86; `dark` text/bg 15.59, muted/panel 8.73,
  primary-action 15.13).
- code-review-graph update/review passed. CLI review: 6 changed files,
  0 affected flows, 35 test gaps, risk score 0.55. MCP context was high because
  Worker Studio is a broad UI component, with no Brain/Executor/Fleet/DB/runtime
  boundary escalation.
