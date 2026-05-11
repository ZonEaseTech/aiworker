# REFACTOR-064 Worker Web shared route layout

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 11:24
- **plan**: PLAN-245
- **relatesTo**: apps/web/src/worker/worker-studio.tsx, apps/web/src/worker/studio.css

## Background

Manual route comparison between `/workers/:workerId` and
`/workers/:workerId/workspaces/:workspaceId` showed that Worker Web does not
reuse a common route layout. Each route branch assembles left navigation, main
header, and content scroll regions independently, so the visual rhythm differs
between worker home, workspace, and session routes.

## Goal

Introduce shared Worker Web layout primitives so route pages reuse the same
sidebar, main header, content, and optional detail-rail structure instead of
rebuilding page chrome per route.

## Acceptance Criteria

- Worker Web has a shared layout component for shell/sidebar/main/detail
  composition.
- Worker home, no-worker, workspace, and session routes use the shared layout
  component.
- Main header and content scroll ownership are controlled by shared layout
  primitives instead of route-specific wrapper duplication.
- Route-specific CSS is limited to layout variants such as two-column,
  three-column, and collapsed detail.
- Existing route behavior is preserved.

## Verification

- Passed `bun run --filter '@zonease/aiworker-web' typecheck`.
- Passed `bun run --filter '@zonease/aiworker-web' lint`.
- Passed `bun run --filter '@zonease/aiworker-web' test -- worker-studio`.
- Passed `bun run --filter '@zonease/aiworker-web' test`.
- Passed `bun run --filter '@zonease/aiworker-web' build`.
- Passed `git diff --check`.
- Playwright MCP validated worker home, workspace, session, and 390px mobile
  workspace/session route geometry on `http://127.0.0.1:9217/`.
- code-review-graph review completed with risk score `0.40`, 0 affected flows.
