# REFACTOR-071 HR People Profile Workbench

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 13:57
- **claimedAt**: 2026-05-12 13:57
- **completedAt**: 2026-05-12 14:28
- **plan**: PLAN-278
- **relatesTo**: REFACTOR-068, REFACTOR-069, REFACTOR-070, apps/web, packages/shared

## Background

REFACTOR-068..070 proved that AIWorker can route HR into a specialized Soul
workbench, but the default object was still a role search. That made the UI feel
like a recruiting cockpit instead of a broader HR workspace.

The product correction is to make the HR workbench people-first. HR needs to
assist recruiting, onboarding, active employee care, and departure/offboarding
contexts. The UI should keep the user oriented around a person profile and the
next reviewable artifact, not around a dense workflow console.

## Goals

- Replace the HR default specialized workbench with a simple people-first
  profile board.
- Keep person profile, lifecycle stage, source evidence, next step, proposal,
  review, and lesson/memory status connected in one loop.
- Preserve agent boundaries: actions generate reviewable artifact proposals,
  never automated hiring or employment decisions.
- Keep PM, QA, DevOps, and future Souls on the current generic worker studio
  fallback.
- Cover logic tests and browser UX checks for desktop/mobile layout and
  interaction continuity.

## Non-goals

- Do not implement ATS/HRIS, payroll, LMS, or real employee-record connectors.
- Do not introduce candidate ranking, protected-class inference, employment
  decisions, or compensation commitments.
- Do not add storage schema or API forks for HR-specific profile data in this
  slice.
- Do not specialize non-HR Souls.

## Acceptance Criteria

- HR worker route renders People Workbench instead of Role Search Cockpit.
- The main work surface is a flex-based profile poster wall with lifecycle
  filters and review/evidence status.
- Selecting a profile keeps the right-side profile panel, timeline, next step,
  and proposal composer aligned to the same workspace/person.
- HR actions map to available capability templates and still create normal
  workspace sessions/artifacts through the existing local daemon contract.
- Tests cover descriptor resolution, HR rendering, action-to-composer behavior,
  session creation, and non-HR fallback.
- Playwright checks review layout quality, mobile behavior, and at least one HR
  action flow.

## Progress

- 2026-05-12 13:57: Claimed for implementation after operator approved goal-mode
  development, logic tests, and UI tests.
- 2026-05-12 14:28: Shipped HR People Workbench with profile poster wall,
  lifecycle filters, selected-profile loop panel, and profile-bound proposal
  actions while keeping non-HR Souls on the generic worker studio.
- 2026-05-12 14:28: Verification passed for shared descriptor tests, focused
  WorkerStudio tests, Web/API/shared/root typecheck and lint gates, Web build,
  Playwright desktop/mobile UX checks, HR action-to-composer flow, PM fallback,
  `git diff --check`, and code-review-graph update/review.
- 2026-05-12 14:49: Removed the duplicate lifecycle control from the left rail.
  The header strip remains the single lifecycle filter, while the rail now only
  summarizes the current view and selected profile stage.
- 2026-05-12 15:43: Fixed HR review semantics and worker-route action
  navigation. `needs_review` records now stay pending in cards/loop/next-step,
  and workbench actions launched from the worker route navigate into the created
  session. Playwright reran the profile-to-interview flow with a fresh candidate
  profile and confirmed the loop returns to `待 review / 请求 review`.
