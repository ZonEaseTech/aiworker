import type { LocalSessionEvent, LocalSettingsConfig, LocalTurn, LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-protocol'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { engineIconSrc } from '../../features/settings/model'
import { WorkerStudio } from '../worker-studio'

interface MountedMicroAppTestEvent {
  actionId?: string
  appId?: string
  input?: unknown
  surfaceId?: string
  type: string
  workerId?: string | null
  workspaceId?: string | null
}

const microAppRouteMock = vi.hoisted(() => ({
  dataListeners: new Map<string, (event: MountedMicroAppTestEvent) => void>(),
  getMountedMicroAppCurrentRoute: vi.fn(),
  listeners: new Map<string, (to: { pathname?: string }, from: { pathname?: string }) => void>(),
  pushMountedMicroAppRoute: vi.fn(),
  replaceMountedMicroAppRoute: vi.fn(),
}))

vi.mock('../../lib/micro-app-runtime', async () => {
  const actual = await vi.importActual<typeof import('../../lib/micro-app-runtime')>('../../lib/micro-app-runtime')
  return {
    ...actual,
    addMountedMicroAppDataListener: vi.fn((appName: string, listener: (event: MountedMicroAppTestEvent) => void) => {
      microAppRouteMock.dataListeners.set(appName, listener)
      return () => microAppRouteMock.dataListeners.delete(appName)
    }),
    addMountedMicroAppRouteListener: vi.fn(async (appName: string, listener: (to: { pathname?: string }, from: { pathname?: string }) => void) => {
      microAppRouteMock.listeners.set(appName, listener)
      return () => microAppRouteMock.listeners.delete(appName)
    }),
    getMountedMicroAppCurrentRoute: microAppRouteMock.getMountedMicroAppCurrentRoute,
    pushMountedMicroAppRoute: microAppRouteMock.pushMountedMicroAppRoute,
    replaceMountedMicroAppRoute: microAppRouteMock.replaceMountedMicroAppRoute,
  }
})

const now = '2026-05-10T00:00:00.000Z'
const HR_SOUL_ID = 'aiworker-hr'
const QA_SOUL_ID = 'aiworker-qa'
const CUSTOM_SOUL_ID = 'aiworker-custom'
const CUSTOM_TEMPLATE_ID = `${CUSTOM_SOUL_ID}.explore`
const HR_PERSON_PROFILE = `${HR_SOUL_ID}.person-profile`
const HR_LIFECYCLE_NEXT_STEP = `${HR_SOUL_ID}.lifecycle-next-step`
const HR_CANDIDATE_SCREEN = `${HR_SOUL_ID}.candidate-screen`
const HR_INTERVIEW_BRIEF = `${HR_SOUL_ID}.interview-brief`
const HR_ONBOARDING_PLAN = `${HR_SOUL_ID}.onboarding-plan`
const HR_OFFBOARDING_SUMMARY = `${HR_SOUL_ID}.offboarding-summary`
const HR_EVIDENCE_MATRIX = `${HR_SOUL_ID}.evidence-matrix`
const HR_HIRING_RISK = `${HR_SOUL_ID}.hiring-risk`
const HR_PROFILE_UPDATE_PROPOSAL = `${HR_SOUL_ID}.profile-update-draft`

function openHostSettings() {
  fireEvent.click(screen.getByRole('button', { name: /^Platform settings(?:\s|$)/ }))
}

function selectSettingsTab(tab: HTMLElement) {
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
}

const workspace = {
  createdAt: now,
  id: 'workspace-1',
  workerId: 'hr-worker',
  name: 'Hiring Workspace',
  rootPath: '/tmp/hiring',
  type: 'workspace',
  status: 'active',
  sourcePointersJson: [],
  metadataJson: {},
  updatedAt: now,
}

const workers = [
  { createdAt: now, defaultEngineId: 'codex', id: 'hr-worker', metadataJson: {}, name: 'HR', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
  { createdAt: now, defaultEngineId: 'codex', id: 'qa-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
]

const souls = [
  { defaultTemplates: [HR_PERSON_PROFILE, HR_PROFILE_UPDATE_PROPOSAL, HR_LIFECYCLE_NEXT_STEP, HR_CANDIDATE_SCREEN, HR_INTERVIEW_BRIEF, HR_ONBOARDING_PLAN, HR_OFFBOARDING_SUMMARY, HR_EVIDENCE_MATRIX, HR_HIRING_RISK], description: 'People operations workspace', domain: 'hr-people-ops', id: HR_SOUL_ID, name: 'AIWorker HR', status: 'available' },
  { defaultTemplates: ['aiworker-qa.release-gate'], description: 'QA workspace', domain: 'quality-assurance', id: QA_SOUL_ID, name: 'AIWorker QA', status: 'available' },
]

const templates = [
  {
    description: 'Create a source-backed HR profile snapshot.',
    id: HR_PERSON_PROFILE,
    inputHints: ['Person context', 'Lifecycle stage'],
    name: 'Person Profile',
    outputKind: 'person-profile',
    promptRef: './product/workflows/person-profile/prompt.md',
    reviewRubricRef: './product/workflows/person-profile/review.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an inspectable candidate profile update.',
    id: HR_PROFILE_UPDATE_PROPOSAL,
    inputHints: ['Candidate materials', 'Accepted README baseline'],
    name: 'Profile Update Draft',
    outputKind: 'profile-update-draft',
    promptRef: './product/workflows/profile-update-draft/prompt.md',
    reviewRubricRef: './product/workflows/profile-update-draft/review.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare the next HR touchpoint.',
    id: HR_LIFECYCLE_NEXT_STEP,
    inputHints: ['Person profile', 'Open questions'],
    name: 'Lifecycle Next Step',
    outputKind: 'lifecycle-next-step',
    promptRef: './product/workflows/lifecycle-next-step/prompt.md',
    reviewRubricRef: null,
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare a role rubric.',
    id: `${HR_SOUL_ID}.role-rubric`,
    inputHints: ['Role', 'Signals'],
    name: 'Role Rubric',
    outputKind: 'role-rubric',
    promptRef: './product/workflows/role-rubric/prompt.md',
    reviewRubricRef: null,
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Screen a candidate against a role.',
    id: HR_CANDIDATE_SCREEN,
    inputHints: ['Role', 'Candidate packet'],
    name: 'Candidate Screen',
    outputKind: 'candidate-screen',
    promptRef: './product/workflows/candidate-screen/prompt.md',
    reviewRubricRef: './product/workflows/candidate-screen/review.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an interview brief.',
    id: HR_INTERVIEW_BRIEF,
    inputHints: ['Candidate packet', 'Rubric'],
    name: 'Interview Brief',
    outputKind: 'interview-brief',
    promptRef: './product/workflows/interview-brief/prompt.md',
    reviewRubricRef: './product/workflows/interview-brief/review.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an onboarding plan.',
    id: HR_ONBOARDING_PLAN,
    inputHints: ['Employee profile', 'Role expectations'],
    name: 'Onboarding Plan',
    outputKind: 'onboarding-plan',
    promptRef: './product/workflows/onboarding-plan/prompt.md',
    reviewRubricRef: null,
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare an offboarding summary.',
    id: HR_OFFBOARDING_SUMMARY,
    inputHints: ['Departing employee context', 'Handoff notes'],
    name: 'Offboarding Summary',
    outputKind: 'offboarding-summary',
    promptRef: './product/workflows/offboarding-summary/prompt.md',
    reviewRubricRef: null,
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Compare candidates against the role rubric.',
    id: HR_EVIDENCE_MATRIX,
    inputHints: ['Role rubric', 'Candidate packets'],
    name: 'Evidence Matrix',
    outputKind: 'evidence-matrix',
    promptRef: './product/workflows/evidence-matrix/prompt.md',
    reviewRubricRef: './product/workflows/evidence-matrix/review.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare a roundup packet.',
    id: `${HR_SOUL_ID}.roundup-packet`,
    inputHints: ['Evidence matrix', 'Interview notes'],
    name: 'Roundup Packet',
    outputKind: 'roundup-packet',
    promptRef: './product/workflows/roundup-packet/prompt.md',
    reviewRubricRef: null,
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Review hiring risk.',
    id: HR_HIRING_RISK,
    inputHints: ['Artifact', 'Policy'],
    name: 'Hiring Risk',
    outputKind: 'hiring-risk',
    promptRef: './product/workflows/hiring-risk/prompt.md',
    reviewRubricRef: './product/workflows/hiring-risk/review.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Summarize release readiness.',
    id: 'aiworker-qa.release-gate',
    inputHints: ['Test evidence', 'Known defects'],
    name: 'Release Gate',
    outputKind: 'release-gate',
    promptRef: './product/workflows/release-gate/prompt.md',
    reviewRubricRef: './product/workflows/release-gate/review.md',
    soulId: QA_SOUL_ID,
  },
]

const themeMediaQuery = '(prefers-color-scheme: dark)'

const baseSettings: LocalSettingsConfig = {
  appearance: 'system',
  byok: { apiKeyRef: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', provider: 'openai-compatible' },
  connectors: [
    { enabled: false, id: 'ats', name: 'ATS / HRIS', status: 'not_configured' },
    { enabled: false, id: 'ci', name: 'CI / release evidence', status: 'not_configured' },
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
  capabilityTemplateId: HR_CANDIDATE_SCREEN,
  context: 'Candidate context',
  createdAt: now,
  endedAt: null,
  id: 'session-1',
  metadataJson: {},
  startedAt: now,
  status: 'active',
  title: 'Screen candidate',
  updatedAt: now,
  workerId: 'hr-worker',
  workspaceId: 'workspace-1',
}

const turnRecord = {
  createdAt: now,
  error: null,
  id: 'turn-1',
  input: 'Prepare a candidate screen.',
  metadataJson: {},
  response: 'Generated Candidate Screen.',
  seq: 1,
  sessionId: 'session-1',
  status: 'succeeded',
  updatedAt: now,
} satisfies LocalTurn

const artifactRecord = {
  createdAt: now,
  id: 'artifact-1',
  kind: 'candidate-screen',
  metadataJson: {},
  path: 'artifacts/session-1/candidate-screen.md',
  invocationId: 'invocation-1',
  sessionId: 'session-1',
  status: 'available',
  title: 'Candidate Screen',
  turnId: 'turn-1',
  updatedAt: now,
  workspaceId: 'workspace-1',
}

const eventRecord = {
  createdAt: now,
  id: 1,
  invocationId: 'invocation-1',
  payloadJson: { status: 'succeeded' },
  seq: 0,
  sessionId: 'session-1',
  turnId: 'turn-1',
  type: 'status',
} satisfies LocalSessionEvent

let currentArtifacts: typeof artifactRecord[]
let currentEvents: LocalSessionEvent[]
let currentSettings: typeof baseSettings
let currentSessions: typeof sessionRecord[]
let currentSouls: typeof souls
let currentTemplates: typeof templates
let currentTurns: LocalTurn[]
let currentWorkers: typeof workers
let currentWorkspaces: typeof workspace[]
let workspaceDataResponses: Array<Promise<typeof workspace[]> | typeof workspace[]>
let currentWorkerOverlayAssets: LocalWorkerOverlayAsset[]
let currentArtifactRawContent: string
let currentArtifactRawStatus: number
let lastMessageRequestBody: Record<string, unknown> | null
let lastSessionRequestBody: Record<string, unknown> | null
let writtenFiles: Array<{ body: string, path: string, workspaceId: string }>
let currentApps: Array<{
  appId: string
  manifest: {
    connectors?: {
      optional: Array<{ access: string[], id: string, reason: string, scopes: string[] }>
      required: Array<{ access: string[], id: string, reason: string, scopes: string[] }>
    }
    permissions?: unknown[]
    name: string
    ui?: {
      artifactPreviews?: Array<{ id: string, label: string }>
      panels?: Array<{ id: string, label: string }>
      reviewPanels?: Array<{ id: string, label: string }>
      routes?: Array<{
        id?: string
        label: string
        path: string
        surface?: {
          entry?: string
          renderer: 'host-descriptor' | 'micro-app'
          scope?: 'app' | 'artifact' | 'review' | 'session' | 'workspace'
        }
      }>
      workbench?: {
        actions?: Array<{
          id: string
          label: string
          protocolAction: string
          requiredPermissions?: string[]
          role: 'action' | 'panel-toggle' | 'refresh'
        }>
        primaryAction?: {
          id: string
          label: string
          protocolAction: string
          requiredPermissions?: string[]
          role: 'primary'
        }
        search?: {
          id: string
          label: string
          placeholder: string
          protocolProvider: string
          requiredPermissions?: string[]
        }
        configuration?: {
          id: string
          label: string
          protocolAction: string
          requiredPermissions?: string[]
        }
      }
      workspaceWidgets?: Array<{ id: string, label: string, surface?: { renderer: 'host-descriptor' | 'micro-app' } }>
    }
  }
  mountedContribution?: {
    apiRoutePrefix: string | null
    artifactPreviewIds: string[]
    descriptorSurfaceIds?: string[]
    microAppSurfaceIds?: string[]
    panelIds: string[]
    reviewPanelIds: string[]
    routePaths: string[]
    surfaceIds?: string[]
    workbench?: {
      actions?: Array<{
        id: string
        label: string
        protocolAction: string
        requiredPermissions?: string[]
        role: 'action' | 'panel-toggle' | 'refresh'
      }>
      primaryAction?: {
        id: string
        label: string
        protocolAction: string
        requiredPermissions?: string[]
        role: 'primary'
      }
      search?: {
        id: string
        label: string
        placeholder: string
        protocolProvider: string
        requiredPermissions?: string[]
      }
      configuration?: {
        id: string
        label: string
        protocolAction: string
        requiredPermissions?: string[]
      }
    } | null
    workspaceWidgetIds: string[]
  }
  status: string
  version: string
}>
let deferCreatedSessionStream: boolean

function mountedRouteApp({
  appId,
  appName,
  routes,
}: {
  appId: string
  appName: string
  routes: Array<{
    entry?: string
    id: string
    label: string
    path: string
    scope?: 'app' | 'artifact' | 'review' | 'session' | 'workspace'
  }>
}): typeof currentApps[number] {
  return {
    appId,
    manifest: {
      name: appName,
      ui: {
        artifactPreviews: [],
        panels: [],
        reviewPanels: [],
        routes: routes.map(route => ({
          id: route.id,
          label: route.label,
          path: route.path,
          surface: { entry: route.entry, renderer: 'micro-app', scope: route.scope },
        })),
        workspaceWidgets: [],
      },
    },
    mountedContribution: {
      apiRoutePrefix: `/api/apps/${appId}`,
      artifactPreviewIds: [],
      descriptorSurfaceIds: [],
      microAppSurfaceIds: routes.map(route => route.id),
      panelIds: [],
      reviewPanelIds: [],
      routePaths: routes.map(route => route.path),
      surfaceIds: routes.map(route => route.id),
      workspaceWidgetIds: [],
    },
    status: 'enabled',
    version: '0.1.0',
  }
}

function universalRoute(label = 'Universal Workbench') {
  return {
    entry: '/micro-app/workbench/universal',
    id: 'universal-workbench',
    label,
    path: '/workbench/universal',
    scope: 'app' as const,
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
  workspaceDataResponses = []
  currentSessions = [{ ...sessionRecord }]
  currentSouls = souls.map(soul => ({ ...soul, defaultTemplates: [...soul.defaultTemplates] }))
  currentTemplates = templates.map(template => ({
    ...template,
    inputHints: [...template.inputHints],
  }))
  currentTurns = [{ ...turnRecord }]
  currentArtifacts = [{ ...artifactRecord }]
  currentEvents = [{ ...eventRecord }]
  currentWorkers = workers.map(worker => ({ ...worker }))
  currentWorkerOverlayAssets = [{
    checksum: 'sha256:interview-brief',
    enabled: true,
    id: 'interview-brief',
    kind: 'skill',
    metadataJson: {},
    optionsJson: {},
    source: 'overlay',
    sourceRef: 'descriptor://engine/skills/interview-brief',
    target: 'codex',
    updatedAt: now,
  }]
  lastMessageRequestBody = null
  lastSessionRequestBody = null
  writtenFiles = []
  currentArtifactRawContent = [
    '# Candidate Screen',
    '',
    'Evidence summary.',
    '',
    '```aiworker-profile-readme',
    '# Accepted Ada Profile',
    '',
    '## Current Profile Summary',
    '',
    'Reviewed profile summary.',
    '```',
    '',
  ].join('\n')
  currentArtifactRawStatus = 200
  currentApps = []
  deferCreatedSessionStream = false
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
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
  microAppRouteMock.dataListeners.clear()
  microAppRouteMock.listeners.clear()
  microAppRouteMock.pushMountedMicroAppRoute.mockReset()
  microAppRouteMock.replaceMountedMicroAppRoute.mockReset()
  microAppRouteMock.getMountedMicroAppCurrentRoute.mockReset()
  microAppRouteMock.getMountedMicroAppCurrentRoute.mockResolvedValue(null)
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

    if (url.endsWith('/api/local/info'))
      return json({ runtimeVersion: 'test', startedAt: now, workers: currentWorkers })
    if (url.endsWith('/api/local/apps'))
      return json({ apps: currentApps })
    if (url.endsWith('/api/local/apps/aiworker-qa/enable') && method === 'POST') {
      const enabled = currentApps.find(app => app.appId === 'aiworker-qa')
      currentApps = currentApps.map(app => app.appId === 'aiworker-qa' ? { ...app, status: 'enabled' } : app)
      return json({
        app: enabled ? { ...enabled, status: 'enabled' } : null,
        catalog: { apps: currentApps, souls: currentSouls, templates: currentTemplates },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-qa/disable') && method === 'POST') {
      const disabled = currentApps.find(app => app.appId === 'aiworker-qa')
      currentApps = currentApps.map(app => app.appId === 'aiworker-qa' ? { ...app, status: 'disabled' } : app)
      return json({
        app: disabled ? { ...disabled, status: 'disabled' } : null,
        catalog: { apps: currentApps, souls: currentSouls, templates: currentTemplates },
      })
    }
    const requestUrl = new URL(url, 'http://local.test')
    const mountedSurfaceMatch = requestUrl.pathname.match(/^\/api\/local\/apps\/([^/]+)\/surfaces\/([^/]+)$/)
    if (mountedSurfaceMatch) {
      const appId = mountedSurfaceMatch[1]!
      const surfaceId = mountedSurfaceMatch[2]!
      const mountedApp = currentApps
        .find(app => app.appId === appId)
      const mountedRoute = mountedApp
        ?.manifest
        .ui
        ?.routes
        ?.find(route => route.id === surfaceId)
      if (mountedRoute?.surface?.renderer === 'micro-app') {
        return json({
          microApp: {
            data: {
              appId,
              sessionId: requestUrl.searchParams.get('sessionId') ?? null,
              surfaceId,
              workerId: requestUrl.searchParams.get('workerId') ?? null,
              workspaceId: requestUrl.searchParams.get('workspaceId') ?? null,
              theme: requestUrl.searchParams.get('theme') ?? null,
            },
            name: `${appId}--${surfaceId}`,
            url: `/api/apps/${appId}${mountedRoute.surface.entry ?? `/micro-app/routes/${surfaceId}`}${requestUrl.search}`,
          },
          surface: { id: surfaceId, kind: 'route', label: mountedRoute.label, renderer: 'micro-app', scope: mountedRoute.surface.scope ?? null },
        })
      }
      return json({
        actions: [{ id: 'create-profile-draft', label: 'Create profile draft' }],
        fields: [
          { label: 'Domain', value: 'hr-people-ops' },
          { label: 'Source connector', value: 'ats' },
        ],
        status: 'ready',
        title: 'HR Mounted Workbench',
        type: 'aiworker.surface.descriptor.v1',
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/surfaces/hr-people-widget')) {
      return json({
        microApp: {
          data: {
            appId: 'aiworker-hr',
            surfaceId: 'hr-people-widget',
            theme: null,
          },
          name: 'aiworker-hr--hr-people-widget',
          url: '/api/apps/aiworker-hr/micro-app/widgets/hr-people-widget',
        },
        surface: { id: 'hr-people-widget', kind: 'workspace-widget', label: 'People widget', renderer: 'micro-app' },
      })
    }
    if (url.endsWith('/api/apps/aiworker-hr/micro-app/widgets/hr-people-widget')) {
      return new Response('<!doctype html><html><body><h1>People widget</h1></body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    if (url.endsWith('/api/local/workers') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as { name: string, soulId: string } : { name: 'Created worker', soulId: HR_SOUL_ID }
      const created = {
        createdAt: now,
        defaultEngineId: 'codex',
        id: 'worker-created',
        metadataJson: {},
        name: body.name,
        soulId: body.soulId,
        status: 'active',
        updatedAt: now,
      }
      currentWorkers = [created, ...currentWorkers]
      return json({ worker: created }, 201)
    }
    if (url.endsWith('/api/local/workers'))
      return json({ workers: currentWorkers })
    if (requestUrl.pathname.match(/^\/api\/local\/workers\/[^/]+\/overlay$/)) {
      const workerId = requestUrl.pathname.split('/')[4]!
      if (method === 'PUT') {
        const requestBody = init?.body ? JSON.parse(String(init.body)) as { assets?: LocalWorkerOverlayAsset[] } : {}
        currentWorkerOverlayAssets = requestBody.assets?.map(asset => ({
          ...asset,
          metadataJson: asset.metadataJson ?? {},
          source: 'overlay',
          updatedAt: now,
        })) ?? []
      }
      return json({ overlay: { assets: currentWorkerOverlayAssets, workerId } })
    }
    const workerProjectionMatch = requestUrl.pathname.match(/^\/api\/local\/workers\/([^/]+)\/workspaces\/([^/]+)\/projection$/)
    if (workerProjectionMatch && method === 'POST') {
      const workerId = workerProjectionMatch[1]!
      const workspaceId = workerProjectionMatch[2]!
      const workspace = currentWorkspaces.find(item => item.id === workspaceId && item.workerId === workerId)
      if (!workspace)
        return json({}, 404)
      const projected = {
        ...workspace,
        metadataJson: {
          ...workspace.metadataJson,
          engineAssetProjection: {
            projectedAt: now,
            projectionCount: currentWorkerOverlayAssets.filter(asset => asset.enabled).length,
            projectionManifestPath: '.aiworker/projections.json',
          },
        },
      }
      currentWorkspaces = currentWorkspaces.map(item => item.id === workspaceId ? projected : item)
      return json({
        projection: {
          receipt: {
            appId: 'aiworker-hr',
            generatedAt: now,
            projections: currentWorkerOverlayAssets.filter(asset => asset.enabled).map(asset => ({
              kind: asset.kind,
              source: 'worker-overlay',
              target: asset.id,
            })),
            version: 1,
          },
          workspace: projected,
        },
      })
    }
    if (url.endsWith('/api/local/souls'))
      return json({ souls: currentSouls })
    if (url.endsWith('/api/local/templates'))
      return json({ templates: currentTemplates })
    if (url.endsWith('/api/local/workers/hr-worker/workspaces') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as { name: string } : { name: 'New candidate workspace' }
      const created = { ...workspace, id: 'workspace-created', name: body.name }
      currentWorkspaces = [created, ...currentWorkspaces]
      return json({ workspace: created }, 201)
    }
    if (url.endsWith('/api/local/workspaces'))
      return json({ workspaces: await (workspaceDataResponses.shift() ?? currentWorkspaces) })
    const workspaceFileWriteMatch = url.match(/\/api\/local\/workspaces\/([^/]+)\/files\/raw\/(.+)$/)
    if (workspaceFileWriteMatch && method === 'PUT') {
      const workspaceId = workspaceFileWriteMatch[1]!
      const filePath = workspaceFileWriteMatch[2]!.split('/').map(decodeURIComponent).join('/')
      const body = String(init?.body ?? '')
      writtenFiles.push({ body, path: filePath, workspaceId })
      return json({
        file: {
          createdAt: now,
          hash: null,
          id: `file-${writtenFiles.length}`,
          kind: 'uploaded',
          mtime: Date.parse(now),
          path: filePath,
          size: body.length,
          source: 'user',
          updatedAt: now,
          workspaceId,
        },
      }, 201)
    }
    const workerSessionStreamMatch = url.match(/\/api\/local\/workers\/hr-worker\/workspaces\/([^/]+)\/sessions\/stream$/)
    const workspaceSessionStreamMatch = url.match(/\/api\/local\/workspaces\/([^/]+)\/sessions\/stream$/)
    const streamWorkspaceId = workerSessionStreamMatch?.[1] ?? workspaceSessionStreamMatch?.[1]
    if (streamWorkspaceId && method === 'POST') {
      const requestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      lastSessionRequestBody = requestBody
      const sessionId = streamWorkspaceId === 'workspace-created' ? 'session-created' : 'session-created-worker-route'
      const turnId = streamWorkspaceId === 'workspace-created' ? 'turn-created' : 'turn-created-worker-route'
      const artifactId = streamWorkspaceId === 'workspace-created' ? 'artifact-created' : 'artifact-created-worker-route'
      const workspaceName = currentWorkspaces.find(item => item.id === streamWorkspaceId)?.name ?? 'New candidate workspace'
      const createdSession = {
        ...sessionRecord,
        capabilityTemplateId: String(requestBody.capabilityTemplateId ?? sessionRecord.capabilityTemplateId),
        context: String(requestBody.context ?? ''),
        metadataJson: requestBody.metadata as Record<string, unknown> ?? {},
        workspaceId: streamWorkspaceId,
        id: sessionId,
        title: workspaceName,
      }
      const createdTurn = { ...turnRecord, id: turnId, sessionId }
      const createdArtifact = { ...artifactRecord, id: artifactId, sessionId, turnId, workspaceId: streamWorkspaceId }
      currentSessions = [createdSession, ...currentSessions]
      currentTurns = [createdTurn, ...currentTurns]
      currentArtifacts = [createdArtifact, ...currentArtifacts]
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        start(controller) {
          const write = () => {
            controller.enqueue(encoder.encode(`event: session\ndata: ${JSON.stringify(createdSession)}\n\n`))
            controller.enqueue(encoder.encode(`event: turn\ndata: ${JSON.stringify({ ...createdTurn, status: 'running', response: null })}\n\n`))
            controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify({ artifacts: [createdArtifact], events: [], files: [], session: createdSession, turn: createdTurn })}\n\n`))
            controller.close()
          }
          if (deferCreatedSessionStream)
            setTimeout(write, 20)
          else
            write()
        },
      }), { headers: { 'content-type': 'text/event-stream' }, status: 201 })
    }
    if ((url.endsWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions') || url.endsWith('/api/local/workspaces/workspace-created/sessions')) && method === 'POST') {
      const createdSession = { ...sessionRecord, workspaceId: 'workspace-created', id: 'session-created', title: 'New candidate workspace' }
      const createdTurn = { ...turnRecord, id: 'turn-created', sessionId: 'session-created' }
      const createdArtifact = { ...artifactRecord, id: 'artifact-created', sessionId: 'session-created', turnId: 'turn-created', workspaceId: 'workspace-created' }
      currentSessions = [createdSession, ...currentSessions]
      currentTurns = [createdTurn, ...currentTurns]
      currentArtifacts = [createdArtifact, ...currentArtifacts]
      return json({ artifacts: [createdArtifact], events: [], files: [], session: createdSession, turn: createdTurn }, 201)
    }
    if ((url.endsWith('/api/local/workers/hr-worker/sessions/session-1/messages/stream') || url.endsWith('/api/local/sessions/session-1/turns/stream')) && method === 'POST') {
      lastMessageRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      const nextTurn = {
        ...turnRecord,
        id: 'turn-2',
        input: String(lastMessageRequestBody.input ?? 'Add interview risks.'),
        response: 'Updated Candidate Screen.',
        seq: 2,
      }
      const nextEvent = {
        ...eventRecord,
        id: 2,
        payloadJson: { agentEvent: { kind: 'text', text: 'Added interview risks.' }, status: 'succeeded' },
        seq: 1,
        turnId: 'turn-2',
        type: 'assistant_delta',
      } satisfies LocalSessionEvent
      currentTurns = [...currentTurns, nextTurn]
      currentEvents = [...currentEvents, nextEvent]
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: turn\ndata: ${JSON.stringify({ ...nextTurn, status: 'running', response: null })}\n\n`))
          controller.enqueue(encoder.encode(`event: session_event\ndata: ${JSON.stringify(nextEvent)}\n\n`))
          controller.enqueue(encoder.encode(`event: turn\ndata: ${JSON.stringify(nextTurn)}\n\n`))
          controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify({ artifacts: [], events: currentEvents, files: [], session: sessionRecord, turn: nextTurn })}\n\n`))
          controller.close()
        },
      }), { headers: { 'content-type': 'text/event-stream' }, status: 200 })
    }
    if ((url.endsWith('/api/local/workers/hr-worker/sessions/session-1/messages') || url.endsWith('/api/local/sessions/session-1/turns')) && method === 'POST') {
      lastMessageRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      const nextTurn = {
        ...turnRecord,
        id: 'turn-2',
        input: String(lastMessageRequestBody.input ?? 'Add interview risks.'),
        response: 'Updated Candidate Screen.',
        seq: 2,
      }
      currentTurns = [...currentTurns, nextTurn]
      currentEvents = [...currentEvents, { ...eventRecord, id: 2, seq: 1, turnId: 'turn-2' }]
      return json({ artifacts: [], events: currentEvents, files: [], session: sessionRecord, turn: nextTurn }, 201)
    }
    if (url.endsWith('/api/local/sessions'))
      return json({ sessions: currentSessions })
    if (url.endsWith('/api/local/turns'))
      return json({ turns: currentTurns })
    if (url.endsWith('/api/local/files'))
      return json({ files: [] })
    if (url.includes('/api/local/workspaces/') && url.includes('/files/raw/')) {
      return new Response(currentArtifactRawContent, {
        headers: { 'content-type': 'text/plain' },
        status: currentArtifactRawStatus,
      })
    }
    if (url.endsWith('/api/local/artifacts'))
      return json({ artifacts: currentArtifacts })
    if (url.endsWith('/api/local/events'))
      return json({ events: currentEvents })
    if (url.endsWith('/api/local/settings') && method === 'PATCH') {
      const patch = init?.body ? JSON.parse(String(init.body)) as Partial<typeof baseSettings> : {}
      currentSettings = {
        ...currentSettings,
        ...patch,
        byok: { ...currentSettings.byok, ...(patch.byok ?? {}) },
        updatedAt: now,
      }
      return json({ settings: currentSettings })
    }
    if (url.endsWith('/api/local/settings'))
      return json({ settings: currentSettings })
    if (url.endsWith('/api/local/settings/engines/rescan'))
      return json({ engines: currentSettings.engines, settings: currentSettings })
    if (url.endsWith('/api/local/settings/engines/test'))
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

  it('skips legacy workers whose Souls are no longer projected', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'devops-worker', metadataJson: {}, name: 'DevOps', soulId: 'devops', status: 'active', updatedAt: now },
      ...workers.map(worker => ({ ...worker })),
    ]

    render(<WorkerStudio />)

    expect(await screen.findByLabelText('Host actions')).toBeTruthy()
    const switcher = screen.getByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /HR \(1\)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /DevOps/ })).toBeNull()
    expect(screen.queryByText('Loading Soul workspace...')).toBeNull()
  })

  it('keeps the Host sidebar to worker switching instead of workspace/session hierarchy', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Collapse AIWorker HR' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Collapse AIWorker QA' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to QA' })).toBeTruthy()
    expect(within(switcher).queryByText('Hiring Workspace')).toBeNull()
    expect(within(switcher).queryByText('Screen candidate')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
  })

  it('opens a workspace route as an app-owned mounted surface instead of Host session composition', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-home',
            label: 'HR People Workbench',
            path: '/hr',
            surface: { renderer: 'micro-app', scope: 'workspace' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-home'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr'],
        surfaceIds: ['hr-home'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('HR People Workbench')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-hr',
      sessionId: null,
      surfaceId: 'hr-home',
      workerId: 'hr-worker',
      workspaceId: 'workspace-1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/surfaces/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light', expect.objectContaining({ headers: {} }))
    expect(screen.queryByText('What do you want to build in Hiring Workspace?')).toBeNull()
    expect(screen.queryByRole('combobox', { name: /capability|skill|template/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /\$ skill/i })).toBeNull()
    expect(lastSessionRequestBody).toBeNull()
  })

  it('renders universal workbench routes through the micro-app mount path', async () => {
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-hr',
        appName: 'AIWorker HR',
        routes: [universalRoute()],
      }),
    ]
    window.history.replaceState(null, '', '/workers/hr-worker')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Universal Workbench')
    expect(microApp.tagName).toBe('MICRO-APP')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('name')).toBe('aiworker-hr--universal-workbench')
    expect(microApp.getAttribute('baseroute')).toBe('/workbench/universal')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/workbench/universal?workerId=hr-worker&theme=light')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-hr',
      sessionId: null,
      surfaceId: 'universal-workbench',
      workerId: 'hr-worker',
      workspaceId: null,
    })
    expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/surfaces/universal-workbench?workerId=hr-worker&theme=light', expect.objectContaining({ headers: {} }))
    expect(screen.queryByTestId('universal-workbench')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(lastSessionRequestBody).toBeNull()
  })

  it('passes the resolved dark Host theme to mounted route URL and micro-app data', async () => {
    currentSettings = { ...currentSettings, appearance: 'dark' }
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-hr',
        appName: 'AIWorker HR',
        routes: [universalRoute()],
      }),
    ]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Universal Workbench')
    expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/workbench/universal?workerId=hr-worker&workspaceId=workspace-1&theme=dark')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-hr',
      surfaceId: 'universal-workbench',
      theme: 'dark',
      workerId: 'hr-worker',
      workspaceId: 'workspace-1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/surfaces/universal-workbench?workerId=hr-worker&workspaceId=workspace-1&theme=dark', expect.objectContaining({ headers: {} }))
  })

  it('updates mounted route theme data when Host appearance changes without reloading', async () => {
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-hr',
        appName: 'AIWorker HR',
        routes: [universalRoute()],
      }),
    ]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Universal Workbench') as HTMLElement & { data?: Record<string, unknown> }
    expect(microApp.data).toMatchObject({ theme: 'light' })

    openHostSettings()
    const settingsDialog = screen.getByRole('dialog', { name: 'Local Host Settings' })
    selectSettingsTab(within(settingsDialog).getByRole('tab', { name: /Appearance/ }))
    const appearanceGroup = await screen.findByRole('group', { name: 'Appearance' })
    fireEvent.click(within(appearanceGroup).getByRole('radio', { name: /Dark Workspace/ }))

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
      expect(microApp.data).toMatchObject({ theme: 'dark' })
      expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/workbench/universal?workerId=hr-worker&workspaceId=workspace-1&theme=dark')
    })
  })

  it('updates Host workspace locator when a mounted app selects a workspace', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'qa-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-qa',
        appName: 'AIWorker QA',
        routes: [universalRoute()],
      }),
    ]
    const qaWorkspace = { ...workspace, id: 'qa-workspace', name: 'QA Workspace', workerId: 'qa-worker', updatedAt: '2026-05-24T06:49:06.848Z' }
    currentWorkspaces = []
    const staleForeignWorkspaceRefresh = deferred<typeof workspace[]>()
    workspaceDataResponses = [[], staleForeignWorkspaceRefresh.promise, [qaWorkspace]]
    window.history.replaceState(null, '', '/workers/qa-worker')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Universal Workbench')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&theme=light')

    await waitFor(() => {
      expect(microAppRouteMock.dataListeners.has('aiworker-qa--universal-workbench')).toBe(true)
    })
    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-qa--universal-workbench')?.({
        appId: 'aiworker-qa',
        surfaceId: 'universal-workbench',
        type: 'locator:workspace-selected',
        workerId: 'hr-worker',
        workspaceId: 'qa-workspace',
      })
    })
    expect(window.location.pathname).toBe('/workers/qa-worker')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&theme=light')

    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-qa--universal-workbench')?.({
        appId: 'aiworker-qa',
        surfaceId: 'universal-workbench',
        type: 'locator:workspace-selected',
        workerId: 'qa-worker',
        workspaceId: 'workspace-1',
      })
    })
    expect(window.location.pathname).toBe('/workers/qa-worker')

    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-qa--universal-workbench')?.({
        appId: 'aiworker-qa',
        surfaceId: 'universal-workbench',
        type: 'locator:workspace-selected',
        workerId: 'qa-worker',
        workspaceId: 'qa-workspace',
      })
    })

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/qa-worker/workspaces/qa-workspace')
    })
    await waitFor(() => {
      expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&workspaceId=qa-workspace&theme=light')
    })
    await waitFor(() => {
      expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'qa-workspace',
      })
    })

    await act(async () => {
      staleForeignWorkspaceRefresh.resolve([{ ...workspace, workerId: 'hr-worker' }])
      await staleForeignWorkspaceRefresh.promise
    })
    expect(window.location.pathname).toBe('/workers/qa-worker/workspaces/qa-workspace')
    await waitFor(() => {
      expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&workspaceId=qa-workspace&theme=light')
    })
  })

  it('keeps WorkerStudio free of universal-workbench renderer branches', () => {
    const source = readFileSync('src/worker/worker-studio.tsx', 'utf8')

    expect(source).not.toContain('@zonease/aiworker-soul-app-workbench')
    expect(source).not.toContain('UniversalWorkbenchApp')
    expect(source).not.toContain('activeMountedRoute.id === \'universal-workbench\'')
    expect(source).not.toContain('activeMountedRoute?.id !== \'universal-workbench\'')
  })

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

  it('opens Worker configuration from the worker row without opening Host settings', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    fireEvent.click(await screen.findByRole('button', { name: 'Configure HR' }))

    expect(screen.getByRole('dialog', { name: 'Worker configuration' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /settings/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Toggle Skills' })).toBeTruthy()
    expect(screen.getByTestId('worker-overlay-asset-list').getAttribute('data-orientation')).toBe('vertical')
    const workerConfigBody = screen.getByTestId('worker-configuration-body')
    expect(workerConfigBody.className).toContain('max-md:flex-col')
    const workerOverlaySidebar = screen.getByTestId('worker-overlay-sidebar')
    expect(workerOverlaySidebar.className).toContain('max-md:w-full')
    expect(workerOverlaySidebar.className).toContain('max-md:flex-none')
    expect(workerOverlaySidebar.className).toContain('max-md:max-h-64')
    const workerOverlayEditorPanel = screen.getByTestId('worker-overlay-editor-panel')
    expect(workerOverlayEditorPanel.className).toContain('max-md:w-full')
    expect(workerOverlayEditorPanel.className).toContain('max-md:flex-none')
    expect(workerOverlayEditorPanel.className).toContain('max-md:min-w-0')

    fireEvent.click(screen.getAllByRole('switch', { name: 'Enable interview-brief' })[0]!)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/overlay', expect.objectContaining({
        body: expect.stringContaining('"enabled":false'),
        method: 'PUT',
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'New skill' }))
    fireEvent.change(screen.getByLabelText('Overlay asset id'), { target: { value: 'custom-skill' } })
    fireEvent.change(screen.getByLabelText('Overlay asset target'), { target: { value: 'codex' } })
    fireEvent.change(screen.getByLabelText('Overlay asset source reference'), { target: { value: 'descriptor://engine/skills/custom-skill' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create asset' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/overlay', expect.objectContaining({
        body: expect.stringContaining('"id":"custom-skill"'),
        method: 'PUT',
      }))
    })
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More actions for custom-skill' }))
    fireEvent.click(await screen.findByText('Duplicate'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/overlay', expect.objectContaining({
        body: expect.stringContaining('"id":"custom-skill-2"'),
        method: 'PUT',
      }))
    })

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More actions for custom-skill-2' }))
    fireEvent.click(await screen.findByText('Delete'))

    await waitFor(() => {
      const putBodies = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith('/api/local/workers/hr-worker/overlay') && init?.method === 'PUT').map(([, init]) => String(init?.body ?? ''))
      expect(putBodies.at(-1)).not.toContain('"id":"custom-skill-2"')
    })
  })

  it('keeps Worker configuration scoped away from workspace projection', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    fireEvent.click(await screen.findByRole('button', { name: 'Configure HR' }))
    const dialog = screen.getByRole('dialog', { name: 'Worker configuration' })

    expect(within(dialog).queryByText('Projection')).toBeNull()
    expect(within(dialog).queryByText(/Workspace:/)).toBeNull()
    expect(within(dialog).queryByText('No workspace selected')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Run projection' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Toggle Skills' })).toBeTruthy()
  })

  it('opens configuration for the worker row that owns the hovered more action', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure QA' }))

    expect(screen.getByRole('dialog', { name: 'Worker configuration' })).toBeTruthy()
    expect(screen.getByText('QA worker overlay')).toBeTruthy()
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/qa-worker/overlay', expect.objectContaining({
        headers: {},
      }))
    })
    expect(window.location.pathname).toBe('/workers/hr-worker')
  })

  it('shows the workbench switch only for workers whose Soul App declares multiple micro-app routes', async () => {
    currentSouls = [
      ...currentSouls,
      {
        defaultTemplates: [CUSTOM_TEMPLATE_ID],
        description: 'Custom workspace',
        domain: 'general-exploration',
        id: CUSTOM_SOUL_ID,
        name: 'AIWorker Custom',
        status: 'available',
      },
    ]
    currentTemplates = [
      ...currentTemplates,
      {
        description: 'Explore a custom workspace.',
        id: CUSTOM_TEMPLATE_ID,
        inputHints: ['Workspace context'],
        name: 'Explore',
        outputKind: 'custom-exploration',
        promptRef: './product/workflows/explore/prompt.md',
        reviewRubricRef: null,
        soulId: CUSTOM_SOUL_ID,
      },
    ]
    currentWorkers = [
      ...currentWorkers,
      { createdAt: now, defaultEngineId: 'codex', id: 'custom-worker', metadataJson: {}, name: 'Custom', soulId: CUSTOM_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-hr',
        appName: 'AIWorker HR',
        routes: [
          universalRoute(),
          { entry: '/micro-app/routes/hr-home', id: 'hr-home', label: 'HR People Workbench', path: '/hr', scope: 'workspace' },
        ],
      }),
      mountedRouteApp({
        appId: 'aiworker-qa',
        appName: 'AIWorker QA',
        routes: [universalRoute()],
      }),
      mountedRouteApp({
        appId: 'aiworker-custom',
        appName: 'AIWorker Custom',
        routes: [universalRoute()],
      }),
    ]
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure HR' }))
    fireEvent.click(screen.getByRole('button', { name: /^Workbench/ }))
    expect(screen.getByRole('tablist', { name: 'Workbench routes' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Universal Workbench' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'HR People Workbench' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure QA' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure Custom' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
  })

  it('keeps active workbench route selection scoped to each worker', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'hr-worker', metadataJson: {}, name: 'HR Primary', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: now, defaultEngineId: 'codex', id: 'hr-worker-secondary', metadataJson: {}, name: 'HR Secondary', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: now, defaultEngineId: 'codex', id: 'qa-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-hr',
        appName: 'AIWorker HR',
        routes: [
          universalRoute(),
          { entry: '/micro-app/routes/hr-home', id: 'hr-home', label: 'HR People Workbench', path: '/hr', scope: 'workspace' },
        ],
      }),
    ]
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure HR Primary' }))
    fireEvent.click(screen.getByRole('button', { name: /^Workbench/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'HR People Workbench' }))
    await screen.findByTitle('HR People Workbench')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure HR Secondary' }))
    fireEvent.click(screen.getByRole('button', { name: /^Workbench/ }))

    expect(screen.getByRole('tab', { name: 'Universal Workbench' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'HR People Workbench' }).getAttribute('aria-selected')).toBe('false')
  })

  it('falls back to first-run Soul App home when every persisted worker is orphaned', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'devops-worker', metadataJson: {}, name: 'DevOps', soulId: 'devops', status: 'active', updatedAt: now },
    ]

    render(<WorkerStudio />)

    expect(await screen.findByRole('heading', { name: 'Choose a Soul App to start' })).toBeTruthy()
    expect(screen.getByText('No enabled Soul Apps')).toBeTruthy()
    const firstRunRailTitle = screen.getByText('First run')
    expect(firstRunRailTitle.closest('[data-slot="item"]')).toBeTruthy()
    expect(firstRunRailTitle.closest('[data-slot="card"]')).toBeNull()
    expect(screen.queryByText('Loading Soul workspace...')).toBeNull()
  })

  it('renders HR through an app-owned mounted route instead of a Host renderer', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-home',
            label: 'HR People Workbench',
            path: '/hr',
            surface: { renderer: 'micro-app' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-home'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr'],
        surfaceIds: ['hr-home'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]

    render(<WorkerStudio />)

    const hostTopBar = await screen.findByLabelText('Host actions')
    expect(hostTopBar.getAttribute('data-host-slot')).toBe('host-top-bar')
    expect(hostTopBar.classList.contains('bg-sidebar')).toBe(true)
    expect(hostTopBar.classList.contains('text-sidebar-foreground')).toBe(true)
    const shell = screen.getByTestId('worker-studio-shell')
    expect(shell.getAttribute('data-slot')).toBe('app-shell')
    expect(shell.classList.contains('bg-background')).toBe(true)
    expect(shell.classList.contains('text-foreground')).toBe(true)
    const shellSidebar = document.querySelector('[data-host-slot="shell-sidebar"]') as HTMLElement
    expect(shellSidebar).toBeTruthy()
    expect(shellSidebar.getAttribute('data-slot')).toBe('sidebar-content')
    expect(shellSidebar.classList.contains('bg-sidebar')).toBe(true)
    expect(shellSidebar.classList.contains('text-sidebar-foreground')).toBe(true)
    expect(shellSidebar.querySelector('[data-sidebar="group"][aria-label="Host navigation"]')).toBeTruthy()
    expect(shellSidebar.querySelector('[data-sidebar="group"][aria-label="Workers"]')).toBeTruthy()
    expect(shellSidebar.querySelector('[data-sidebar="group"][aria-label="Workspaces"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /AIWorker HR \(1\)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /AIWorker QA \(1\)/ })).toBeNull()
    const microApp = await screen.findByTitle('HR People Workbench')
    expect(microApp.tagName).toBe('MICRO-APP')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('name')).toBe('aiworker-hr--hr-home')
    expect(microApp.getAttribute('baseroute')).toBe('/hr')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/routes/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-hr',
      surfaceId: 'hr-home',
      theme: 'light',
      workerId: 'hr-worker',
      workspaceId: 'workspace-1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/surfaces/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light', expect.objectContaining({ headers: {} }))
    expect(screen.queryByText('Soul App mounted route')).toBeNull()
    expect(screen.queryByText('HR People Workbench')).toBeNull()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(screen.queryByText('People Profiles')).toBeNull()
    expect(document.querySelector('[data-host-slot="hr-people-workbench"]')).toBeNull()
  })

  it('stores mounted HR child route changes per workspace and restores them without remounting', async () => {
    const secondWorkspace = {
      ...workspace,
      id: 'workspace-2',
      name: 'Second Hiring Workspace',
      workerId: 'hr-worker',
    }
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-home',
            label: 'HR People Workbench',
            path: '/hr',
            surface: { renderer: 'micro-app' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-home'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr'],
        surfaceIds: ['hr-home'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    currentWorkspaces = [workspace, secondWorkspace]
    microAppRouteMock.getMountedMicroAppCurrentRoute.mockResolvedValue({ pathname: '/hr' })
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    const firstMicroApp = await screen.findByTitle('HR People Workbench')
    expect(firstMicroApp.getAttribute('name')).toBe('aiworker-hr--hr-home')

    await waitFor(() => {
      expect(microAppRouteMock.listeners.has('aiworker-hr--hr-home')).toBe(true)
    })
    microAppRouteMock.listeners.get('aiworker-hr--hr-home')?.(
      { pathname: '/hr/profiles/profile-ben' },
      { pathname: '/hr' },
    )

    act(() => {
      window.history.pushState(null, '', '/workers/hr-worker/workspaces/workspace-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTitle('HR People Workbench')).toBe(firstMicroApp)
    expect(firstMicroApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/routes/hr-home?workerId=hr-worker&workspaceId=workspace-2&theme=light')
    await waitFor(() => {
      expect((firstMicroApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'workspace-2',
      })
    })

    await waitFor(() => {
      expect(microAppRouteMock.listeners.has('aiworker-hr--hr-home')).toBe(true)
    })
    microAppRouteMock.listeners.get('aiworker-hr--hr-home')?.(
      { pathname: '/hr/profiles/profile-stella' },
      { pathname: '/hr' },
    )

    act(() => {
      window.history.pushState(null, '', '/workers/hr-worker/workspaces/workspace-1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTitle('HR People Workbench')).toBe(firstMicroApp)
    expect(firstMicroApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/routes/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light')
    await waitFor(() => {
      expect((firstMicroApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'workspace-1',
      })
    })
    await waitFor(() => {
      expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenLastCalledWith('aiworker-hr--hr-home', '/hr/profiles/profile-ben')
    })

    act(() => {
      window.history.pushState(null, '', '/workers/hr-worker/workspaces/workspace-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTitle('HR People Workbench')).toBe(firstMicroApp)
    expect(firstMicroApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/routes/hr-home?workerId=hr-worker&workspaceId=workspace-2&theme=light')
    await waitFor(() => {
      expect((firstMicroApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'workspace-2',
      })
    })
    await waitFor(() => {
      expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenLastCalledWith('aiworker-hr--hr-home', '/hr/profiles/profile-stella')
    })
  })

  it('does not reinterpret session engine state when a Soul App owns the mounted route', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-session',
            label: 'HR Session Workbench',
            path: '/hr/session',
            surface: { renderer: 'micro-app', scope: 'session' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-session'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr/session'],
        surfaceIds: ['hr-session'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    currentArtifacts = []
    currentTurns = [{ ...turnRecord, response: null, status: 'running' }]
    currentEvents = [{
      ...eventRecord,
      id: 12,
      payloadJson: {
        agentEvent: {
          detail: 'add /tmp/hiring/artifacts/session-1/candidate-screen.md (completed)',
          kind: 'status',
          label: 'file_change',
        },
      },
      seq: 1,
      type: 'status',
    }]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('HR Session Workbench')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-hr',
      sessionId: 'session-1',
      surfaceId: 'hr-session',
      workerId: 'hr-worker',
      workspaceId: 'workspace-1',
    })
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).not.toHaveProperty('turns')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).not.toHaveProperty('engineStatus')
    expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/surfaces/hr-session?workerId=hr-worker&workspaceId=workspace-1&sessionId=session-1&theme=light', expect.objectContaining({ headers: {} }))
    expect(screen.queryByText('Agent is generating')).toBeNull()
    expect(screen.queryByText('File written, indexing')).toBeNull()
    expect(screen.queryByText('Searched files')).toBeNull()
    expect(screen.queryByText('Artifact ready')).toBeNull()
    expect(screen.queryByText('Review recorded')).toBeNull()
    expect(document.querySelector('[data-slot="session-composer"]')).toBeNull()
  })

  it('uses shadcn sidebar menu buttons for host chrome actions', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')
    const hostChromeButtons = [
      screen.getByRole('button', { name: 'Hide sidebar' }),
      screen.getByRole('button', { name: 'Open workspace terminal' }),
      screen.getByRole('button', { name: 'Open right panel' }),
    ]

    for (const button of hostChromeButtons) {
      expect(button.getAttribute('data-slot')).toBe('sidebar-menu-button')
      expect(button.getAttribute('data-size')).toBe('sm')
      expect(button.className).toContain('hover:bg-sidebar-accent')
      expect(button.classList.contains('icon-button')).toBe(false)
      expect(button.classList.contains('icon-btn')).toBe(false)
      expect(button.querySelector('svg')).toBeTruthy()
    }

    const hostSidebarToggle = screen.getByRole('button', { name: 'Hide sidebar' })
    expect(hostSidebarToggle.getAttribute('aria-pressed')).toBe('true')
    expect(hostSidebarToggle.getAttribute('data-active')).toBe('true')
    fireEvent.click(hostSidebarToggle)
    expect(screen.getByRole('button', { name: 'Show sidebar' }).getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[class*="lucide-"]')).toBeNull()
  })

  it('keeps the Host sidebar scoped to worker switching', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')
    expect(document.querySelector('.worker-list-panel')).toBeNull()
    const switcher = screen.getByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Collapse AIWorker HR' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Collapse AIWorker QA' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to QA' })).toBeTruthy()
    expect(within(switcher).queryByText('Hiring Workspace')).toBeNull()
    expect(within(switcher).queryByRole('button', { name: 'Screen candidate' })).toBeNull()
  })

  it('keeps installed Soul Apps out of the worker rail and shows them in Settings', async () => {
    currentApps = [
      {
        appId: 'aiworker-hr',
        manifest: {
          name: 'AIWorker HR',
          permissions: Array.from({ length: 10 }, (_, index) => ({ id: `perm-${index}` })),
          ui: {
            artifactPreviews: [{ id: 'person-profile-preview', label: 'Person profile preview' }],
            panels: [{ id: 'people-panel', label: 'People panel' }],
            reviewPanels: [{ id: 'hr-review', label: 'HR review' }],
            routes: [{ id: 'hr-home', label: 'People workbench', path: '/hr/people', surface: { renderer: 'host-descriptor' } }],
            workbench: {
              actions: [
                {
                  id: 'refresh-people',
                  label: 'Refresh',
                  protocolAction: 'people.refresh',
                  requiredPermissions: ['storage:read:aiworker-hr'],
                  role: 'refresh',
                },
                {
                  id: 'toggle-evidence-drawer',
                  label: 'Evidence',
                  protocolAction: 'drawers.evidence.toggle',
                  requiredPermissions: ['connector:read:ats'],
                  role: 'panel-toggle',
                },
              ],
              primaryAction: {
                id: 'create-people-profile',
                label: 'New people profile',
                protocolAction: 'peopleProfiles.create',
                requiredPermissions: ['storage:write:aiworker-hr', 'search:write:aiworker-hr'],
                role: 'primary',
              },
              search: {
                id: 'people-profile-search',
                label: 'Search people profiles',
                placeholder: 'Search people profiles',
                protocolProvider: 'peopleProfiles.search',
                requiredPermissions: ['search:read:aiworker-hr'],
              },
              configuration: {
                id: 'configure-hr',
                label: 'Configure HR',
                protocolAction: 'configuration.open',
                requiredPermissions: ['api:serve:/api/apps/aiworker-hr'],
              },
            },
            workspaceWidgets: [{ id: 'hr-people-widget', label: 'People widget', surface: { renderer: 'micro-app' } }],
          },
        },
        mountedContribution: {
          apiRoutePrefix: '/api/apps/aiworker-hr',
          artifactPreviewIds: ['person-profile-preview'],
          descriptorSurfaceIds: ['hr-home'],
          microAppSurfaceIds: ['hr-people-widget'],
          panelIds: ['people-panel'],
          reviewPanelIds: ['hr-review'],
          routePaths: ['/hr/people'],
          surfaceIds: ['hr-home', 'hr-people-widget'],
          workbench: {
            actions: [
              {
                id: 'refresh-people',
                label: 'Refresh',
                protocolAction: 'people.refresh',
                requiredPermissions: ['storage:read:aiworker-hr'],
                role: 'refresh',
              },
              {
                id: 'toggle-evidence-drawer',
                label: 'Evidence',
                protocolAction: 'drawers.evidence.toggle',
                requiredPermissions: ['connector:read:ats'],
                role: 'panel-toggle',
              },
            ],
            primaryAction: {
              id: 'create-people-profile',
              label: 'New people profile',
              protocolAction: 'peopleProfiles.create',
              requiredPermissions: ['storage:write:aiworker-hr', 'search:write:aiworker-hr'],
              role: 'primary',
            },
            search: {
              id: 'people-profile-search',
              label: 'Search people profiles',
              placeholder: 'Search people profiles',
              protocolProvider: 'peopleProfiles.search',
              requiredPermissions: ['search:read:aiworker-hr'],
            },
            configuration: {
              id: 'configure-hr',
              label: 'Configure HR',
              protocolAction: 'configuration.open',
              requiredPermissions: ['api:serve:/api/apps/aiworker-hr'],
            },
          },
          workspaceWidgetIds: ['people-widget'],
        },
        status: 'enabled',
        version: '0.1.0',
      },
      {
        appId: 'aiworker-qa',
        manifest: {
          connectors: {
            optional: [],
            required: [
              {
                access: ['read'],
                id: 'ci',
                reason: 'Read CI and test evidence through the Host connector broker.',
                scopes: ['runs.read'],
              },
            ],
          },
          name: 'AIWorker QA',
          permissions: [
            { action: 'read', kind: 'storage', reason: 'Read app-scoped QA domain metadata.', target: 'aiworker-qa' },
            { action: 'write', kind: 'storage', reason: 'Write app-scoped QA domain metadata.', target: 'aiworker-qa' },
            { action: 'read', kind: 'search', reason: 'Read app-owned QA search descriptors.', target: 'aiworker-qa' },
            { action: 'write', kind: 'search', reason: 'Publish app-owned QA search descriptors.', target: 'aiworker-qa' },
            { action: 'read', kind: 'connector', reason: 'Read CI evidence through Host connector broker.', target: 'ci' },
          ],
          ui: {
            artifactPreviews: [],
            panels: [],
            reviewPanels: [],
            routes: [],
            workbench: {
              primaryAction: {
                id: 'create-release-gate',
                label: 'New release gate',
                protocolAction: 'releaseGates.create',
                requiredPermissions: ['storage:write:aiworker-qa', 'search:write:aiworker-qa'],
                role: 'primary',
              },
              search: {
                id: 'release-search',
                label: 'Search releases',
                placeholder: 'Search releases',
                protocolProvider: 'releases.search',
                requiredPermissions: ['search:read:aiworker-qa'],
              },
            },
          },
        },
        mountedContribution: {
          apiRoutePrefix: '/api/apps/aiworker-qa',
          artifactPreviewIds: [],
          descriptorSurfaceIds: [],
          microAppSurfaceIds: [],
          panelIds: [],
          reviewPanelIds: [],
          routePaths: ['/qa/release'],
          surfaceIds: [],
          workspaceWidgetIds: [],
        },
        status: 'disabled',
        version: '0.1.0',
      },
    ]

    render(<WorkerStudio />)

    await screen.findByTestId('worker-switcher')
    expect(screen.getByLabelText('Host actions')).toBeTruthy()
    expect(document.querySelectorAll('.entry-header.workspace-header')).toHaveLength(0)
    expect(document.querySelector('.hr-people-header')).toBeNull()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(screen.queryByText('People Profiles')).toBeNull()

    expect(screen.queryByRole('button', { name: 'New people profile' })).toBeNull()
    expect(screen.queryByPlaceholderText('Search people profiles')).toBeNull()
    expect(screen.getByPlaceholderText('Search workspaces...')).toBeTruthy()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/actions/'))).toBe(false)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/search?providerId='))).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Soul Apps (2)')).toBeNull()
    expect(screen.queryByText('Enabled · 0.1.0')).toBeNull()
    expect(screen.queryByText('10 permissions')).toBeNull()
    expect(screen.queryByText('API /api/apps/aiworker-hr')).toBeNull()
    expect(screen.queryByText('Route People workbench · /hr/people')).toBeNull()
    expect(screen.queryByText('3 mounted contributions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Developer details' })).toBeNull()

    openHostSettings()
    const dialog = await screen.findByRole('dialog', { name: 'Local Host Settings' })
    selectSettingsTab(within(dialog).getByRole('tab', { name: /Soul Apps/ }))

    expect(await within(dialog).findByRole('heading', { name: 'Soul Apps' })).toBeTruthy()
    expect(within(dialog).getByText('AIWorker HR')).toBeTruthy()
    const hrAppCard = within(dialog).getByText('AIWorker HR').closest('[data-slot="card"]')
    expect(hrAppCard).toBeTruthy()
    expect(within(dialog).getByText('Enabled · 0.1.0')).toBeTruthy()
    const permissionsBadge = within(dialog).getByText('10 access entries')
    expect(permissionsBadge.getAttribute('data-slot')).toBe('badge')
    expect(within(dialog).getByText('3 mounted contributions').getAttribute('data-slot')).toBe('badge')
    const disableHrButton = within(dialog).getByRole('button', { name: 'Disable AIWorker HR' })
    expect(disableHrButton.getAttribute('data-slot')).toBe('button')
    expect(disableHrButton.classList.contains('settings-action-button')).toBe(false)
    expect(disableHrButton.querySelector('span')).toBeNull()
    expect(within(dialog).getByText('API /api/apps/aiworker-hr')).toBeTruthy()
    expect(within(dialog).getByText('AIWorker QA')).toBeTruthy()
    expect(within(dialog).getByText('Disabled · 0.1.0')).toBeTruthy()
    expect(within(dialog).getByText('5 access entries')).toBeTruthy()
    const searchPermissionBadges = within(dialog).getAllByText('search:read:aiworker-qa')
    const qaAppAccess = searchPermissionBadges[0]?.closest('[aria-label="AIWorker QA app access"]')
    expect(qaAppAccess?.getAttribute('data-slot')).toBe('item-group')
    expect(within(dialog).getByText('App access').getAttribute('data-slot')).toBe('kbd')
    expect(within(dialog).getByText('App access').classList.contains('font-mono')).toBe(false)
    expect(searchPermissionBadges.some(node => node.closest('[data-slot="item-actions"]'))).toBe(true)
    expect(within(dialog).getByText('ci · not enabled').closest('[data-slot="item-actions"]')).toBeTruthy()
    expect(within(dialog).getAllByText('search:read:aiworker-qa').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('ci · not enabled')).toBeTruthy()
    expect(within(dialog).getAllByText('storage:write:aiworker-qa').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('search:write:aiworker-qa').length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable AIWorker QA' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-qa/enable', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(within(dialog).getAllByText('Enabled · 0.1.0').length).toBeGreaterThan(1)
    })
  })

  it('prefers an app-owned mounted route frame over the Host embedded HR renderer', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-home',
            label: 'HR People Workbench',
            path: '/hr',
            surface: { renderer: 'micro-app' },
          }],
          workbench: {
            primaryAction: {
              id: 'create-people-profile',
              label: 'New people profile',
              protocolAction: 'peopleProfiles.create',
              role: 'primary',
            },
          },
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-home'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr'],
        surfaceIds: ['hr-home'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('HR People Workbench')
    expect(microApp.tagName).toBe('MICRO-APP')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('name')).toBe('aiworker-hr--hr-home')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/routes/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light')
    expect(screen.queryByText('Soul App mounted route')).toBeNull()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/surfaces/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light', expect.objectContaining({ headers: {} }))

    await waitFor(() => {
      expect(microAppRouteMock.dataListeners.has('aiworker-hr--hr-home')).toBe(true)
    })
    vi.mocked(fetch).mockClear()
    microAppRouteMock.dataListeners.get('aiworker-hr--hr-home')?.({
      actionId: 'create-people-profile',
      appId: 'aiworker-hr',
      input: { source: 'soul-workbench' },
      surfaceId: 'hr-home',
      type: 'action',
    })

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/actions/'))).toBe(false)
    expect(microAppRouteMock.pushMountedMicroAppRoute).not.toHaveBeenCalledWith('aiworker-hr--hr-home', '/hr/profiles/new')
  })

  it('keeps worker identity in the Host worker switcher without duplicated worker rail labels', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')
    const switcher = screen.getByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).getByText('AIWorker HR').getAttribute('data-slot')).toBe('item-title')
    expect(within(switcher).getAllByText('Soul worker').every(item => item.getAttribute('data-slot') === 'item-description')).toBe(true)
    expect(within(switcher).getByRole('button', { name: 'Configure HR' })).toBeTruthy()
    const inactiveMore = within(switcher).getByRole('button', { name: 'Configure QA' })
    expect(inactiveMore.getAttribute('data-sidebar')).toBe('menu-action')
    expect(inactiveMore.className).toContain('md:opacity-0')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Collapse AIWorker QA' }))
    expect(within(switcher).queryByRole('button', { name: 'Switch to QA' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'HR' })).toBeNull()
    expect(screen.queryByRole('button', { name: /AIWorker HR \(1\)/ })).toBeNull()
    expect(switcher.querySelector('.status-dot')).toBeNull()
    expect(switcher.querySelector('.worker-list-item-meta')).toBeNull()
  })

  it('disambiguates duplicate worker names with stable ids in the Host worker switcher', async () => {
    currentWorkers = [
      { createdAt: '2026-05-24T06:49:06.848Z', defaultEngineId: 'codex', id: 'e2e-hr-codex-20260524', metadataJson: {}, name: 'e2e-hr-codex', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: '2026-05-25T06:49:06.848Z', defaultEngineId: 'codex', id: 'e2e-hr-codex-20260525', metadataJson: {}, name: 'e2e-hr-codex', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentWorkspaces = [
      { ...workspace, id: 'workspace-20260524', workerId: 'e2e-hr-codex-20260524' },
      { ...workspace, id: 'workspace-20260525', workerId: 'e2e-hr-codex-20260525' },
    ]
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-home',
            label: 'HR People Workbench',
            path: '/hr',
            surface: { entry: '/micro-app/routes/hr-home', renderer: 'micro-app', scope: 'workspace' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-home'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr'],
        surfaceIds: ['hr-home'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]

    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to e2e-hr-codex (e2e-hr-codex-20260524)' })).toBeTruthy()
    const secondWorkerButton = within(switcher).getByRole('button', { name: 'Switch to e2e-hr-codex (e2e-hr-codex-20260525)' })
    expect(within(switcher).getByText('id e2e-hr-c...0524 / 2026-05-24').getAttribute('data-slot')).toBe('item-description')
    expect(within(switcher).getByText('id e2e-hr-c...0525 / 2026-05-25').getAttribute('data-slot')).toBe('item-description')

    fireEvent.click(secondWorkerButton)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/e2e-hr-codex-20260525')
    })
    const microApp = await screen.findByTitle('HR People Workbench')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-hr/micro-app/routes/hr-home?workerId=e2e-hr-codex-20260525&workspaceId=workspace-20260525&theme=light')
  })

  it('routes directly to a worker and updates capability templates with worker identity', async () => {
    window.history.replaceState(null, '', '/workers/qa-worker')
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')

    await waitFor(() => {
      expect(screen.getByText('qa-worker')).toBeTruthy()
      expect(screen.getAllByText('Release Gate').length).toBeGreaterThan(0)
      expect(screen.queryByText('candidate-screen')).toBeNull()
    })
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    const capabilityTemplateHeading = screen.getByText('Capability template (1)')
    expect(capabilityTemplateHeading).toBeTruthy()
    expect(capabilityTemplateHeading.closest('[data-slot="item-group"]')).toBeTruthy()
    expect(capabilityTemplateHeading.closest('[data-slot="card"]')).toBeNull()
    expect(screen.getByTestId('worker-identity-card').getAttribute('data-slot')).toBe('card')
    expect(document.querySelector('.worker-overview-panel')).toBeNull()
    const workspaceAvatarButton = screen.getByRole('button', { name: 'Workspace' })
    expect(workspaceAvatarButton.getAttribute('data-slot')).toBe('button')
    expect(workspaceAvatarButton.getAttribute('data-size')).toBe('icon')
    expect(workspaceAvatarButton.querySelector('[data-slot="avatar"]')).toBeTruthy()
    expect(workspaceAvatarButton.querySelector('[data-slot="avatar-fallback"]')).toBeTruthy()
  })

  it('keeps Host toolbar focused on workspace controls when apps declare workbench actions', async () => {
    currentWorkspaces = [{
      ...workspace,
      id: 'qa-workspace',
      name: 'QA Release Workspace',
      workerId: 'qa-worker',
    }]
    currentApps = [{
      appId: 'aiworker-qa',
      manifest: {
        name: 'AIWorker QA',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [],
          workbench: {
            primaryAction: {
              id: 'create-release-gate',
              label: 'New release gate',
              protocolAction: 'releaseGates.create',
              requiredPermissions: ['storage:write:aiworker-qa', 'search:write:aiworker-qa'],
              role: 'primary',
            },
            search: {
              id: 'release-search',
              label: 'Search releases',
              placeholder: 'Search releases',
              protocolProvider: 'releases.search',
              requiredPermissions: ['search:read:aiworker-qa'],
            },
          },
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-qa',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: [],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/qa/release'],
        surfaceIds: [],
        workbench: {
          primaryAction: {
            id: 'create-release-gate',
            label: 'New release gate',
            protocolAction: 'releaseGates.create',
            requiredPermissions: ['storage:write:aiworker-qa', 'search:write:aiworker-qa'],
            role: 'primary',
          },
          search: {
            id: 'release-search',
            label: 'Search releases',
            placeholder: 'Search releases',
            protocolProvider: 'releases.search',
            requiredPermissions: ['search:read:aiworker-qa'],
          },
        },
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    window.history.replaceState(null, '', '/workers/qa-worker')

    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')

    expect(screen.queryByRole('button', { name: 'New release gate' })).toBeNull()
    expect(screen.queryByPlaceholderText('Search releases')).toBeNull()

    const searchInput = screen.getByPlaceholderText('Search workspaces...')
    expect(searchInput.getAttribute('data-slot')).toBe('input-group-control')
    expect(searchInput.closest('[data-slot="input-group"]')).toBeTruthy()
    expect(document.querySelector('.toolbar-search input')).toBeNull()
    const workspaceCard = screen
      .getAllByRole('button', { name: /QA Release Workspace/ })
      .find(item => item.getAttribute('aria-pressed') === 'true')
    expect(workspaceCard).toBeTruthy()
    if (!workspaceCard)
      return
    expect(workspaceCard.getAttribute('data-slot')).toBe('button')
    expect(workspaceCard.getAttribute('data-variant')).toBe('secondary')
    expect(workspaceCard.classList.contains('aria-pressed:border-primary')).toBe(false)
    expect(workspaceCard.classList.contains('aria-pressed:bg-primary/5')).toBe(false)
    const workspaceCardIcon = workspaceCard.querySelector('[data-slot="item-media"]') as HTMLElement
    expect(workspaceCardIcon).toBeTruthy()
    expect(workspaceCardIcon.classList.contains('rounded-md')).toBe(false)
    expect(workspaceCardIcon.classList.contains('bg-muted')).toBe(false)
    const workspaceListHeading = screen.getByText(/Workspaces \(/)
    expect(workspaceListHeading.getAttribute('data-slot')).toBe('item-title')
    fireEvent.change(searchInput, { target: { value: 'release workspace' } })
    expect(screen.getAllByRole('button', { name: /QA Release Workspace/ }).some(item => item.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/search?providerId='))).toBe(false)
  })

  it('creates a worker from the compact worker list dialog', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')
    fireEvent.click(screen.getByRole('button', { name: 'New Soul worker' }))

    const dialog = screen.getByRole('dialog', { name: 'Create worker' })
    expect(dialog.getAttribute('data-slot')).toBe('dialog-content')
    const createWorkerButton = within(dialog).getByRole('button', { name: 'Create worker' })
    expect(createWorkerButton.getAttribute('data-slot')).toBe('button')
    expect(createWorkerButton.getAttribute('data-variant')).toBe('default')
    expect(createWorkerButton.querySelector('span')).toBeNull()
    const soulSelect = within(dialog).getByRole('combobox', { name: 'Soul' })
    expect(soulSelect.getAttribute('data-slot')).toBe('select-trigger')
    expect(dialog.querySelector('.studio-select')).toBeNull()
    const workerNameInput = within(dialog).getByLabelText('Worker name')
    expect(workerNameInput.getAttribute('data-slot')).toBe('input')
    expect(workerNameInput.classList.contains('newproj-name')).toBe(false)
    fireEvent.click(soulSelect)
    expect(document.querySelector('[data-slot="select-content"]')).toBeTruthy()
    expect(screen.getByRole('listbox', { name: 'Soul' })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /QA/ }))
    expect(document.querySelector('[data-slot="select-content"]')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Worker name'), { target: { value: 'QA Worker' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create worker' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers', expect.objectContaining({
        body: expect.stringContaining(`"soulId":"${QA_SOUL_ID}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/worker-created')
    })
  })

  it('starts first-run from enabled Soul Apps when no workers exist', async () => {
    currentWorkers = []
    currentWorkspaces = []
    currentSessions = []
    currentArtifacts = []
    currentApps = [
      {
        appId: 'aiworker-hr',
        manifest: {
          name: 'AIWorker HR',
          ui: {
            artifactPreviews: [],
            panels: [],
            reviewPanels: [],
            routes: [],
            workspaceWidgets: [],
          },
        },
        mountedContribution: {
          apiRoutePrefix: '/api/apps/aiworker-hr',
          artifactPreviewIds: [],
          descriptorSurfaceIds: [],
          microAppSurfaceIds: [],
          panelIds: [],
          reviewPanelIds: [],
          routePaths: [],
          surfaceIds: [],
          workspaceWidgetIds: [],
        },
        status: 'enabled',
        version: '0.1.0',
      },
      {
        appId: 'aiworker-qa',
        manifest: {
          name: 'AIWorker QA',
          ui: {
            artifactPreviews: [],
            panels: [],
            reviewPanels: [],
            routes: [],
            workspaceWidgets: [],
          },
        },
        mountedContribution: {
          apiRoutePrefix: '/api/apps/aiworker-qa',
          artifactPreviewIds: [],
          descriptorSurfaceIds: [],
          microAppSurfaceIds: [],
          panelIds: [],
          reviewPanelIds: [],
          routePaths: [],
          surfaceIds: [],
          workspaceWidgetIds: [],
        },
        status: 'enabled',
        version: '0.1.0',
      },
    ]

    render(<WorkerStudio />)

    expect(await screen.findByText('Choose a Soul App to start')).toBeTruthy()
    expect(screen.getAllByText('AIWorker HR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AIWorker QA').length).toBeGreaterThan(0)
    const startHrButton = screen.getByRole('button', { name: 'Start AIWorker HR' })
    const startQaButton = screen.getByRole('button', { name: 'Start AIWorker QA' })
    expect(startHrButton.getAttribute('data-slot')).toBe('button')
    expect(startQaButton.getAttribute('data-slot')).toBe('button')
    expect(startHrButton.querySelector('span')).toBeNull()
    expect(startQaButton.querySelector('span')).toBeNull()
    expect(startHrButton.closest('[data-slot="card"]')).toBeTruthy()
    expect(startHrButton.classList.contains('first-run-app-card')).toBe(false)
    expect(screen.queryByText('aiworker-hr · 0 permissions')).toBeNull()
    expect(screen.queryByText('API /api/apps/aiworker-hr')).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Soul catalog' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Start AIWorker HR' }))

    const dialog = screen.getByRole('dialog', { name: 'Create worker' })
    expect((within(dialog).getByLabelText('Worker name') as HTMLInputElement).value).toBe('AIWorker HR')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create worker' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers', expect.objectContaining({
        body: expect.stringContaining(`"soulId":"${HR_SOUL_ID}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/worker-created')
    })
  })

  it('passes session locator context to app-owned mounted session surfaces without Host turn submission', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-session',
            label: 'HR Session Workbench',
            path: '/hr/session',
            surface: { renderer: 'micro-app', scope: 'session' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-session'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr/session'],
        surfaceIds: ['hr-session'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('HR Session Workbench')
    expect(microApp.getAttribute('name')).toBe('aiworker-hr--hr-session')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-hr',
      sessionId: 'session-1',
      surfaceId: 'hr-session',
      workerId: 'hr-worker',
      workspaceId: 'workspace-1',
    })
    expect(screen.queryByLabelText('Follow-up turn')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send turn' })).toBeNull()
    expect(writtenFiles).toHaveLength(0)
    expect(lastMessageRequestBody).toBeNull()
  })

  it('keeps Host from rendering session detail or artifact preview failures for app-owned mounted sessions', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-session',
            label: 'HR Session Workbench',
            path: '/hr/session',
            surface: { renderer: 'micro-app', scope: 'session' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-session'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr/session'],
        surfaceIds: ['hr-session'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    currentArtifactRawStatus = 500
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('HR Session Workbench')).toBeTruthy()
    expect(screen.queryByTestId('session-detail-panel')).toBeNull()
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull()
    expect(screen.queryByText('Local file 500: /api/local/workspaces/workspace-1/files/raw/artifacts/session-1/candidate-screen.md')).toBeNull()
  })

  it('keeps workspace routes on app-owned mounted surfaces when a Soul App route exists', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-home',
            label: 'HR People Workbench',
            path: '/hr',
            surface: { renderer: 'micro-app' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-home'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr'],
        surfaceIds: ['hr-home'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    currentSessions = []
    currentTurns = []
    currentArtifacts = []
    currentEvents = []
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('HR People Workbench')).toBeTruthy()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(screen.queryByText('Workspace navigation')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(screen.queryByText('What do you want to build in Hiring Workspace?')).toBeNull()
  })

  it('keeps session routes free of Host-level new-session navigation', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-session',
            label: 'HR Session Workbench',
            path: '/hr/session',
            surface: { renderer: 'micro-app', scope: 'session' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-session'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr/session'],
        surfaceIds: ['hr-session'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('HR Session Workbench')).toBeTruthy()
    expect(document.querySelector('.workspace-context-card')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to workspace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
  })

  it('keeps a selected session route under the active worker without exposing sessions in Host sidebar', async () => {
    currentApps = [{
      appId: 'aiworker-hr',
      manifest: {
        name: 'AIWorker HR',
        ui: {
          artifactPreviews: [],
          panels: [],
          reviewPanels: [],
          routes: [{
            id: 'hr-session',
            label: 'HR Session Workbench',
            path: '/hr/session',
            surface: { renderer: 'micro-app', scope: 'session' },
          }],
          workspaceWidgets: [],
        },
      },
      mountedContribution: {
        apiRoutePrefix: '/api/apps/aiworker-hr',
        artifactPreviewIds: [],
        descriptorSurfaceIds: [],
        microAppSurfaceIds: ['hr-session'],
        panelIds: [],
        reviewPanelIds: [],
        routePaths: ['/hr/session'],
        surfaceIds: ['hr-session'],
        workspaceWidgetIds: [],
      },
      status: 'enabled',
      version: '0.1.0',
    }]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('HR Session Workbench')).toBeTruthy()
    const switcher = screen.getByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).queryByText('Hiring Workspace')).toBeNull()
    expect(within(switcher).queryByRole('button', { name: 'Screen candidate' })).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Current worker' })).toBeNull()
    expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
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

    await screen.findByLabelText('Host actions')
    expect(screen.queryByRole('dialog', { name: 'Local Host Settings' })).toBeNull()

    openHostSettings()

    const settingsDialog = screen.getByRole('dialog', { name: 'Local Host Settings' })
    expect(settingsDialog).toBeTruthy()
    expect(settingsDialog.getAttribute('data-slot')).toBe('dialog-content')
    expect(document.querySelector('.modal-backdrop')).toBeNull()
    expect(settingsDialog.querySelector('[data-settings-slot="settings-dialog-actions"]')?.classList.contains('z-10')).toBe(false)
    const executionTab = within(settingsDialog).getByRole('tab', { name: /Local CLI \/ BYOK/ })
    expect(executionTab.getAttribute('data-slot')).toBe('tabs-trigger')
    expect(executionTab.className).toContain('group-data-vertical/tabs:flex-none')
    expect(executionTab.className).not.toContain('cursor-pointer')
    expect(executionTab.className).not.toMatch(/(?:^|\s)flex-1(?:\s|$)/)
    expect(within(executionTab).getByText('Execution').getAttribute('data-slot')).toBe('item-title')
    expect(within(executionTab).getByText('Local CLI / BYOK').getAttribute('data-slot')).toBe('item-description')
    const settingsTabs = within(settingsDialog).getByRole('tablist', { name: 'Local Host Settings' })
    expect(settingsTabs.getAttribute('data-slot')).toBe('tabs-list')
    expect(settingsTabs.getAttribute('aria-orientation')).toBe('vertical')
    expect(settingsTabs.className).toContain('max-md:h-52')
    expect(settingsTabs.className).toContain('max-md:max-h-52')
    expect(settingsTabs.className).toContain('max-md:overflow-auto')
    expect(settingsTabs.className).toContain('md:h-auto')
    expect(settingsTabs.className).toContain('md:max-h-none')
    expect(settingsTabs.className).toContain('md:overflow-visible')
    expect(settingsTabs.className).toContain('md:self-start')
    expect(settingsTabs.className).not.toMatch(/(?:^|\s)overflow-auto(?:\s|$)/)
    expect(settingsTabs.className).not.toContain('md:max-h-full')
    expect(settingsTabs.className).not.toContain('md:h-80')
    expect(settingsTabs.className).not.toContain('md:max-h-80')
    expect(settingsTabs.className).not.toContain('md:h-full')
    const settingsTabsRoot = settingsTabs.closest('[data-slot="tabs"]') as HTMLElement
    expect(settingsTabsRoot.classList.contains('border-t')).toBe(false)
    expect(settingsTabsRoot.classList.contains('border-border')).toBe(false)
    expect(settingsTabs.classList.contains('border-b')).toBe(false)
    expect(settingsTabs.classList.contains('border-r')).toBe(false)
    expect(settingsTabs.classList.contains('rounded-none')).toBe(false)
    expect(within(settingsDialog).getByRole('tabpanel').getAttribute('data-slot')).toBe('tabs-content')
    expect(screen.getByText('Local CLI / BYOK')).toBeTruthy()
    const executionPanel = within(settingsDialog).getByRole('tabpanel')
    const executionHeading = within(executionPanel).getByText('Local CLI engines')
    expect(executionHeading.getAttribute('data-slot')).toBe('item-title')
    expect(executionHeading.closest('[data-slot="item"]')).toBeTruthy()
    expect(screen.queryByText('All changes saved')).toBeNull()
    const executionModeGroup = within(settingsDialog).getByRole('group', { name: 'Execution' })
    expect(executionModeGroup.getAttribute('data-slot')).toBe('toggle-group')
    const localCliToggle = within(executionModeGroup).getByRole('radio', { name: /Local CLI/ })
    expect(localCliToggle.getAttribute('data-slot')).toBe('toggle-group-item')
    expect(within(localCliToggle).getByText('Local CLI').getAttribute('data-slot')).toBe('item-title')
    expect(within(localCliToggle).getByText('1 available').getAttribute('data-slot')).toBe('item-description')
    const codexIcon = document.querySelector('[data-engine-icon="codex"]')
    expect(codexIcon).toBeTruthy()
    expect(codexIcon?.getAttribute('data-slot')).toBe('item-media')
    expect(codexIcon?.getAttribute('data-variant')).toBe('icon')
    expect(codexIcon?.getAttribute('data-engine-icon-src')).toContain('/engine-icons/openai.svg')
    expect(codexIcon?.className).toContain('size-4')
    expect(codexIcon?.querySelector('[data-slot="engine-logo"]')).toBeNull()
    expect(codexIcon?.querySelector('[class]')).toBeNull()
    expect(codexIcon?.classList.contains('rounded-md')).toBe(false)
    expect(codexIcon?.classList.contains('ring-1')).toBe(false)
    const cursorIcon = document.querySelector('[data-engine-icon="cursor"]')
    expect(cursorIcon).toBeTruthy()
    expect(cursorIcon?.getAttribute('data-slot')).toBe('item-media')
    expect(cursorIcon?.getAttribute('data-variant')).toBe('icon')
    expect(cursorIcon?.getAttribute('data-engine-icon-src')).toContain('/engine-icons/cursor.svg')
    expect(cursorIcon?.className).toContain('size-4')
    expect(cursorIcon?.querySelector('[data-slot="engine-logo"]')).toBeNull()
    expect(cursorIcon?.querySelector('[class]')).toBeNull()
    expect(cursorIcon?.classList.contains('rounded-md')).toBe(false)
    expect(cursorIcon?.classList.contains('ring-1')).toBe(false)
    const codexEngineCard = screen.getByRole('button', { name: /Codex CLI/ })
    expect(codexEngineCard.getAttribute('data-slot')).toBe('button')
    expect(codexEngineCard.getAttribute('data-variant')).toBe('secondary')
    expect(codexEngineCard.className).not.toContain('cursor-pointer')
    expect(codexEngineCard.className).not.toContain('aria-pressed:bg-secondary')
    expect(codexEngineCard.classList.contains('aria-pressed:border-primary')).toBe(false)
    expect(codexEngineCard.classList.contains('aria-pressed:bg-primary/5')).toBe(false)
    const activeEngineBadge = within(codexEngineCard).getByText('Active')
    expect(activeEngineBadge.getAttribute('data-slot')).toBe('badge')
    expect(activeEngineBadge.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('.status-dot')).toBeNull()
    const testButton = screen.getByRole('button', { name: 'Test' })
    const rescanButton = screen.getByRole('button', { name: 'Rescan' })
    expect(testButton.classList.contains('settings-action-button')).toBe(false)
    expect(rescanButton.classList.contains('settings-action-button')).toBe(false)
    expect(testButton.classList.contains('icon-btn')).toBe(false)
    expect(rescanButton.classList.contains('icon-btn')).toBe(false)
    expect(testButton.getAttribute('data-slot')).toBe('button')
    expect(testButton.getAttribute('data-variant')).toBe('ghost')
    expect(testButton.className).not.toContain('cursor-pointer')
    expect(testButton.className).toContain('hover:bg-muted')
    expect(testButton.querySelector('span')).toBeNull()
    expect(testButton.closest('[data-slot="item-actions"]')).toBeTruthy()
    expect(testButton.closest('[data-slot="button-group"]')).toBeNull()
    expect(rescanButton.getAttribute('data-slot')).toBe('button')
    expect(rescanButton.getAttribute('data-variant')).toBe('ghost')
    expect(rescanButton.className).not.toContain('cursor-pointer')
    expect(rescanButton.className).toContain('hover:bg-muted')
    expect(rescanButton.querySelector('span')).toBeNull()
    expect(rescanButton.closest('[data-slot="item-actions"]')).toBeTruthy()
    expect(rescanButton.closest('[data-slot="button-group"]')).toBeNull()
    fireEvent.click(testButton)
    fireEvent.click(rescanButton)
    const engineStatus = await within(settingsDialog).findByText('Codex CLI responded.')
    expect(engineStatus.getAttribute('data-slot')).toBe('alert-description')
    const engineStatusAlert = engineStatus.closest('[data-slot="alert"]')
    expect(engineStatusAlert).toBeTruthy()
    expect(engineStatusAlert?.getAttribute('role')).toBe('status')
    selectSettingsTab(within(settingsDialog).getByRole('tab', { name: /Connectors/ }))
    const atsConnectorSwitch = within(settingsDialog).getByRole('switch', { name: /ATS \/ HRIS/ })
    const connectorItem = atsConnectorSwitch.closest('[data-slot="item"]') as HTMLElement
    expect(connectorItem.getAttribute('data-variant')).toBe('muted')
    expect(atsConnectorSwitch.closest('[data-slot="card"]')).toBeNull()
    selectSettingsTab(within(settingsDialog).getByRole('tab', { name: /About/ }))
    const aboutPanel = within(settingsDialog).getByRole('tabpanel')
    expect(aboutPanel.querySelector('[data-slot="item-group"]')).toBeTruthy()
    expect(aboutPanel.querySelectorAll('[data-slot="item"]').length).toBeGreaterThanOrEqual(4)
    const versionFact = within(aboutPanel).getByText('Version').closest('[data-slot="item"]') as HTMLElement
    expect(versionFact.getAttribute('data-variant')).toBe('muted')
    expect(within(versionFact).getByText('test')).toBeTruthy()
    expect(aboutPanel.querySelector('.rounded-md.border.bg-card')).toBeNull()
    selectSettingsTab(screen.getByRole('tab', { name: /Language/ }))
    const languageGroup = screen.getByRole('group', { name: 'Language' })
    expect(languageGroup.getAttribute('data-slot')).toBe('toggle-group')
    const zhLanguageButton = within(languageGroup).getByRole('radio', { name: /简体中文/ })
    expect(zhLanguageButton.getAttribute('data-slot')).toBe('toggle-group-item')
    expect(within(zhLanguageButton).getByText('简体中文').getAttribute('data-slot')).toBe('item-title')
    expect(within(zhLanguageButton).getByText('Interface').getAttribute('data-slot')).toBe('item-description')
    fireEvent.click(zhLanguageButton)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/test', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/rescan', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings', expect.objectContaining({ method: 'PATCH' }))
      expect(document.documentElement.lang).toBe('zh-CN')
    })
    const localizedSettingsDialog = screen.getByRole('dialog', { name: '本地 Host 设置' })
    expect(localizedSettingsDialog).toBeTruthy()
    fireEvent.click(within(localizedSettingsDialog).getByRole('button', { name: '关闭本地 Host 设置' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '本地 Host 设置' })).toBeNull()
    })
    expect(await screen.findByTestId('worker-switcher')).toBeTruthy()
    expect(screen.queryByText('Create workspace session')).toBeNull()
  })

  it('marks MCP settings as pending until workspace binding is implemented', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')
    openHostSettings()

    selectSettingsTab(screen.getByRole('tab', { name: /Local MCP/ }))
    const localMcpToggle = await screen.findByRole('switch', { name: /Local workspace MCP/ }) as HTMLButtonElement
    expect(localMcpToggle.getAttribute('data-slot')).toBe('switch')
    expect(localMcpToggle.disabled).toBe(true)
    expect(localMcpToggle.getAttribute('aria-checked')).toBe('false')
    expect(localMcpToggle.closest('[data-slot="item"]')?.getAttribute('data-variant')).toBe('muted')
    expect(localMcpToggle.closest('[data-slot="card"]')).toBeNull()
    expect(screen.getByText('Not connected yet. Future workspace binding will decide which sessions expose MCP context.')).toBeTruthy()

    selectSettingsTab(screen.getByRole('tab', { name: /External MCP/ }))
    const commandInput = await screen.findByPlaceholderText('command --arg value') as HTMLInputElement
    expect(commandInput.getAttribute('data-slot')).toBe('input')
    expect(commandInput.disabled).toBe(true)
    expect(screen.getByText('App-owned local MCP servers will be enabled from workspace binding with secret references when configured.')).toBeTruthy()
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

    expect(await screen.findByLabelText('Host actions')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: /Platform settings vtest/ })).toBeTruthy()
  })

  it('applies system appearance from the operating-system color scheme and updates on changes', async () => {
    const media = installMatchMedia(false)

    render(<WorkerStudio />)

    const shell = await screen.findByTestId('worker-studio-shell')
    expect(shell.getAttribute('data-appearance')).toBe('system')
    expect(shell.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => media.setMatches(true))

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
    expect(appearanceGroup.getAttribute('data-slot')).toBe('toggle-group')
    const darkAppearanceButton = within(appearanceGroup).getByRole('radio', { name: /Dark Workspace/ })
    expect(darkAppearanceButton.getAttribute('data-slot')).toBe('toggle-group-item')
    fireEvent.click(darkAppearanceButton)

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-appearance')).toBe('dark')
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(fetch).toHaveBeenCalledWith('/api/local/settings', expect.objectContaining({
        body: JSON.stringify({ appearance: 'dark' }),
        method: 'PATCH',
      }))
    })
  })
})
