# PLAN-404 HR mounted scoped CSS layout fix

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 19:10
- **approvedAt**: 2026-05-21 19:10
- **relatedTask**: BUG-149

## Current State

The HR Soul App owns its mounted reading-room UI and Host Web mounts it through
the generic `micro-app` runtime. In desktop Host mounted mode the page currently
has three child columns in the DOM, but computed CSS produces a single grid
track. Earlier investigation showed the mounted child receives the Host
viewport correctly; the regression is caused by HR's Tailwind arbitrary
`xl:grid-cols-[...]` selector being dropped by micro-app scoped CSS handling.

## Proposal

1. Replace HR's arbitrary Tailwind grid column classes with a stable
   `hr-reading-room-grid` class on the HR-owned route surface.
2. Keep the existing `data-left-panel` and `data-right-panel` attributes as the
   panel state contract.
3. Add ordinary HR-owned CSS selectors in the HR app stylesheet for desktop and
   narrow layout states.
4. Update static HR tests to assert the stable hook and panel data attributes.
5. Extend the mounted smoke script to assert computed desktop and narrow grid
   layouts after the child app is mounted through Host Web.

## Component Library Preflight

Checked active UI ownership and primitive usage:

- HR route and columns already compose `@zonease/aiworker-ui` shadcn-managed
  primitives.
- This fix adds no new app-local control primitive; it only replaces a fragile
  Tailwind layout utility with HR-owned layout CSS.
- Host Web remains a generic micro-app mount container and does not render HR
  domain layout.

## Scope

- `apps/aiworker-hr/product/web/people-workbench/app.tsx`
- `apps/aiworker-hr/product/web/styles.css`
- `apps/aiworker-hr/product/web/component-proof.test.tsx`
- `apps/aiworker-hr/host-adapter/index.test.ts`
- `apps/web/scripts/smoke-mounted-surfaces.ts`
- PMA task/plan indexes and changelog
- Approved Superpowers implementation plan

## Non-Goals

- Do not alter `apps/web/src/lib/micro-app-runtime.ts`.
- Do not add HR domain layout logic to `apps/web`.
- Do not change HR panel open/close behavior.
- Do not normalize unrelated refactor work already present in the dirty tree.

## Risks

- The smoke helper must parse computed `gridTemplateColumns` robustly because
  browser serialization may include spaces inside functions.
- The repository currently has a large dirty worktree. Staging must be scoped
  to this HR mounted layout fix only.
- `ui:check` may report unrelated pre-existing migration debt; changed files
  must be fixed if they are involved.

## Verification Plan

- Run focused static tests:
  `bun test apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/host-adapter/index.test.ts`
- Run HR package tests:
  `bun run --filter '@zonease/aiworker-hr' test`
- Build HR styles:
  `bun run --filter '@zonease/aiworker-hr' build:styles`
- Run mounted smoke:
  `bun apps/web/scripts/smoke-mounted-surfaces.ts`
- Run UI governance:
  `bun run ui:check`
- Run diff and review gates:
  `git diff --check`
  `bun run crg:update`
  `bun run crg:review`

## Progress

- 2026-05-21 19:10: Plan opened after user approved the scoped CSS direction.
  Implementation starts from HR-owned layout hooks and computed mounted smoke
  coverage.
- 2026-05-21 19:34: Completed. HR now owns scoped-safe
  `hr-reading-room-grid` CSS for panel-state layouts, the route no longer emits
  the arbitrary Tailwind grid contract or `grid-cols-1` utility override, and
  the mounted smoke verifies computed desktop and narrow grid tracks through
  the Host `micro-app` path.

## Verification

- 2026-05-21 19:21: `bun test apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/host-adapter/index.test.ts` passed.
- 2026-05-21 19:25: `bun apps/web/scripts/smoke-mounted-surfaces.ts` initially failed with one desktop grid track, proving the new smoke caught the regression.
- 2026-05-21 19:29: Browser CSSOM debug confirmed the HR selector survived micro-app scoped CSS and matched the element; Tailwind `grid-cols-1` utility layer was still overriding the component-layer rule.
- 2026-05-21 19:31: `bun apps/web/scripts/smoke-mounted-surfaces.ts` passed after removing `grid-cols-1` and refreshing the HR client bundle.
- 2026-05-21 19:32: `bun run --filter '@zonease/aiworker-hr' test` passed.
- 2026-05-21 19:32: `bun run --filter '@zonease/aiworker-hr' build:styles && bun run --filter '@zonease/aiworker-hr' build:client` passed.
- 2026-05-21 19:32: `bun run ui:check` passed.
- 2026-05-21 19:32: `git diff --check` passed.
- 2026-05-21 19:33: `bun run --filter '@zonease/aiworker-hr' typecheck` passed.
- 2026-05-21 19:33: `bun run --filter '@zonease/aiworker-hr' validate` passed.
- 2026-05-21 19:33: `bun run --filter '@zonease/aiworker-hr' smoke` passed.
- 2026-05-21 19:34: `bun run crg:update && bun run crg:review` passed. The CRG summary used the whole dirty worktree and reported 101 changed files, 0 affected flows and risk score 0.60; no blocking issue was reported for this scoped fix.
