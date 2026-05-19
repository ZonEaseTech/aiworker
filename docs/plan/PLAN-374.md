# PLAN-374 HR profile composer select dropdown visual split

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: BUG-139

## Current State

`HrProfileToolsPanel` renders the proposal type control through
`@zonease/aiworker-component` `Select`. The trigger is compacted by the
HR-owned `.hr-composer-template-select` class.

The shared `Select` renders `SelectPrimitive.Content` inside a Radix portal.
That means the menu content is no longer a descendant of
`.hr-composer-template-select`, so the compact font and density rules only reach
the trigger. The portal also cannot inherit `--studio-select-open-radius` from
`.studio-select`; live browser measurement showed the opened content computed
`border-radius: 0px`.

The HR composer sits near the bottom of the right panel, so Radix places the
menu above the trigger with `data-side="top"`. Shared CSS currently styles the
open trigger as if the menu always opens below it, leaving the wrong edge
rounded and making the menu and select read as separate surfaces.

## Component Library Preflight

- Checked `packages/component/src/primitives/select.tsx`: existing shared
  primitive is the correct base because this is a generic select behavior and
  already uses Radix rather than app-local select logic.
- Checked `packages/component/src/styles/patterns.css`: the current open-state
  styling is shared and assumes a bottom-opening menu.
- Checked HR app-local CSS: it can define HR-specific compact density and mono
  typography, but portal content needs an explicit shared component hook to
  receive those styles.
- No new component catalog entry is needed if the shared `Select` gains small
  optional props for side and portal content class. A reusable gap only needs
  catalog tracking if another select variant is invented instead.

## Proposal

1. Extend the shared `Select` primitive with optional, backward-compatible props:
   - `side?: 'top' | 'bottom' | 'left' | 'right'`
   - `contentClassName?: string`
2. Apply the requested side as a root class such as `side-top` when provided,
   and pass it to Radix content so the HR composer can intentionally open above
   the bottom action bar.
3. Fix shared select CSS so portal content has its own radius fallback and
   `data-side="top"` / `data-side="bottom"` use the correct connected edge.
4. Set the HR composer select to `side="top"` and give the portal content an
   HR-owned compact content class for matching option density and mono labels.
5. Add focused assertions:
   - shared primitive test covers `side` and `contentClassName`;
   - WorkerStudio test covers HR select portal content class and top-opening
     configuration.

## Risks

- Radix portal content is outside the HR panel DOM, so app-local selectors must
  target only the explicit content class and avoid generic page-wide select
  changes.
- Forcing the HR composer menu to open above is appropriate for the bottom
  action bar, but this should remain opt-in so creation dialogs and other shared
  select users keep default collision behavior.
- Visual closure still requires a browser smoke because jsdom cannot validate
  the real portal geometry or radius rendering.

## Scope

- `packages/component/src/primitives/select.tsx`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/primitives/primitives.test.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- focused WorkerStudio test updates if needed

## Verification

- [x] `bun run --filter '@zonease/aiworker-component' test`
- [x] `bun run --filter '@zonease/aiworker-component' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' lint`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] `bun run ui:check`
- [x] `bun run docs:check`
- [x] Browser smoke of the HR composer dropdown.
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Annotations

- 2026-05-19 17:32 CST: Proposed a narrow shared primitive hook plus HR-owned
  compact portal styling instead of reverting to native select or adding
  app-local dropdown logic.
- 2026-05-19 17:58 CST: Implemented and verified. Browser smoke measured the
  HR proposal type trigger at 38px before and after open; portal content now has
  `data-side="top"`, `hr-composer-template-select-content`, 38px option rows,
  mono 13px labels, and connected `12px 12px 0 0` menu radius paired with
  `0 0 12px 12px` trigger radius.
