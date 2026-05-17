# REFACTOR-080 Worker Web Host shell V9 layout

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-17
- **claimedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **plan**: PLAN-351
- **relatesTo**: apps/web/src/worker/worker-studio.tsx, packages/component/src/layout/shell.tsx, apps/web/src/styles/shell.css

## Background

The current Worker Web shell still lets route context reshape the sidebar into
workspace/session detail navigation and does not have a full-width Host header.
The approved V9 design defines Host as a fixed chrome layer:

- a 40px full-width Host header;
- left `PanelLeftClose` / `PanelLeftOpen` sidebar toggle;
- Host locator centered in the header;
- right `PanelBottom` and `PanelRight` reserved panel toggles;
- sidebar navigation stops at `Soul App -> Soul worker`;
- workspace and session UX stays inside the Soul App main surface.

## Acceptance Criteria

- Worker Web renders a full-width 40px Host header above sidebar and main.
- The sidebar can be fully hidden and restored; no collapsed icon rail remains.
- Header actions use panel toggle icons and do not invoke unfinished terminal or
  right-panel behavior.
- The sidebar top uses Host list item actions instead of brand/logo chrome.
- HR workbench behavior, profile actions, workspace rendering and session detail
  behavior remain intact.

## Implementation Plan

- Covered by `PLAN-351`.

## Outcome

Implemented the approved V9 Host shell layout while preserving the existing HR
workbench and design tokens:

- added a full-width 40px Host header above the sidebar/main grid;
- added header-owned sidebar, bottom panel and right panel icon placeholders;
- made sidebar collapse fully hide the sidebar without retaining an icon rail;
- replaced the sidebar brand block with Host list item actions;
- kept workspace/session navigation out of the Host sidebar.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: browser smoke on `http://127.0.0.1:4195/` for expanded and hidden sidebar states.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
