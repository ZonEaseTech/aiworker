# PLAN-342 HR workbench selection empty state and action drawer refinement

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **relatedTask**: BUG-125

## Current State

Manual review found four HR workbench issues after FEAT-093 / PLAN-340:

- The HR side-panel toggles swap grid classes and conditionally mount/unmount
  panel content, but `.hr-people-layout` has no transition contract. Only the
  generic session route currently transitions drawer grid columns.
- `WorkerStudio` derives `selectedWorkspace` from the route, local selected id,
  or `latest(soulWorkspaces)`. `HrPeopleWorkbench` then falls back from
  `selectedProfile` to `profiles[0]`. As a result, the HR worker home can render
  a profile Reading Room/tools surface without an explicit workspace selection,
  and the no-profile state still shows the second and third columns.
- `.hr-profile-tools-rail` inherits stable scrollbar gutter and vertical
  overflow behavior from scroll containers, which reserves horizontal gutter
  space and makes the 34px icon buttons look left-biased inside the 48px rail.
- `HrProfileToolsPanel` stacks profile card, source cards, timeline, proposed
  change preview, guardrails, recent sessions, suggested actions and composer in
  one drawer. The result still reads like an inventory dashboard/cockpit instead
  of a compact workbench for the next profile action.

## Proposal

1. Add an explicit profile selection state for the HR renderer.
   - Keep Host generic: WorkerStudio should pass route/manual workspace
     selection to the specialized workbench without letting HR infer domain
     state in Host.
   - In HR, use only the explicitly selected profile as `focusedProfile`.
   - When no profile is selected, render profile list plus a clear empty/select
     state; do not render the Reading Room or tools rail/drawer.
2. Add HR drawer motion as part of the local HR layout.
   - Use stable grid tracks/CSS variables so profile-list and right-tools
     columns animate instead of appearing/disappearing instantly.
   - Fade/slide panel content with existing motion tokens and honor
     `prefers-reduced-motion`.
3. Center the collapsed right rail.
   - Remove stable scrollbar gutter/scrollbar reservation from the collapsed
     rail and keep icon buttons centered in the 48px column.
4. Rework the expanded right drawer into a simple profile workbench.
   - Rename/reframe away from `Profile Actions`.
   - Lead with selected profile plus one next action/composer.
   - Keep sources, proposed change, guardrails and recent sessions as compact
     supporting context, not dashboard cards.
   - Preserve review-gated profile promotion and current mounted action calls.
5. Update focused tests for empty selection, explicit profile selection, drawer
   controls, promotion flow and action drawer copy/layout.

## Risks

- Existing tests currently encode the implicit first-profile behavior, so the
  test updates must prove this is an intentional UX correction rather than a
  broken load state.
- Changing `selectedWorkspace` globally could affect generic worker home
  behavior. The implementation should either keep generic behavior intact or
  introduce a narrow explicit-selection value for specialized workbenches.
- Drawer animation can regress responsive layout if grid track counts change
  across states; the implementation should use stable tracks where animation is
  required and fall back to simple stacking under mobile breakpoints.

## Scope

Expected files:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/souls/types.ts` if the workbench context needs an
  explicit-selection flag
- `apps/web/src/worker/souls/hr/people-workbench/**`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `docs/task/BUG-125.md`
- `docs/task/index.md`
- `docs/plan/PLAN-342.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

Passed focused verification:

- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser smoke against an isolated HR worker:
  - worker home showed the profile list plus the select-profile empty state,
    with no Reading Room or tools rail.
  - selected workspace showed the Reading Room and collapsed workbench rail.
  - rail/button horizontal center delta was `0`.
  - expanded drawer showed `Next Profile Step` and no `Profile Actions` copy.
  - layout transition included `grid-template-columns`.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
