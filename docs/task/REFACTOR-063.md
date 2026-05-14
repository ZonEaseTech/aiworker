# REFACTOR-063 Worker Web interaction polish follow-up

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 10:38
- **plan**: PLAN-242
- **relatesTo**: apps/web/src/worker/studio.css, apps/web/src/worker/worker-studio.tsx, apps/web/src/worker/session-chat.tsx, apps/web/src/worker/session-detail.tsx, apps/web/src/worker/i18n.ts

## Background

Manual testing after the first visual polish pass surfaced product-facing
defects in typography, dialogs, Soul selection, select menus, button states,
workspace/session layout, session navigation, and streaming route behavior.

## Goal

Bring Worker Web interaction polish to a production-usable baseline without
changing worker, workspace, session, artifact, review, or engine API contracts.

## Acceptance Criteria

- Typography follows `DESIGN.md`: body text uses 16px defaults, utility text
  uses 14px/12px intentionally, and headings use the rounded heading stack.
- Creation dialogs have balanced header/body/action spacing and no clipped
  header text.
- Empty-worker Soul selection is a vertical, scrollable list item selector
  instead of the current tag-like horizontal pills.
- Worker Web select controls that expose user-visible options use an integrated
  custom popover/listbox with aligned trigger, option menu, padding, and icon
  placement.
- Button hover, active, disabled, and primary/secondary color states preserve
  readable foreground colors.
- Workspace route content is visually centered and constrained instead of
  feeling left-biased.
- Session routes expose clear workspace/session navigation, including a direct
  return to the current workspace.
- Session management hierarchy makes worker -> workspace -> session transitions
  clear in the sidebar and main surface.
- Streaming session creation must not force navigation back to a session after
  the operator has intentionally navigated elsewhere.

## Verification

- Playwright MCP desktop and mobile inspection before and after implementation.
- Worker Web RTL coverage for custom select and no forced session navigation.
- Focused Web typecheck, lint, test, and build.
- `git diff --check`
- code-review-graph review after code edits.

## Closeout

Completed on 2026-05-11.

- Worker Web typography now uses `DESIGN.md` token sizes and weights in the
  built studio CSS: 12/14/16/18/20/24/30px, 400/500/600 weights, and zero
  letter spacing.
- Create worker and create session flows now use a local integrated listbox
  select instead of native `select` option chrome.
- Empty-worker Soul selection now renders as a vertical scrollable list item
  selector, with the existing worker list pattern preserved.
- Dialog spacing, close-button placement, select chevron padding, button hover
  foreground colors, workspace content centering, and session return actions
  were repaired.
- Session creation stream navigation now only opens the new session if the
  operator is still on the initiating workspace route, preventing later engine
  output from pulling them back after navigation.
- Playwright MCP found an additional mobile workspace overlap between the
  create-session card and the empty session state; that was fixed by preventing
  those content blocks from shrinking inside the scroll container.
