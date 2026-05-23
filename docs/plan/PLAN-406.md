# PLAN-406 Restore interactive universal workbench

- **status**: completed
- **createdAt**: 2026-05-23
- **approvedAt**: 2026-05-23
- **completedAt**: 2026-05-23
- **relatedTask**: BUG-150

## Context

Systematic debugging found that the universal workbench itself regressed into a
static mounted placeholder.

The intended design is documented in
`docs/superpowers/specs/2026-05-22-universal-soul-workbench-design.md`:

- `packages/soul-app-workbench` owns `UniversalWorkbenchApp`, workspace/session
  tree, session chat, timeline/detail UI and the shared composer flow.
- `/micro-app/workbench/universal` should return an HTML page that hosts
  `UniversalWorkbenchApp`.
- The universal client should call thin mounted session API paths, which proxy
  to Host session and engine bridge routes without adding Soul domain semantics.

Current code has all the pieces partially present but disconnected:

- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
  exists and composes `WorkspaceSessionTree`, `SessionChatView`,
  `SessionDetail` and shared `SessionComposer`.
- `packages/soul-app-runtime/src/universal-workbench-html.ts` now returns a
  static HTML card and explicitly avoids importing
  `@zonease/aiworker-soul-app-workbench`.
- `packages/soul-app-runtime/src/index.ts` includes a thin
  `mountSessionApiProxy(...)`, but official mounted services do not call it.
- Official app asset serving only builds/serves HR's `hr-home-client.js`; there
  is no universal workbench browser client asset.
- `packages/soul-app-runtime/src/index.test.ts` currently asserts the static
  shell and `not.toContain('@zonease/aiworker-soul-app-workbench')`, so tests
  lock in the placeholder instead of the intended interactive surface.

Commit history explains how this happened:

- `cfb4a6e8` added the real `UniversalWorkbenchApp`.
- `de87ff37` added the universal HTML helper, but left `root.render(...)` as a
  placeholder comment.
- `6a106397` correctly removed Host Web's direct universal renderer to satisfy
  the Host/Soul boundary. That exposed the unfinished mounted helper as the
  product surface.

## Proposal

1. Add failing tests first:
   - runtime HTML includes a universal client script and no static placeholder
     card;
   - an official mounted service serves the universal client asset;
   - universal API proxy paths are wired or explicitly tested through the
     mounted service;
   - Host Web still renders `universal-workbench` only through `<micro-app>`.
2. Add a browser client entry for the universal workbench that mounts
   `UniversalWorkbenchApp` inside the micro-app document.
3. Move data fetching/session mutation into the mounted universal client, using
   the app's route prefix and thin session proxy paths.
4. Wire official mounted services to:
   - serve `/micro-app/workbench/universal` with the real HTML shell;
   - serve the universal client asset;
   - call `mountSessionApiProxy(...)` for the universal session endpoints.
5. Keep Host Web unchanged except for tests if needed. The Host remains a
   generic micro-app container and does not import the universal workbench React
   package.
6. Update runtime/official app tests and changelog with the regression root
   cause.

## Component Library Preflight

Relevant existing shared primitives are already in `packages/ui` and consumed
by `packages/soul-app-workbench`:

- `SessionComposer`
- `Button`
- `Empty`
- timeline/detail primitives already used by `SessionChatView` and
  `SessionDetail`

This slice should reuse those existing primitives through the shared
`UniversalWorkbenchApp`; it should not introduce a new app-local composer,
custom focus management or Host-owned UI controls.

## Scope

- `packages/soul-app-workbench`
- `packages/soul-app-runtime`
- official mounted service asset/proxy wiring in `apps/aiworker-hr`,
  `apps/aiworker-qa` and `apps/aiworker-custom`
- focused runtime, official app and Worker Web boundary tests
- `docs/task/BUG-150.md`
- `docs/plan/PLAN-406.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Risks

- Bundling `UniversalWorkbenchApp` for browser use must keep package boundaries
  clean. Host Web must not import the workbench package; mounted app bundles may
  include it as app-owned UI.
- `mountSessionApiProxy(...)` currently covers only session list/create. The
  shared workbench may need additional thin proxy paths for turns/events before
  the composer/chat flow is complete.
- Official apps have different asset pipelines. A shared helper is preferable
  to duplicating fragile asset maps in each app, but the first implementation
  must stay narrow.
- `ui:check` may report unrelated historical findings; any changed UI must
  remain shadcn-first.

## Alternatives

- Restore Host Web's direct `UniversalWorkbenchApp` branch. Rejected because it
  violates the active Host/Soul boundary fixed by REFACTOR-096.
- Leave universal as a bridge-proof static page and make each domain route do
  all work. Rejected because it contradicts the accepted universal workbench
  design and leaves QA/custom first screens unusable.
- Build a new universal UI per official app. Rejected because the shared
  package already exists and is the intended ownership boundary.

## Verification Plan

- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- focused official app tests for HR, QA and Custom mounted services
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run ui:check`
- Browser smoke on `/micro-app/workbench/universal` through Host to confirm
  composer-centered UI is visible and the first mounted app is not the static
  placeholder.
- `git diff --check`
- `bun run crg:update && bun run crg:review`

## Annotations

- 2026-05-23: Initial investigation was incorrectly framed as HR route priority.
  User clarified the real issue: universal workbench was already designed as an
  interactive composer-centered workbench. This plan supersedes that wrong
  framing.
- 2026-05-23: User approved implementation.
- 2026-05-23: Implemented the mounted universal workbench client, official app
  asset/proxy wiring, focused tests and browser smoke. A follow-up robustness
  fix keeps a successfully created session visible even if a background list
  refresh sees a transient mounted proxy timeout.
