# FEAT-096 HR profile patch review workbench

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-18
- **claimedAt**: 2026-05-18
- **plan**: PLAN-354
- **relatesTo**: apps/web/src/worker/souls/hr/people-workbench, FEAT-095, REFACTOR-080, REFACTOR-081

## Background

The HR People Workbench currently places reviewable profile proposal markdown,
source inventory, timeline, guardrails, recent sessions and the proposal
composer into one narrow right-side panel. That makes the panel function as a
small document reader and action catalog at the same time.

The approved product direction is to make the Reading Room the primary surface
for the accepted README profile, and to render session artifacts that request
README promotion as a section-aware Profile Patch Review: current README state
versus proposed README state.

## Acceptance Criteria

- The Reading Room shows a slim pending patch strip when the latest selected
  reviewable artifact can form a README promotion patch.
- Section headings show lightweight `+`, `~` or blocked indicators for sections
  touched by the pending patch without turning the Reading Room into an action
  dashboard.
- The full patch decision happens in a center-column Profile Patch Review view,
  not inside the right panel.
- The patch review compares current README and proposed README by HR profile
  section and supports whole-patch approve/reject semantics.
- Blocked artifacts explain why no promotable README patch can be formed without
  rendering a full raw markdown preview in the right panel.
- The right panel becomes a concise Next Step panel: one primary review/run
  action, limited secondary actions, source/activity summaries and the composer.
- Existing Host shell V9 and Host/Soul workbench contract semantics remain
  unchanged.

## Implementation Plan

- Covered by `PLAN-354`.

