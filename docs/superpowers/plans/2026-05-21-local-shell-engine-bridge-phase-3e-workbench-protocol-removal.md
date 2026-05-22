# Local Shell Engine Bridge Phase 3E Workbench Protocol Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Host-owned generic workbench action/search routing now that micro-app carries the app-owned UI/API boundary.

**Architecture:** Host keeps start, shell, locate, mount and bridge. Host resolves declared micro-app surfaces and proxies mounted app API paths, but it does not translate workbench descriptors into `/protocol/actions` or `/protocol/search` calls. Soul Apps own action/search UI inside the micro-app.

**Tech Stack:** Bun workspaces, TypeScript, Hono daemon API, React Worker Web, micro-app runtime.

---

## Task 1: API Route Removal

**Files:**
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `apps/api/src/modes/worker.ts`

- [x] **Step 1: Write failing API tests**

Replace positive Host action/search tests with assertions that:

- `/api/local/apps/:appId/actions/:actionId` is no longer a Host product API.
- `/api/local/apps/:appId/search` is no longer a Host product API.
- `/api/local/apps/:appId/protocol/actions` still proxies to the mounted app service as an app-owned API path.
- OpenAPI does not list the two removed product routes.

- [x] **Step 2: Verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: failures because the Host routes and OpenAPI entries still exist.

- [x] **Step 3: Remove Host routes and helpers**

Delete:

- `POST /api/local/apps/:appId/actions/:actionId`
- `GET /api/local/apps/:appId/search`
- `WorkbenchActionDescriptor`
- `MountedRequestScope`
- `resolveWorkbenchAction`
- `mountedScopeFromRecord`
- `optionalNonEmptyString`
- `mountedActionResponse`
- `mountedSearchResponse`

Keep `/api/local/apps/:appId/surfaces/:surfaceId` and
`/api/local/apps/:appId/:path{.+}`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
```

Expected: both pass.

## Task 2: Worker Web Stops Rendering Generic Workbench Controls

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/workspace-data.ts`
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `packages/shared/src/soul-app/micro-app.ts`

- [x] **Step 1: Write failing Web test updates**

Update Worker Studio tests so they expect:

- Host toolbar does not render app-declared "New profile", "Configure HR" or release action buttons.
- Host toolbar search remains the Host workspace search input, not app-declared workbench search.
- micro-app child `action` events do not call `/api/local/apps/:appId/actions/:actionId`.

- [x] **Step 2: Verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: failures while Worker Web still renders and calls generic workbench controls.

- [x] **Step 3: Remove Web generic workbench control code**

Delete the Worker Studio state, effects, render helpers and API helpers for
generic Soul App workbench action/search. Remove the micro-app child event
`action` variant from the shared type and normalization path if no other live
code needs it.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: both pass.

## Task 3: Active Guidance Sync And Closeout

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`
- Modify: `.agents/skills/aiworker-host-dev/SKILL.md`
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`
- Modify: `docs/task/REFACTOR-087.md`
- Modify: `docs/plan/PLAN-395.md`
- Modify: this plan

- [x] **Step 1: Sync active guidance**

State that micro-app is the active mounted UI/API boundary and replaces the old
Host-owned workbench action/search protocol bridge. Historical plans remain
audit-only.

- [x] **Step 2: Run final gates**

Run:

```bash
bun run docs:check
git diff --check
bun run crg:update
bun run crg:review
```

- [x] **Step 3: Mark tracking complete and commit**

Record verification, mark REFACTOR-087/PLAN-395 complete, and commit:

```bash
git commit -m "refactor: 移除 Host workbench 协议桥"
```
