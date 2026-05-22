# PLAN-403 WorkerStudio mounted-first Host shell boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 18:05
- **approvedAt**: 2026-05-21 18:05
- **relatedTask**: REFACTOR-095

## Current State

`docs/architecture.md` says Host owns start, shell, locate, mount and bridge.
It may keep workspace/session locators, but Soul Apps own domain UI, app-owned
workflow and product output meaning.

Current `WorkerStudio` still mixes the shell with old Host-owned product
surfaces:

- `WorkspaceSessionComposer` starts Host session turns from workspace routes.
- `WorkerSessionChat` and `SessionDetail` render Host-owned session chat,
  artifact preview and follow-up controls from session routes.
- The mounted Soul App route only renders when the route is not a session route.
- Stream, pending turn and artifact preview state make the shell own session
  product behavior instead of only locator/context handoff.

## Proposal

1. Make mounted Soul App surfaces the default worker/workspace/session product
   surface whenever the selected Soul App declares a `micro-app` route.
2. Pass `workerId`, optional `workspaceId`, optional `sessionId` and theme as
   narrow mount context only.
3. Remove Host-owned session composer/chat/detail imports, state and handlers
   from `WorkerStudio`.
4. Keep worker creation, worker switcher, worker configuration, settings and
   mounted micro-app lifecycle as Host Web shell behavior.
5. Replace the no-mounted-surface workspace/session UI with a generic Host
   locator fallback that does not create sessions, continue turns or interpret
   artifacts.

## Component Library Preflight

Checked existing shadcn-managed primitives already used by Worker Web:

- `Button`
- `Item`, `ItemGroup`, `ItemActions`, `ItemContent`, `ItemTitle`,
  `ItemDescription`
- `Card`, `CardContent`
- `Alert`, `AlertDescription`
- `Badge`

This slice removes Host-owned product UI and reuses existing primitives for the
generic fallback only. No new app-local UI primitive is required.

## Scope

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `apps/web/src/features/i18n/*`
- `apps/web/src/lib/micro-app-runtime.ts`
- `apps/web/src/types/micro-app.d.ts`
- `apps/web/src/worker/session-detail.tsx`
- PMA task/plan indexes and changelog

## Non-Goals

- Do not delete workspace/session storage or API routes in this slice.
- Do not remove app-owned mounted APIs.
- Do not reintroduce Host workbench actions/search, generic review/lesson,
  proposal, broker, governance or admission concepts.
- Do not create a new Host session abstraction or rename old session product
  logic into hooks.
- Do not redesign HR or QA mounted product UI.

## Risks

- Existing WorkerStudio tests are broad and historically assert Host-owned
  session UI. Tests must be updated to the mounted-first boundary, not kept by
  preserving old UI.
- Some non-mounted custom Soul App may no longer have a Host fallback composer.
  That is acceptable for this boundary slice; the generic fallback should point
  to mounted surface availability rather than starting Host sessions.
- The API/core legacy session adapter remains in place. This plan narrows the
  Web default path only and should not claim full backend removal.

## Verification Plan

- Update focused WorkerStudio tests for:
  - workspace route renders the mounted app when declared;
  - session route renders the mounted app with session context when declared;
  - no legacy Host session composer/chat/detail UI appears on mounted default
    paths.
- Run `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`.
- Run `bun run --filter '@zonease/aiworker-web' typecheck`.
- Run `bun run ui:check`.
- Run `git diff --check`.
- Run code-review-graph for production code changes.

## Progress

- 2026-05-21 18:05: Plan opened and approved in-session. Implementation starts
  from Web shell only; API/storage/core locator surfaces are intentionally left
  untouched.
- 2026-05-21 18:31: Completed. `WorkerStudio` now prefers app-owned
  `micro-app` routes across worker/workspace/session locators, passes
  worker/workspace/session ids as mount context only, and no longer renders the
  Host-owned workspace composer, session chat or session detail surface in the
  default path.

## Verification

- 2026-05-21 18:27: `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx` passed.
- 2026-05-21 18:28: `bun run --filter '@zonease/aiworker-web' typecheck` passed.
- 2026-05-21 18:29: `bun run --filter '@zonease/aiworker-web' lint` passed with warnings only.
- 2026-05-21 18:29: `bun run ui:check` passed.
- 2026-05-21 18:29: `git diff --check` passed.
- 2026-05-21 18:30: `bun run crg:update` passed.
- 2026-05-21 18:30: `bun run crg:review` passed; the brief report is scoped to the whole dirty worktree and still reports unrelated HR workbench test gaps.
