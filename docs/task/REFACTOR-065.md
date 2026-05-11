# REFACTOR-065 Worker Web architecture modularization

- **status**: in_progress
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 13:15
- **plan**: PLAN-248
- **relatesTo**: apps/web, packages/component

## Background

Worker Web has accumulated product, route, API, i18n, settings, session, and
layout logic inside a small set of large files. The current structure makes
routine UI changes touch the same broad surface repeatedly and does not use the
monorepo as an engineering boundary.

Current hotspots from investigation:

- `apps/web/src/worker/worker-studio.tsx`: 2172 lines.
- `apps/web/src/worker/studio.css`: 3328 lines.
- `apps/web/src/worker/i18n.ts`: 1536 lines.
- `apps/web/src/worker/api.ts`: 331 lines.
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`: 686 lines.
- No `packages/component` workspace exists.
- `apps/web/src` only contains `worker/` plus test setup.

## Goal

Refactor Worker Web into a monorepo-aware frontend architecture with a reusable
component package and separated app, API, i18n, feature, route, layout, and style
modules.

## Acceptance Criteria

- Add `packages/component` as a workspace package for shared React UI primitives
  used by Worker Web.
- Move reusable layout/dialog/select primitives out of `worker-studio.tsx`.
- Split Worker Web API logic into shared client and feature-scoped API modules.
- Split i18n into an i18n directory with locale/catalog boundaries instead of a
  single top-level file.
- Move routing into an app-level route module.
- Split Worker Web route/session/settings/workspace components so
  `worker-studio.tsx` no longer owns every UI branch.
- Split the large CSS bundle into style modules imported from one app stylesheet.
- Preserve current Worker Web behavior and tests.
- Run focused Web gates and code-review-graph before closure.
- Use multiple conventional commits during the refactor.

## Verification

- Pending.
