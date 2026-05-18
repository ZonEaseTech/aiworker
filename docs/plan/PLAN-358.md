# PLAN-358 HR Soul App header convergence

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **relatedTask**: FEAT-097

## Current State

`HrPeopleWorkbench` currently renders a `header.entry-header.workspace-header`
with the HR workbench title, global search, metrics, New Profile, evidence,
refresh/settings, and panel toggles. The selected profile content then renders
another `Current Profile Summary` heading via `HrProfileDetails` and
`HrProfileReadingRoom`, creating duplicated hierarchy.

`HrProfileList` owns the profile sections but not the profile-list action row.
`HrProfileDetails` owns the center profile document but not the selected-profile
actions. `ProfilePatchStrip` appears whenever an artifact exists and the review
state is not empty/loading, so zero-change or already-consumed patch states can
remain visually prominent.

## Proposal

Refactor the HR workbench chrome around object-local headers:

1. Remove the HR Soul App top workbench header from `HrPeopleWorkbench`.
2. Move the optional local profile-list filter and new-profile icon action into
   `HrProfileList`.
3. Move HR-owned panel toggles, refresh, evidence and settings into a new
   selected-profile header inside `HrProfileDetails`.
4. Let `HrProfileReadingRoom` begin with README profile content and section
   cards without rendering another `Current Profile Summary` wrapper heading.
5. Tighten `ProfilePatchStrip` visibility and shorten its action label.
6. Update focused Worker Studio tests and CSS for desktop/mobile layouts.

## Scope

- `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-list.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-details.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs, Superpowers implementation plan, and changelog entry.

## Non-Goals

- No Host header removal or redesign.
- No Host/Soul manifest or protocol schema change.
- No profile promotion API change.
- No broad right-panel redesign beyond the control relocation required here.

## Risks

- The search descriptor currently exists in mounted workbench fixtures. This
  plan removes HR workbench-level search rendering, not the protocol descriptor.
- The broad Worker Studio test has many historical assertions. Update only the
  assertions that describe the approved UX.
- Removing an outer title must not harm accessibility; the selected-profile
  header and regions need clear labels.

## Implementation Plan

- Detailed execution steps are tracked in
  `docs/superpowers/plans/2026-05-18-hr-soul-app-header-convergence.md`.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: browser smoke against the local Ben HR workspace using the current
  repo Vite dev server at `127.0.0.1:5173` and the existing daemon API at
  `127.0.0.1:9217`.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
