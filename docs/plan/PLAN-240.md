# PLAN-240 Session composer and right drawer refinement

- **status**: pending
- **owner**: unassigned
- **createdAt**: 2026-05-11 03:05
- **relatedTask**: REFACTOR-062

## Current State

- `WorkerSessionChat` has a functional composer, but its textarea, tool button,
  and submit button do not share a polished container rhythm with the rest of
  the app.
- `WorkerSessionChat` currently has a partial bottom-follow implementation:
  initial session scroll, near-bottom auto-follow, and a jump button. However,
  the scroll area is not modeled as a full OD-style scroll island and is not
  explicitly reset by remounting the session pane.
- `SessionDetail` renders artifact, turn history, review, memory candidates,
  and recent events as a long right-side ledger.
- The right side is always open on session routes and cannot collapse into a
  drawer.
- Event/log detail consumes reading space even when artifact and review context
  should be higher priority.
- Open Design reference:
  - `tmp/open-design-research/apps/web/src/components/ProjectView.tsx` keys
    `ChatPane` by `activeConversationId`, explicitly resetting internal
    scroll/draft state on conversation changes.
  - `tmp/open-design-research/apps/web/src/components/ChatPane.tsx` resets
    initial scroll once per conversation, auto-scrolls only when the user is
    near the bottom, tracks scrollback distance, and exposes jump-to-latest.
  - `tmp/open-design-research/apps/web/src/index.css` wraps `.chat-log` in
    `.chat-log-wrap` with `position: relative; flex: 1; min-height: 0`, so the
    jump button and composer do not disturb the scroll container.

## Proposal

1. Root the session communication surface in the Open Design scroll-island
   pattern:
   - key/remount `WorkerSessionChat` by session id so scroll state and draft
     state do not bleed between sessions;
   - introduce a dedicated `.worker-chat-log-wrap` around the scrollable log;
   - keep header and composer outside the scroll container;
   - preserve near-bottom-only auto-follow during streaming;
   - keep jump-to-latest anchored inside the wrapper, not relative to the whole
     pane.
2. Rework the session composer visual structure:
   unified textarea geometry, pill action buttons, stable min/max height, and
   consistent disabled/loading styling.
3. Convert the right side into a drawer-like rail:
   - visible expanded state on desktop by default;
   - icon button to collapse/restore;
   - collapsed state keeps a slim, accessible restore affordance;
   - mobile keeps the panel reachable without horizontal overflow.
4. Reorder and collapse sections by reading priority:
   artifact preview and review open by default, memory candidates compact,
   turn/event history as collapsed details or low-height sections.
5. Replace ledger-like event rows with summary counts and on-demand details.
6. Keep data derivation and API behavior unchanged.

## Scope

In scope:

- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/i18n.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`

Out of scope:

- Changing session/turn/artifact/review data contracts.
- Adding new artifact types.
- Rebuilding the center timeline interaction model.

## Risks

- Drawer collapse state must not trap content off-screen or break keyboard
  access.
- Collapsing low-signal sections should not hide errors or review actions.
- Mobile stacking needs browser validation because CSS grid changes can create
  horizontal overflow.
- Scroll handling must not regress active streaming: new assistant deltas should
  remain visible when pinned, but should not steal scrollback when the user is
  reading previous output.

## Verification Plan

- RTL tests for follow-up turn submission, session switch scroll reset, pinned
  auto-follow behavior, jump-to-latest visibility, and drawer collapse/restore.
- Browser validation for session route, artifact preview, review action, memory
  action, and mobile overflow.
- Focused Web typecheck, lint, test, and build.
- code-review-graph update/review after code edits.

## Approval Gate

Pending operator approval.
