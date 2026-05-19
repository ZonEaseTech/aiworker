# PLAN-383 Session composer attachment density polish

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-144

## Current State

The shared composer attachment previews were functional, but their visual
density did not match the rest of the composer:

- file attachments used a large card scale with a 58px icon, 82px minimum
  height and broad maximum width;
- image previews used a large square thumbnail;
- attachment tray padding was too tight against the composer field border.

## Proposal

1. Keep the existing shared attachment list and lightbox behavior.
2. Tighten the default file attachment chip to a smaller icon, height, width,
   copy size and close affordance.
3. Tighten image thumbnails while preserving the preview button and lightbox.
4. Increase attachment tray padding so previews sit comfortably inside the
   composer shell.

## Component Library Preflight

Checked shared components:

- `SessionComposer`
- `SessionAttachmentList`
- `packages/component` pattern styles

Reusable gap closed:

- attachment density is corrected in the shared composer pattern instead of
  app-local Worker Web CSS.

Local UI exceptions:

- None.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/styles/patterns.css`
- PMA task/plan/changelog files

## Non-Goals

- No attachment data model changes.
- No new upload behavior.
- No lightbox interaction changes.

## Verification

- `bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- `git diff --check`
- browser smoke on an HR session composer route with an attached file
- `bun run crg:update`
- `bun run crg:review`
