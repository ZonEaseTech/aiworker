# micro-app Host/Soul Mounted Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Host-mounted Soul App UI renderer with `@micro-zoe/micro-app`, keeping Host generic and Soul App UI app-owned.

**Architecture:** Shared manifest schema recognizes `micro-app` mounted surfaces. The daemon resolves a declared micro-app surface into a mount payload after grants and mounted-service readiness. Host Web renders a generic `<micro-app>` element and passes narrow mount context; HR/QA serve their UI from `/micro-app/*` mounted routes.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vite 8, `@micro-zoe/micro-app`, Hono local daemon, zod manifest schema, Vitest/happy-dom.

---

### Task 1: Shared Manifest Contract

**Files:**
- Modify: `packages/shared/src/soul-app/manifest.ts`
- Modify: `packages/shared/src/soul-app/manifest.test.ts`
- Modify: `packages/shared/src/soul-app/fixtures.ts`

- [ ] **Step 1: Write failing manifest tests**

Add assertions that `micro-app` is accepted only with `/micro-app/*` entries and that `sandboxed-frame` is no longer valid for new official mounted UI fixtures.

Run: `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`

Expected: FAIL because `micro-app` is not in `soulAppMountedSurfaceRendererSchema`.

- [ ] **Step 2: Implement schema change**

Change renderer enum from:

```ts
zod.enum(['host-descriptor', 'sandboxed-frame', 'trusted-module'])
```

to:

```ts
zod.enum(['host-descriptor', 'micro-app'])
```

Update `unsafeSurfaceMessage` so `micro-app` entries must start with `/micro-app/`, while `host-descriptor` continues to require `/surfaces/`.

- [ ] **Step 3: Update shared fixtures**

Change official HR/QA route and widget surface descriptors from:

```json
{ "entry": "/frames/...", "renderer": "sandboxed-frame" }
```

to:

```json
{ "entry": "/micro-app/...", "renderer": "micro-app" }
```

- [ ] **Step 4: Verify shared tests**

Run: `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`

Expected: PASS.

### Task 2: Daemon micro-app Surface Resolver

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: Write failing API tests**

Update mounted surface tests to expect:

```json
{
  "microApp": {
    "name": "aiworker-hr--hr-home",
    "url": "/api/local/apps/aiworker-hr/micro-app/routes/hr-home?theme=light",
    "data": {
      "appId": "aiworker-hr",
      "surfaceId": "hr-home",
      "theme": "light"
    }
  },
  "surface": { "renderer": "micro-app" }
}
```

Run: `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`

Expected: FAIL because the resolver still returns `frame`.

- [ ] **Step 2: Implement mount payload**

Replace the `sandboxed-frame` branch in `mountedSurfaceResponse` with a `micro-app` branch. It should build:

```ts
{
  microApp: {
    data: mountedMicroAppData(c, state, app, contribution, service),
    name: `${app.appId}--${contribution.id}`,
    url: `/api/local/apps/${app.appId}${contribution.surface.entry}${sourceUrl.search}`,
  },
  surface: publicMountedSurfaceContribution(contribution),
}
```

Call `mountedSoulAppServiceOrResponse` before returning so readiness and launch deduplication are still exercised.

- [ ] **Step 3: Keep host-descriptor proxy behavior intact**

Leave `host-descriptor` proxying unchanged so JSON descriptor surfaces still flow through the mounted service.

- [ ] **Step 4: Verify API tests**

Run: `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`

Expected: PASS.

### Task 3: Web micro-app Host

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add dependency**

Run: `bun add --filter '@zonease/aiworker-web' @micro-zoe/micro-app`

Expected: `apps/web/package.json` and `bun.lock` include `@micro-zoe/micro-app`.

- [ ] **Step 2: Write failing Web tests**

Update WorkerStudio mounted route tests to expect a `micro-app` element with:

```ts
expect(element.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
expect(element.getAttribute('name')).toBe('aiworker-hr--hr-home')
expect(element.getAttribute('url')).toContain('/api/local/apps/aiworker-hr/micro-app/routes/hr-home')
```

Also assert the element receives `.data.theme === 'light'`.

Run: `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`

Expected: FAIL because Host still renders an iframe.

- [ ] **Step 3: Initialize micro-app once**

Import `microApp` and start it once in Web code with sandbox and scoped CSS enabled:

```ts
microApp.start({
  'disable-sandbox': false,
  'disable-scopecss': false,
  iframe: false,
})
```

Guard the call so tests and hot reload do not repeatedly start it.

- [ ] **Step 4: Render generic micro-app surface**

Rename the local response type from frame-specific to micro-app-specific. Replace iframe rendering with:

```tsx
<micro-app
  ref={microAppRef}
  data-slot="soul-app-mounted-micro-app"
  name={surface.microApp.name}
  url={surface.microApp.url}
  destroy
/>
```

Assign `microAppRef.current.data = surface.microApp.data` in an effect after the element mounts.

- [ ] **Step 5: Verify Web tests**

Run: `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`

Expected: PASS.

### Task 4: HR And QA Mounted Services

**Files:**
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
- Modify: `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Modify: `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
- Modify: app tests that assert mounted route paths or renderers

- [ ] **Step 1: Write failing app tests**

Update HR/QA mounted adapter tests to request `/micro-app/...` entries and expect mounted HTML to carry `data-soul-app-id` and `data-surface-id`.

Run: `bun run --filter '@zonease/aiworker-hr' test && bun run --filter '@zonease/aiworker-qa' test`

Expected: FAIL because services still serve `/frames/...` paths.

- [ ] **Step 2: Migrate manifest entries**

Replace official app UI surface entries:

```json
"/frames/routes/hr-home"
"/frames/widgets/hr-people-widget"
"/frames/widgets/qa-release-widget"
```

with:

```json
"/micro-app/routes/hr-home"
"/micro-app/widgets/hr-people-widget"
"/micro-app/widgets/qa-release-widget"
```

Set all app-owned UI surface renderers to `micro-app`.

- [ ] **Step 3: Serve micro-app HTML routes**

Rename frame helper functions to micro-app helper names and route the mounted service to `/micro-app/*`. Keep the HTML self-owned by each app and keep style links through `/api/local/apps/:appId/styles.css`.

- [ ] **Step 4: Verify app tests**

Run: `bun run --filter '@zonease/aiworker-hr' test && bun run --filter '@zonease/aiworker-qa' test`

Expected: PASS.

### Task 5: Governance, Docs, And Completion Gates

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`
- Modify: `docs/changelog.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `scripts/check-soul-app-boundaries.ts`
- Modify: `scripts/check-web-ui-components.ts` only if it still treats iframe as the only mounted surface

- [ ] **Step 1: Update docs**

Document that Host-mounted UI uses micro-app as the standard runtime. Preserve the hard rule that Host does not import Soul App source or domain renderers.

- [ ] **Step 2: Run boundary and UI audits**

Run:

```bash
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun scripts/check-web-ui-components.ts --all --audit
```

Expected: both PASS.

- [ ] **Step 3: Run focused package verification**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
bun run docs:check
git diff --check
```

Expected: all PASS.

- [ ] **Step 4: Run app validation and smoke**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-hr' smoke
bun run --filter '@zonease/aiworker-qa' validate
bun run --filter '@zonease/aiworker-qa' smoke
```

Expected: all PASS.

- [ ] **Step 5: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: no blocking boundary or security findings.
