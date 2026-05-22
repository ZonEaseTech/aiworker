# Local Shell Engine Bridge Phase 3B Security Review Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove the Host-owned Soul App security-review enablement gate from core, daemon API, OpenAPI, and Worker Web Settings.

**Architecture:** Host remains a Local Shell + Engine Bridge for Soul Apps and no longer projects a generic permission/security review before enablement. Soul App manifest permissions and connector descriptors stay as install/route metadata for this slice; broker routes are deliberately left for a later, separately testable removal.

**Tech Stack:** Bun workspaces, TypeScript, Hono daemon API, React/Vitest Worker Web tests, core registry tests.

---

## File Structure

- Delete `packages/core/src/soul-app/security-review.ts`
  - Removes the pure Host-owned security-review projection.
- Modify `packages/core/src/host/runtime.ts`
  - Removes `HostRuntime.reviewAppSecurity()`.
- Modify `packages/core/src/index.ts`
  - Stops exporting security-review helpers and types.
- Modify `packages/core/src/soul-app/registry.test.ts`
  - Removes the security-review projection test.
- Modify `apps/api/src/modes/worker.ts`
  - Removes `GET /api/local/apps/:appId/security-review`, removes review fields from enable/disable responses, and removes the OpenAPI path.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Replaces security-review assertions with "route is gone and enable works directly" assertions, and checks OpenAPI does not list the route.
- Modify `apps/web/src/features/local-workspace/api/workspace-data.ts`
  - Removes the Web security-review API helper.
- Modify `apps/web/src/features/local-workspace/api/types.ts`
  - Removes `LocalSoulAppSecurityReview` and the optional lifecycle `review` field.
- Modify `apps/web/src/features/local-workspace/api/index.ts`
  - Stops re-exporting `reviewSoulAppSecurity`.
- Modify `apps/web/src/features/settings/components/settings-dialog.tsx`
  - Enables/disable apps directly through lifecycle endpoints and renames the app metadata group away from "security review".
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Removes mocked `/security-review`, removes the blocking test, and updates Settings assertions to the new metadata label.

## Task 1: Core Security-Review Projection Removal

**Files:**
- Delete: `packages/core/src/soul-app/security-review.ts`
- Modify: `packages/core/src/host/runtime.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/soul-app/registry.test.ts`

- [x] **Step 1: Remove the core projection test**

Remove the `reviewSoulAppSecurity` import and delete the test named:

```ts
it('projects a security review from manifest permissions, connectors, and descriptors before enablement', async () => {
  // deleted
})
```

- [x] **Step 2: Run the focused core test and verify the old import fails if production code is untouched**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
```

Expected before implementation: TypeScript/runtime failure from stale `reviewSoulAppSecurity` exports or imports if any remain.

- [x] **Step 3: Remove core production exports and runtime method**

In `packages/core/src/host/runtime.ts`, remove:

```ts
import type { SoulAppSecurityReview } from '../soul-app/security-review'
import { reviewSoulAppSecurity } from '../soul-app/security-review'
```

Delete:

```ts
reviewAppSecurity(appId: string): SoulAppSecurityReview {
  const app = getHostedSoulApp(appId)
  if (!app)
    throw new Error(`Soul App not found: ${appId}`)
  return reviewSoulAppSecurity(app, this.registryContext())
}
```

In `packages/core/src/index.ts`, delete the export block for `./soul-app/security-review`. Delete `packages/core/src/soul-app/security-review.ts`.

- [x] **Step 4: Verify core passes**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts
bun run --filter '@zonease/aiworker-core' typecheck
```

Expected: both commands pass.

## Task 2: Daemon API Route and OpenAPI Removal

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [x] **Step 1: Rewrite API lifecycle test first**

Replace the security-review API test with:

```ts
it('enables Soul Apps without a Host-owned security review preflight', async () => {
  const target = await app()
  expect((await target.request(`/api/local/apps/${QA_APP_ID}/disable`, { method: 'POST' })).status).toBe(200)

  const reviewRes = await target.request(`/api/local/apps/${QA_APP_ID}/security-review`)
  expect(reviewRes.status).toBe(409)
  expect(await reviewRes.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })

  const enableRes = await target.request(`/api/local/apps/${QA_APP_ID}/enable`, { method: 'POST' })
  expect(enableRes.status).toBe(200)
  const enableBody = await enableRes.json() as { app: { status: string }, review?: unknown }
  expect(enableBody.app.status).toBe('enabled')
  expect(enableBody).not.toHaveProperty('review')
})
```

Change the OpenAPI assertion to:

```ts
expect(paths).not.toContain('/api/local/apps/{appId}/security-review')
```

- [x] **Step 2: Run the focused API test and watch it fail**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected before implementation: the new test fails because `/security-review` still returns the Host review payload and enable returns `review`. The final route status is `409` because the generic mounted app proxy catches reserved app subpaths after the explicit Host route is removed.

- [x] **Step 3: Remove the route and lifecycle review fields**

In `apps/api/src/modes/worker.ts`, delete `GET /api/local/apps/:appId/security-review`. Change enable/disable responses to:

```ts
return c.json({ app, catalog: state.host.listCatalog() })
```

Remove the OpenAPI path registration for `/api/local/apps/{appId}/security-review`.

- [x] **Step 4: Verify API passes**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
```

Expected: both commands pass.

## Task 3: Worker Web Settings Direct Lifecycle

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/workspace-data.ts`
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Modify: `apps/web/src/features/local-workspace/api/index.ts`
- Modify: `apps/web/src/features/settings/components/settings-dialog.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Update Web tests first**

Remove the `/api/local/apps/aiworker-qa/security-review` mock branch. Remove the test named:

```ts
it('blocks Soul App enablement when Host security review cannot enable the app', async () => {
  // deleted
})
```

In the Settings metadata test, replace:

```ts
const qaSecurityReview = searchPermissionBadges[0]?.closest('[aria-label="AIWorker QA security review"]')
expect(qaSecurityReview?.getAttribute('data-slot')).toBe('item-group')
```

with:

```ts
const qaAppAccess = searchPermissionBadges[0]?.closest('[aria-label="AIWorker QA app access"]')
expect(qaAppAccess?.getAttribute('data-slot')).toBe('item-group')
```

- [x] **Step 2: Run the focused Web test and watch it fail**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected before implementation: failures from stale security-review calls and aria label mismatch.

- [x] **Step 3: Remove Web API helper and direct Settings lifecycle**

Remove `LocalSoulAppSecurityReview`, remove `review?: LocalSoulAppSecurityReview`, remove `reviewSoulAppSecurity()` and its re-export. In `settings-dialog.tsx`, remove `reviewSoulAppSecurity` import and change the enable branch to:

```ts
else {
  await enableSoulApp(app.appId)
}
```

Delete `securityReviewBlockMessage()` and rename the app metadata group aria label to:

```tsx
aria-label={`${app.manifest.name} app access`}
```

- [x] **Step 4: Verify Web passes**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: both commands pass.

## Task 4: Cross-Surface Cleanup and Review

**Files:**
- Any touched files from tasks above.

- [x] **Step 1: Search for stale security-review implementation references**

Run:

```bash
rg -n "reviewSoulAppSecurity|security-review|SoulAppSecurityReview|securityReviewBlockMessage|LocalSoulAppSecurityReview|reviewAppSecurity" packages/core/src apps/api/src apps/web/src
```

Expected: no matches in production code. Negative route assertions may remain in focused API tests.

- [x] **Step 2: Run repository hygiene checks**

Run:

```bash
bun run docs:check
git diff --check
```

Expected: both pass.

- [x] **Step 3: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: `crg:review` does not report blocking findings for the changed code.

- [x] **Step 4: Commit**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-05-21-local-shell-engine-bridge-phase-3b-security-review-removal.md packages/core/src/host/runtime.ts packages/core/src/index.ts packages/core/src/soul-app/registry.test.ts packages/core/src/soul-app/security-review.ts apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts apps/web/src/features/local-workspace/api/workspace-data.ts apps/web/src/features/local-workspace/api/types.ts apps/web/src/features/local-workspace/api/index.ts apps/web/src/features/settings/components/settings-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "refactor: 移除 Host 安全评审入口"
```

Expected: commit succeeds with only the scoped files above.

## Self-Review

- Spec coverage: removes the default Host security-review projection, route, OpenAPI entry, Settings gate and active tests. Leaves broker/provider routes for a later slice by design.
- Placeholder scan: no TBD/TODO/fill-in steps.
- Type consistency: `reviewSoulAppSecurity`, `SoulAppSecurityReview`, `LocalSoulAppSecurityReview`, `reviewAppSecurity`, and lifecycle `review` are removed consistently.
