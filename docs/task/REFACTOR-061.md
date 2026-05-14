# REFACTOR-061 Worker list and creation dialog polish

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 03:05
- **plan**: PLAN-239
- **relatesTo**: apps/web/src/worker/worker-studio.tsx, apps/web/src/worker/studio.css, apps/web/src/worker/i18n.ts

## Background

The worker list currently reuses larger rail/card styling, so workers read as
list cards instead of compact list items. Creation flows are rendered as
separate block panels, making create and browse feel disconnected.

## Goal

Make worker navigation compact and move creation interactions behind icon
button-triggered dialogs while preserving the current worker-first routes and
data flow.

## Acceptance Criteria

- Worker list renders as compact list items, not large cards.
- Create worker and create workspace entrypoints are icon buttons with
  accessible names and dialogs.
- Dialog forms reuse the unified form-control and button style from
  REFACTOR-060.
- Existing worker/workspace creation API behavior and route navigation remain
  unchanged.
- Empty states point to the same creation entrypoints without adding a second
  full-width creation block.

## Verification

- Worker Web RTL coverage for dialog open, submit, and route updates.
- Focused Web typecheck, lint, test, and build.
- Browser desktop and mobile validation.
- code-review-graph review after code edits.

## Closeout

- Worker navigation now renders compact list rows.
- Create worker and create workspace flows moved behind accessible icon-button
  dialogs while preserving existing API payloads and route updates.
- Empty states reuse the same dialog entrypoints instead of restoring the old
  full-width creation panels.
