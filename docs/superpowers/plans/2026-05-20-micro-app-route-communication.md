# micro-app Route Communication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement router-first communication between Host Web and the HR Host-mounted micro-app surface.

**Architecture:** Host Web keeps one `hr-home` micro-app mounted and controls child navigation with `microApp.router.push` and `microApp.router.replace`. Host observes child route changes through `microApp.router.afterEach`, stores the last child path per workspace as UI state, and keeps mount context on the existing data channel. HR adds a thin app-owned route bridge for its current static mounted HTML; this proves route communication without moving HR domain rendering into Host Web or rewriting HR as a full client SPA in this slice.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vite 8, Vitest/happy-dom, `@micro-zoe/micro-app`, Hono mounted Soul App service, AIWorker Host/Soul manifest protocol.

---

## File Structure

- Modify `apps/web/src/lib/micro-app-runtime.ts`
  - Owns the Host-side wrapper over `@micro-zoe/micro-app`.
  - Add route helpers for push, replace, current route read and afterEach listener.
  - Add a test-only runtime injector so tests can prove router behavior without loading the browser custom element runtime.
- Create `apps/web/src/lib/micro-app-runtime.test.ts`
  - Unit tests for the wrapper functions and listener cleanup.
- Create `apps/web/src/worker/mounted-child-route.ts`
  - Owns AIWorker-specific child-route normalization and route-memory keys.
  - Keeps these rules out of `worker-studio.tsx`.
- Create `apps/web/src/worker/mounted-child-route.test.ts`
  - Unit tests for HR route normalization, fallback and memory keys.
- Modify `apps/web/src/types/micro-app.d.ts`
  - Add typed `default-page` and `keep-router-state` JSX attributes if implementation uses them.
- Modify `apps/web/src/worker/worker-studio.tsx`
  - Add `baseroute`.
  - Register child-route observers.
  - Restore remembered child route on workspace switch.
  - Navigate to action `redirectTo` child paths through `microApp.router`.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Assert `baseroute="/hr"`.
  - Assert Host route helpers are called without remounting the micro-app.
  - Assert workspace route memory is updated from child route observation.
  - Assert `redirectTo` from the HR workbench action uses child router navigation.
- Modify `apps/aiworker-hr/product/web/people-workbench/surface.tsx`
  - Add app-owned route data attributes on relevant HR controls.
  - These attributes do not move HR behavior into Host.
- Create `apps/aiworker-hr/host-adapter/mounted/route-bridge.ts`
  - Owns HR child route parsing and the static mounted HTML route bridge script.
- Modify `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
  - Include the HR route bridge script on `/micro-app/routes/hr-home`.
  - Keep the existing micro-app data bridge.
  - Return `/hr/profiles/new` from `peopleProfiles.create`.
- Modify `apps/aiworker-hr/host-adapter/index.test.ts`
  - Assert the HR route bridge is present and action redirects to the canonical HR child route.
- Modify `docs/changelog.md`, `docs/task/*.md`, `docs/plan/*.md` only if PMA tracking is required during implementation.
  - Do not edit these during plan creation.

## Task 1: Host micro-app Router Adapter

**Files:**
- Modify: `apps/web/src/lib/micro-app-runtime.ts`
- Create: `apps/web/src/lib/micro-app-runtime.test.ts`

- [ ] **Step 1: Add failing router adapter tests**

Create `apps/web/src/lib/micro-app-runtime.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  addMountedMicroAppRouteListener,
  getMountedMicroAppCurrentRoute,
  pushMountedMicroAppRoute,
  replaceMountedMicroAppRoute,
  setMicroAppRuntimeForTest,
} from './micro-app-runtime'

describe('micro-app-runtime route helpers', () => {
  afterEach(() => {
    setMicroAppRuntimeForTest(null)
  })

  it('pushes and replaces mounted child routes through micro-app router', async () => {
    const push = vi.fn()
    const replace = vi.fn()
    setMicroAppRuntimeForTest({
      addDataListener: vi.fn(),
      forceSetData: vi.fn(),
      removeDataListener: vi.fn(),
      router: {
        afterEach: vi.fn(),
        current: { get: vi.fn() },
        push,
        replace,
      },
      setData: vi.fn(),
      start: vi.fn(),
    })

    await pushMountedMicroAppRoute('aiworker-hr--hr-home', '/hr/profiles/profile-ben')
    await replaceMountedMicroAppRoute('aiworker-hr--hr-home', '/hr')

    expect(push).toHaveBeenCalledWith({ name: 'aiworker-hr--hr-home', path: '/hr/profiles/profile-ben' })
    expect(replace).toHaveBeenCalledWith({ name: 'aiworker-hr--hr-home', path: '/hr' })
  })

  it('returns the current route for one mounted child app', async () => {
    const get = vi.fn().mockReturnValue({ pathname: '/hr/profiles/profile-ben', search: '?tab=summary' })
    setMicroAppRuntimeForTest({
      addDataListener: vi.fn(),
      forceSetData: vi.fn(),
      removeDataListener: vi.fn(),
      router: {
        afterEach: vi.fn(),
        current: { get },
        push: vi.fn(),
        replace: vi.fn(),
      },
      setData: vi.fn(),
      start: vi.fn(),
    })

    await expect(getMountedMicroAppCurrentRoute('aiworker-hr--hr-home')).resolves.toEqual({
      pathname: '/hr/profiles/profile-ben',
      search: '?tab=summary',
    })
    expect(get).toHaveBeenCalledWith('aiworker-hr--hr-home')
  })

  it('binds route afterEach for the target app and returns cleanup', async () => {
    const cleanup = vi.fn()
    const afterEach = vi.fn().mockImplementation((listeners) => {
      listeners['aiworker-hr--hr-home']({ pathname: '/hr/profiles/profile-stella' }, { pathname: '/hr' })
      return cleanup
    })
    const listener = vi.fn()
    setMicroAppRuntimeForTest({
      addDataListener: vi.fn(),
      forceSetData: vi.fn(),
      removeDataListener: vi.fn(),
      router: {
        afterEach,
        current: { get: vi.fn() },
        push: vi.fn(),
        replace: vi.fn(),
      },
      setData: vi.fn(),
      start: vi.fn(),
    })

    const stop = await addMountedMicroAppRouteListener('aiworker-hr--hr-home', listener)
    stop()

    expect(afterEach).toHaveBeenCalledWith({
      'aiworker-hr--hr-home': expect.any(Function),
    })
    expect(listener).toHaveBeenCalledWith({ pathname: '/hr/profiles/profile-stella' }, { pathname: '/hr' })
    expect(cleanup).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/lib/micro-app-runtime.test.ts
```

Expected: FAIL because `pushMountedMicroAppRoute`, `replaceMountedMicroAppRoute`, `getMountedMicroAppCurrentRoute`, `addMountedMicroAppRouteListener`, and `setMicroAppRuntimeForTest` do not exist yet.

- [ ] **Step 3: Implement router adapter helpers**

In `apps/web/src/lib/micro-app-runtime.ts`, extend the runtime type and add helpers:

```ts
export interface MountedMicroAppRouteInfo {
  fullPath?: string
  hash?: string
  href?: string
  pathname?: string
  search?: string
}

type MicroAppRouter = {
  afterEach: (listeners: Record<string, (to: MountedMicroAppRouteInfo, from: MountedMicroAppRouteInfo) => unknown>) => () => void
  current: {
    get: (appName: string) => MountedMicroAppRouteInfo | null | undefined
  }
  push: (route: { name: string, path: string }) => void
  replace: (route: { name: string, path: string }) => void
}

type MicroAppRuntime = {
  addDataListener: (appName: string, cb: (data: Record<PropertyKey, unknown>) => unknown, autoTrigger?: boolean) => void
  forceSetData: (appName: string, data: Record<PropertyKey, unknown>, nextStep?: CallableFunction) => void
  removeDataListener: (appName: string, cb: (data: Record<PropertyKey, unknown>) => unknown) => void
  router?: MicroAppRouter
  setData: (appName: string, data: Record<PropertyKey, unknown>, nextStep?: CallableFunction, force?: boolean) => void
  start: (options?: Record<string, unknown>) => void
}

export async function pushMountedMicroAppRoute(appName: string, path: string): Promise<void> {
  const microApp = await loadMicroAppRuntime()
  microApp?.router?.push({ name: appName, path })
}

export async function replaceMountedMicroAppRoute(appName: string, path: string): Promise<void> {
  const microApp = await loadMicroAppRuntime()
  microApp?.router?.replace({ name: appName, path })
}

export async function getMountedMicroAppCurrentRoute(appName: string): Promise<MountedMicroAppRouteInfo | null> {
  const microApp = await loadMicroAppRuntime()
  return microApp?.router?.current.get(appName) ?? null
}

export async function addMountedMicroAppRouteListener(
  appName: string,
  listener: (to: MountedMicroAppRouteInfo, from: MountedMicroAppRouteInfo) => void,
): Promise<() => void> {
  const microApp = await loadMicroAppRuntime()
  if (!microApp?.router?.afterEach)
    return () => {}
  return microApp.router.afterEach({
    [appName]: listener,
  })
}

export function setMicroAppRuntimeForTest(value: MicroAppRuntime | null): void {
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test')
    throw new Error('setMicroAppRuntimeForTest is only available in tests.')
  runtime = value
  started = Boolean(value)
  starting = null
}
```

Keep the existing data-channel helpers unchanged.

- [ ] **Step 4: Run adapter tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/lib/micro-app-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add apps/web/src/lib/micro-app-runtime.ts apps/web/src/lib/micro-app-runtime.test.ts
git commit -m "feat: 增加 micro-app 路由适配器"
```

## Task 2: Mounted Child Route Helpers

**Files:**
- Create: `apps/web/src/worker/mounted-child-route.ts`
- Create: `apps/web/src/worker/mounted-child-route.test.ts`

- [ ] **Step 1: Add failing route helper tests**

Create `apps/web/src/worker/mounted-child-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from './mounted-child-route'

describe('mounted child route helpers', () => {
  it('uses the manifest route path as the mounted child default', () => {
    expect(mountedChildDefaultPath('/hr')).toBe('/hr')
    expect(mountedChildDefaultPath('')).toBe('/')
  })

  it('normalizes child paths under the mounted base path', () => {
    expect(normalizeMountedChildPath('/hr/profiles/profile-ben', '/hr')).toBe('/hr/profiles/profile-ben')
    expect(normalizeMountedChildPath('/hr/profiles/profile-ben?tab=review#patch', '/hr')).toBe('/hr/profiles/profile-ben?tab=review#patch')
    expect(normalizeMountedChildPath('/qa/release', '/hr')).toBe('/hr')
    expect(normalizeMountedChildPath('', '/hr')).toBe('/hr')
  })

  it('reads path-like values from micro-app route info', () => {
    expect(mountedChildPathFromRouteInfo({ fullPath: '/hr/profiles/profile-ben?tab=summary' }, '/hr')).toBe('/hr/profiles/profile-ben?tab=summary')
    expect(mountedChildPathFromRouteInfo({ pathname: '/hr/profiles/profile-stella', search: '?tab=evidence', hash: '#sources' }, '/hr')).toBe('/hr/profiles/profile-stella?tab=evidence#sources')
    expect(mountedChildPathFromRouteInfo({ pathname: '/qa/release' }, '/hr')).toBe('/hr')
  })

  it('keys route memory by app, surface and workspace', () => {
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-hr',
      surfaceId: 'hr-home',
      workspaceId: 'workspace-1',
    })).toBe('aiworker-hr::hr-home::workspace-1')
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-hr',
      surfaceId: 'hr-home',
      workspaceId: null,
    })).toBe('aiworker-hr::hr-home::app')
  })
})
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/mounted-child-route.test.ts
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Implement route helpers**

Create `apps/web/src/worker/mounted-child-route.ts`:

```ts
import type { MountedMicroAppRouteInfo } from '../lib/micro-app-runtime'

export function mountedChildDefaultPath(routePath: string | null | undefined): string {
  return routePath && routePath.startsWith('/') ? routePath : '/'
}

export function normalizeMountedChildPath(path: string | null | undefined, basePath: string): string {
  const fallback = mountedChildDefaultPath(basePath)
  if (!path)
    return fallback
  const normalized = path.startsWith('/') ? path : `/${path}`
  const pathname = normalized.split(/[?#]/, 1)[0] || '/'
  return pathname === fallback || pathname.startsWith(`${fallback}/`) ? normalized : fallback
}

export function mountedChildPathFromRouteInfo(route: MountedMicroAppRouteInfo | null | undefined, basePath: string): string {
  if (!route)
    return mountedChildDefaultPath(basePath)
  if (route.fullPath)
    return normalizeMountedChildPath(route.fullPath, basePath)
  if (route.href) {
    try {
      const url = new URL(route.href, 'http://aiworker.local')
      return normalizeMountedChildPath(`${url.pathname}${url.search}${url.hash}`, basePath)
    }
    catch {
      return normalizeMountedChildPath(route.href, basePath)
    }
  }
  const path = `${route.pathname ?? ''}${route.search ?? ''}${route.hash ?? ''}`
  return normalizeMountedChildPath(path, basePath)
}

export function mountedRouteMemoryKey(input: {
  appId: string
  surfaceId: string
  workspaceId?: string | null
}): string {
  return `${input.appId}::${input.surfaceId}::${input.workspaceId || 'app'}`
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/mounted-child-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add apps/web/src/worker/mounted-child-route.ts apps/web/src/worker/mounted-child-route.test.ts
git commit -m "feat: 增加 mounted 子路由规则"
```

## Task 3: WorkerStudio Host Route Coordination

**Files:**
- Modify: `apps/web/src/types/micro-app.d.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add failing WorkerStudio tests**

At the top of `apps/web/src/worker/__tests__/worker-studio.test.tsx`, mock the micro-app runtime before importing `WorkerStudio`. Use `vi.hoisted` because Vitest hoists `vi.mock` factories:

```ts
const microAppRouteMock = vi.hoisted(() => ({
  getMountedMicroAppCurrentRoute: vi.fn(),
  listeners: new Map<string, (to: { pathname?: string }, from: { pathname?: string }) => void>(),
  pushMountedMicroAppRoute: vi.fn(),
  replaceMountedMicroAppRoute: vi.fn(),
}))

vi.mock('../../lib/micro-app-runtime', async () => {
  const actual = await vi.importActual<typeof import('../../lib/micro-app-runtime')>('../../lib/micro-app-runtime')
  return {
    ...actual,
    addMountedMicroAppRouteListener: vi.fn(async (appName: string, listener: (to: { pathname?: string }, from: { pathname?: string }) => void) => {
      microAppRouteMock.listeners.set(appName, listener)
      return () => microAppRouteMock.listeners.delete(appName)
    }),
    getMountedMicroAppCurrentRoute: microAppRouteMock.getMountedMicroAppCurrentRoute,
    pushMountedMicroAppRoute: microAppRouteMock.pushMountedMicroAppRoute,
    replaceMountedMicroAppRoute: microAppRouteMock.replaceMountedMicroAppRoute,
  }
})
```

In `beforeEach`, reset the new mocks:

```ts
microAppRouteMock.listeners.clear()
microAppRouteMock.pushMountedMicroAppRoute.mockReset()
microAppRouteMock.replaceMountedMicroAppRoute.mockReset()
microAppRouteMock.getMountedMicroAppCurrentRoute.mockReset()
microAppRouteMock.getMountedMicroAppCurrentRoute.mockResolvedValue(null)
```

Update the existing test fetch handler for `/api/local/apps/aiworker-hr/actions/create-people-profile` so the mocked action response includes the HR child route:

```ts
return json({
  action: { id: 'create-people-profile', protocolAction: 'peopleProfiles.create' },
  result: { ok: true, message: 'People profile draft created.', redirectTo: '/hr/profiles/new', refresh: true },
})
```

Extend the existing HR mounted route test to assert `baseroute`:

```ts
expect(microApp.getAttribute('baseroute')).toBe('/hr')
```

Add a new test:

```ts
it('stores mounted HR child route changes per workspace and restores them without remounting', async () => {
  const secondWorkspace = {
    ...workspace,
    id: 'workspace-2',
    name: 'Second Hiring Workspace',
    workerId: 'hr-worker',
  }
  currentWorkspaces = [workspace, secondWorkspace]
  window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

  render(<WorkerStudio />)

  const firstMicroApp = await screen.findByTitle('HR People Workbench')
  expect(firstMicroApp.getAttribute('name')).toBe('aiworker-hr--hr-home')
  expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenCalledWith('aiworker-hr--hr-home', '/hr')

  microAppRouteMock.listeners.get('aiworker-hr--hr-home')?.(
    { pathname: '/hr/profiles/profile-ben' },
    { pathname: '/hr' },
  )

  act(() => {
    window.history.pushState(null, '', '/workers/hr-worker/workspaces/workspace-2')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await screen.findByTitle('HR People Workbench')
  await waitFor(() => {
    expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenLastCalledWith('aiworker-hr--hr-home', '/hr')
  })

  act(() => {
    window.history.pushState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await screen.findByTitle('HR People Workbench')
  await waitFor(() => {
    expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenLastCalledWith('aiworker-hr--hr-home', '/hr/profiles/profile-ben')
  })
})
```

Add another test for action redirects:

```ts
it('opens HR action redirect paths through the mounted child router', async () => {
  window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
  render(<WorkerStudio />)

  await screen.findByTitle('HR People Workbench')
  fireEvent.click(screen.getByRole('button', { name: /New people profile/ }))

  await waitFor(() => {
    expect(microAppRouteMock.pushMountedMicroAppRoute).toHaveBeenCalledWith('aiworker-hr--hr-home', '/hr/profiles/new')
  })
})
```

- [ ] **Step 2: Run the focused failing WorkerStudio tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because route helpers are not imported, `baseroute` is not rendered, and action `redirectTo` is ignored.

- [ ] **Step 3: Extend micro-app JSX attributes**

If needed, update `apps/web/src/types/micro-app.d.ts`:

```ts
'default-page'?: string
'keep-router-state'?: boolean | string
```

Keep the existing `baseroute?: string` attribute.

- [ ] **Step 4: Wire mounted child route helpers into WorkerStudio**

In `apps/web/src/worker/worker-studio.tsx`, add imports:

```ts
import {
  addMountedMicroAppRouteListener,
  getMountedMicroAppCurrentRoute,
  pushMountedMicroAppRoute,
  replaceMountedMicroAppRoute,
} from '../lib/micro-app-runtime'
import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from './mounted-child-route'
```

Near other `useRef` state in `WorkerStudio`, add:

```ts
const mountedChildRouteMemoryRef = useRef(new Map<string, string>())
```

Define this helper inside `WorkerStudio`, after `runWorkbenchAction` dependencies are available:

```ts
function openMountedChildRoute(path: string, options: { replace?: boolean } = {}) {
  if (!selectedSoulApp || !selectedMountedWorkbenchRoute)
    return
  const appName = `${selectedSoulApp.appId}--${selectedMountedWorkbenchRoute.id}`
  const childPath = normalizeMountedChildPath(path, mountedChildDefaultPath(selectedMountedWorkbenchRoute.path))
  const memoryKey = mountedRouteMemoryKey({
    appId: selectedSoulApp.appId,
    surfaceId: selectedMountedWorkbenchRoute.id,
    workspaceId: selectedWorkspace?.id ?? null,
  })
  mountedChildRouteMemoryRef.current.set(memoryKey, childPath)
  void (options.replace
    ? replaceMountedMicroAppRoute(appName, childPath)
    : pushMountedMicroAppRoute(appName, childPath))
}
```

After the existing action result handling in `runWorkbenchAction`, add:

```ts
if (response.result.ok && response.result.redirectTo)
  openMountedChildRoute(response.result.redirectTo)
```

Pass the route memory ref into `MountedSoulAppRouteSurface`:

```tsx
<MountedSoulAppRouteSurface
  appId={selectedSoulApp.appId}
  mountedChildRouteMemoryRef={mountedChildRouteMemoryRef}
  resolvedTheme={resolvedTheme}
  route={selectedMountedWorkbenchRoute}
  sessionId={selectedMountedWorkbenchRoute.surface?.scope === 'session' ? selectedSession?.id ?? null : null}
  workerId={selectedWorker.id}
  workspaceId={selectedWorkspace?.id ?? null}
  onRefresh={refresh}
/>
```

Update `MountedSoulAppRouteSurface` props. Import `MutableRefObject` from React if the file does not already expose the `React` namespace:

```ts
mountedChildRouteMemoryRef: MutableRefObject<Map<string, string>>
```

Use the ref when a surface is available:

```ts
const childBasePath = mountedChildDefaultPath(route.path)
const memoryKey = mountedRouteMemoryKey({
  appId,
  surfaceId: route.id,
  workspaceId,
})
```

Inside the `surface` effect, add route observation and restore:

```ts
const rememberedPath = mountedChildRouteMemoryRef.current.get(memoryKey) ?? childBasePath
void replaceMountedMicroAppRoute(surface.microApp.name, rememberedPath)
void getMountedMicroAppCurrentRoute(surface.microApp.name).then((currentRoute) => {
  const currentPath = mountedChildPathFromRouteInfo(currentRoute, childBasePath)
  mountedChildRouteMemoryRef.current.set(memoryKey, currentPath)
})
let activeRouteListener = true
let stopRouteListening: (() => void) | null = null
void addMountedMicroAppRouteListener(surface.microApp.name, (to) => {
  const nextPath = mountedChildPathFromRouteInfo(to, childBasePath)
  mountedChildRouteMemoryRef.current.set(memoryKey, nextPath)
}).then((stop) => {
  if (!activeRouteListener) {
    stop()
    return
  }
  stopRouteListening = stop
})
```

Return cleanup that stops both listeners:

```ts
return () => {
  activeRouteListener = false
  stopListening()
  stopRouteListening?.()
}
```

Render `baseroute` on the micro-app element:

```tsx
baseroute={childBasePath}
```

- [ ] **Step 5: Run WorkerStudio tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run focused Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/lib/micro-app-runtime.test.ts src/worker/mounted-child-route.test.ts src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add apps/web/src/types/micro-app.d.ts apps/web/src/worker/worker-studio.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "feat: 接入 Host mounted 子路由切换"
```

## Task 4: HR Mounted Route Bridge

**Files:**
- Modify: `apps/aiworker-hr/product/web/people-workbench/surface.tsx`
- Create: `apps/aiworker-hr/host-adapter/mounted/route-bridge.ts`
- Modify: `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`

- [ ] **Step 1: Add failing HR adapter tests**

In `apps/aiworker-hr/host-adapter/index.test.ts`, extend the mounted micro-app HTML assertion:

```ts
expect(microAppHtml).toContain('data-hr-child-route="/hr"')
expect(microAppHtml).toContain('data-hr-route-action="new-profile"')
expect(microAppHtml).toContain('data-hr-profile-id="profile-ben"')
expect(microAppHtml).toContain('window.__AIWORKER_HR_CHILD_ROUTE__')
```

Update the action assertion for `peopleProfiles.create`:

```ts
expect(await actionRes.json()).toMatchObject({
  ok: true,
  redirectTo: '/hr/profiles/new',
})
```

- [ ] **Step 2: Run failing HR tests**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
```

Expected: FAIL because the route bridge and canonical redirect are not present.

- [ ] **Step 3: Add route attributes to HR app-owned markup**

In `apps/aiworker-hr/product/web/people-workbench/surface.tsx`, add data attributes:

```tsx
<section
  data-slot="hr-route-surface"
  data-hr-child-route="/hr"
  className={surfaceGridClassName}
>
```

On the new profile button:

```tsx
<Button
  type="button"
  variant="ghost"
  size="icon-sm"
  aria-label={labels.newProfile}
  data-hr-route-action="new-profile"
>
  +
</Button>
```

On each profile list item button:

```tsx
data-hr-profile-id={profile.id}
data-hr-route-path={`/hr/profiles/${profile.id}`}
```

- [ ] **Step 4: Implement the HR child route bridge**

Create `apps/aiworker-hr/host-adapter/mounted/route-bridge.ts`:

```ts
export const hrMountedRouteBase = '/hr'

export function normalizeHrChildRoute(path: string | null | undefined): string {
  if (!path)
    return hrMountedRouteBase
  const value = path.startsWith('/') ? path : `/${path}`
  const pathname = value.split(/[?#]/, 1)[0] || hrMountedRouteBase
  if (pathname === hrMountedRouteBase || pathname.startsWith(`${hrMountedRouteBase}/`))
    return value
  return hrMountedRouteBase
}

export function hrChildRouteBridgeScript(appId: string, surfaceId: string): string {
  const appValue = JSON.stringify(appId).replaceAll('<', '\\u003C').replaceAll('>', '\\u003E').replaceAll('&', '\\u0026')
  const surfaceValue = JSON.stringify(surfaceId).replaceAll('<', '\\u003C').replaceAll('>', '\\u003E').replaceAll('&', '\\u0026')
  return `;(() => {
  const appId = ${appValue};
  const surfaceId = ${surfaceValue};
  const normalize = (path) => {
    if (!path || typeof path !== 'string')
      return '/hr';
    const value = path.startsWith('/') ? path : '/' + path;
    const pathname = value.split(/[?#]/, 1)[0] || '/hr';
    return pathname === '/hr' || pathname.startsWith('/hr/') ? value : '/hr';
  };
  const currentPath = () => normalize(window.location.pathname + window.location.search + window.location.hash);
  const applyRoute = () => {
    const path = currentPath();
    window.__AIWORKER_HR_CHILD_ROUTE__ = path;
    document.documentElement.setAttribute('data-hr-child-route', path);
    document.querySelectorAll('[data-hr-child-route]').forEach((element) => {
      element.setAttribute('data-hr-child-route', path);
    });
  };
  const navigate = (path) => {
    const nextPath = normalize(path);
    window.history.pushState(window.history.state, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    applyRoute();
  };
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-hr-route-path],[data-hr-route-action]') : null;
    if (!target)
      return;
    const explicitPath = target.getAttribute('data-hr-route-path');
    const action = target.getAttribute('data-hr-route-action');
    const nextPath = explicitPath || (action === 'new-profile' ? '/hr/profiles/new' : null);
    if (!nextPath)
      return;
    event.preventDefault();
    navigate(nextPath);
  });
  window.addEventListener('popstate', applyRoute);
  applyRoute();
})();`
}
```

- [ ] **Step 5: Include the route bridge in mounted HTML**

In `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`, import the helper:

```ts
import { hrChildRouteBridgeScript } from './route-bridge'
```

In `hrRouteMicroAppHtml`, include it after the existing micro-app data bridge:

```ts
`<script>${microAppBridgeScript(hrSoulAppManifest.id, surfaceId)}</script>`,
`<script>${hrChildRouteBridgeScript(hrSoulAppManifest.id, surfaceId)}</script>`,
```

Do not include the HR route bridge on non-route widgets unless a widget needs route behavior later.

- [ ] **Step 6: Align HR action redirect**

In `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`, change the `peopleProfiles.create` result:

```ts
return {
  message: 'People profile draft opened by HR app.',
  ok: true,
  redirectTo: '/hr/profiles/new',
  refresh: true,
}
```

- [ ] **Step 7: Run HR tests**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/surface.tsx apps/aiworker-hr/host-adapter/mounted/route-bridge.ts apps/aiworker-hr/host-adapter/mounted/host-mounted.ts apps/aiworker-hr/host-adapter/index.test.ts
git commit -m "feat: 接入 HR mounted 子路由桥"
```

## Task 5: Contract Verification And PMA Closeout

**Files:**
- Modify only if needed: `docs/changelog.md`
- Modify only if needed: `docs/task/*.md`
- Modify only if needed: `docs/plan/*.md`

- [ ] **Step 1: Run focused Web verification**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/lib/micro-app-runtime.test.ts src/worker/mounted-child-route.test.ts src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run focused HR verification**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
```

Expected: PASS.

- [ ] **Step 3: Run Web typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: PASS.

- [ ] **Step 4: Run HR typecheck if present**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' typecheck
```

Expected: PASS, or document that the package has no `typecheck` script if Bun reports no matching script.

- [ ] **Step 5: Run UI governance check if app-local UI attributes triggered the checker**

Run:

```bash
bun run ui:check
```

Expected: PASS. If it fails only on unrelated pre-existing migration debt, stop and inspect before changing unrelated files.

- [ ] **Step 6: Run docs and whitespace checks**

Run:

```bash
bun run docs:check
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: PASS or actionable findings addressed before final report.

- [ ] **Step 8: Update PMA/changelog if implementation created a tracked feature**

If the current implementation session is using PMA slots, update the current `docs/task/*.md`, `docs/plan/*.md`, indexes and `docs/changelog.md` with:

```text
micro-app route communication uses router-first mounted child navigation.
Host Web keeps HR mounted once, restores per-workspace child paths, and HR
serves a thin app-owned route bridge for static mounted HTML.
```

If there is no active PMA slot for this slice, record the verification results in the final response and do not create noisy task docs.

- [ ] **Step 9: Commit verification docs only if they changed**

Run:

```bash
git add docs/changelog.md docs/task docs/plan
git commit -m "docs: 记录 micro-app 路由通信验证"
```

Expected: Commit succeeds only when docs changed. Skip this commit if no PMA/changelog files changed.

## Acceptance Criteria

- Host Web renders HR mounted route with `router-mode="pure"` and `baseroute="/hr"`.
- Host can call `microApp.router.push` for `/hr/profiles/:profileId`.
- Host can call `microApp.router.replace` to restore a remembered per-workspace child path.
- Host observes child route changes through `microApp.router.afterEach`.
- HR mounted HTML exposes route bridge metadata and canonical route actions under `/hr`.
- HR `peopleProfiles.create` redirects to `/hr/profiles/new`.
- Mount context remains on the data channel.
- Business behavior remains in action/search/broker/protocol paths.
- No Host Web HR domain renderer is reintroduced.
