# PLAN-282 HR Profile Workspace Three Panel Layout

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 18:39
- **approvedAt**: 2026-05-12 18:39
- **completedAt**: 2026-05-12 19:08
- **relatedTask**: REFACTOR-074

## Current State

REFACTOR-073 moved HR toward profile-centered work with a dossier and artifact
preview. The current UI still has these gaps:

- `HrPeopleCommandStrip` duplicates the page header and competes with the real
  workbench chrome.
- `HrProfileWall` is a card wall, not the requested sectioned Profile List.
- `Profile Details` and `Profile Tools` are page-flow panels, so the whole page
  scrolls instead of each panel owning its own scroll.
- `Profile Tools` only shows actions and a composer; the profile's recent agent
  sessions are not visible as compact work-loop thumbnails.

## Decision

Reframe the HR specialized workbench as:

```text
Single HR header
  - breadcrumb / workbench title / selected profile
  - metrics
  - search
  - new profile / evidence connectors / refresh / settings

Three-panel body
  - Profile List: collapsible smart/lifecycle sections
  - Profile Details: selected profile facts, evidence, timeline, artifact preview
  - Profile Tools: current profile, compact sessions, suggested tools, proposal composer
```

Keep sessions as thumbnails in Profile Tools. Full session content remains on
the existing session route.

Use local React state for section collapse and profile search. No backend or
route changes are needed.

## Scope

In scope:

- Remove the second HR command strip from the workbench render path.
- Add a grouped/collapsible Profile List component.
- Rename the visible workbench sections to Profile List, Profile Details, and
  Profile Tools.
- Pass profile-bound sessions into Profile Tools and add compact session cards
  with an open-session action.
- Update HR CSS so the three panels fill remaining height and scroll internally.
- Update focused tests for the new IA, grouping, session thumbnails, action
  flow, and fallback behavior.
- Run focused tests, Web gates, Playwright layout/flow review, and CRG review.

Out of scope:

- Backend API changes.
- Full chat rendering in HR workbench.
- Cross-Soul specialization beyond HR.
- New persistence for collapsed sections.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop HR three-panel layout review.
- Playwright mobile HR bounded-panel layout review.
- Playwright HR profile section collapse smoke.
- Playwright HR session-thumbnail jump smoke.
- Playwright HR action-to-composer smoke.
- Playwright PM fallback smoke.
- `bun run crg:update`
- `bun run crg:review`

## Risks

- **Duplicated people in smart sections**: Needs Attention is a smart section,
  not a lifecycle bucket. Mitigation: keep it visually pinned and label it as a
  focus section while lifecycle sections remain the canonical grouping.
- **Panel-local scroll traps**: Overly constrained panels can make mobile
  awkward. Mitigation: use full-height bounded panels on desktop and
  viewport-aware panel sizing on mobile with Playwright review.
- **Session prominence drift**: Showing sessions could turn HR back into an
  agent log. Mitigation: show only compact thumbnails and keep full content on
  session routes.

## Progress

- 2026-05-12 18:39: Plan approved by operator instruction and implementation
  started.
- 2026-05-12 19:08: Completed implementation and verification. HR now renders
  one header plus Profile List, Profile Details, and Profile Tools. Profile
  Tools owns compact session thumbnails and profile-bound proposal actions;
  full session content stays on the existing session route.
