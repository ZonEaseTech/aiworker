# PLAN-253 Worker Web full-width route shell

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 16:42
- **relatedTask**: BUG-095

## Current State

- Worker and workspace routes used a `:not(.workspace-session-route)` rule to
  center content and cap width at `1120px`.
- Session routes already used the full-width shell.
- The resulting layout made top-level worker/workspace pages feel visually
  disconnected from session pages.

## Proposal

1. Remove the non-session width and margin override from `workspace.css`.
2. Let `.entry-header` and `.entry-tab-content` own full-width route padding
   consistently for all workspace routes.
3. Keep component-level layout rules unchanged.

## Result

- Worker, workspace, and session routes now share the same full-width page
  shell.
- Route padding stays governed by the shared header/content rules.
- Session route behavior is unchanged.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/worker/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Browser result: at 1800x1000, worker and workspace routes both render main,
  header, and content at 1460px wide from the sidebar edge; the session route
  keeps its existing 3-column layout with a 1120px middle session column.
- code-review-graph result: risk score `0.00`, 0 affected flows, 0 test gaps.
