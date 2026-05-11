# PLAN-273 Session drawer controls and motion polish

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 02:51
- **approvedAt**: 2026-05-12 02:51
- **relatedTask**: BUG-114

## Current State

- `WorkerSessionChat` renders a header-level “Back to worker” action as well as
  refresh and settings actions.
- `SessionDetail` renders its own drawer header with session title plus
  refresh/settings/collapse buttons, and a collapsed restore rail.
- `WorkerStudioLayout` keeps a 52px third column in collapsed session state.
- Drawer title rows mix custom summary markup and shared section headers, which
  can place icons at different edges and wrap awkwardly in the narrow drawer.
- Motion tokens and animation classes exist, but the drawer toggle and hover /
  focus interactions are too subtle to be perceived reliably.

## Proposal

1. Remove the selected-session header “Back to worker” action from
   `WorkerSessionChat`; keep the left workspace rail as the only return surface.
2. Add a sidebar toggle icon immediately after the session header settings
   button. The button uses `aria-pressed`, active styling, and the existing
   collapse/expand accessibility labels.
3. Remove `SessionDetail` drawer-owned refresh/settings/collapse controls and
   make collapsed mode render a hidden zero-width drawer instead of a restore
   sliver.
4. Tighten `artifact.css` heading/flex rules so right drawer icons and titles
   stay on the same row without awkward wrapping.
5. Strengthen transition rules for drawer layout, panel surfaces, buttons,
   rows, and chat/composer focus states using existing motion tokens.
6. Update WorkerStudio tests for the new control ownership and drawer toggle
   behavior.

## Scope

In scope:

- Worker Web selected-session route controls and right drawer behavior.
- CSS motion and drawer-title alignment rules.
- Focused WorkerStudio tests and PMA documentation.

Out of scope:

- API/data model changes.
- Changing workspace route or worker home route behavior beyond shared CSS
  transitions.
- A larger visual redesign of the drawer content model.

## Risks

- Removing the chat header return button must not remove the left rail return
  action.
- Moving drawer collapse ownership to the chat header must preserve keyboard and
  accessible-name behavior.
- Stronger transitions must respect `prefers-reduced-motion`.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser smoke on `http://127.0.0.1:9217`
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator on 2026-05-12 through the explicit annotated screenshot
correction request.

## Progress

- 2026-05-12 02:51: Located the duplicated header return action, drawer-owned
  action cluster, collapsed restore rail, and drawer title alignment rules.
- 2026-05-12 02:55: Moved session drawer ownership into the chat header sidebar
  toggle and removed the drawer-local control cluster.
- 2026-05-12 02:55: Updated drawer collapsed state to zero-width hidden mode and
  strengthened motion/title-alignment CSS.
- 2026-05-12 02:55: Added focused WorkerStudio coverage and verified the local
  browser preview.

## Result

- Selected-session route now has one return surface in the left rail, while the
  chat header owns refresh, settings, and right drawer toggle actions.
- Right drawer collapse no longer leaves a restore sliver; the header sidebar
  icon opens and closes it with active state.
- Right drawer section titles use consistent left icon alignment and nowrap /
  ellipsis behavior.
- Motion tokens and transitions are more visible across drawer, panel, row,
  button, and composer interactions while retaining reduced-motion support.
