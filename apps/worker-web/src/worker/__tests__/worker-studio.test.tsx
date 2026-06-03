import type { HostedSoulApp, LocalSessionEvent, LocalSettingsConfig, LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-descriptor'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { engineIconSrc } from '../../features/settings/model'
import { WorkerStudio } from '../worker-studio'

const now = '2026-05-10T00:00:00.000Z'
const PRIMARY_SOUL_ID = 'aiworker-demo-primary'

function openHostSettings() {
  fireEvent.click(screen.getByRole('button', { name: /^Open local Host settings/ }))
}

function selectSettingsTab(tab: HTMLElement) {
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
}

const workspace = {
  createdAt: now,
  id: 'workspace-1',
  workerId: 'primary-worker',
  name: 'Demo Workspace',
  rootPath: '/tmp/demo-workspace',
  type: 'workspace',
  status: 'active',
  sourcePointersJson: [],
  metadataJson: {},
  updatedAt: now,
}

const workers = [
  { createdAt: now, defaultEngineId: 'codex', id: 'primary-worker', metadataJson: {}, name: 'Primary', appId: PRIMARY_SOUL_ID, status: 'active', updatedAt: now },
]

const souls = [
  { description: 'Primary operations workspace', id: PRIMARY_SOUL_ID, name: 'Demo Primary', status: 'available' },
]

const themeMediaQuery = '(prefers-color-scheme: dark)'

const baseSettings: LocalSettingsConfig = {
  appearance: 'system',
  byok: { apiKeyRef: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', provider: 'openai-compatible' },
  connectors: [
    { enabled: false, id: 'ats', name: 'ATS / Source', status: 'not_configured' },
    { enabled: false, id: 'ci', name: 'CI / secondary evidence', status: 'not_configured' },
  ],
  engineId: 'codex',
  engines: [{ command: 'codex', id: 'codex', installed: true, name: 'Codex CLI', path: '/usr/local/bin/codex', version: 'codex 1.0.0' }],
  executionMode: 'local-cli',
  externalMcpServers: [{ command: '', enabled: false, id: 'team-context', name: 'Team context MCP' }],
  language: 'en',
  localMcpServer: { enabled: false, url: 'http://127.0.0.1:4319/mcp' },
  updatedAt: now,
}

const sessionRecord = {
  createdAt: now,
  endedAt: null,
  id: 'session-1',
  metadataJson: {},
  startedAt: now,
  status: 'active',
  title: 'Screen request',
  updatedAt: now,
  workerId: 'primary-worker',
  workspaceId: 'workspace-1',
}

const eventRecord = {
  createdAt: now,
  id: 1,
  invocationId: 'invocation-1',
  payloadJson: { status: 'succeeded' },
  seq: 0,
  sessionId: 'session-1',
  type: 'status',
} satisfies LocalSessionEvent

let currentEvents: LocalSessionEvent[]
let currentSettings: typeof baseSettings
let currentSessions: typeof sessionRecord[]
let currentSouls: typeof souls
let currentWorkers: typeof workers
let currentWorkspaces: typeof workspace[]
let currentWorkerOverlayAssets: LocalWorkerOverlayAsset[]
let hideCreatedWorkerFromWorkerList: boolean
let lastMessageRequestBody: Record<string, unknown> | null
let lastSessionRequestBody: Record<string, unknown> | null
let lastWorkerRequestBody: Record<string, unknown> | null
let lastWorkspaceRequestBody: Record<string, unknown> | null
let currentApps: HostedSoulApp[]

function hostedApp({
  appId,
  appName,
  permissions = [],
  status = 'enabled',
}: {
  appId: string
  appName: string
  permissions?: HostedSoulApp['permissions']
  status?: HostedSoulApp['status']
}): HostedSoulApp {
  return {
    api: {
      localService: null,
      routePrefix: `/api/apps/${appId}`,
    },
    appId,
    description: `${appName} descriptor`,
    descriptor: {
      engine: {},
      identity: {
        id: appId,
        name: appName,
      },
      protocol: 'soul/v1',
    },
    descriptorDigest: `${appId}-digest`,
    engineAssets: {
      workspace: { source: 'engine-assets/workspace' },
    },
    healthMessage: null,
    healthStatus: 'unknown',
    name: appName,
    permissions,
    projectedSoul: {
      description: `${appName} descriptor`,
      id: appId,
      name: appName,
      status: status === 'enabled' ? 'available' : 'coming_soon',
    },
    sourceKind: 'descriptor-path',
    sourceRef: `/tmp/${appId}/dist/soul.descriptor.json`,
    status,
    validationIssues: [],
  }
}

function catalogOnlyAppForSoul(
  soul: typeof souls[number],
): HostedSoulApp {
  const app = hostedApp({ appId: soul.id, appName: soul.name })
  return {
    ...app,
    description: soul.description,
    projectedSoul: {
      ...soul,
      status: soul.status === 'available' ? 'available' : 'coming_soon',
    },
  }
}

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

function resetSettings() {
  currentSettings = {
    ...baseSettings,
    byok: { ...baseSettings.byok },
    connectors: baseSettings.connectors.map(item => ({ ...item })),
    engines: baseSettings.engines.map(item => ({ ...item })),
    externalMcpServers: baseSettings.externalMcpServers.map(item => ({ ...item })),
    localMcpServer: { ...baseSettings.localMcpServer },
  }
  currentWorkspaces = [{ ...workspace }]
  currentSessions = [{ ...sessionRecord }]
  currentSouls = souls.map(soul => ({ ...soul }))
  currentEvents = [{ ...eventRecord }]
  currentWorkers = workers.map(worker => ({ ...worker }))
  currentWorkerOverlayAssets = [{
    checksum: 'sha256:briefing-brief',
    enabled: true,
    id: 'briefing-brief',
    kind: 'skill',
    metadataJson: {},
    optionsJson: {},
    source: 'overlay',
    sourceRef: 'descriptor://engine/skills/briefing-brief',
    target: 'codex',
    updatedAt: now,
  }]
  hideCreatedWorkerFromWorkerList = false
  lastMessageRequestBody = null
  lastSessionRequestBody = null
  lastWorkerRequestBody = null
  lastWorkspaceRequestBody = null
  currentApps = currentSouls.map(soul => catalogOnlyAppForSoul(soul))
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<EventListenerOrEventListenerObject>()
  const queryList = {
    get matches() {
      return matches
    },
    media: themeMediaQuery,
    onchange: null as MediaQueryList['onchange'],
    addEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
      if (event === 'change')
        listeners.add(listener)
    }),
    removeEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
      if (event === 'change')
        listeners.delete(listener)
    }),
    addListener: vi.fn((listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener)
    }),
    removeListener: vi.fn((listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener)
    }),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList

  const controller = {
    matchMedia: vi.fn(() => queryList),
    setMatches(next: boolean) {
      matches = next
      const event = { matches, media: themeMediaQuery } as MediaQueryListEvent
      for (const listener of listeners) {
        if (typeof listener === 'function')
          listener(event)
        else
          listener.handleEvent(event)
      }
      queryList.onchange?.(event)
    },
  }
  vi.stubGlobal('matchMedia', controller.matchMedia)
  return controller
}

beforeEach(() => {
  resetSettings()
  window.history.replaceState(null, '', '/')
  document.documentElement.lang = ''
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
  window.localStorage.clear()
  installMatchMedia(false)
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status,
    })
    const requestUrl = new URL(url, 'http://local.test')

    if (requestUrl.pathname === '/api/info')
      return json({ runtimeVersion: 'test', startedAt: now, workers: currentWorkers })
    if (requestUrl.pathname === '/api/app-installation/apps')
      return json({ apps: currentApps })
    if (requestUrl.pathname === '/api/app-installation/apps/aiworker-demo-secondary/enable' && method === 'POST') {
      const enabled = currentApps.find(app => app.appId === 'aiworker-demo-secondary')
      currentApps = currentApps.map(app => app.appId === 'aiworker-demo-secondary' ? { ...app, status: 'enabled' } : app)
      return json({
        app: enabled ? { ...enabled, status: 'enabled' } : null,
        catalog: { apps: currentApps, souls: currentSouls },
      })
    }
    if (requestUrl.pathname === '/api/workers' && method === 'GET')
      return json({ workers: currentWorkers })
    if (requestUrl.pathname === '/api/workers' && method === 'POST') {
      lastWorkerRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      const created = {
        ...workers[0]!,
        id: 'worker-created',
        name: String(lastWorkerRequestBody.name ?? 'Created worker'),
        appId: String(lastWorkerRequestBody.appId ?? PRIMARY_SOUL_ID),
      }
      if (!hideCreatedWorkerFromWorkerList)
        currentWorkers = [created, ...currentWorkers]
      return json({ worker: created }, 201)
    }
    const workerConfigReadMatch = requestUrl.pathname.match(/^\/api\/workers\/([^/]+)\/config$/)
    if (workerConfigReadMatch && method === 'GET') {
      const workerId = decodeURIComponent(workerConfigReadMatch[1]!)
      return json({
        config: { values: [] },
        overlay: { assets: currentWorkerOverlayAssets, workerId },
        workerId,
      })
    }
    const workerConfigMatch = requestUrl.pathname.match(/^\/api\/workers\/([^/]+)\/config\/([^/]+)(?:\/archive)?$/)
    if (workerConfigMatch) {
      const workerId = decodeURIComponent(workerConfigMatch[1]!)
      const configKey = decodeURIComponent(workerConfigMatch[2]!)
      const archive = requestUrl.pathname.endsWith('/archive')
      if (archive && method === 'POST') {
        return json({ config: { archived: true, configKey, updatedAt: now, value: null, workerId } })
      }
      if (method === 'PUT' || method === 'PATCH') {
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
        return json({ config: { archived: false, configKey, source: 'web', updatedAt: now, value: body, workerId } })
      }
    }
    if (requestUrl.pathname === '/api/workspace-locators' && method === 'POST') {
      lastWorkspaceRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      const created = { ...workspace, id: 'workspace-created', name: String(lastWorkspaceRequestBody.name ?? 'New workspace') }
      currentWorkspaces = [created, ...currentWorkspaces]
      return json({ workspace: created }, 201)
    }
    if (requestUrl.pathname === '/api/workspace-locators')
      return json({ workspaces: currentWorkspaces })
    if (requestUrl.pathname === '/api/sessions' && method === 'POST') {
      lastSessionRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      const created = {
        ...sessionRecord,
        id: 'session-created',
        title: String(lastSessionRequestBody.title ?? 'New session'),
        workspaceId: String(lastSessionRequestBody.workspaceId ?? 'workspace-1'),
      }
      currentSessions = [created, ...currentSessions]
      return json({ session: created }, 201)
    }
    if (requestUrl.pathname === '/api/sessions/session-1/invocations' && method === 'POST') {
      lastMessageRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      return json({ artifacts: [], events: [], files: [], invocation: { id: 'invocation-1', status: 'queued' }, session: sessionRecord }, 201)
    }
    const invocationEventsMatch = requestUrl.pathname.match(/^\/api\/engine\/invocations\/([^/]+)\/events$/)
    if (invocationEventsMatch && method === 'GET') {
      return json({ events: currentEvents, invocation: { id: invocationEventsMatch[1], status: 'succeeded' } })
    }
    if (requestUrl.pathname === '/api/sessions')
      return json({ sessions: currentSessions })
    if (requestUrl.pathname === '/api/settings' && method === 'PATCH') {
      const patch = init?.body ? JSON.parse(String(init.body)) as Partial<typeof baseSettings> : {}
      currentSettings = { ...currentSettings, ...patch, byok: { ...currentSettings.byok, ...(patch.byok ?? {}) }, updatedAt: now }
      return json({ settings: currentSettings })
    }
    if (requestUrl.pathname === '/api/settings')
      return json({ settings: currentSettings })
    if (requestUrl.pathname === '/api/engine/targets/rescan')
      return json({ engines: currentSettings.engines, settings: currentSettings })
    if (requestUrl.pathname === '/api/engine/targets/codex/test')
      return json({ result: { engineId: 'codex', message: 'Codex CLI responded.', status: 'pass' } })

    return json({}, 404)
  }))
})

describe('worker studio', () => {
  it('renders startup load failures through a shadcn alert', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('local daemon offline'))

    render(<WorkerStudio />)

    const loadFailure = await screen.findByText('local daemon offline')
    expect(loadFailure.getAttribute('data-slot')).toBe('alert-description')
    const loadFailureAlert = loadFailure.closest('[data-slot="alert"]')
    expect(loadFailureAlert).toBeTruthy()
    expect(loadFailureAlert?.getAttribute('role')).toBe('alert')
  })

  it('shows the bound Soul name in the Worker Workbench top bar without a worker switcher or Soul catalog', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker')
    render(<WorkerStudio />)

    const topBar = await screen.findByLabelText('Worker Workbench')
    expect(topBar.getAttribute('data-host-slot')).toBe('worker-top-bar')
    expect(within(topBar).getByText('Demo Primary')).toBeTruthy()
    // No multi-worker / Soul-catalog Host chrome in v1 standalone.
    expect(screen.queryByTestId('worker-switcher')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New Soul worker' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Soul Apps' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Switch to Primary' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create worker' })).toBeNull()
    expect(screen.queryByText('Loading Soul workspace...')).toBeNull()
  })

  it('renders the left panel as a workspace tree with sessions nested under each workspace', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker')
    render(<WorkerStudio />)

    const tree = await screen.findByTestId('workspace-tree')
    expect(within(tree).getByText('Demo Workspace')).toBeTruthy()
    expect(within(tree).getByRole('button', { name: 'Open session Screen request' })).toBeTruthy()
    expect(within(tree).getByRole('button', { name: 'New workspace' })).toBeTruthy()
    expect(within(tree).getAllByRole('button', { name: /New session/ }).length).toBeGreaterThan(0)
  })

  it('renders the selected session chat directly in the main area without a mounted micro-app', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker/workspaces/workspace-1/sessions/session-1')
    render(<WorkerStudio />)

    await screen.findByTestId('worker-studio-shell')
    // The shell renders the chat surface (transcript + composer) itself.
    expect(await screen.findByRole('log', { name: 'Session events' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send invocation' })).toBeTruthy()
    // No mounted micro-app machinery anywhere.
    expect(document.querySelector('micro-app')).toBeNull()
    expect(document.querySelector('[data-slot="soul-app-mounted-micro-app"]')).toBeNull()
    expect(screen.queryByTitle('Demo Primary Workbench')).toBeNull()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/mount/workbench'))).toBe(false)
  })

  it('submits a follow-up invocation from the directly-rendered session chat', async () => {
    currentEvents = [{
      ...eventRecord,
      id: 2,
      payloadJson: { data: { text: 'engine reply here' } },
      seq: 1,
      type: 'assistant_delta',
    }]
    window.history.replaceState(null, '', '/workers/primary-worker/workspaces/workspace-1/sessions/session-1')
    render(<WorkerStudio />)

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'continue please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invocation' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/sessions/session-1/invocations', expect.objectContaining({ method: 'POST' }))
    })
    expect(lastMessageRequestBody).toMatchObject({ input: 'continue please' })
    await waitFor(() => {
      expect(screen.getByText(/engine reply here/)).toBeTruthy()
    })
  })

  it('creates a workspace from the tree action and routes to it', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker')
    render(<WorkerStudio />)

    const tree = await screen.findByTestId('workspace-tree')
    fireEvent.click(within(tree).getByRole('button', { name: 'New workspace' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: 'Release workspace' } })
    fireEvent.click(within(dialog).getByTestId('create-project'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workspace-locators', expect.objectContaining({ method: 'POST' }))
      expect(window.location.pathname).toBe('/workers/primary-worker/workspaces/workspace-created')
    })
    expect(lastWorkspaceRequestBody).toMatchObject({ name: 'Release workspace', workerId: 'primary-worker' })
  })

  it('creates a worker first when the live workspace page has no active worker', async () => {
    currentWorkers = []
    currentWorkspaces = []
    currentSessions = []
    window.history.replaceState(null, '', '/')
    render(<WorkerStudio />)

    const main = await screen.findByLabelText('Soul workspaces and sessions')
    fireEvent.click(within(main).getByRole('button', { name: 'Create worker' }))

    const workerDialog = await screen.findByRole('dialog', { name: 'Create worker' })
    fireEvent.change(within(workerDialog).getByLabelText('Worker name'), { target: { value: 'Primary live worker' } })
    fireEvent.click(within(workerDialog).getByRole('button', { name: 'Create worker' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workers', expect.objectContaining({ method: 'POST' }))
    })
    expect(lastWorkerRequestBody).toMatchObject({ appId: PRIMARY_SOUL_ID, name: 'Primary live worker' })

    const workspaceDialog = await screen.findByRole('dialog', { name: 'Create workspace' })
    expect((within(workspaceDialog).getByLabelText('Current worker') as HTMLInputElement).value).toBe('Primary live worker / Demo Primary')
    fireEvent.change(within(workspaceDialog).getByLabelText('Workspace name'), { target: { value: 'Live browser workspace' } })
    fireEvent.click(within(workspaceDialog).getByTestId('create-project'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workspace-locators', expect.objectContaining({ method: 'POST' }))
      expect(window.location.pathname).toBe('/workers/worker-created/workspaces/workspace-created')
    })
    expect(lastWorkspaceRequestBody).toMatchObject({ name: 'Live browser workspace', workerId: 'worker-created' })
  })

  it('uses the created worker for workspace creation even before the worker list refresh sees it', async () => {
    currentWorkers = []
    currentWorkspaces = []
    currentSessions = []
    hideCreatedWorkerFromWorkerList = true
    window.history.replaceState(null, '', '/')
    render(<WorkerStudio />)

    const main = await screen.findByLabelText('Soul workspaces and sessions')
    fireEvent.click(within(main).getByRole('button', { name: 'Create worker' }))

    const workerDialog = await screen.findByRole('dialog', { name: 'Create worker' })
    fireEvent.change(within(workerDialog).getByLabelText('Worker name'), { target: { value: 'Delayed worker' } })
    fireEvent.click(within(workerDialog).getByRole('button', { name: 'Create worker' }))

    const workspaceDialog = await screen.findByRole('dialog', { name: 'Create workspace' })
    expect((within(workspaceDialog).getByLabelText('Current worker') as HTMLInputElement).value).toBe('Delayed worker / Demo Primary')
    fireEvent.change(within(workspaceDialog).getByLabelText('Workspace name'), { target: { value: 'Delayed refresh workspace' } })
    fireEvent.click(within(workspaceDialog).getByTestId('create-project'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workspace-locators', expect.objectContaining({ method: 'POST' }))
      expect(window.location.pathname).toBe('/workers/worker-created/workspaces/workspace-created')
    })
    expect(lastWorkspaceRequestBody).toMatchObject({ name: 'Delayed refresh workspace', workerId: 'worker-created' })
  })

  it('creates a workspace for the active worker even when its Soul app is not currently available', async () => {
    currentSouls = [
      { ...souls[0]!, status: 'coming_soon' },
      { description: 'Secondary workspace', id: 'aiworker-demo-secondary', name: 'Demo Secondary', status: 'available' },
    ]
    currentApps = currentSouls.map(soul => catalogOnlyAppForSoul(soul))
    currentWorkspaces = []
    currentSessions = []
    window.history.replaceState(null, '', '/')
    render(<WorkerStudio />)

    const main = await screen.findByLabelText('Soul workspaces and sessions')
    fireEvent.click(within(main).getByRole('button', { name: 'Create workspace' }))

    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('Current worker') as HTMLInputElement).value).toBe('Primary / Demo Primary')
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: 'Checkout deploy checklist' } })
    fireEvent.click(within(dialog).getByTestId('create-project'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workspace-locators', expect.objectContaining({ method: 'POST' }))
      expect(window.location.pathname).toBe('/workers/primary-worker/workspaces/workspace-created')
    })
    expect(lastWorkspaceRequestBody).toMatchObject({ name: 'Checkout deploy checklist', workerId: 'primary-worker' })
  })

  it('starts a new session from the workspace tree and routes to the session chat', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const tree = await screen.findByTestId('workspace-tree')
    fireEvent.click(within(tree).getAllByRole('button', { name: /New session/ })[0]!)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({ method: 'POST' }))
      expect(window.location.pathname).toBe('/workers/primary-worker/workspaces/workspace-1/sessions/session-created')
    })
    expect(lastSessionRequestBody).toMatchObject({ workerId: 'primary-worker', workspaceId: 'workspace-1' })
  })

  it('shows a create-first-workspace empty state when the worker has no workspaces', async () => {
    currentWorkspaces = []
    currentSessions = []
    window.history.replaceState(null, '', '/workers/primary-worker')
    render(<WorkerStudio />)

    const main = await screen.findByLabelText('Soul workspaces and sessions')
    expect(within(main).getByText('No workspaces yet')).toBeTruthy()
    expect(within(main).getByText('Create a Demo Primary workspace to start work.')).toBeTruthy()
    expect(within(main).getByRole('button', { name: 'Create workspace' })).toBeTruthy()

    const tree = screen.getByTestId('workspace-tree')
    expect(within(tree).getByText('No workspaces yet')).toBeTruthy()
    fireEvent.click(within(tree).getByRole('button', { name: 'New workspace (No workspaces yet)' }))
    expect(await screen.findByRole('dialog', { name: 'Create workspace' })).toBeTruthy()
  })

  it('shows a start-first-session empty state for a workspace with no sessions', async () => {
    currentSessions = []
    window.history.replaceState(null, '', '/workers/primary-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const main = await screen.findByLabelText('Soul workspaces and sessions')
    expect(within(main).getByText('No sessions in this workspace yet.')).toBeTruthy()
    expect(within(main).getByRole('button', { name: 'New session' })).toBeTruthy()
  })

  it('renders the latest session chat for a workspace route that already has sessions', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const main = await screen.findByLabelText('Soul workspaces and sessions')
    // Workspace route with existing sessions resolves to the latest session chat,
    // not a "no sessions" empty state that would contradict the populated tree.
    expect(within(main).getByRole('log', { name: 'Session events' })).toBeTruthy()
    expect(within(main).getByRole('textbox')).toBeTruthy()
    expect(within(main).queryByText('No sessions in this workspace yet.')).toBeNull()
  })

  it('keeps apps/worker-web free of retired Host-owned session product surfaces', () => {
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

  it('keeps apps/worker-web free of mounted micro-app machinery', () => {
    const files = listWebSourceFiles('src')
    const sources = files.map(file => ({
      file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      source: readFileSync(file, 'utf8'),
    }))

    expect(sources.some(item => item.file.endsWith('/worker/studio/mounted-surface.tsx'))).toBe(false)
    expect(sources.some(item => item.file.endsWith('/lib/micro-app-runtime.ts'))).toBe(false)
    for (const item of sources) {
      expect(item.source, item.file).not.toContain('@micro-zoe/micro-app')
      expect(item.source, item.file).not.toContain('MountedSoulAppRouteSurface')
      expect(item.source, item.file).not.toContain('resolveMountedWorkbench')
      expect(item.source, item.file).not.toContain('/api/mount/workbench')
    }
  })

  it('opens Worker configuration from the top bar without opening Host settings', async () => {
    window.history.replaceState(null, '', '/workers/primary-worker')
    render(<WorkerStudio />)

    fireEvent.click(await screen.findByRole('button', { name: 'Configure' }))

    expect(screen.getByRole('dialog', { name: 'Worker configuration' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /settings/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Toggle Skills' })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('switch', { name: 'Enable briefing-brief' })[0]!)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workers/primary-worker/config/skill-overlay%3Abriefing-brief', expect.objectContaining({
        body: expect.stringContaining('"enabled":false'),
        method: 'PUT',
      }))
    })
  })

  it('uses shadcn sidebar menu buttons for the worker top bar', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Worker Workbench')
    const topBarButtons = [
      screen.getByRole('button', { name: 'Hide sidebar' }),
      screen.getByRole('button', { name: /^Open local Host settings/ }),
    ]

    for (const button of topBarButtons) {
      expect(button.getAttribute('data-slot')).toBe('sidebar-menu-button')
      expect(button.getAttribute('data-size')).toBe('sm')
      expect(button.className).toContain('hover:bg-sidebar-accent')
      expect(button.querySelector('svg')).toBeTruthy()
    }

    const sidebarToggle = screen.getByRole('button', { name: 'Hide sidebar' })
    expect(sidebarToggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(sidebarToggle)
    expect(screen.getByRole('button', { name: 'Show sidebar' }).getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[class*="lucide-"]')).toBeNull()
  })

  it('opens settings, rescans/tests engines, and autosaves settings changes', async () => {
    currentSettings = {
      ...currentSettings,
      engines: [
        ...currentSettings.engines,
        { command: 'cursor-agent', id: 'cursor', installed: false, name: 'Cursor Agent', path: null, version: null },
      ],
    }

    render(<WorkerStudio />)

    await screen.findByLabelText('Worker Workbench')
    expect(screen.queryByRole('dialog', { name: 'Local Host Settings' })).toBeNull()

    openHostSettings()

    const settingsDialog = screen.getByRole('dialog', { name: 'Local Host Settings' })
    expect(settingsDialog).toBeTruthy()
    expect(settingsDialog.getAttribute('data-slot')).toBe('dialog-content')
    const testButton = screen.getByRole('button', { name: 'Test' })
    const rescanButton = screen.getByRole('button', { name: 'Rescan' })
    fireEvent.click(testButton)
    fireEvent.click(rescanButton)
    const engineStatus = await within(settingsDialog).findByText('Codex CLI responded.')
    expect(engineStatus.getAttribute('data-slot')).toBe('alert-description')

    selectSettingsTab(screen.getByRole('tab', { name: /Language/ }))
    const languageGroup = screen.getByRole('group', { name: 'Language' })
    fireEvent.click(within(languageGroup).getByRole('radio', { name: /简体中文/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/engine/targets/codex/test', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/engine/targets/rescan', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ method: 'PATCH' }))
      expect(document.documentElement.lang).toBe('zh-CN')
    })
  })

  it('maps each local engine to its own icon asset', () => {
    expect(engineIconSrc('codex')).toBe('/engine-icons/openai.svg')
    expect(engineIconSrc('claude-code')).toBe('/engine-icons/claude.svg')
    expect(engineIconSrc('cursor')).toBe('/engine-icons/cursor.svg')
    expect(engineIconSrc('gemini')).toBe('/engine-icons/gemini.svg')
    expect(engineIconSrc('opencode')).toBe('/engine-icons/opencode.svg')
    expect(engineIconSrc('qwen')).toBe('/engine-icons/qwen.svg')
    expect(engineIconSrc('hermes')).toBe('/engine-icons/hermesagent.svg')
  })

  it('falls back to English for unknown persisted language values', async () => {
    currentSettings = { ...currentSettings, language: 'pirate' }

    render(<WorkerStudio />)

    expect(await screen.findByLabelText('Worker Workbench')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })

  it('applies system appearance from the operating-system color scheme and updates on changes', async () => {
    const media = installMatchMedia(false)

    render(<WorkerStudio />)

    const shell = await screen.findByTestId('worker-studio-shell')
    expect(shell.getAttribute('data-appearance')).toBe('system')
    expect(shell.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    media.setMatches(true)

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('persists dark appearance and applies the dark theme without reloading', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('worker-studio-shell')
    openHostSettings()
    const settingsDialog = screen.getByRole('dialog', { name: 'Local Host Settings' })
    selectSettingsTab(within(settingsDialog).getByRole('tab', { name: /Appearance/ }))
    const appearanceGroup = await screen.findByRole('group', { name: 'Appearance' })
    fireEvent.click(within(appearanceGroup).getByRole('radio', { name: /Dark Workspace/ }))

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-appearance')).toBe('dark')
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(fetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
        body: JSON.stringify({ appearance: 'dark' }),
        method: 'PATCH',
      }))
    })
  })
})
