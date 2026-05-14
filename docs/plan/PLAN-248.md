# PLAN-248 Worker Web architecture modularization

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 13:15
- **relatedTask**: REFACTOR-065

## Current State

Worker Web is structurally under-engineered for the monorepo:

- The root workspace already supports `apps/*` and `packages/*`, but Worker Web
  has no reusable component package.
- `apps/web/src` only has `worker/` and test setup. There is no app/shared/
  features/styles split.
- `worker-studio.tsx` owns data loading, route selection, layout chrome,
  worker rail, workspace surface, dialogs, settings, theme helpers, selectors,
  prompt construction, and mutation handlers.
- `api.ts` mixes transport, whole-workspace loading, session streaming,
  reviews, lessons, settings, engine actions, and file reads.
- `i18n.ts` mixes message schema, four full locales, built-in Soul/template
  catalog display, locale normalization, language labels, and formatters.
- `router.ts` is a hand-rolled browser route helper under `worker/`, not an
  app-level route module.
- `studio.css` is a single 3328-line stylesheet containing tokens, reset,
  app shell, route layout, worker rail, chat, artifact rail, dialogs, settings,
  cards, and responsive rules.

## Proposal

Implement the refactor in staged commits:

1. **Component package boundary**
   - Add `packages/component`.
   - Export reusable Worker Web-compatible primitives: studio layout, sidebar,
     main frame, creation dialog, select, and status dot.
   - Wire `@zonease/aiworker-web` to consume the package through
     `workspace:*`.

2. **App/shared/feature structure**
   - Introduce `apps/web/src/app` for entry and route wiring.
   - Introduce `apps/web/src/shared` for local API transport and common runtime
     helpers.
   - Introduce `apps/web/src/features/{workspace,session,settings,i18n}` for
     feature modules.
   - Keep the public route URLs unchanged.

3. **API split**
   - Move fetch and SSE frame parsing to a shared local API client.
   - Move workspace loading, worker/workspace mutations, session turns, reviews,
     lessons, settings, engine actions, and file reads into feature-scoped API
     modules.
   - Keep typed contracts imported from `@zonease/aiworker-shared`.

4. **i18n split**
   - Move locale metadata, normalization, formatting, built-in catalog display,
     and locale message catalogs into an i18n module directory.
   - Preserve current locales and copy behavior.

5. **Worker surface split**
   - Extract settings dialog and settings sections from `worker-studio.tsx`.
   - Extract worker/workspace rail and workspace cards.
   - Move theme and workspace selector helpers into feature modules.
   - Leave `WorkerStudio` as the orchestration component, not the owner of all
     UI implementation details.

6. **Style split**
   - Replace the single `studio.css` entry with `styles/index.css` importing
     token/base/layout/rail/chat/artifact/dialog/settings/card/responsive
     modules.
   - Preserve class names in this pass to avoid visual churn.

## Scope

In scope:

- `apps/web` source architecture.
- New `packages/component` workspace package.
- Web package dependencies and TypeScript configuration as needed.
- Focused tests and PMA docs.

Out of scope:

- Backend API behavior changes.
- Product UX redesign beyond preserving existing behavior through cleaner
  boundaries.
- Fleet/admin UI resurrection.
- Migrating to a new routing framework in the same pass. This pass creates the
  route module boundary first; a TanStack Router migration can become a later
  isolated plan if still needed.

## Risks

- This touches many imports, so typecheck is the primary guard after each slice.
- CSS splitting can silently change cascade order; preserve exact import order
  and validate build/tests before visual checks.
- Moving React components to a package can trip `react-refresh` or TS package
  resolution; keep the package dependency-light and source-exported.
- Current tests are broad but concentrated in one file; keep them passing while
  adding targeted tests only where a new module has nontrivial logic.

## Verification Plan

- Passed: `bun run --filter '@zonease/aiworker-component' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser preview on `http://127.0.0.1:4173/worker/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Passed: code-review-graph range review for `8f63d85..HEAD`

## Approval Gate

Approved by operator on 2026-05-11 with explicit authorization to take over the
Worker Web architecture refactor in goal mode and use multiple conventional
commits until the requirements are landed.

## Result

- Added `packages/component` as the reusable Worker Web React component package.
- Split Worker Web into `app`, `shared/api`, `features`, and `styles`
  boundaries.
- Replaced the monolithic API, i18n, router, settings, workspace component,
  model/helper, and CSS files with scoped modules.
- Reduced `worker-studio.tsx` from 2172 lines to 1081 lines while preserving
  current route behavior and tests.
