# REFACTOR-075 HR Profile Workbench Panel Controls Polish

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 20:30
- **claimedAt**: 2026-05-12 20:30
- **completedAt**: 2026-05-12 20:42
- **plan**: PLAN-283
- **relatesTo**: REFACTOR-074, apps/web

## Background

REFACTOR-074 landed the HR Profile Workspace three-panel layout. Follow-up UX
review identified several panel-level issues:

- Profile List still has a smart "Needs attention" section that duplicates
  lifecycle classification.
- Profile List cards are too large for a navigation list.
- Profile List and Profile Tools should be toggled from the header action
  cluster beside refresh/settings.
- Profile Tools block spacing is uneven.
- Suggested Tools should not maintain its own scroll area; the whole tools
  panel should own scrolling.

## Goals

- Remove the visible Needs Attention section from Profile List.
- Simplify Profile List items into compact navigation rows.
- Add header icon toggles for Profile List and Profile Tools visibility.
- Rebalance Profile Tools block spacing.
- Let Profile Tools use one panel-level scroll path instead of nested
  Suggested Tools scrolling.

## Non-goals

- Do not change HR backend APIs, workspace/session routes, or artifact storage.
- Do not add persistence for panel visibility.
- Do not redesign non-HR Soul workbenches.

## Acceptance Criteria

- Profile List shows only lifecycle sections.
- Profile List rows are compact and still expose the profile name, lifecycle,
  moment, and next step.
- Header contains Profile List and Profile Tools toggle buttons grouped with
  refresh/settings actions.
- Hiding either side panel lets Profile Details reclaim layout space.
- Suggested Tools no longer has its own scroll container.
- Existing HR action, session jump, and PM fallback flows still pass.

## Progress

- 2026-05-12 20:30: Claimed after operator requested focused HR workbench panel
  control and spacing refinements.
- 2026-05-12 20:42: Removed the visible Needs Attention profile-list section,
  compacted profile list rows, moved side-panel toggles into the header icon
  group, removed nested Suggested Tools scrolling, and verified panel expansion
  behavior in browser.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop review: Profile List has lifecycle sections only, compact
  rows render without the Needs Attention section, side-panel toggles live in
  the header icon group, and details expands when panels are hidden.
- Playwright mobile review: no horizontal overflow, Profile Tools uses one
  panel-level scroll, and Suggested Tools no longer owns nested scrolling.
- Playwright flow review: suggested action still populates the proposal composer,
  session thumbnail still opens the full session route, and PM fallback remains
  non-HR.
- `bun run crg:update`
- `bun run crg:review`
