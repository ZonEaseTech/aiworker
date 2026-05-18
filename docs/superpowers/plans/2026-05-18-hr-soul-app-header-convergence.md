# HR Soul App Header Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the HR Soul App workbench header and relocate controls to People Profiles and selected People Profile object headers.

**Architecture:** Keep the Host header untouched. `HrPeopleWorkbench` owns layout state and passes local controls down; `HrProfileList` owns list filtering/new profile creation; `HrProfileDetails` owns selected-profile actions; `HrProfileReadingRoom` renders README sections and patch awareness only.

**Tech Stack:** React 19, TypeScript, Vitest/Testing Library, Tailwind-token CSS, lucide-react icons, AIWorker Worker Web.

---

## Files

- Modify: `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-list.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-details.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `docs/task/FEAT-097.md`
- Modify: `docs/plan/PLAN-358.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

## Task 1: Write failing Worker Studio assertions

- [x] Update the HR workbench rendering test in `apps/web/src/worker/__tests__/worker-studio.test.tsx` so it expects the Host header to remain, the HR top workbench header to be absent, `New profile` to live inside `.hr-profile-list-panel`, and HR panel toggles to live inside `.hr-profile-details`.

- [x] Update the mounted workbench contribution test so it expects no `Search people profiles` placeholder and no HR header search fetch, while still proving `New people profile`, `Refresh`, `Evidence`, and `HR settings` call their mounted protocol actions from local object headers.

- [x] Add or update one assertion proving a ready patch strip with zero changed sections is not rendered as an actionable review bar.

- [x] Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: tests fail because the current UI still renders the HR workbench header/search and places controls in the old header.

## Task 2: Move People Profiles controls into the list panel

- [x] In `HrPeopleWorkbench`, stop rendering the HR top `header.entry-header.workspace-header` block.

- [x] Keep `profileQuery` state in `HrPeopleWorkbench`, but pass `profileQuery`, `setProfileQuery`, `onCreateWorkspace`, and the local primary workbench action handler into `HrProfileList`.

- [x] In `HrProfileList`, render a compact panel header with `People Profiles`, visible count, optional profile-list filter, and a `Plus` icon button with accessible name `New profile` or the mounted primary action label.

- [x] Ensure the list filter only filters the current `profiles` array. It must not call `workbenchBridge.search`.

- [x] Run the Worker Studio test again and confirm the search/header assertions move closer to green.

## Task 3: Move selected-profile controls into the profile header

- [x] Extend `HrProfileDetails` props with profile-list visibility state, profile-tools state, refresh/settings/evidence handlers, and optional mounted workbench actions.

- [x] Render a selected-profile header inside `.hr-profile-details` with title `{profile.name} People Profile`, profile status detail, list/tool toggle icon buttons, refresh, evidence, and settings.

- [x] Remove the outer `WorkbenchSectionTitle` from `HrProfileDetails`.

- [x] In `HrProfileReadingRoom`, remove its top `WorkbenchSectionTitle` so README content starts directly under the selected-profile header.

- [x] Run the Worker Studio test and fix assertion fallout around `Current Profile Summary` as UI header while preserving README section content.

## Task 4: Tighten patch strip behavior and copy

- [x] In `ProfilePatchStrip`, return `null` when `review.status !== 'ready'` unless the blocked state is opened in the explicit review view.

- [x] Return `null` when `review.changedSectionCount <= 0`.

- [x] Change the strip action text to `Review` in English and Chinese copy, while keeping accessible names clear through title or aria-label.

- [x] Update tests to prove the patch strip disappears after approval refresh and for zero-section patches.

## Task 5: CSS convergence

- [x] Remove CSS rules for `.hr-people-header`, `.hr-header-main`, `.hr-header-actions`, `.hr-profile-search`, `.hr-header-metrics`, `.hr-header-command`, and `.hr-header-icon-group` when they are no longer used.

- [x] Add CSS for the People Profiles panel header, local profile-list filter, selected-profile header, and selected-profile action group.

- [x] Confirm text truncation and button sizes remain stable at desktop and narrow viewports.

## Task 6: Verification, PMA closeout, and review

- [x] Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' build
```

- [x] Start or reuse the local dev server and run browser smoke against the HR workspace. Confirm Host header remains visible, HR workbench header is gone, list/profile controls are local, and the patch strip behavior is correct.

- [x] Run:

```bash
bun run crg:update
bun run crg:review
```

- [x] Mark `FEAT-097` and `PLAN-358` completed, update indexes and changelog with verification evidence.

- [x] Commit and push the completed implementation.
