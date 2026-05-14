# Soul App Protocol Interaction Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make app-declared shell actions, app search, and app settings usable through generic Host protocol routes while keeping Soul Apps authoritative for domain behavior.

**Architecture:** Host exposes stable local API routes for declared app actions and search providers, validates lifecycle/declaration/scope, and forwards to mounted app protocol routes. HR/QA implement minimal mounted protocol handlers, and Worker Web calls only generic Host routes without app-specific branching.

**Tech Stack:** Bun workspaces, TypeScript, Hono local daemon, mounted Soul App service routes, React Worker Web, Zod-style manifest validation, bun:test, Vitest, PMA docs, code-review-graph.

---

## Scope Check

This plan implements `docs/superpowers/specs/2026-05-14-soul-app-protocol-interaction-closure-design.md`.

It is intentionally local-first:

- Do not add real Logto, S3, GCP, vault, remote control plane, marketplace, gateway, or fleet.
- Do not make Host create or persist HR people profiles or QA release gates.
- Do not add HR/QA-specific branches in Worker Web.
- Use mounted service protocol routes as the app-owned execution point:
  - `POST /protocol/actions`
  - `GET /protocol/search`

## File Structure

- Create `docs/task/FEAT-073.md`
  - PMA task for protocol interaction closure.
- Create `docs/plan/PLAN-305.md`
  - PMA plan record.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
  - Track and close this work.
- Modify `docs/soul-app-developer.md`, `docs/architecture.md`
  - Document action/search invocation as protocol-only surfaces.
- Modify `packages/shared/src/soul-app/protocol.ts`, `packages/shared/src/soul-app/index.ts`
  - Add `refresh?: boolean` to action results and keep search/action types exported.
- Modify `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`
  - Add Host local action/search endpoints and tests for declared/undeclared/disabled behavior.
- Modify `apps/aiworker-hr/src/host-mounted.ts`, `apps/aiworker-qa/src/host-mounted.ts`
  - Add mounted protocol handlers.
- Modify `apps/aiworker-hr/src/index.test.ts`, `apps/aiworker-qa/src/index.test.ts`
  - Cover action/search mounted service routes.
- Modify `apps/web/src/features/local-workspace/api/types.ts`, `apps/web/src/features/local-workspace/api/workspace-data.ts`
  - Add generic action/search client helpers and response types.
- Modify `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Enable shell action buttons and wire search through generic endpoints.
- Modify existing locale files only if new user-visible generic strings are needed.

### Task 1: PMA And Contract Tracking

**Files:**
- Create: `docs/task/FEAT-073.md`
- Create: `docs/plan/PLAN-305.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`

- [ ] **Step 1: Confirm next PMA ids**

Run:

```bash
tail -n 20 docs/task/index.md
tail -n 20 docs/plan/index.md
```

Expected: `FEAT-072` and `PLAN-304` are completed, so this slice uses `FEAT-073` and `PLAN-305`.

- [ ] **Step 2: Create FEAT-073**

Create `docs/task/FEAT-073.md`:

```markdown
# FEAT-073 Soul App protocol interaction closure

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 00:00
- **plan**: PLAN-305
- **relatesTo**: FEAT-072, packages/shared, apps/api, apps/web, apps/aiworker-hr, apps/aiworker-qa

## 背景

Host 已能发现并渲染 Soul App 声明的 shell descriptor，但 shell action 仍不可点击，
search/settings 也没有统一调用路径。下一步要把 Host mounted 体验从“可见”推进到
“可操作”，同时保持 Soul App 拥有领域语义。

## 目标

- Host 提供 generic action/search local API。
- Host 只调用 manifest 中声明的 action/search provider。
- HR/QA mounted service 实现最小协议 handler。
- Worker Web 通过 generic API 调用 shell action/search，不写 app-specific 分支。
- PMA、验证、browser smoke、code-review-graph 和 conventional commit 收口。

## 非目标

- 不接入真实 Logto。
- 不接入真实 S3/GCP/vault provider。
- 不实现跨 app 编排。
- 不让 Host 创建或持久化 HR profile / QA release gate 领域对象。

## 验收标准

- HR/QA shell primary action 可点击并返回 app-owned result。
- HR/QA shell search 通过 generic search endpoint 返回 app-owned summaries。
- settings intent 通过 app-declared action 调用。
- undeclared action/search 被 Host 拒绝。
- disabled app action/search 被 Host 拒绝。
- focused tests、root gates、browser smoke 和 code-review-graph 通过。
```

- [ ] **Step 3: Create PLAN-305**

Create `docs/plan/PLAN-305.md`:

```markdown
# PLAN-305 Soul App protocol interaction closure

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-14 00:00
- **relatedTask**: FEAT-073

## Decision

Implement the local-first protocol interaction closure defined in
`docs/superpowers/specs/2026-05-14-soul-app-protocol-interaction-closure-design.md`.

Host owns lifecycle, declaration validation, scope and mounted invocation. Soul App
owns protocol action/search behavior and result meaning.

## Implementation Slices

1. Shared protocol result typing.
2. Host action/search API routes.
3. HR/QA mounted protocol handlers.
4. Worker Web action/search UX.
5. PMA closeout and verification.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun run --filter '@zonease/aiworker-qa' smoke`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- browser smoke on `http://localhost:5173/`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
```

- [ ] **Step 4: Update indexes**

Append:

```markdown
- [-] [**FEAT-073 Soul App protocol interaction closure**](FEAT-073.md) `P0`
- [-] [**PLAN-305 Soul App protocol interaction closure**](PLAN-305.md) `2026-05-14`
```

Set headers:

```markdown
> Updated: 2026-05-14 (FEAT-073 in progress)
> Updated: 2026-05-14 (PLAN-305 in progress)
```

- [ ] **Step 5: Sync contract docs**

Add this rule to `docs/architecture.md` under `Protocol Surfaces`, and to
`docs/soul-app-developer.md` under `Design Boundary`:

```text
Host action/search/settings invocation must resolve a manifest-declared descriptor first.
Host must reject undeclared protocol actions or search providers, and must not infer app domain behavior from protocol names.
```

Run:

```bash
rg -n "Host action/search/settings invocation must resolve" docs/architecture.md docs/soul-app-developer.md
git diff --check -- docs/task/FEAT-073.md docs/plan/PLAN-305.md docs/task/index.md docs/plan/index.md docs/architecture.md docs/soul-app-developer.md
```

Expected: both docs contain the rule and diff check passes.

### Task 2: Shared Protocol Result Types

**Files:**
- Modify: `packages/shared/src/soul-app/protocol.ts`
- Modify: `packages/shared/src/soul-app/index.ts`

- [ ] **Step 1: Extend action result type**

In `packages/shared/src/soul-app/protocol.ts`, update:

```ts
export interface SoulAppProtocolActionResult {
  message?: string
  ok: boolean
  redirectTo?: string
  refresh?: boolean
}
```

Keep `refresh` generic. It means “Host/Web may refresh app-visible data”, not
“a domain object changed”.

- [ ] **Step 2: Confirm barrel exports**

In `packages/shared/src/soul-app/index.ts`, verify these are exported:

```ts
export type {
  SoulAppProtocolAction,
  SoulAppProtocolActionResult,
  SoulAppProtocolViewSummary,
  SoulAppSearchRequest,
  SoulAppSearchResult,
} from './protocol'
```

Add only missing exports.

- [ ] **Step 3: Run shared gate**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' typecheck
```

Expected: typecheck passes.

### Task 3: Host Action/Search API

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: Add failing API tests for declared invocation**

In `apps/api/src/modes/worker.local.test.ts`, add a test near mounted surface service tests:

```ts
it('invokes declared Soul App shell actions through a generic Host endpoint', async () => {
  const target = await app()
  const servicePath = join(dir, 'mounted-action-service.ts')
  writeFileSync(servicePath, `
const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return Response.json({ status: 'ok' })
    if (url.pathname === '/protocol/actions') {
      return request.json().then(body => Response.json({
        ok: true,
        protocolAction: body.protocolAction,
        message: 'App-owned action result',
        refresh: true,
        redirectTo: '/hr/people',
      }))
    }
    if (url.pathname === '/protocol/search') {
      return Response.json({ providerId: url.searchParams.get('providerId'), items: [] })
    }
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)

  await target.request('/api/local/apps/install', {
    method: 'POST',
    body: JSON.stringify({
      manifest: {
        ...hrSoulAppManifest,
        api: {
          ...hrSoulAppManifest.api,
          localService: {
            command: ['bun', servicePath],
            healthPath: '/health',
          },
        },
      },
    }),
    headers: { 'content-type': 'application/json' },
  })
  expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

  const res = await target.request('/api/local/apps/aiworker-hr/actions/create-people-profile', {
    method: 'POST',
    body: JSON.stringify({ input: { source: 'test' } }),
    headers: { 'content-type': 'application/json' },
  })

  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    action: {
      id: 'create-people-profile',
      protocolAction: 'peopleProfiles.create',
    },
    result: {
      message: 'App-owned action result',
      ok: true,
      redirectTo: '/hr/people',
      refresh: true,
    },
  })
})
```

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected before implementation: route returns 404.

- [ ] **Step 2: Add failing tests for undeclared and disabled behavior**

Add:

```ts
it('rejects undeclared Soul App shell actions and search providers', async () => {
  const target = await app()
  await target.request('/api/local/apps/install', {
    method: 'POST',
    body: JSON.stringify({ manifest: hrSoulAppManifest }),
    headers: { 'content-type': 'application/json' },
  })
  await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })

  const actionRes = await target.request('/api/local/apps/aiworker-hr/actions/delete-all-people', { method: 'POST' })
  expect(actionRes.status).toBe(404)
  expect(await actionRes.json()).toMatchObject({ error: { code: 'SOUL_APP_ACTION_NOT_DECLARED' } })

  const searchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=people.internal&q=ada')
  expect(searchRes.status).toBe(404)
  expect(await searchRes.json()).toMatchObject({ error: { code: 'SOUL_APP_SEARCH_NOT_DECLARED' } })
})

it('rejects action and search invocation for disabled Soul Apps', async () => {
  const target = await app()
  await target.request('/api/local/apps/install', {
    method: 'POST',
    body: JSON.stringify({ manifest: hrSoulAppManifest }),
    headers: { 'content-type': 'application/json' },
  })

  const actionRes = await target.request('/api/local/apps/aiworker-hr/actions/create-people-profile', { method: 'POST' })
  expect(actionRes.status).toBe(409)
  expect(await actionRes.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })

  const searchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&q=ada')
  expect(searchRes.status).toBe(409)
  expect(await searchRes.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })
})
```

- [ ] **Step 3: Implement Host API routes**

In `apps/api/src/modes/worker.ts`, add routes after broker routes and before
`/api/local/apps/:appId/surfaces/:surfaceId`:

```ts
  app.post('/api/local/apps/:appId/actions/:actionId', async (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return c.json({ error: { code: 'SOUL_APP_NOT_FOUND', message: `Soul App was not found: ${c.req.param('appId')}` } }, 404)
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    const action = resolveShellAction(app, c.req.param('actionId'))
    if (!action)
      return c.json({ error: { code: 'SOUL_APP_ACTION_NOT_DECLARED', message: `Soul App action is not declared: ${c.req.param('actionId')}` } }, 404)
    const body = await readJson<{ input?: Record<string, unknown> }>(c.req)
    return mountedActionResponse(c, state, app, action, isRecord(body.input) ? body.input : {})
  })

  app.get('/api/local/apps/:appId/search', async (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return c.json({ error: { code: 'SOUL_APP_NOT_FOUND', message: `Soul App was not found: ${c.req.param('appId')}` } }, 404)
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    const providerId = c.req.query('providerId') ?? ''
    const search = app.manifest.ui.shell?.search
    if (!search || search.protocolProvider !== providerId)
      return c.json({ error: { code: 'SOUL_APP_SEARCH_NOT_DECLARED', message: `Soul App search provider is not declared: ${providerId}` } }, 404)
    return mountedSearchResponse(c, state, app, search)
  })
```

Add helpers near `mountedSurfaceResponse`:

```ts
type ShellActionDescriptor = NonNullable<HostedSoulApp['manifest']['ui']['shell']>['primaryAction']

function resolveShellAction(app: HostedSoulApp, actionId: string): ShellActionDescriptor | null {
  const shell = app.manifest.ui.shell
  const candidates = [
    shell?.primaryAction,
    ...(shell?.actions ?? []),
    shell?.settings ? { ...shell.settings, slot: 'settings' as const } : undefined,
  ].filter(Boolean) as ShellActionDescriptor[]
  return candidates.find(action => action.id === actionId) ?? null
}

async function mountedActionResponse(
  c: Context,
  state: LocalDaemonState,
  app: HostedSoulApp,
  action: ShellActionDescriptor,
  input: Record<string, unknown>,
): Promise<Response> {
  const service = await mountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service
  const headers = mountedProxyHeaders(c.req.raw.headers)
  applyMountedProxyContextHeaders(headers, c, state, app, service)
  headers.set('content-type', 'application/json')
  const res = await fetch(new URL('/protocol/actions', service.baseUrl), {
    body: JSON.stringify({
      actionId: action.id,
      input,
      protocolAction: action.protocolAction,
    }),
    headers,
    method: 'POST',
  })
  if (!res.ok)
    return c.json({ error: { code: 'SOUL_APP_PROTOCOL_ERROR', message: await res.text() } }, 502)
  const result = await res.json() as Record<string, unknown>
  return c.json({
    action: {
      id: action.id,
      protocolAction: action.protocolAction,
    },
    result,
  })
}

async function mountedSearchResponse(
  c: Context,
  state: LocalDaemonState,
  app: HostedSoulApp,
  search: NonNullable<HostedSoulApp['manifest']['ui']['shell']>['search'],
): Promise<Response> {
  const service = await mountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service
  const sourceUrl = new URL(c.req.url)
  const targetUrl = new URL('/protocol/search', service.baseUrl)
  targetUrl.searchParams.set('providerId', search.protocolProvider)
  targetUrl.searchParams.set('query', sourceUrl.searchParams.get('query') ?? sourceUrl.searchParams.get('q') ?? '')
  targetUrl.searchParams.set('limit', sourceUrl.searchParams.get('limit') ?? '8')
  const headers = mountedProxyHeaders(c.req.raw.headers)
  applyMountedProxyContextHeaders(headers, c, state, app, service)
  const res = await fetch(targetUrl, { headers, method: 'GET' })
  if (!res.ok)
    return c.json({ error: { code: 'SOUL_APP_PROTOCOL_ERROR', message: await res.text() } }, 502)
  return c.json(await res.json())
}
```

- [ ] **Step 4: Add OpenAPI path entries**

In `registerLocalOpenApiPaths`, add:

```ts
    { method: 'post', path: '/api/local/apps/{appId}/actions/{actionId}', summary: 'Invoke a declared Soul App shell action', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/apps/{appId}/search', summary: 'Search through a declared Soul App provider', tags: ['apps'] },
```

- [ ] **Step 5: Run API gates**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
```

Expected: tests and typecheck pass.

### Task 4: HR And QA Mounted Protocol Handlers

**Files:**
- Modify: `apps/aiworker-hr/src/host-mounted.ts`
- Modify: `apps/aiworker-qa/src/host-mounted.ts`
- Modify: `apps/aiworker-hr/src/index.test.ts`
- Modify: `apps/aiworker-qa/src/index.test.ts`

- [ ] **Step 1: Add HR mounted tests**

In `apps/aiworker-hr/src/index.test.ts`, extend the mounted service test:

```ts
const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
  method: 'POST',
  body: JSON.stringify({ protocolAction: 'peopleProfiles.create', input: {} }),
  headers: {
    'content-type': 'application/json',
    'x-aiworker-mount-token': 'test-hr-mounted-token',
  },
})
expect(actionRes.status).toBe(200)
expect(await actionRes.json()).toMatchObject({
  message: 'People profile draft opened by HR app.',
  ok: true,
  redirectTo: '/hr/people',
  refresh: true,
})

const searchRes = await fetch(`${baseUrl}/protocol/search?providerId=peopleProfiles.search&query=ada&limit=2`, {
  headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
})
expect(searchRes.status).toBe(200)
expect(await searchRes.json()).toMatchObject({
  providerId: 'peopleProfiles.search',
  items: [expect.objectContaining({
    appId: 'aiworker-hr',
    authority: 'soul-app',
    kind: 'people-profile',
  })],
})
```

Insert these assertions inside the existing mounted service token test, after
the frame surface assertion. The test already defines `baseUrl` and uses
`test-hr-mounted-token`, so use that token value for `x-aiworker-mount-token`.

- [ ] **Step 2: Add QA mounted tests**

In `apps/aiworker-qa/src/index.test.ts`, add equivalent assertions:

```ts
const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
  method: 'POST',
  body: JSON.stringify({ protocolAction: 'releaseGates.create', input: {} }),
  headers: {
    'content-type': 'application/json',
    'x-aiworker-mount-token': 'test-qa-mounted-token',
  },
})
expect(actionRes.status).toBe(200)
expect(await actionRes.json()).toMatchObject({
  message: 'Release gate draft opened by QA app.',
  ok: true,
  redirectTo: '/qa/release',
  refresh: true,
})

const searchRes = await fetch(`${baseUrl}/protocol/search?providerId=releases.search&query=release&limit=2`, {
  headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
})
expect(searchRes.status).toBe(200)
expect(await searchRes.json()).toMatchObject({
  providerId: 'releases.search',
  items: [expect.objectContaining({
    appId: 'aiworker-qa',
    authority: 'soul-app',
    kind: 'release-gate',
  })],
})
```

- [ ] **Step 3: Implement HR handlers**

In `apps/aiworker-hr/src/host-mounted.ts`, before the broker route:

```ts
      if (url.pathname === '/protocol/actions') {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>
        return Response.json(hrProtocolAction(String(body.protocolAction ?? '')))
      }
      if (url.pathname === '/protocol/search') {
        return Response.json(hrProtocolSearch(url))
      }
```

Add helpers:

```ts
function hrProtocolAction(protocolAction: string) {
  if (protocolAction === 'peopleProfiles.create') {
    return {
      message: 'People profile draft opened by HR app.',
      ok: true,
      redirectTo: '/hr/people',
      refresh: true,
    }
  }
  if (protocolAction === 'people.refresh') {
    return {
      message: 'People data refreshed by HR app.',
      ok: true,
      refresh: true,
    }
  }
  if (protocolAction === 'drawers.evidence.toggle') {
    return {
      message: 'Evidence drawer intent emitted by HR app.',
      ok: true,
    }
  }
  if (protocolAction === 'settings.open') {
    return {
      message: 'HR settings are owned by the HR app.',
      ok: true,
    }
  }
  return {
    message: `Unknown HR protocol action: ${protocolAction}`,
    ok: false,
  }
}

function hrProtocolSearch(url: URL) {
  const query = url.searchParams.get('query') ?? ''
  return {
    items: [{
      appId: hrSoulAppManifest.id,
      authority: 'soul-app' as const,
      id: 'people-profile-draft',
      kind: 'people-profile',
      openAction: {
        id: 'create-people-profile',
        input: { query },
      },
      status: 'draft',
      summary: query ? `HR app-owned profile match for ${query}` : 'Open HR profile workspace',
      title: query ? `People profile: ${query}` : 'People profile draft',
    }],
    providerId: 'peopleProfiles.search',
  }
}
```

- [ ] **Step 4: Implement QA handlers**

In `apps/aiworker-qa/src/host-mounted.ts`, add the same routes with QA helpers:

```ts
function qaProtocolAction(protocolAction: string) {
  if (protocolAction === 'releaseGates.create') {
    return {
      message: 'Release gate draft opened by QA app.',
      ok: true,
      redirectTo: '/qa/release',
      refresh: true,
    }
  }
  if (protocolAction === 'release.refresh') {
    return {
      message: 'Release data refreshed by QA app.',
      ok: true,
      refresh: true,
    }
  }
  if (protocolAction === 'settings.open') {
    return {
      message: 'QA settings are owned by the QA app.',
      ok: true,
    }
  }
  return {
    message: `Unknown QA protocol action: ${protocolAction}`,
    ok: false,
  }
}

function qaProtocolSearch(url: URL) {
  const query = url.searchParams.get('query') ?? ''
  return {
    items: [{
      appId: qaSoulAppManifest.id,
      authority: 'soul-app' as const,
      id: 'release-gate-draft',
      kind: 'release-gate',
      openAction: {
        id: 'create-release-gate',
        input: { query },
      },
      status: 'draft',
      summary: query ? `QA app-owned release match for ${query}` : 'Open QA release gate workspace',
      title: query ? `Release gate: ${query}` : 'Release gate draft',
    }],
    providerId: 'releases.search',
  }
}
```

- [ ] **Step 5: Run app gates**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-qa' typecheck
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-qa' validate
bun run --filter '@zonease/aiworker-hr' smoke
bun run --filter '@zonease/aiworker-qa' smoke
```

Expected: all pass.

### Task 5: Worker Web Generic Action/Search UX

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Modify: `apps/web/src/features/local-workspace/api/workspace-data.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify locale files only if needed.

- [ ] **Step 1: Add Web API types**

In `apps/web/src/features/local-workspace/api/types.ts`, add:

```ts
export interface LocalSoulAppActionResult {
  message?: string
  ok: boolean
  redirectTo?: string
  refresh?: boolean
}

export interface LocalSoulAppActionResponse {
  action: {
    id: string
    protocolAction: string
  }
  result: LocalSoulAppActionResult
}

export interface LocalSoulAppSearchResultItem {
  appId: string
  authority: 'soul-app'
  id: string
  kind: string
  openAction?: {
    id: string
    input?: Record<string, unknown>
  }
  status?: string
  summary?: string
  title: string
}

export interface LocalSoulAppSearchResponse {
  items: LocalSoulAppSearchResultItem[]
  providerId: string
}
```

- [ ] **Step 2: Add Web client helpers**

In `apps/web/src/features/local-workspace/api/workspace-data.ts`, add:

```ts
import type {
  LocalSoulAppActionResponse,
  LocalSoulAppSearchResponse,
} from './types'
```

Add functions:

```ts
export async function invokeSoulAppAction(appId: string, actionId: string, input: Record<string, unknown> = {}): Promise<LocalSoulAppActionResponse> {
  return localJson<LocalSoulAppActionResponse>(`/api/local/apps/${appId}/actions/${actionId}`, {
    body: JSON.stringify({ input }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

export async function searchSoulApp(appId: string, providerId: string, query: string, limit = 8): Promise<LocalSoulAppSearchResponse> {
  const params = new URLSearchParams({ limit: String(limit), providerId, query })
  return localJson<LocalSoulAppSearchResponse>(`/api/local/apps/${appId}/search?${params}`)
}
```

Call `localJson(path, init)` directly; it accepts `RequestInit` and merges JSON
headers for request bodies.

- [ ] **Step 3: Add failing Web tests**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, update the mock
`fetch`:

```ts
    if (url.endsWith('/api/local/apps/aiworker-hr/actions/create-people-profile')) {
      return json({
        action: { id: 'create-people-profile', protocolAction: 'peopleProfiles.create' },
        result: { message: 'People profile draft opened by HR app.', ok: true, refresh: true },
      })
    }
    if (url.includes('/api/local/apps/aiworker-hr/search?')) {
      return json({
        items: [{
          appId: 'aiworker-hr',
          authority: 'soul-app',
          id: 'people-profile-draft',
          kind: 'people-profile',
          summary: 'HR app-owned profile match for ada',
          title: 'People profile: ada',
        }],
        providerId: 'peopleProfiles.search',
      })
    }
```

Add assertions to the shell descriptor test:

```ts
const profileAction = await screen.findByRole('button', { name: 'New people profile' })
expect(profileAction).not.toHaveAttribute('disabled')
fireEvent.click(profileAction)
await waitFor(() => {
  expect(fetch).toHaveBeenCalledWith(
    '/api/local/apps/aiworker-hr/actions/create-people-profile',
    expect.objectContaining({ method: 'POST' }),
  )
})
expect(await screen.findByText('People profile draft opened by HR app.')).toBeTruthy()

const search = screen.getByPlaceholderText('Search people profiles')
fireEvent.change(search, { target: { value: 'ada' } })
await waitFor(() => {
  expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada&limit=8')
})
expect(await screen.findByText('People profile: ada')).toBeTruthy()
expect(screen.getByText('HR app-owned profile match for ada')).toBeTruthy()
```

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected before implementation: disabled button or missing fetch helper causes failure.

- [ ] **Step 4: Implement Worker Web action state**

In `apps/web/src/worker/worker-studio.tsx`, import:

```ts
import { invokeSoulAppAction, searchSoulApp } from '../features/local-workspace/api'
```

Add state:

```ts
const [shellActionMessage, setShellActionMessage] = useState<string | null>(null)
const [shellActionBusyId, setShellActionBusyId] = useState<string | null>(null)
const [shellSearchResults, setShellSearchResults] = useState<LocalSoulAppSearchResultItem[]>([])
```

Add handler:

```ts
async function invokeShellAction(action: LocalSoulAppShellAction) {
  if (!selectedSoulApp)
    return
  setShellActionBusyId(action.id)
  setShellActionMessage(null)
  try {
    const response = await invokeSoulAppAction(selectedSoulApp.appId, action.id)
    setShellActionMessage(response.result.message ?? null)
    if (response.result.refresh)
      await refresh()
  }
  catch {
    setShellActionMessage('Action unavailable')
  }
  finally {
    setShellActionBusyId(null)
  }
}
```

Use local types already available from `../features/local-workspace/api`.

- [ ] **Step 5: Enable shell buttons**

Replace disabled shell action buttons:

```tsx
<button
  className="shell-primary-action"
  disabled={shellActionBusyId === shellPrimaryAction.id}
  title={shellPrimaryAction.label}
  type="button"
  onClick={() => void invokeShellAction(shellPrimaryAction)}
>
  <Plus aria-hidden="true" size={14} />
  <span>{shellPrimaryAction.label}</span>
</button>
```

Render feedback near the toolbar:

```tsx
{shellActionMessage ? <small className="shell-action-message">{shellActionMessage}</small> : null}
```

- [ ] **Step 6: Implement shell search**

Add effect:

```ts
useEffect(() => {
  if (!selectedSoulApp || !shellSearch || !query.trim()) {
    setShellSearchResults([])
    return
  }
  let alive = true
  searchSoulApp(selectedSoulApp.appId, shellSearch.protocolProvider, query.trim())
    .then((result) => {
      if (alive)
        setShellSearchResults(result.items)
    })
    .catch(() => {
      if (alive)
        setShellSearchResults([])
    })
  return () => {
    alive = false
  }
}, [query, selectedSoulApp, shellSearch])
```

Render results below the search input:

```tsx
{shellSearchResults.length > 0
  ? (
      <div className="shell-search-results">
        {shellSearchResults.map(item => (
          <button key={item.id} type="button" className="shell-search-result">
            <strong>{item.title}</strong>
            {item.summary ? <small>{item.summary}</small> : null}
          </button>
        ))}
      </div>
    )
  : null}
```

- [ ] **Step 7: Add CSS**

In `apps/web/src/styles/workspace-cards.css`, add:

```css
.shell-action-message {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.shell-search-results {
  display: grid;
  gap: 4px;
  width: min(320px, 100%);
}

.shell-search-result {
  display: grid;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  padding: 8px;
  text-align: left;
}

.shell-search-result small {
  color: var(--text-muted);
}
```

- [ ] **Step 8: Run Web gates**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: tests and typecheck pass.

### Task 6: Closeout, Browser Smoke, And Commit

**Files:**
- Modify: `docs/task/FEAT-073.md`
- Modify: `docs/plan/PLAN-305.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run full gates**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' typecheck
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-qa' typecheck
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-qa' validate
bun run --filter '@zonease/aiworker-hr' smoke
bun run --filter '@zonease/aiworker-qa' smoke
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run typecheck
bun run lint
bun run test
bun run build
git diff --check
bun run crg:update
bun run crg:review
```

Expected: all commands exit 0. If code-review-graph reports static test gaps
while exiting 0, document which focused tests cover the changed behavior.

- [ ] **Step 2: Browser smoke**

Start Web dev server:

```bash
(cd /Users/ben/projects/aiworker && nohup bun run --filter @zonease/aiworker-web dev -- --host 127.0.0.1 --port 5173 > /tmp/aiworker-web-protocol-closure.log 2>&1 & echo $! > /tmp/aiworker-web-protocol-closure.pid)
```

Open `http://localhost:5173/` in the in-app browser. Verify:

- page loads;
- a shell primary action is visible and enabled;
- clicking it shows an app-owned success message;
- typing into app shell search shows an app-owned result summary.

Stop the server:

```bash
pid=$(cat /tmp/aiworker-web-protocol-closure.pid); kill "$pid"; rm -f /tmp/aiworker-web-protocol-closure.pid
```

- [ ] **Step 3: Close PMA docs**

Set:

```markdown
- **status**: completed
```

in `docs/task/FEAT-073.md` and `docs/plan/PLAN-305.md`.

Append verification command list to `FEAT-073.md`. Add `Result` section to
`PLAN-305.md`.

Update indexes:

```markdown
- [x] [**FEAT-073 Soul App protocol interaction closure**](FEAT-073.md) `P0`
- [x] [**PLAN-305 Soul App protocol interaction closure**](PLAN-305.md) `2026-05-14`
```

- [ ] **Step 4: Add changelog entry**

Add after `# AIWorker Changelog`:

```markdown
## 2026-05-14 00:00 [completed] FEAT-073 / PLAN-305 — Soul App protocol interaction closure

Closed the local-first Host / Soul App interaction loop by making app-declared
shell actions and search providers usable through generic Host protocol routes.

- Added generic Host action and search routes for declared Soul App shell descriptors.
- Implemented HR/QA mounted protocol action and search handlers.
- Enabled Worker Web shell actions and app-owned shell search without app-specific branches.
- Kept Host as lifecycle, declaration, scope and mounted invocation owner while Soul Apps own domain result meaning.

Verification passed: focused shared/API/Web/HR/QA tests and typechecks, HR/QA
validate and smoke, root typecheck/lint/test/build, browser smoke, `git diff
--check`, and code-review-graph.
```

- [ ] **Step 5: Commit**

Run:

```bash
git status --short --untracked-files=all
git diff --stat
git add \
  docs/task/FEAT-073.md \
  docs/plan/PLAN-305.md \
  docs/task/index.md \
  docs/plan/index.md \
  docs/changelog.md \
  docs/architecture.md \
  docs/soul-app-developer.md \
  packages/shared/src/soul-app/protocol.ts \
  packages/shared/src/soul-app/index.ts \
  apps/api/src/modes/worker.ts \
  apps/api/src/modes/worker.local.test.ts \
  apps/aiworker-hr/src/host-mounted.ts \
  apps/aiworker-hr/src/index.test.ts \
  apps/aiworker-qa/src/host-mounted.ts \
  apps/aiworker-qa/src/index.test.ts \
  apps/web/src/features/local-workspace/api/types.ts \
  apps/web/src/features/local-workspace/api/workspace-data.ts \
  apps/web/src/worker/worker-studio.tsx \
  apps/web/src/worker/__tests__/worker-studio.test.tsx \
  apps/web/src/styles/workspace-cards.css
git diff --cached --check
git commit -m "feat: 打通 Soul App 协议交互闭环"
```

Expected: commit succeeds and `.codex/config.toml` remains unstaged if it is
still the only unrelated local config change.
