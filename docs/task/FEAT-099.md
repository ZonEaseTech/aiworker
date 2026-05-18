# FEAT-099 Host/Soul shared component library

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-367
- **relatesTo**: ARCH-001, HOST-001, SOUL-001, IMPORT-001, REFACTOR-083

## Background

`packages/component` exists, but it is still closer to a Worker Web extraction
than a complete Host/Soul component library. Components import React structure
from the package while styles still live mostly under `apps/web/src/styles/*`.
That lets new Web work drift back to handcrafted app-local CSS.

## Acceptance Criteria

1. `packages/component` exports package-owned styles through
   `@zonease/aiworker-component/styles.css`.
2. Host Web imports the package style entrypoint and keeps its shell/workbench
   visually stable.
3. The component package includes a catalog with implemented/planned components
   and a migration queue.
4. `AGENTS.md` requires new Host/Soul UI to start from `packages/component` and
   records the app-local CSS exception rule.
5. Reusable UI from settings, shell/rail, session chat/detail/progress, and HR
   workbench is promoted where it is generic.
6. A real official Soul App Web proof imports shared components and styles.
7. Shared components do not fetch Host/Soul data and do not encode HR/QA domain
   semantics.
8. Focused package, Host Web, Soul App proof, browser, CRG, and diff checks pass.

## Notes

- This is a shared Host/Soul Web component-library delivery.
- It does not change Host/Soul protocol, manifest, broker, storage, or domain
  data semantics.
- CRG baseline was rebuilt on branch `codex/aiworker-component-library` before
  implementation.

## Completion

Implemented the Host/Soul shared component library:

- `packages/component` now owns shared style slices and exports
  `@zonease/aiworker-component/styles.css`.
- Added a typed component catalog and migration queue.
- Added Radix-backed Dialog/Select/Switch and form primitives.
- Promoted generic settings, progress, message flow, artifact/review, and
  profile reader patterns into the package.
- Migrated Host Web settings/session/detail/progress surfaces to shared
  components and package-owned styles.
- Added an official HR Soul App Web proof that imports shared components and
  shared styles while keeping HR profile/review semantics local.
- Updated AGENTS guidance so new Host/Soul UI starts from `packages/component`
  before app-local CSS.
- Fixed a browser-caught modal positioning regression and added smoke
  assertions that creation/settings dialogs stay inside the viewport.

Verification completed:

- `bun run check`
- `bun run test`
- `bun run --filter '@zonease/aiworker-component' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run web:smoke:mounted-surfaces`
- Browser smoke against `http://127.0.0.1:52067/` with HR worker creation and
  Soul Apps settings modal viewport checks.
- `git diff --check`
- `uvx code-review-graph update --repo . --base 71c1aa5278aab5f9426c43381fb0049af62407b8`
- `uvx code-review-graph build --repo .`
- `uvx code-review-graph detect-changes --repo . --base 71c1aa5278aab5f9426c43381fb0049af62407b8 --brief`

CRG advisory: full-branch review exited 0 with risk score `0.65` and static
test-gap notes for UI shells such as HR proof components, SettingsDialog, and
`assertLocatorWithinViewport`. These are covered by component tests, Worker
Studio RTL tests, HR proof tests, mounted-surface smoke, browser smoke, and the
root test suite.
