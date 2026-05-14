# REFACTOR-040 Worker Web product-detail correction

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 02:05
- **claimedAt**: 2026-05-10 02:05
- **plan**: PLAN-206
- **completedAt**: 2026-05-10 09:11
- **relatesTo**: REFACTOR-039, PLAN-205, apps/web

## Background

The previous Worker Web slice restored Open Design source structure too
literally. User review confirmed that screenshots were only concrete evidence,
not a request to copy the desktop shell, Open Design brand, default settings
modal, or design-tool nouns into AIWorker.

## Goal

Keep the simple Open Design entry pattern, but correct the Web product details
so the page reads as AIWorker:

- no macOS window controls inside the browser page;
- settings dialog opens only from an explicit settings control;
- default screen is immediately usable as a work order launcher;
- visible copy uses AIWorker worker/workspace/pack/run vocabulary instead of
  Open Design/Nexu/design-prototype vocabulary;
- tests guard the fixed defaults and stale copy removal.

## Acceptance Criteria

- Worker Web home has no `.window-lights` or traffic-light controls.
- Settings dialog is not rendered on initial load and opens through a visible
  settings button.
- Home copy no longer includes `Open Design`, `Nexu Labs`, `Claude Design ZIP`,
  or the copied pet name.
- The create action still maps to local brief/run APIs.
- Focused Web tests, build, browser check, and CRG are recorded.

## Progress

- 2026-05-10 02:05: Claimed after user called out literal Web copying, macOS
  navigation controls, and default settings modal.
- 2026-05-10 09:11: Removed the browser-inappropriate desktop chrome, made
  settings closed by default, translated visible home/settings copy into
  AIWorker work-order vocabulary, replaced copied avatar/logo assets, and added
  regression tests for these details.

## Evidence

- `bun run --filter '@zonease/aiworker-web' test` passed.
- `bun run --filter '@zonease/aiworker-web' typecheck` passed.
- `bun run --filter '@zonease/aiworker-web' lint` passed.
- `bun run --filter '@zonease/aiworker-web' build` passed.
- `git diff --check` passed.
- `bun run crg:update && bun run crg:review` passed with 0 affected flows, 3
  test gaps, and risk score 0.40.
- Browser review confirmed default home has no settings dialog or macOS
  traffic-light controls, no copied avatar image, and the settings dialog opens
  through the explicit settings button.
