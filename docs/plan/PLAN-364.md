# PLAN-364 Shared collapsible grouped list pattern

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REFACTOR-083

## Current State

`WorkerStudio` renders the worker rail with local `worker-soul-group-*` markup
and styles. `HrProfileList` renders profile lifecycle sections with separate
`hr-profile-section-*` markup and styles. Both surfaces represent the same UI
relationship: a collapsible group header with count/meta and an expanded child
drawer that should visually nest the child items.

The duplication currently hides the shared pattern and makes visual hierarchy
fixes local by default. A worker-rail indentation change would not help the HR
profile list, even though the profile list has the same parent/child structure.

## Proposal

Introduce a shared component pattern in `@zonease/aiworker-component` for
collapsible grouped lists. The component should provide a generic group wrapper,
toggle row, chevron state, optional meta/count slot, and expanded drawer with
consistent child indentation. It should not render child item content or know
anything about Soul Apps, workers, HR lifecycles, or profiles.

Migrate the Worker Web worker rail and HR profile list to use the shared pattern
while preserving their existing data ownership, labels, roles, child item
components, and click behavior.

## Scope

- `packages/component/src/patterns/*`
- `packages/component/src/index.ts` exports through existing pattern exports
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-list.tsx`
- `apps/web/src/styles/rail.css`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs and changelog entry

## Non-Goals

- No Host/Soul protocol or manifest change.
- No HR profile data, promotion, artifact, review, or storage behavior change.
- No redesign of worker cards, profile cards, or broader panel layout.
- No new app-specific abstraction inside `packages/component`.

## Risks

- The shared pattern may accidentally overfit the dense worker rail and make HR
  profile cards too cramped. Mitigation: the component owns only the group shell
  and drawer indentation; child item layout remains local.
- Accessibility roles differ by surface: worker rail uses `listbox`/`option`,
  while HR profile list is ordinary navigation content. Mitigation: allow the
  group drawer to accept `role` and aria props without hardcoding listbox
  semantics.
- Global CSS class names may collide with existing local styles. Mitigation:
  use `studio-collapsible-*` names and remove only superseded local rules.

## Implementation Plan

1. Add a focused test that proves both worker rail and HR profile sections use
   the shared grouped-list classes and preserve collapse behavior.
2. Add the shared component pattern and exports in `packages/component`.
3. Migrate `WorkerStudio` group markup to the shared component.
4. Migrate `HrProfileList` group markup to the shared component.
5. Move shared shell/drawer styles into global Web style scope and delete
   duplicate local shell styles while keeping child item styles local.
6. Run focused Web tests, typecheck, lint, build, and code-review-graph.

## Verification

- Passed: initial RED check with
  `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
  failed on missing shared `studio-collapsible-*` markup.
- Passed: `bun run --filter '@zonease/aiworker-web' test src/shared/__tests__/studio-collapsible-group.test.tsx src/worker/__tests__/worker-studio.test.tsx`
- Passed: `bun run --filter '@zonease/aiworker-component' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `git diff --check`
- Passed: browser smoke at
  `http://127.0.0.1:5173/workers/w_mn17k4brsadp` against the existing local
  daemon; the snapshot showed both the Worker rail Soul App group and the HR
  profile lifecycle groups.
- Passed with advisory gaps: `bun run crg:update`
- Passed with advisory gaps: `bun run crg:review` exited 0, reported risk
  score `0.40`, and still listed static test gaps for `HrProfileList`,
  `WorkerStudio`, and `StudioCollapsibleGroup`; direct component and
  WorkerStudio RTL coverage was added in this plan.
