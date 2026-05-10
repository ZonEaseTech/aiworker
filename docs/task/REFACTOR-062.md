# REFACTOR-062 Session composer and right-side summary refinement

- **status**: pending
- **priority**: P0
- **owner**: unassigned
- **createdAt**: 2026-05-11 03:05
- **plan**: PLAN-240
- **relatesTo**: apps/web/src/worker/session-chat.tsx, apps/web/src/worker/session-detail.tsx, apps/web/src/worker/studio.css

## Background

The session composer does not feel integrated with the surrounding chat surface.
The right-side summary reads like a running ledger, has inconsistent section
height choices, and cannot collapse like a drawer.

Open Design's chat surface treats the conversation as an isolated scroll island:
the active conversation id keys the chat pane to reset internal scroll/draft
state, the chat log sits inside a relative wrapper, streaming output only
auto-follows when the user is already near the bottom, and a jump-to-latest
button appears when the user scrolls away.

## Goal

Make the session workspace feel cohesive: a polished composer, scannable
artifact/review/memory context, and a collapsible right-side drawer.

## Acceptance Criteria

- Session follow-up input uses the same form-control geometry and spacing as
  other controls.
- Session scrolling follows the Open Design pattern: isolated chat log wrapper,
  conversation/session keyed reset, pinned-near-bottom auto-follow, no scroll
  stealing while reading old output, and a jump-to-latest affordance.
- The composer has a clear action cluster, stable height constraints, and
  polished disabled/loading states.
- Right-side content is reorganized into sections where high-signal artifact
  and review content are expanded by default, while event/log detail is
  collapsed or de-emphasized.
- The right side can be collapsed and restored like a drawer on session routes.
- Mobile layout avoids horizontal overflow and keeps drawer behavior reachable.

## Verification

- Worker Web RTL coverage for session follow-up and drawer state.
- Focused Web typecheck, lint, test, and build.
- Browser desktop and mobile validation.
- code-review-graph review after code edits.
