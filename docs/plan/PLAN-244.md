# PLAN-244 Settings dialog autosave and scroll layout repair

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 11:05
- **relatedTask**: BUG-090

## Current State

- `SettingsDialog` initializes `autosave` as `saved`, so the saved status pill is
  visible immediately when settings opens.
- The settings modal uses only `max-height`; long sections can dominate the
  visual height instead of the content region scrolling inside a stable dialog.

## Proposal

1. Initialize autosave state as `idle`.
2. Render the autosave pill only for `saving`, `saved`, or `failed`.
3. After successful save/rescan, show the saved pill briefly and then return to
   `idle`.
4. Give `.modal-settings` a fixed viewport-constrained height.
5. Keep header/chrome fixed and let sidebar/content scroll inside
   `.modal-body`.

## Scope

In scope:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs and changelog.

Out of scope:

- Settings data model changes.
- New settings sections or new form controls.

## Risks

- Autosave timer cleanup must not update state after dialog unmount.
- Fixed dialog height must still fit narrow or short viewports.

## Verification Plan

- Focused RTL coverage for initial hidden saved status.
- Focused Web typecheck, lint, test, and build.
- Playwright MCP visual/layout inspection against 9217.
- code-review-graph review.

## Approval Gate

Approved by operator on 2026-05-11 in the follow-up bug report.

## Result

Completed on 2026-05-11.

- `SettingsDialog` now initializes autosave state as `idle` and renders the
  autosave pill only during or after real save/rescan work.
- Successful save feedback auto-hides after 1600ms, while failed feedback
  remains visible until the next action changes state.
- `.modal-settings` now has a fixed viewport-constrained height, and the dialog
  body gives vertical scroll ownership to `.settings-sidebar` and
  `.settings-content`.
- Focused Worker Web gates, Playwright MCP inspection, and code-review-graph
  review completed successfully.
