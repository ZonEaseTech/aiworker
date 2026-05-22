# PLAN-395 Host workbench action/search bridge removal

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: REFACTOR-087

## Current State

Host mounted UI already uses `@micro-zoe/micro-app`, and app-owned HTML/API is
served from the mounted service through the Host proxy namespace. However,
`apps/api` still exposes Host-owned `/actions/:actionId` and `/search` routes
that translate manifest workbench descriptors into `/protocol/actions` and
`/protocol/search` calls. Worker Web still renders those descriptors as Host
toolbar buttons/search.

## Proposal

1. Replace the API positive action/search tests with negative route tests and
   one positive app-owned proxy test.
2. Remove daemon route registrations, OpenAPI entries and helper functions for
   Host-owned workbench action/search.
3. Remove Worker Web toolbar action/search rendering and API helpers so the
   Host shell only shows its own workspace search and mounted micro-app surface.
4. Remove micro-app child `action` event dispatching from Host Web; child apps
   should call their own app-owned API through the mounted proxy instead.
5. Update active docs/skills so the rationale is explicit: micro-app replaces
   the old hand-rolled Host workbench protocol bridge.

## Scope

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `apps/web/src/features/local-workspace/api/workspace-data.ts`
- `apps/web/src/features/local-workspace/api/types.ts`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `packages/shared/src/soul-app/micro-app.ts`
- `docs/architecture.md`
- `docs/soul-app-developer.md`
- `.agents/skills/aiworker-host-dev/SKILL.md`
- `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Non-Goals

- Do not remove manifest `ui.workbench` schema in this slice; keep it as
  deprecated metadata until official manifests/scaffold/runtime can be cleaned
  together.
- Do not remove mounted service `/protocol/actions` or `/protocol/search`
  handlers from official apps in this slice.
- Do not alter the micro-app route runtime, sandbox or route communication.
- Do not remove the generic mounted API proxy.

## Verification Plan

- API focused test and typecheck.
- Worker Web focused test and typecheck.
- Docs contract and whitespace checks.
- code-review-graph after code changes.

## Result

Implemented as proposed. Host action/search routes and OpenAPI entries were
removed, Worker Web stopped rendering app-declared workbench action/search
controls, the micro-app child event contract no longer includes Host-dispatched
actions, and active docs/skills now state that micro-app plus app-owned mounted
API paths replace the old hand-rolled Host workbench protocol bridge.

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
