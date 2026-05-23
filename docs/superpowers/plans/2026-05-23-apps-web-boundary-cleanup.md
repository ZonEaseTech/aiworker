# apps/web Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清洗 `apps/web` Host 边界，删除旧 Host-owned session UI/client 残留，并把 `worker-studio.tsx` 拆成可维护的 shell / locator / mount / worker configuration 接线。

**Architecture:** `apps/web` 只保留 Host 的 shell、locate、mount、bridge context 和 worker-scoped configuration。旧 Host session product UI 直接删除；mounted surface 继续由 manifest-declared `micro-app` route 驱动。API/CLI/shared 只做审计记录，不在本轮重写合同。

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vitest + Testing Library, shadcn primitives from `@zonease/aiworker-ui`, `@micro-zoe/micro-app`, AIWorker Host/Soul local daemon API.

---

## Scope Source

Approved design: `docs/superpowers/specs/2026-05-23-apps-web-boundary-cleanup-design.md`

Normative architecture: `docs/architecture.md#constraint-registry`

Host skill contract: `.agents/skills/aiworker-host-dev/SKILL.md`

## Component Library Preflight

Checked shared primitives already used by the target files:

- `@zonease/aiworker-ui/components/button`
- `@zonease/aiworker-ui/components/item`
- `@zonease/aiworker-ui/components/sidebar`
- `@zonease/aiworker-ui/components/card`
- `@zonease/aiworker-ui/components/alert`
- `@zonease/aiworker-ui/components/breadcrumb`
- `@zonease/aiworker-ui/components/input-group`

This plan does not introduce new app-local primitives, hex colors, arbitrary theme values, or icon libraries. Existing Hugeicons usage stays as-is.

## File Structure

- Create `apps/web/src/worker/studio/locator.ts`
  - Pure locator derivation for worker/workspace/session route state.
  - May mention `session` only as locator/context.
- Create `apps/web/src/worker/studio/locator.test.ts`
  - Focused tests for route-derived worker/workspace/session selection and fallback behavior.
- Create `apps/web/src/worker/studio/mounted-route-preferences.ts`
  - Worker-scoped active mounted route preferences.
  - Owns the localStorage key and pure resolve/update helpers.
- Create `apps/web/src/worker/studio/mounted-route-preferences.test.ts`
  - Tests read/persist/fallback by worker id.
- Create `apps/web/src/worker/studio/mounted-surface.tsx`
  - Generic `<micro-app>` mounted route surface and route memory helpers.
  - Moves the current `MountedSoulAppRouteSurface` and `openMountedChildRoute` out of `worker-studio.tsx`.
- Create `apps/web/src/worker/studio/host-chrome.tsx`
  - Moves `HostTopBar`, `HostSidebarActions`, `HostSidebarFooter`.
- Create `apps/web/src/worker/studio/first-run-soul-app-home.tsx`
  - Moves the first-run Soul App card surface.
- Create `apps/web/src/worker/studio/workspace-fallback.tsx`
  - Moves the no-mounted-surface and workspace-list fallback.
- Modify `apps/web/src/worker/worker-studio.tsx`
  - Keep as composition entrypoint.
  - Use new locator, mounted surface, route preference and shell modules.
- Modify `apps/web/src/features/local-workspace/api/index.ts`
  - Remove session turn client exports.
- Modify `apps/web/src/features/local-workspace/components/index.ts`
  - Remove `WorkspaceSessionComposer` export.
- Delete `apps/web/src/features/local-workspace/api/sessions.ts`
- Delete `apps/web/src/features/local-workspace/components/session-composer.tsx`
- Delete `apps/web/src/features/local-workspace/components/session-composer.test.tsx`
- Delete `apps/web/src/worker/session-progress.ts`
- Delete `apps/web/src/features/session/markdown-preview.tsx`
- Delete `apps/web/src/features/session/markdown-preview.test.tsx`
- Modify `scripts/check-soul-app-boundaries.ts`
  - Add Web retired Host session product surface guard for completion audit.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Keep existing mounted route tests.
  - Add source-boundary assertions that survive the file split.
- Modify `docs/changelog.md`
  - Record the final implementation after code changes pass verification.
- Optional PMA sync during implementation:
  - Create or update a task/plan pair if the executor follows PMA closeout in this repo.

## Task 1: Add Boundary Regression Tests Before Deleting Residual Files

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add source walking imports**

Modify the existing import at the top of `apps/web/src/worker/__tests__/worker-studio.test.tsx`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
```

Keep the existing Testing Library and Vitest imports unchanged.

- [ ] **Step 2: Add Web source walker helper**

Append this helper near the existing test helpers, after `universalRoute()`:

```ts
function listWebSourceFiles(relativeDir: string): string[] {
  const root = path.join(process.cwd(), relativeDir)
  if (!existsSync(root))
    return []
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules')
      continue
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...listWebSourceFiles(path.join(relativeDir, entry.name).replaceAll('\\', '/')))
      continue
    }
    if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name))
      files.push(fullPath)
  }
  return files.sort()
}
```

- [ ] **Step 3: Add failing boundary test**

Append this test near the existing `keeps WorkerStudio free of universal-workbench renderer branches` test:

```ts
  it('keeps apps/web free of retired Host-owned session product surfaces', () => {
    const files = listWebSourceFiles('src')
    const sources = files.map(file => ({
      file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      source: readFileSync(file, 'utf8'),
    }))

    expect(sources.some(item => item.file.includes('/features/session/'))).toBe(false)
    expect(sources.some(item => item.file.endsWith('/worker/session-progress.ts'))).toBe(false)
    expect(sources.some(item => item.file.endsWith('/features/local-workspace/api/sessions.ts'))).toBe(false)
    expect(sources.some(item => item.file.endsWith('/features/local-workspace/components/session-composer.tsx'))).toBe(false)
    for (const item of sources) {
      expect(item.source).not.toContain('WorkspaceSessionComposer')
      expect(item.source).not.toContain('createSessionTurn')
      expect(item.source).not.toContain('continueSessionTurn')
      expect(item.source).not.toContain('MarkdownPreview')
      expect(item.source).not.toContain('buildSessionProgress')
    }
  })
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "retired Host-owned session product surfaces"
```

Expected: FAIL because the residual files and exports still exist.

- [ ] **Step 5: Commit only if executing task-by-task**

Do not commit after a failing test if the executor wants green commits only. If following strict TDD commits, commit after Task 2 makes this test pass.

## Task 2: Delete Old Host Session UI And Client Residuals

**Files:**
- Delete: `apps/web/src/features/local-workspace/api/sessions.ts`
- Delete: `apps/web/src/features/local-workspace/components/session-composer.tsx`
- Delete: `apps/web/src/features/local-workspace/components/session-composer.test.tsx`
- Delete: `apps/web/src/worker/session-progress.ts`
- Delete: `apps/web/src/features/session/markdown-preview.tsx`
- Delete: `apps/web/src/features/session/markdown-preview.test.tsx`
- Modify: `apps/web/src/features/local-workspace/api/index.ts`
- Modify: `apps/web/src/features/local-workspace/components/index.ts`

- [ ] **Step 1: Remove session API exports**

Replace `apps/web/src/features/local-workspace/api/index.ts` with:

```ts
export {
  rescanEngines,
  saveSettings,
  testEngine,
} from './settings'
export type {
  LocalInfoResponse,
  LocalWorkspaceData,
  WorkerOverlayResponse,
  WorkerOverlaySaveBody,
} from './types'
export {
  loadWorkerOverlay,
  projectWorkerWorkspaceOverlay,
  saveWorkerOverlay,
} from './worker-overlays'
export {
  createWorker,
} from './workers'
export {
  disableSoulApp,
  enableSoulApp,
  loadLocalWorkspaceData,
  resolveMountedSurface,
} from './workspace-data'
export {
  createWorkspace,
  readFile,
  writeFile,
} from './workspaces'
```

- [ ] **Step 2: Remove composer export**

Replace `apps/web/src/features/local-workspace/components/index.ts` with:

```ts
export { CreateWorkerDialog, CreateWorkspaceDialog } from './creation-dialogs'
export { WorkerIdentityBlock } from './worker-identity'
export { WorkspaceCard } from './workspace-card'
```

- [ ] **Step 3: Delete residual files**

Run:

```bash
git rm \
  apps/web/src/features/local-workspace/api/sessions.ts \
  apps/web/src/features/local-workspace/components/session-composer.tsx \
  apps/web/src/features/local-workspace/components/session-composer.test.tsx \
  apps/web/src/worker/session-progress.ts \
  apps/web/src/features/session/markdown-preview.tsx \
  apps/web/src/features/session/markdown-preview.test.tsx
```

If `apps/web/src/features/session` becomes empty, remove it:

```bash
rmdir apps/web/src/features/session
```

- [ ] **Step 4: Verify no production references remain**

Run:

```bash
rg -n "WorkspaceSessionComposer|createSessionTurn|continueSessionTurn|MarkdownPreview|buildSessionProgress|session-progress|features/session" apps/web/src
```

Expected: only the boundary regression test from Task 1 may contain these strings.

- [ ] **Step 5: Run focused Web test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "retired Host-owned session product surfaces"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/local-workspace/api/index.ts \
  apps/web/src/features/local-workspace/components/index.ts \
  apps/web/src/features/local-workspace/api/sessions.ts \
  apps/web/src/features/local-workspace/components/session-composer.tsx \
  apps/web/src/features/local-workspace/components/session-composer.test.tsx \
  apps/web/src/worker/session-progress.ts \
  apps/web/src/features/session/markdown-preview.tsx \
  apps/web/src/features/session/markdown-preview.test.tsx \
  apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "refactor: 删除 Host session UI 残留"
```

## Task 3: Extract Worker-Scoped Mounted Route Preferences

**Files:**
- Create: `apps/web/src/worker/studio/mounted-route-preferences.ts`
- Create: `apps/web/src/worker/studio/mounted-route-preferences.test.ts`
- Modify later: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Write the failing preference tests**

Create `apps/web/src/worker/studio/mounted-route-preferences.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'

import {
  activeMountedRoutePreferenceKey,
  persistActiveMountedRoutePreferences,
  readActiveMountedRoutePreferences,
  resolveActiveMountedRoute,
  updateWorkerMountedRoutePreference,
} from './mounted-route-preferences'

describe('mounted route preferences', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('reads and writes worker-scoped active route ids', () => {
    persistActiveMountedRoutePreferences({
      'hr-worker': 'hr-home',
      'qa-worker': 'universal-workbench',
    })

    expect(window.localStorage.getItem(activeMountedRoutePreferenceKey)).toContain('hr-home')
    expect(readActiveMountedRoutePreferences()).toEqual({
      'hr-worker': 'hr-home',
      'qa-worker': 'universal-workbench',
    })
  })

  it('ignores malformed stored preferences', () => {
    window.localStorage.setItem(activeMountedRoutePreferenceKey, '{"hr-worker":false}')

    expect(readActiveMountedRoutePreferences()).toEqual({})
  })

  it('resolves a route by worker id and falls back to the first declared route', () => {
    const routes = [
      { id: 'universal-workbench', label: 'Universal Workbench', path: '/workbench/universal' },
      { id: 'hr-home', label: 'People Workbench', path: '/hr' },
    ]

    expect(resolveActiveMountedRoute({
      preferences: { 'hr-worker': 'hr-home' },
      routes,
      workerId: 'hr-worker',
    })?.id).toBe('hr-home')

    expect(resolveActiveMountedRoute({
      preferences: { 'hr-worker': 'missing-route' },
      routes,
      workerId: 'hr-worker',
    })?.id).toBe('universal-workbench')
  })

  it('updates one worker without changing another worker using the same Soul App', () => {
    expect(updateWorkerMountedRoutePreference({
      current: { 'hr-worker-a': 'hr-home' },
      routeId: 'universal-workbench',
      workerId: 'hr-worker-b',
    })).toEqual({
      'hr-worker-a': 'hr-home',
      'hr-worker-b': 'universal-workbench',
    })
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/studio/mounted-route-preferences.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement route preference helper**

Create `apps/web/src/worker/studio/mounted-route-preferences.ts`:

```ts
export const activeMountedRoutePreferenceKey = 'aiworker:worker-studio:active-mounted-route'

interface RouteLike {
  id: string
}

export function readActiveMountedRoutePreferences(storage: Storage | null = defaultStorage()): Record<string, string> {
  if (!storage)
    return {}
  try {
    const raw = storage.getItem(activeMountedRoutePreferenceKey)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed))
      return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  catch {
    return {}
  }
}

export function persistActiveMountedRoutePreferences(
  preferences: Record<string, string>,
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage)
    return
  try {
    storage.setItem(activeMountedRoutePreferenceKey, JSON.stringify(preferences))
  }
  catch {
    // Shell preferences are best-effort and must not block Host mounting.
  }
}

export function updateWorkerMountedRoutePreference({
  current,
  routeId,
  workerId,
}: {
  current: Record<string, string>
  routeId: string
  workerId: string
}): Record<string, string> {
  return { ...current, [workerId]: routeId }
}

export function resolveActiveMountedRoute<T extends RouteLike>({
  preferences,
  routes,
  workerId,
}: {
  preferences: Record<string, string>
  routes: readonly T[]
  workerId: string | null | undefined
}): T | null {
  const fallback = routes[0] ?? null
  if (!workerId)
    return fallback
  const activeRouteId = preferences[workerId]
  if (!activeRouteId)
    return fallback
  return routes.find(route => route.id === activeRouteId) ?? fallback
}

function defaultStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 4: Run preference tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/studio/mounted-route-preferences.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/studio/mounted-route-preferences.ts \
  apps/web/src/worker/studio/mounted-route-preferences.test.ts
git commit -m "test: 固定 mounted route worker 偏好"
```

## Task 4: Extract Locator Derivation

**Files:**
- Create: `apps/web/src/worker/studio/locator.ts`
- Create: `apps/web/src/worker/studio/locator.test.ts`
- Modify later: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Write failing locator tests**

Create `apps/web/src/worker/studio/locator.test.ts`:

```ts
import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'

import { describe, expect, it } from 'vitest'

import { deriveWorkerStudioLocatorState } from './locator'

const now = '2026-05-23T00:00:00.000Z'

const data = {
  apps: [
    {
      appId: 'aiworker-hr',
      manifest: { name: 'AIWorker HR', ui: { artifactPreviews: [], panels: [], reviewPanels: [], routes: [] } },
      mountedContribution: { apiRoutePrefix: '/api/local/apps/aiworker-hr', artifactPreviewIds: [], microAppSurfaceIds: [], panelIds: [], reviewPanelIds: [], routePaths: [], surfaceIds: [], workspaceWidgetIds: [] },
      projectedSoul: { id: 'aiworker-hr' },
      status: 'enabled',
      version: '0.1.0',
    },
  ],
  info: { runtimeVersion: 'test', startedAt: now, workers: [] },
  settings: { language: 'en' },
  sessions: [
    { capabilityTemplateId: 'aiworker-hr.person-profile', context: '', createdAt: now, id: 'session-1', metadataJson: {}, status: 'active', title: 'Session 1', updatedAt: now, workerId: 'hr-worker', workspaceId: 'workspace-1' },
  ],
  turns: [],
  souls: [
    { defaultTemplates: ['aiworker-hr.person-profile'], description: 'People ops', domain: 'hr', id: 'aiworker-hr', name: 'AIWorker HR', status: 'available' },
    { defaultTemplates: ['aiworker-qa.release-gate'], description: 'QA', domain: 'qa', id: 'aiworker-qa', name: 'AIWorker QA', status: 'available' },
  ],
  templates: [
    { description: 'Profile', id: 'aiworker-hr.person-profile', inputHints: [], name: 'Profile', outputKind: 'profile', prompt: '', reviewRubric: [], soulId: 'aiworker-hr' },
  ],
  workspaces: [
    { createdAt: now, id: 'workspace-1', metadataJson: {}, name: 'Hiring', rootPath: '/tmp/hiring', sourcePointersJson: [], status: 'active', type: 'workspace', updatedAt: now, workerId: 'hr-worker' },
    { createdAt: now, id: 'workspace-2', metadataJson: {}, name: 'Other', rootPath: '/tmp/other', sourcePointersJson: [], status: 'active', type: 'workspace', updatedAt: now, workerId: 'hr-worker' },
  ],
  workers: [
    { createdAt: now, defaultEngineId: 'codex', id: 'hr-worker', metadataJson: {}, name: 'HR', soulId: 'aiworker-hr', status: 'active', updatedAt: now },
    { createdAt: now, defaultEngineId: 'codex', id: 'legacy-worker', metadataJson: {}, name: 'Legacy', soulId: 'legacy-soul', status: 'active', updatedAt: now },
  ],
} as unknown as LocalWorkspaceData

describe('deriveWorkerStudioLocatorState', () => {
  it('filters selectable workers to available Souls with templates', () => {
    const state = deriveWorkerStudioLocatorState({
      data,
      query: '',
      route: { kind: 'home' },
      selectedWorkerId: null,
      selectedWorkspaceId: null,
    })

    expect(state.selectableWorkers.map(worker => worker.id)).toEqual(['hr-worker'])
    expect(state.selectedWorker?.id).toBe('hr-worker')
    expect(state.selectedSoulApp?.appId).toBe('aiworker-hr')
  })

  it('uses workspace and session routes only as locators', () => {
    const state = deriveWorkerStudioLocatorState({
      data,
      query: '',
      route: { kind: 'session', workerId: 'hr-worker', workspaceId: 'workspace-1', sessionId: 'session-1' },
      selectedWorkerId: null,
      selectedWorkspaceId: null,
    })

    expect(state.selectedWorker?.id).toBe('hr-worker')
    expect(state.selectedWorkspace?.id).toBe('workspace-1')
    expect(state.selectedSession?.id).toBe('session-1')
    expect(state.isWorkspaceContextRoute).toBe(true)
  })

  it('filters workspaces without looking into app-owned session content', () => {
    const state = deriveWorkerStudioLocatorState({
      data,
      query: 'hir',
      route: { kind: 'worker', workerId: 'hr-worker' },
      selectedWorkerId: null,
      selectedWorkspaceId: null,
    })

    expect(state.filteredWorkspaces.map(workspace => workspace.id)).toEqual(['workspace-1'])
  })
})
```

- [ ] **Step 2: Run locator test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/studio/locator.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement locator helper**

Create `apps/web/src/worker/studio/locator.ts`:

```ts
import type { WorkerRoute } from '../../app/router/worker-route'
import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'

import { displayTemplate } from '../../features/i18n'
import { latest, sessionForWorkspace } from '../../features/local-workspace/model'

export function deriveWorkerStudioLocatorState({
  data,
  query,
  route,
  selectedWorkerId,
  selectedWorkspaceId,
}: {
  data: LocalWorkspaceData
  query: string
  route: WorkerRoute
  selectedWorkerId: string | null
  selectedWorkspaceId: string | null
}) {
  const allSessions = data.sessions
  const routedWorkspace = route.kind === 'workspace' || route.kind === 'session'
    ? data.workspaces.find(workspace => workspace.id === route.workspaceId) ?? null
    : null
  const routedWorker = route.kind === 'worker'
    ? data.workers.find(worker => worker.id === route.workerId) ?? null
    : routedWorkspace ? data.workers.find(worker => worker.id === routedWorkspace.workerId) ?? null : null
  const availableSoulIds = new Set(data.souls.filter(soul => soul.status === 'available').map(soul => soul.id))
  const templatedSoulIds = new Set(data.templates.map(template => template.soulId))
  const selectableWorkers = data.workers.filter(worker => availableSoulIds.has(worker.soulId) && templatedSoulIds.has(worker.soulId))
  const routedSelectableWorker = routedWorker && selectableWorkers.some(worker => worker.id === routedWorker.id)
    ? routedWorker
    : null
  const selectedWorker = routedSelectableWorker
    ?? (selectedWorkerId ? selectableWorkers.find(worker => worker.id === selectedWorkerId) ?? null : null)
    ?? selectableWorkers[0]
    ?? null
  const selectedSoul = selectedWorker
    ? data.souls.find(soul => soul.id === selectedWorker.soulId) ?? null
    : null
  const selectedSoulApp = selectedWorker
    ? data.apps.find(app => app.appId === selectedWorker.soulId || app.projectedSoul?.id === selectedWorker.soulId) ?? null
    : null
  const templates = data.templates.filter(template => template.soulId === selectedWorker?.soulId)
  const soulWorkspaces = data.workspaces.filter(item => item.workerId === selectedWorker?.id)
  const workspaceIds = new Set(soulWorkspaces.map(item => item.id))
  const soulSessions = allSessions.filter(session => workspaceIds.has(session.workspaceId))
  const needle = query.trim().toLowerCase()
  const filteredWorkspaces = soulWorkspaces.filter((item) => {
    const latestSession = sessionForWorkspace(item, allSessions)
    const template = data.templates.find(candidate => candidate.id === latestSession?.capabilityTemplateId)
    const templateCopy = template ? displayTemplate(template, data.settings.language) : null
    return !needle
      || item.name.toLowerCase().includes(needle)
      || template?.name.toLowerCase().includes(needle)
      || templateCopy?.name.toLowerCase().includes(needle)
  })
  const routeWorkspaceId = route.kind === 'workspace' || route.kind === 'session' ? route.workspaceId : null
  const routeWorkspace = routeWorkspaceId ? soulWorkspaces.find(item => item.id === routeWorkspaceId) ?? null : null
  const manuallySelectedWorkspace = selectedWorkspaceId && soulWorkspaces.some(item => item.id === selectedWorkspaceId)
    ? soulWorkspaces.find(item => item.id === selectedWorkspaceId) ?? null
    : null
  const selectedWorkspace = routeWorkspace ?? manuallySelectedWorkspace ?? latest(soulWorkspaces)
  const routeSession = route.kind === 'session'
    ? allSessions.find(session => session.id === route.sessionId && session.workspaceId === route.workspaceId) ?? null
    : null
  const selectedSession = routeSession ?? (route.kind === 'workspace' ? null : selectedWorkspace ? sessionForWorkspace(selectedWorkspace, allSessions) : latest(soulSessions))
  const isWorkspaceContextRoute = (route.kind === 'workspace' || route.kind === 'session') && Boolean(selectedWorkspace)

  return {
    allSessions,
    filteredWorkspaces,
    isWorkspaceContextRoute,
    selectableWorkers,
    selectedSession,
    selectedSoul,
    selectedSoulApp,
    selectedWorker,
    selectedWorkspace,
    soulSessions,
    soulWorkspaces,
    templates,
  }
}
```

If TypeScript reports that `data.settings.language` can be `undefined`, replace the `templateCopy` line with:

```ts
const templateCopy = template ? displayTemplate(template, data.settings.language ?? 'en') : null
```

- [ ] **Step 4: Run locator tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/studio/locator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/studio/locator.ts apps/web/src/worker/studio/locator.test.ts
git commit -m "test: 固定 WorkerStudio locator 派生"
```

## Task 5: Extract Generic Mounted Surface

**Files:**
- Create: `apps/web/src/worker/studio/mounted-surface.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Move the mounted surface component**

Create `apps/web/src/worker/studio/mounted-surface.tsx` by moving these existing symbols from `apps/web/src/worker/worker-studio.tsx` without behavior changes:

```ts
export interface MountedMicroAppSurfaceResponse {
  microApp: {
    data: MountedMicroAppHostData
    name: string
    url: string
  }
  surface: {
    id: string
    kind: string
    label: string
    renderer: 'micro-app'
  }
}

export function MountedSoulAppRouteSurface({
  appId,
  resolvedTheme,
  route,
  routeMemoryRef,
  sessionId,
  workerId,
  workspaceId,
}: {
  appId: string
  resolvedTheme: ResolvedTheme
  route: HostedSoulApp['manifest']['ui']['routes'][number]
  routeMemoryRef: MutableRefObject<Map<string, string>>
  sessionId?: string | null
  workerId?: string | null
  workspaceId?: string | null
}) {
  // Paste the current implementation body from worker-studio.tsx without changing behavior.
}

async function openMountedChildRoute(
  microAppName: string,
  routeMemoryRef: MutableRefObject<Map<string, string>>,
  memoryKey: string,
  basePath: string,
  path: string,
  options: { replace?: boolean } = {},
): Promise<void> {
  // Paste the current implementation body from worker-studio.tsx without changing behavior.
}
```

The concrete imports for the new file should be:

```ts
import type {
  HostedSoulApp,
  MountedMicroAppChildEvent,
  MountedMicroAppHostData,
} from '@zonease/aiworker-shared'
import type { MutableRefObject } from 'react'
import type { ResolvedTheme } from '../../features/theme/system-theme'

import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { CardContent } from '@zonease/aiworker-ui/components/card'
import { ItemDescription } from '@zonease/aiworker-ui/components/item'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveMountedSurface } from '../../features/local-workspace/api/workspace-data'
import {
  addMountedMicroAppDataListener,
  addMountedMicroAppRouteListener,
  ensureMicroAppStarted,
  getMountedMicroAppCurrentRoute,
  pushMountedMicroAppRoute,
  replaceMountedMicroAppRoute,
  sendMountedMicroAppData,
  setMountedMicroAppElementData,
} from '../../lib/micro-app-runtime'
import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from '../mounted-child-route'
```

- [ ] **Step 2: Update WorkerStudio imports**

In `apps/web/src/worker/worker-studio.tsx`, remove direct imports from `../lib/micro-app-runtime` and remove `MountedMicroAppChildEvent` / `MountedMicroAppHostData` type imports. Add:

```ts
import { MountedSoulAppRouteSurface } from './studio/mounted-surface'
```

- [ ] **Step 3: Remove moved code from WorkerStudio**

Delete the local `MountedMicroAppSurfaceResponse` interface, `MountedSoulAppRouteSurface` component and `openMountedChildRoute` helper from `worker-studio.tsx`.

- [ ] **Step 4: Run mounted route tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "micro-app|mounted|session locator"
```

Expected: PASS for mounted route and session locator tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/studio/mounted-surface.tsx apps/web/src/worker/worker-studio.tsx
git commit -m "refactor: 抽出 Host mounted surface"
```

## Task 6: Extract Host Chrome And First-Run Surface

**Files:**
- Create: `apps/web/src/worker/studio/host-chrome.tsx`
- Create: `apps/web/src/worker/studio/first-run-soul-app-home.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Move Host chrome components**

Create `apps/web/src/worker/studio/host-chrome.tsx` by moving `HostTopBar`, `HostSidebarActions`, `HostSidebarFooter` and `workerInitials` if needed by chrome.

Use these imports:

```ts
import { Add01Icon, ArrowRight01Icon, PanelBottom, PanelLeftIcon, PanelRightIcon, Search01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@zonease/aiworker-ui/components/breadcrumb'
import { ItemActions, ItemContent, ItemDescription, ItemTitle } from '@zonease/aiworker-ui/components/item'
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@zonease/aiworker-ui/components/sidebar'
import { Fragment } from 'react'
```

Export the components:

```ts
export function HostTopBar({
  locatorSegments,
  onToggleSidebar,
  sidebarCollapsed,
}: {
  locatorSegments: string[]
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
}) {
  // Paste the current HostTopBar body from worker-studio.tsx without changing markup.
}

export function HostSidebarActions({
  onCreateWorker,
  onOpenSoulApps,
}: {
  onCreateWorker: () => void
  onOpenSoulApps: () => void
}) {
  // Paste the current HostSidebarActions body from worker-studio.tsx without changing markup.
}

export function HostSidebarFooter({
  onOpenSettings,
  runtimeVersion,
}: {
  onOpenSettings: () => void
  runtimeVersion: string
}) {
  // Paste the current HostSidebarFooter body from worker-studio.tsx without changing markup.
}
```

- [ ] **Step 2: Move first-run Soul App home**

Create `apps/web/src/worker/studio/first-run-soul-app-home.tsx` by moving `FirstRunSoulAppHome` and `soulForApp`.

Use these imports:

```ts
import type { HostedSoulApp } from '@zonease/aiworker-shared'
import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'
import type { messagesFor, normalizeLocale } from '../../features/i18n'

import { ArrowRight01Icon, File02Icon, Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { ItemContent, ItemDescription, ItemGroup } from '@zonease/aiworker-ui/components/item'
import { displaySoul, formatStatus } from '../../features/i18n'
import { StudioEmptyState } from '../components/studio-shell'
```

Export:

```ts
export function FirstRunSoulAppHome({
  apps,
  copy,
  locale,
  onCreateWorker,
  onStartApp,
  souls,
}: {
  apps: HostedSoulApp[]
  copy: ReturnType<typeof messagesFor>
  locale: ReturnType<typeof normalizeLocale>
  onCreateWorker: () => void
  onStartApp: (app: HostedSoulApp) => void
  souls: LocalWorkspaceData['souls']
}) {
  // Paste the current FirstRunSoulAppHome body from worker-studio.tsx without changing behavior.
}
```

- [ ] **Step 3: Update WorkerStudio imports**

In `worker-studio.tsx`, add:

```ts
import { FirstRunSoulAppHome } from './studio/first-run-soul-app-home'
import { HostSidebarActions, HostSidebarFooter, HostTopBar } from './studio/host-chrome'
```

Remove the moved local functions from the bottom of the file.

- [ ] **Step 4: Run chrome tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "Host actions|first run|worker rail|Soul Apps"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/studio/host-chrome.tsx \
  apps/web/src/worker/studio/first-run-soul-app-home.tsx \
  apps/web/src/worker/worker-studio.tsx
git commit -m "refactor: 抽出 Host shell chrome"
```

## Task 7: Extract Workspace Fallback

**Files:**
- Create: `apps/web/src/worker/studio/workspace-fallback.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Create fallback component**

Create `apps/web/src/worker/studio/workspace-fallback.tsx` and move the JSX that currently renders:

- no-mounted-surface empty state;
- worker identity block;
- template badges;
- workspace list;
- workspace search input and create workspace trigger.

Export two components:

```ts
export function WorkspaceContextNoMountedSurface(/* props from current branch */) {
  // Move the current workspace-context no-mounted-surface JSX.
}

export function WorkerHomeFallback(/* props from current branch */) {
  // Move the current worker home fallback JSX.
}
```

The new file should import only shadcn primitives, Hugeicons, i18n helpers, `WorkerIdentityBlock`, `WorkspaceCard`, `sessionForWorkspace`, `turnForSession` and shell components. It must not import `SessionComposer`, `features/session`, `session-progress`, or session turn API clients.

- [ ] **Step 2: Update WorkerStudio fallback branches**

In `worker-studio.tsx`, replace the two large `!showMountedWorkbenchRoute` JSX branches with:

```tsx
<WorkspaceContextNoMountedSurface
  copy={copy}
  selectedSoulCopy={selectedSoulCopy}
  selectedWorkspace={selectedWorkspace}
  onOpenSettings={() => openSettings()}
  onRefresh={() => void refresh()}
/>
```

and:

```tsx
<WorkerHomeFallback
  allSessions={allSessions}
  copy={copy}
  data={data}
  filteredWorkspaces={filteredProjects}
  locale={activeLocale}
  query={query}
  selectedSoul={selectedSoul}
  selectedSoulCopy={selectedSoulCopy}
  selectedWorker={selectedWorker}
  selectedWorkspace={selectedWorkspace}
  templates={templates}
  onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
  onOpenSettings={() => openSettings()}
  onRefresh={() => void refresh()}
  onSearch={setQuery}
  onSelectWorkspace={(item) => {
    setSelectedWorkspaceId(item.id)
    navigateWorkerRoute({ kind: 'workspace', workerId: item.workerId, workspaceId: item.id })
  }}
/>
```

The fallback component must use the prop names shown above. It receives locator data and callbacks only; it does not fetch or submit session turns.

- [ ] **Step 3: Run fallback tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "workspace|no mounted|session composition|retired"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/worker/studio/workspace-fallback.tsx apps/web/src/worker/worker-studio.tsx
git commit -m "refactor: 抽出 Host workspace fallback"
```

## Task 8: Wire Locator And Route Preferences Into WorkerStudio

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/studio/locator.ts`
- Modify: `apps/web/src/worker/studio/mounted-route-preferences.ts`

- [ ] **Step 1: Replace inline locator derivation**

In `worker-studio.tsx`, import:

```ts
import { deriveWorkerStudioLocatorState } from './studio/locator'
```

Replace the inline derived constants for selectable workers, selected worker, selected Soul App, templates, soul workspaces/sessions, filtered projects, selected workspace/session and `isWorkspaceContextRoute` with:

```ts
  const locator = useMemo(() => data
    ? deriveWorkerStudioLocatorState({
        data,
        query,
        route,
        selectedWorkerId,
        selectedWorkspaceId,
      })
    : null, [data, query, route, selectedWorkerId, selectedWorkspaceId])

  const allSessions = locator?.allSessions ?? []
  const selectableWorkers = locator?.selectableWorkers ?? []
  const selectedWorker = locator?.selectedWorker ?? null
  const selectedSoul = locator?.selectedSoul ?? null
  const selectedSoulApp = locator?.selectedSoulApp ?? null
  const templates = locator?.templates ?? []
  const soulWorkspaces = locator?.soulWorkspaces ?? []
  const soulSessions = locator?.soulSessions ?? []
  const filteredProjects = locator?.filteredWorkspaces ?? []
  const selectedWorkspace = locator?.selectedWorkspace ?? null
  const selectedSession = locator?.selectedSession ?? null
  const isWorkspaceContextRoute = locator?.isWorkspaceContextRoute ?? false
```

Keep `workerConfigurationWorker`, `workerConfigurationSoulApp` and Worker Configuration overlay target logic in `worker-studio.tsx`, because it is dialog state.

- [ ] **Step 2: Replace inline mounted route preference helpers**

Import:

```ts
import {
  persistActiveMountedRoutePreferences,
  readActiveMountedRoutePreferences,
  resolveActiveMountedRoute,
  updateWorkerMountedRoutePreference,
} from './studio/mounted-route-preferences'
```

Replace local `activeMountedRoutePreferenceKey`, `readActiveMountedRoutePreferences`, `persistActiveMountedRoutePreferences` and `isRecord`.

Use:

```ts
  const activeMountedRoute = useMemo(() => resolveActiveMountedRoute({
    preferences: activeMountedTabMap,
    routes: selectedMountedRoutes,
    workerId: selectedWorker?.id ?? null,
  }), [activeMountedTabMap, selectedMountedRoutes, selectedWorker?.id])
```

For Worker Configuration tab selection:

```ts
        onSelectWorkbenchTab={(tab) => {
          if (workerConfigurationWorker) {
            updateActiveMountedTabMap(prev => updateWorkerMountedRoutePreference({
              current: prev,
              routeId: tab.id,
              workerId: workerConfigurationWorker.id,
            }))
          }
        }}
```

- [ ] **Step 3: Remove now-unused imports and helpers**

Remove imports that are no longer used after extraction:

- `MutableRefObject`
- `MountedMicroAppChildEvent`
- `MountedMicroAppHostData`
- direct micro-app runtime functions
- `Avatar`, `AvatarFallback` if moved to fallback or chrome
- `Breadcrumb*` if moved to host chrome
- `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem` if moved to host chrome

Run:

```bash
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: PASS or only actionable unused-import/type errors in files touched by this task. Fix those errors before continuing.

- [ ] **Step 4: Run full Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: PASS.

- [ ] **Step 5: Check WorkerStudio size**

Run:

```bash
wc -l apps/web/src/worker/worker-studio.tsx apps/web/src/worker/studio/*.ts apps/web/src/worker/studio/*.tsx
```

Expected: `worker-studio.tsx` is substantially smaller than the previous 1267 lines and no longer contains `function MountedSoulAppRouteSurface`, `function HostTopBar`, `function FirstRunSoulAppHome`, or `activeMountedRoutePreferenceKey`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/worker/worker-studio.tsx \
  apps/web/src/worker/studio/locator.ts \
  apps/web/src/worker/studio/mounted-route-preferences.ts
git commit -m "refactor: 拆薄 WorkerStudio locator 接线"
```

## Task 9: Extend Boundary Script Completion Audit

**Files:**
- Modify: `scripts/check-soul-app-boundaries.ts`

- [ ] **Step 1: Add retired Host Web surface scanner**

In `scripts/check-soul-app-boundaries.ts`, add this constant near `forbiddenHostWebImports`:

```ts
const retiredHostWebSurfacePatterns: Array<{ message: string, pattern: RegExp }> = [
  {
    message: 'Host Web must not keep WorkspaceSessionComposer; session product UI belongs in Soul-owned mounted surfaces.',
    pattern: /\bWorkspaceSessionComposer\b/,
  },
  {
    message: 'Host Web must not keep Host-owned session turn clients; turns are started by the engine bridge or Soul-owned mounted UI.',
    pattern: /\b(?:createSessionTurn|continueSessionTurn)(?:Stream)?\b/,
  },
  {
    message: 'Host Web must not keep Host-owned MarkdownPreview session surfaces.',
    pattern: /\bMarkdownPreview\b/,
  },
  {
    message: 'Host Web must not keep Host-owned session progress surfaces.',
    pattern: /\bbuildSessionProgress\b/,
  },
]
```

Add the new scanner to the `issues` array:

```ts
  ...scanHostWebRetiredProductSurfaces(),
```

Add this function after `scanHostWebPackageImports()`:

```ts
function scanHostWebRetiredProductSurfaces(): BoundaryIssue[] {
  if (!completionAudit)
    return []
  const webRoot = path.join(repoRoot, 'apps/web')
  if (!existsSync(webRoot))
    return []
  const issues: BoundaryIssue[] = []
  for (const file of listSourceFiles(webRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    if (isTestSourceFile(file))
      continue
    if (relative.includes('/features/session/')) {
      issues.push(issue(file, 'features/session', 'Host Web must not keep retired Host-owned session product feature files.'))
      continue
    }
    if (relative.endsWith('/worker/session-progress.ts')) {
      issues.push(issue(file, 'session-progress', 'Host Web must not keep retired Host-owned session progress files.'))
      continue
    }
    const content = readFileSync(file, 'utf8')
    for (const retired of retiredHostWebSurfacePatterns) {
      if (retired.pattern.test(content))
        issues.push(issue(file, retired.pattern.source, retired.message))
    }
  }
  return issues
}
```

- [ ] **Step 2: Run boundary audit**

Run:

```bash
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: PASS after Task 2 deletion.

- [ ] **Step 3: Confirm locator words are not blocked**

Run:

```bash
rg -n "sessionId|workspaceId" apps/web/src/worker apps/web/src/features/local-workspace/api
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: `rg` finds locator/context usage, and the audit still passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-soul-app-boundaries.ts
git commit -m "test: 扩展 Host Web 边界审计"
```

## Task 10: Record API/CLI/shared Audit Findings

**Files:**
- Modify: `docs/changelog.md`
- Optional Modify/Create: `docs/task/*.md`, `docs/task/index.md`, `docs/plan/*.md`, `docs/plan/index.md`

- [ ] **Step 1: Add changelog entry**

Prepend this entry to `docs/changelog.md` after `# AIWorker Changelog`:

```md
## 2026-05-23 [completed] Cleaned apps/web Host boundary

Cleaned `apps/web` back to the active Host contract. Worker Web no longer keeps
old Host-owned session composer, markdown preview, progress, or session turn
client files. `WorkerStudio` was split into locator, mounted surface, mounted
route preference, Host chrome, first-run, and workspace fallback modules so the
main entry remains a shell composition layer.

The completion audit now rejects retired Host Web session product surfaces while
still allowing `workerId`, `workspaceId`, and `sessionId` as opaque locator or
mount context. API/CLI/shared follow-up risks remain documented separately:
global session turn API compatibility, stale `host-descriptor` schema support,
and scaffold wording that could imply Host-owned workbench behavior.
```

- [ ] **Step 2: If PMA sync is required, create a follow-up task**

Create `docs/task/TODO-047.md` with:

```md
# TODO-047 Audit API/CLI/shared Host/Soul boundary leftovers

Status: Pending
Priority: P2

## Context

`apps/web` boundary cleanup identified API/CLI/shared surfaces that may still
carry older Host-owned workbench or session compatibility concepts.

## Scope

- Decide whether global session turn API routes remain as engine bridge
  compatibility or should become worker-scoped only.
- Decide whether shared manifest `host-descriptor` and `ui.workbench`
  descriptor support should be removed or retained for authoring compatibility.
- Audit CLI scaffold output for wording that could imply Host-owned workbench
  actions/search/configuration.

## Acceptance

- Active architecture remains the source of truth.
- Follow-up changes are planned separately before implementation.
```

Append to `docs/task/index.md`:

```md
- [ ] [**TODO-047 Audit API/CLI/shared Host/Soul boundary leftovers**](TODO-047.md) `P2`
```

Skip this step if the implementation owner records the audit in an existing PMA task instead.

- [ ] **Step 3: Run docs diff check**

Run:

```bash
git diff --check -- docs/changelog.md docs/task docs/plan
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/changelog.md docs/task/TODO-047.md docs/task/index.md
git commit -m "docs: 记录 apps/web 边界清洗"
```

If no PMA task was created, use:

```bash
git add docs/changelog.md
git commit -m "docs: 记录 apps/web 边界清洗"
```

## Task 11: Final Verification And Code Review Graph

**Files:**
- No new source files unless verification exposes a bug.

- [ ] **Step 1: Run focused boundary audit**

Run:

```bash
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: PASS.

- [ ] **Step 2: Run Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: PASS.

- [ ] **Step 3: Run Web build**

Run:

```bash
bun run --filter '@zonease/aiworker-web' build
```

Expected: PASS.

- [ ] **Step 4: Run UI audit**

Run:

```bash
bun run ui:check
```

Expected: PASS. If this flags only deleted legacy session files, update the checker references rather than weakening the rule.

- [ ] **Step 5: Run diff check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: `crg:update` completes and `crg:review` reports no blocking issues. Fix any P0/P1 or boundary-related finding before closeout.

- [ ] **Step 7: Inspect final file shape**

Run:

```bash
wc -l apps/web/src/worker/worker-studio.tsx apps/web/src/worker/studio/*
rg -n "WorkspaceSessionComposer|createSessionTurn|continueSessionTurn|MarkdownPreview|buildSessionProgress|@zonease/aiworker-soul-app-workbench|UniversalWorkbenchApp" apps/web/src scripts/check-soul-app-boundaries.ts
```

Expected:

- `worker-studio.tsx` is substantially smaller than 1267 lines.
- `rg` only finds intentional test/guard strings, not production Host Web imports or components.

- [ ] **Step 8: Final commit if verification required fixes**

If verification required fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix: 完成 apps/web 边界清洗验证"
```

If no fixes were required after prior task commits, do not create an empty commit.

## Self-Review Checklist

- Spec coverage:
  - Delete old Host session UI/client residuals: Task 2.
  - Split `worker-studio.tsx`: Tasks 3 through 8.
  - Keep mounted surface manifest-driven: Tasks 5, 8 and 11.
  - Worker-scoped route preferences: Task 3 and Task 8.
  - Boundary guardrails: Task 1 and Task 9.
  - API/CLI/shared audit-only scope: Task 10.
- No placeholders:
  - The plan uses explicit file paths, commands and expected outcomes.
  - Optional PMA sync has an exact file and exact text if used.
- Type consistency:
  - `resolveActiveMountedRoute`, `readActiveMountedRoutePreferences`, `persistActiveMountedRoutePreferences`, and `updateWorkerMountedRoutePreference` are introduced before `worker-studio.tsx` imports them.
  - `deriveWorkerStudioLocatorState` is introduced before `worker-studio.tsx` imports it.
  - Mounted surface extraction preserves current prop names and behavior.
