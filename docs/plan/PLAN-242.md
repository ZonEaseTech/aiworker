# PLAN-242 Worker Web interaction polish follow-up

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 10:38
- **relatedTask**: REFACTOR-063

## Current State

- Playwright MCP on `http://127.0.0.1:9217/` confirms the body and app shell
  compute to `13.5px` body text and system sans headings, diverging from
  `DESIGN.md`.
- Create worker dialog header content starts at the dialog edge, so the kicker
  and title feel clipped and the body/actions do not have a coherent spacing
  rhythm.
- The empty-worker Soul picker still uses horizontal tag-like `.soul-rail-item`
  cards, while the existing worker list rows are closer to the intended
  compact list item pattern.
- Native `select` exposes operating-system option chrome and cannot match the
  product menu surface or integrated trigger/menu geometry.
- Global button hover changes background without consistently preserving
  contrast for primary and disabled states.
- Workspace routes use a wide full-bleed main column and can read as left
  biased on large screens.
- Session routes only expose a return to worker in the sidebar. The hierarchy
  from workspace to session is not clear enough, and there is no direct return
  to the current workspace from the session header.
- `createSessionTurnStream` currently navigates to the new session from its
  streaming `onSession` callback and again after completion, so background
  engine output can pull the operator back to the session after they leave.

## Proposal

1. Tighten visual tokens and typography:
   - set Worker Web body/app text to `DESIGN.md` body-md by default;
   - use the rounded heading stack only for headings and brand text;
   - keep utility/caption surfaces at explicit smaller sizes.
2. Rework creation dialogs:
   - move spacing to the dialog shell instead of letting header text touch the
     top edge;
   - align close button, header, form fields, and actions to a consistent
     inner padding.
3. Replace empty-worker Soul tags with vertical list items:
   - scroll vertically inside the selector;
   - use row layout, status metadata, and selected state consistent with
     worker list rows.
4. Replace native select usage in Worker Studio critical flows with a local
   custom select component:
   - trigger is a button with integrated chevron padding;
   - options render in an attached listbox below the trigger;
   - support click selection, Escape close, and basic arrow/Enter keyboard
     navigation.
5. Normalize button state styling so foreground/background remain readable
   across hover, active, disabled, primary, ghost, and icon-only buttons.
6. Constrain workspace route content with a centered content rail and clearer
   session management panels.
7. Add session navigation actions:
   - return to current workspace from session header/sidebar;
   - separate workspace sessions from other workspaces in the sidebar;
   - make current session state visible.
8. Prevent forced route changes during streaming:
   - navigate to the new session only if the operator is still on the same
     workspace route that initiated the stream;
   - never navigate from stream updates after the operator moved to another
     page.

## Scope

In scope:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/i18n.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs and changelog.

Out of scope:

- Backend API/schema changes.
- Replacing settings dialog select controls unless they are needed for this
  route-level repair.
- Release publishing or PR creation.

## Risks

- A custom select is easy to overbuild. Keep it scoped to Worker Studio flows
  and use simple, testable keyboard behavior.
- Session streaming navigation needs to preserve the happy path where creating
  a session still takes the operator to that session when they remain on the
  workspace page.
- Typography changes can expand layout height; desktop and mobile overflow
  checks are required.

## Verification Plan

- Worker Web RTL tests for custom select, workspace/session navigation, and no
  forced navigation when the route changes during session creation.
- Focused Web typecheck, lint, test, and build.
- Playwright MCP desktop and mobile checks on `http://127.0.0.1:9217/`.
- `git diff --check`
- code-review-graph update/review.

## Approval Gate

Approved by operator on 2026-05-11 in the manual-feedback request.

## Result

Completed on 2026-05-11.

- Worker Studio typography was tightened to the `DESIGN.md` type scale and
  weight set, including built CSS verification in the browser.
- Creation dialogs were re-spaced, native select controls in the critical
  Worker Studio flows were replaced by an integrated listbox select, and button
  hover states now preserve readable foreground colors.
- Empty-worker Soul selection now uses vertical list items with a scrollable
  selector instead of horizontal tags.
- Workspace route content is centered in a constrained rail, and session routes
  expose direct return-to-workspace actions from both sidebar and header.
- Streaming session creation no longer forces navigation after the operator
  leaves the workspace route.
- An additional Playwright-discovered mobile overlap in the workspace route was
  repaired by preventing the create card and empty state from shrinking inside
  the scroll container.
