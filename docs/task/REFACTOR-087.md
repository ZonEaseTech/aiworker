# REFACTOR-087 Remove Host workbench action and search protocol bridge

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21
- **claimedAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **plan**: PLAN-395
- **relatesTo**: HOST-001, MOUNT-001, PROTO-001, FEAT-106, FEAT-107, apps/api, apps/web

## Background

The micro-app mounted runtime now carries app-owned UI/API boundaries. That
means the older Host workbench action/search bridge is no longer the right
product path: Host should mount the app-owned surface and proxy declared app
API paths, not expose generic `/actions/:actionId` or `/search` product routes
that translate manifest descriptors into `/protocol/actions` and
`/protocol/search` calls.

## Acceptance Criteria

1. Local daemon OpenAPI no longer lists `/api/local/apps/{appId}/actions/{actionId}`
   or `/api/local/apps/{appId}/search`.
2. Those routes are no longer Host-owned product routes; app-owned mounted API
   proxying remains available through `/api/local/apps/{appId}/{path}`.
3. Worker Web no longer renders generic Soul App workbench action/search
   controls in the Host toolbar.
4. micro-app route mounting and child route communication keep working.
5. Active docs/skills describe micro-app as the replacement for the old
   hand-rolled Host workbench protocol bridge.

## Verification

- [x] `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- [x] `bun run --filter '@zonease/aiworker-api' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-shared' typecheck`
- [x] `bun run --filter '@zonease/aiworker-shared' test`
- [x] `bun run --filter '@zonease/aiworker-cli' typecheck`
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Resolution

Host no longer exposes generic workbench action/search product routes or renders
manifest-declared workbench controls in Worker Web. micro-app surfaces and the
mounted API proxy remain the active boundary for app-owned UI/API.
