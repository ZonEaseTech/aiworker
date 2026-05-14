# PLAN-245 Worker Web shared route layout

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 11:24
- **relatedTask**: REFACTOR-064

## Current State

- The no-worker route returns its own `entry-shell -> entry -> aside -> main`
  tree.
- The selected-worker route returns another `entry-shell -> entry -> aside ->
  main -> optional detail` tree.
- `workspace-home-route`, `workspace-context-route`, and
  `workspace-session-route` independently control grid columns and some main
  content width rules.
- Left navigation content and main header/content wrappers are route-branch
  owned rather than layout-owned.

## Proposal

1. Introduce a shared local `WorkerStudioLayout` component in
   `worker-studio.tsx`.
2. Introduce small `StudioSidebar` and `StudioMain` helpers so all routes share
   the same sidebar/header/content frame.
3. Convert no-worker, worker home, workspace, and session surfaces to render
   through the shared layout component.
4. Keep route-specific behavior in slot content only:
   - no-worker Soul list;
   - worker list and workspace list;
   - workspace context navigation and session creation;
   - session chat and detail rail.
5. Simplify CSS route variants so they select column geometry without owning
   unrelated sidebar/main rhythm.

## Scope

In scope:

- Worker Web layout composition in `worker-studio.tsx`.
- Worker Web route layout CSS in `studio.css`.
- Focused tests and PMA docs.

Out of scope:

- Backend API/schema changes.
- Rewriting session detail internals.
- New visual design beyond making layout chrome shared.

## Risks

- The current file is large, so a broad extraction can create review noise.
  Keep helpers local and small for this pass.
- Session route has a right detail rail, so the shared layout must support an
  optional detail slot without changing session behavior.
- Mobile layout relies on current flex fallback; Playwright mobile validation is
  required.

## Verification Plan

- Passed focused Worker Web RTL test run:
  `bun run --filter '@zonease/aiworker-web' test -- worker-studio`.
- Passed focused Web gates:
  `bun run --filter '@zonease/aiworker-web' typecheck`,
  `bun run --filter '@zonease/aiworker-web' lint`,
  `bun run --filter '@zonease/aiworker-web' test`, and
  `bun run --filter '@zonease/aiworker-web' build`.
- Passed Playwright MCP desktop/mobile route comparison on port 9217.
- Passed `git diff --check`.
- Passed code-review-graph update/review.

## Approval Gate

Approved by operator on 2026-05-11 after route layout inconsistency diagnosis.
