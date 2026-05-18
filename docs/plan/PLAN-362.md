# PLAN-362 Host left panel toggle active state repair

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **relatedTask**: BUG-137

## Current State

The shared icon button stylesheet already highlights active controls through
`.icon-button[aria-pressed="true"]`. HR's People Profile header uses this
contract for its left/right panel toggles.

The Host shell `HostTopBar` left sidebar toggle uses the same icon primitive and
PanelLeft icon, but does not set `aria-pressed`. The button label changes
between `Hide sidebar` and `Show sidebar`, yet the visual active state has no
state hook while the sidebar is visible.

This work is being performed in an isolated worktree because the main checkout
contains unrelated in-progress `BUG-136 / PLAN-361` profile-ledger changes.

## Proposal

1. Add a focused Worker Studio regression assertion for Host left sidebar
   toggle pressed state.
2. Set `aria-pressed={!sidebarCollapsed}` on the Host topbar sidebar toggle.
3. Re-run focused tests, Web package checks, browser smoke and code-review-graph.
4. Record the fix and ship it in a patch CLI release.

## Risks

- The fix must not change Host/Soul App ownership boundaries; it is strictly a
  Host shell visual/ARIA state repair.
- The active state should describe panel visibility, matching HR's existing
  toggle semantics.
- Existing unrelated dirty files in the main checkout must not be included in
  the release branch.

## Scope

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA/changelog tracking for this bug and the follow-up release.

## Verification

- [x] RED: focused Worker Studio test fails before implementation because
  `aria-pressed` is `null`.
- [x] Focused Worker Studio test passes after implementation.
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' lint`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] Browser smoke for Host sidebar toggle pressed state.
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Annotations

- 2026-05-18：RED regression confirmed `aria-pressed` was `null` before the
  production change.
- 2026-05-18：Browser smoke against the real HR workspace route confirmed
  `Hide sidebar` reports `aria-pressed="true"` with active computed colors and
  `Show sidebar` reports `aria-pressed="false"` after collapse.
- 2026-05-18：code-review-graph reported no affected flows and low risk
  (`0.40`). Its static gap note lists private `HostTopBar`; the covered
  behavior is exercised through Worker Studio integration tests.
