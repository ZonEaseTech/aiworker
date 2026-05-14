# PLAN-283 HR Profile Workbench Panel Controls Polish

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 20:30
- **approvedAt**: 2026-05-12 20:30
- **completedAt**: 2026-05-12 20:42
- **relatedTask**: REFACTOR-075

## Current State

The HR Profile Workspace currently uses one header and three panels. The
remaining UX problems are concentrated in panel navigation density and panel
controls:

- Profile List has both a smart Needs Attention section and lifecycle sections.
- Profile cards use a large poster-like layout even though the list now acts as
  navigation.
- Profile List and Profile Tools are always visible.
- Suggested Tools owns a nested scroll area inside the Profile Tools panel.

## Decision

Keep the three-panel architecture, but make the side panels optional from the
header action cluster:

```text
Header action cluster
  - Profile List toggle
  - Profile Tools toggle
  - refresh
  - settings

Body
  - Profile List: lifecycle sections only, compact rows
  - Profile Details: expands when side panels are hidden
  - Profile Tools: one panel-level scroll path plus fixed proposal composer
```

This keeps the workbench simple while preserving a clearer reading center.

## Scope

In scope:

- Remove the Needs Attention profile-list section from the render path.
- Simplify Profile List item markup and CSS.
- Add local state for Profile List and Profile Tools visibility.
- Add header toggle buttons using existing icon button primitives.
- Remove nested scroll behavior from Suggested Tools.
- Update focused tests and run browser UX checks.

Out of scope:

- Backend/API changes.
- Persistent panel preferences.
- New HR business workflows.
- Non-HR workbench changes.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop HR layout and panel toggle review.
- Playwright HR action-to-composer and session-thumbnail smoke.
- Playwright PM fallback smoke.
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-12 20:30: Plan approved by operator direction and implementation
  started.
- 2026-05-12 20:42: Completed implementation and verification. The HR workbench
  now has lifecycle-only Profile List sections, compact profile rows, header
  toggles for both side panels, and a single scroll owner inside Profile Tools.
