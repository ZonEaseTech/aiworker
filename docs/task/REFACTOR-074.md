# REFACTOR-074 HR Profile Workspace Three Panel Layout

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 18:39
- **claimedAt**: 2026-05-12 18:39
- **completedAt**: 2026-05-12 19:08
- **plan**: PLAN-282
- **relatesTo**: REFACTOR-071, REFACTOR-072, REFACTOR-073, apps/web

## Background

The HR People Workbench now has profile-centered content and Markdown artifact
preview, but the interaction model still has product friction:

- the page header and command strip read as two competing headers;
- profile selection is still a poster wall rather than a classified profile
  list;
- the three primary regions do not fill the remaining viewport height together;
- scrolling is page-level instead of panel-local;
- agent sessions are not visible as compact profile-bound work loops in the
  tools panel.

The product direction is to make every HR action orbit a single profile:
Profile List, Profile Details, and Profile Tools.

## Goals

- Keep one HR workbench header only.
- Replace the poster-wall profile selector with a grouped, collapsible Profile
  List.
- Split the surface into Profile List, Profile Details, and Profile Tools.
- Make the three panels fill the remaining workbench height and own their
  internal scrolling.
- Show compact profile-bound agent sessions in Profile Tools, with jump actions
  into full session detail.
- Preserve the current HR artifact, review, lesson, and session contracts.

## Non-goals

- Do not change backend APIs or database schemas.
- Do not redesign non-HR Soul fallback workbenches.
- Do not show full agent chat/session logs inside the HR workbench.
- Do not add a new routing model.

## Acceptance Criteria

- HR renders a single header surface for workbench title, metrics, search, new
  profile, and connectors.
- Profile List groups people by smart attention section and lifecycle sections,
  with collapsible drawer-style sections.
- Profile Details remains the primary reading panel for the selected profile and
  artifact preview.
- Profile Tools shows current profile, compact recent sessions, suggested
  tools, and proposal composer.
- Desktop and mobile layouts use bounded panel scrolling rather than one long
  unstructured page.
- HR action-to-composer and session jump flows still work.
- PM fallback remains unchanged.

## Progress

- 2026-05-12 18:39: Claimed after operator approved the single-header,
  grouped-list, bounded three-panel HR workbench direction.
- 2026-05-12 19:08: Implemented the single-header HR workbench, collapsible
  Profile List, Profile Details, Profile Tools, recent session thumbnails,
  action-to-composer flow, and bounded desktop/mobile panel scrolling.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop review: single HR header, three bounded panels, panel-local
  scroll, and no PM fallback regression.
- Playwright mobile review: no horizontal overflow, stacked bounded panels, and
  panel-local scroll.
- Playwright flow review: collapsed lifecycle section keeps profile details
  stable, recent session thumbnail opens the full session route, and suggested
  tools populate the profile-bound proposal composer.
- `bun run crg:update`
- `bun run crg:review`
