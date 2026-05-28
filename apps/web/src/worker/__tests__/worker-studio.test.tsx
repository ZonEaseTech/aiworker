import type { HostedSoulApp, LocalSessionEvent, LocalSettingsConfig, LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-protocol'
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
const HR_SOUL_ID = 'aiworker-demo-people'
const QA_SOUL_ID = 'aiworker-demo-release'
const CUSTOM_SOUL_ID = 'aiworker-custom'
const CUSTOM_TEMPLATE_ID = `${CUSTOM_SOUL_ID}.explore`
const PEOPLE_CONTEXT_CAPTURE = `${HR_SOUL_ID}.context-capture`
const HR_LIFECYCLE_NEXT_STEP = `${HR_SOUL_ID}.lifecycle-next-step`
const HR_CANDIDATE_SCREEN = `${HR_SOUL_ID}.candidate-screen`
const HR_INTERVIEW_BRIEF = `${HR_SOUL_ID}.interview-brief`
const HR_ONBOARDING_PLAN = `${HR_SOUL_ID}.onboarding-plan`
const HR_OFFBOARDING_SUMMARY = `${HR_SOUL_ID}.offboarding-summary`
const HR_EVIDENCE_MATRIX = `${HR_SOUL_ID}.evidence-matrix`
const PEOPLE_RISK_REVIEW = `${HR_SOUL_ID}.risk-review`
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
  workerId: 'people-worker',
  name: 'Demo Workspace',
  rootPath: '/tmp/demo-workspace',
  type: 'workspace',
  status: 'active',
  sourcePointersJson: [],
  metadataJson: {},
  updatedAt: now,
}

const workers = [
  { createdAt: now, defaultEngineId: 'codex', id: 'people-worker', metadataJson: {}, name: 'HR', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
  { createdAt: now, defaultEngineId: 'codex', id: 'release-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
]

const souls = [
  { defaultCapabilities: [PEOPLE_CONTEXT_CAPTURE, HR_PROFILE_UPDATE_PROPOSAL, HR_LIFECYCLE_NEXT_STEP, HR_CANDIDATE_SCREEN, HR_INTERVIEW_BRIEF, HR_ONBOARDING_PLAN, HR_OFFBOARDING_SUMMARY, HR_EVIDENCE_MATRIX, PEOPLE_RISK_REVIEW], description: 'People operations workspace', id: HR_SOUL_ID, name: 'Demo People', status: 'available' },
  { defaultCapabilities: ['aiworker-demo-release.release-gate'], description: 'QA workspace', id: QA_SOUL_ID, name: 'Demo Release', status: 'available' },
]

const capabilities = [
  {
    description: 'Capture source context for a workspace item.',
    id: PEOPLE_CONTEXT_CAPTURE,
    inputHints: ['Source context', 'Workspace goal'],
    name: 'Context Capture',
    outputKind: 'context-capture',
    promptRef: './product/capabilities/context-capture/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an inspectable candidate profile update.',
    id: HR_PROFILE_UPDATE_PROPOSAL,
    inputHints: ['Candidate materials', 'Accepted README baseline'],
    name: 'Profile Update Draft',
    outputKind: 'profile-update-draft',
    promptRef: './product/workflows/profile-update-draft/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare the next HR touchpoint.',
    id: HR_LIFECYCLE_NEXT_STEP,
    inputHints: ['Person profile', 'Open questions'],
    name: 'Lifecycle Next Step',
    outputKind: 'lifecycle-next-step',
    promptRef: './product/workflows/lifecycle-next-step/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare a role rubric.',
    id: `${HR_SOUL_ID}.role-rubric`,
    inputHints: ['Role', 'Signals'],
    name: 'Role Rubric',
    outputKind: 'role-rubric',
    promptRef: './product/workflows/role-rubric/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Screen a candidate against a role.',
    id: HR_CANDIDATE_SCREEN,
    inputHints: ['Role', 'Candidate packet'],
    name: 'Candidate Screen',
    outputKind: 'candidate-screen',
    promptRef: './product/workflows/candidate-screen/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an interview brief.',
    id: HR_INTERVIEW_BRIEF,
    inputHints: ['Candidate packet', 'Rubric'],
    name: 'Interview Brief',
    outputKind: 'interview-brief',
    promptRef: './product/workflows/interview-brief/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an onboarding plan.',
    id: HR_ONBOARDING_PLAN,
    inputHints: ['Employee profile', 'Role expectations'],
    name: 'Onboarding Plan',
    outputKind: 'onboarding-plan',
    promptRef: './product/workflows/onboarding-plan/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare an offboarding summary.',
    id: HR_OFFBOARDING_SUMMARY,
    inputHints: ['Departing employee context', 'Handoff notes'],
    name: 'Offboarding Summary',
    outputKind: 'offboarding-summary',
    promptRef: './product/workflows/offboarding-summary/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Compare candidates against the role rubric.',
    id: HR_EVIDENCE_MATRIX,
    inputHints: ['Role rubric', 'Candidate packets'],
    name: 'Evidence Matrix',
    outputKind: 'evidence-matrix',
    promptRef: './product/workflows/evidence-matrix/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare a roundup packet.',
    id: `${HR_SOUL_ID}.roundup-packet`,
    inputHints: ['Evidence matrix', 'Interview notes'],
    name: 'Roundup Packet',
    outputKind: 'roundup-packet',
    promptRef: './product/workflows/roundup-packet/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Review operational risk.',
    id: PEOPLE_RISK_REVIEW,
    inputHints: ['Artifact', 'Policy'],
    name: 'Risk Review',
    outputKind: 'risk-review',
    promptRef: './product/workflows/risk-review/prompt.md',
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Summarize release readiness.',
    id: 'aiworker-demo-release.release-gate',
    inputHints: ['Test evidence', 'Known defects'],
    name: 'Release Gate',
    outputKind: 'release-gate',
    promptRef: './product/workflows/release-gate/prompt.md',
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
  capabilityId: HR_CANDIDATE_SCREEN,
  createdAt: now,
  endedAt: null,
  id: 'session-1',
  metadataJson: {},
  startedAt: now,
  status: 'active',
  title: 'Screen candidate',
  updatedAt: now,
  workerId: 'people-worker',
  workspaceId: 'workspace-1',
}

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
  type: 'status',
} satisfies LocalSessionEvent

let currentArtifacts: typeof artifactRecord[]
let currentEvents: LocalSessionEvent[]
let currentSettings: typeof baseSettings
let currentSessions: typeof sessionRecord[]
let currentSouls: typeof souls
let currentCapabilities: typeof capabilities
let currentWorkers: typeof workers
let currentWorkspaces: typeof workspace[]
let workspaceDataResponses: Array<Promise<typeof workspace[]> | typeof workspace[]>
let currentWorkerOverlayAssets: LocalWorkerOverlayAsset[]
let currentArtifactRawContent: string
let currentArtifactRawStatus: number
let lastMessageRequestBody: Record<string, unknown> | null
let lastSessionRequestBody: Record<string, unknown> | null
let writtenFiles: Array<{ body: string, path: string, workspaceId: string }>
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
      api: null,
      capabilities: [{
        id: 'default',
        name: `${appName} Default`,
        prompt: { ref: 'dist/product/capabilities/default/prompt.md', type: 'packaged-file' },
      }],
      compatibility: { host: '>=1.0.0' },
      configuration: {},
      engine: {},
      extensions: {},
      external: {},
      health: { ready: true },
      identity: {
        appId,
        name: appName,
        soulId: appId.replace(/^aiworker-/, ''),
        version: '0.1.0',
      },
      protocol: 'soul/v1',
      workbench: {
        entry: 'dist/web/workbench/index.html',
        mode: 'sdk-common',
        router: { mode: 'search' },
        type: 'micro-app',
      },
    },
    descriptorDigest: `${appId}-digest`,
    engineAssets: {
      workspace: { source: 'engine-assets/workspace' },
    },
    healthMessage: null,
    healthStatus: 'unknown',
    mountedWorkbench: {
      entry: '/micro-app/workbench',
      id: 'workbench',
      path: '/workbench',
      renderer: 'micro-app',
      scope: 'app',
    },
    name: appName,
    permissions,
    projectedCapabilities: [{
      description: `${appName} default capability`,
      id: `${appId}.default`,
      inputHints: [],
      name: `${appName} Default`,
      outputKind: 'session',
      promptRef: 'dist/product/capabilities/default/prompt.md',
      soulId: appId,
    }],
    projectedSoul: {
      defaultCapabilities: [`${appId}.default`],
      description: `${appName} descriptor`,
      id: appId,
      name: appName,
      status: status === 'enabled' ? 'available' : 'coming_soon',
    },
    soulId: appId.replace(/^aiworker-/, ''),
    sourceKind: 'descriptor-path',
    sourceRef: `/tmp/${appId}/dist/soul.descriptor.json`,
    status,
    validationIssues: [],
    version: '0.1.0',
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
  currentSouls = souls.map(soul => ({ ...soul, defaultCapabilities: [...soul.defaultCapabilities] }))
  currentCapabilities = capabilities.map(capability => ({
    ...capability,
    inputHints: [...capability.inputHints],
  }))
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
}

function workerOverlayConfigKeyForTest(asset: LocalWorkerOverlayAsset): string {
  const kind = asset.kind === 'entry-file'
    ? 'entry-file-overlay'
    : asset.kind === 'mcp-client' ? 'mcp-overlay' : 'skill-overlay'
  return `${kind}:${asset.id}`
}

function legacyWorkerOverlayConfigKeyForTest(asset: LocalWorkerOverlayAsset): string {
  return `overlay:${encodeURIComponent(asset.kind)}:${encodeURIComponent(asset.target)}:${encodeURIComponent(asset.id)}`
}

function workerOverlayAssetsFromConfigForTest(configKey: string, body: Record<string, unknown>): LocalWorkerOverlayAsset[] {
  const kind = body.kind === 'entry-file-overlay'
    ? 'entry-file'
    : body.kind === 'mcp-overlay' ? 'mcp-client' : body.kind === 'skill-overlay' ? 'skill' : null
  if (!kind)
    return []

  const options = readObjectForTest(body.options)
  const id = overlayIdFromConfigForTest(configKey, kind, options)
  if (!id)
    return []

  const sourceRef = readStringForTest(body.sourceRef) ?? readStringForTest(options.replaces) ?? ''
  return overlayTargetsFromConfigForTest(kind, body.target).map(target => ({
    checksum: readStringForTest(body.checksum),
    enabled: body.enabled !== false,
    id,
    kind,
    metadataJson: readObjectForTest(options.metadataJson),
    optionsJson: readObjectForTest(options.optionsJson),
    source: 'overlay',
    sourceRef,
    target,
    updatedAt: now,
  }))
}

function overlayIdFromConfigForTest(configKey: string, kind: LocalWorkerOverlayAsset['kind'], options: Record<string, unknown>): string | null {
  if (kind === 'entry-file')
    return readStringForTest(options.targetPath) ?? configKeyIdForTest(configKey)
  if (kind === 'skill')
    return skillIdFromRefForTest(readStringForTest(options.replaces)) ?? configKeyIdForTest(configKey)
  return configKeyIdForTest(configKey)
}

function overlayTargetsFromConfigForTest(kind: LocalWorkerOverlayAsset['kind'], target: unknown): string[] {
  if (kind === 'entry-file')
    return ['workspace']
  if (target === 'codex' || target === 'claude-code')
    return [target]
  if (kind === 'skill' && target === 'all')
    return ['codex', 'claude-code']
  return []
}

function configKeyIdForTest(configKey: string): string | null {
  const separatorIndex = configKey.indexOf(':')
  if (separatorIndex < 0)
    return null
  return configKey.slice(separatorIndex + 1) || null
}

function skillIdFromRefForTest(ref: string | null): string | null {
  const prefix = 'descriptor://engine/skills/'
  return ref?.startsWith(prefix) ? ref.slice(prefix.length).replace(/\/SKILL\.md$/, '') : null
}

function readObjectForTest(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringForTest(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
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
    if (url.endsWith('/api/app-installation/apps'))
      return json({ apps: currentApps })
    if (url.endsWith('/api/app-installation/apps/aiworker-demo-release/enable') && method === 'POST') {
      const enabled = currentApps.find(app => app.appId === 'aiworker-demo-release')
      currentApps = currentApps.map(app => app.appId === 'aiworker-demo-release' ? { ...app, status: 'enabled' } : app)
      return json({
        app: enabled ? { ...enabled, status: 'enabled' } : null,
        catalog: { apps: currentApps, capabilities: currentCapabilities, souls: currentSouls },
      })
    }
    if (url.endsWith('/api/app-installation/apps/aiworker-demo-release/archive') && method === 'POST') {
      const disabled = currentApps.find(app => app.appId === 'aiworker-demo-release')
      currentApps = currentApps.map(app => app.appId === 'aiworker-demo-release' ? { ...app, status: 'disabled' } : app)
      return json({
        app: disabled ? { ...disabled, status: 'disabled' } : null,
        catalog: { apps: currentApps, capabilities: currentCapabilities, souls: currentSouls },
      })
    }
    const requestUrl = new URL(url, 'http://local.test')
    if (requestUrl.pathname === '/api/mount/workbench') {
      const workerId = requestUrl.searchParams.get('workerId')
      const worker = currentWorkers.find(item => item.id === workerId)
      const mountedApp = currentApps
        .find(app => app.appId === worker?.soulId || app.appId === worker?.id || app.appId === HR_SOUL_ID)
        ?? currentApps.find(app => app.descriptor?.workbench?.type === 'micro-app')
      const surfaceId = 'workbench'
      const routePath = '/workbench'
      const appId = mountedApp?.appId ?? HR_SOUL_ID
      const entry = '/micro-app/workbench'
      const descriptorIdentity = mountedApp?.descriptor?.identity
      const identityName = typeof descriptorIdentity?.name === 'string' && descriptorIdentity.name.length > 0
        ? descriptorIdentity.name
        : appId
      const label = `${identityName} Workbench`
      const scope = 'app'
      return json({
        locator: {
          sessionId: requestUrl.searchParams.get('sessionId') ?? null,
          workerId,
          workspaceId: requestUrl.searchParams.get('workspaceId') ?? null,
        },
        microApp: {
          data: {
            appId,
            sessionId: requestUrl.searchParams.get('sessionId') ?? null,
            surfaceId,
            workerId,
            workspaceId: requestUrl.searchParams.get('workspaceId') ?? null,
            theme: requestUrl.searchParams.get('theme') ?? null,
          },
          name: `${appId}--${surfaceId}`,
          url: `/api/apps/${appId}${entry}${requestUrl.search}`,
        },
        mount: {
          appId,
          entry: `/api/apps/${appId}${entry}`,
          surfaceId,
          type: 'micro-app',
        },
        routerMode: 'search',
        surface: { id: surfaceId, kind: 'route', label, path: routePath, renderer: 'micro-app', scope },
      })
    }
    if (url.endsWith('/api/apps/aiworker-demo-people/micro-app/widgets/people-widget')) {
      return new Response('<!doctype html><html><body><h1>People widget</h1></body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    if (url.endsWith('/api/workers') && method === 'POST') {
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
    if (url.endsWith('/api/workers'))
      return json({ workers: currentWorkers })
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
        currentWorkerOverlayAssets = currentWorkerOverlayAssets.filter((asset) => {
          return workerOverlayConfigKeyForTest(asset) !== configKey && legacyWorkerOverlayConfigKeyForTest(asset) !== configKey
        })
        return json({
          config: {
            archived: true,
            configKey,
            updatedAt: now,
            value: null,
            workerId,
          },
        })
      }
      if (method === 'PUT' || method === 'PATCH') {
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
        const nextAssets = workerOverlayAssetsFromConfigForTest(configKey, body)
        currentWorkerOverlayAssets = [
          ...currentWorkerOverlayAssets.filter((asset) => {
            return workerOverlayConfigKeyForTest(asset) !== configKey && legacyWorkerOverlayConfigKeyForTest(asset) !== configKey
          }),
          ...nextAssets,
        ]
        return json({
          config: {
            archived: false,
            configKey,
            source: 'web',
            updatedAt: now,
            value: body,
            workerId,
          },
        })
      }
    }
    const projectionRefreshMatch = requestUrl.pathname.match(/^\/api\/projections\/([^/]+)\/refresh$/)
    if (projectionRefreshMatch && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as { workerId?: string, workspaceId?: string } : {}
      const workerId = body.workerId ?? ''
      const workspaceId = body.workspaceId ?? ''
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
            appId: 'aiworker-demo-people',
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
        target: projectionRefreshMatch[1],
      })
    }
    if (url.endsWith('/api/local/souls'))
      return json({ souls: currentSouls })
    if (url.endsWith('/api/capabilities'))
      return json({ capabilities: currentCapabilities })
    if (url.endsWith('/api/workspace-locators') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as { name: string } : { name: 'New candidate workspace' }
      const created = { ...workspace, id: 'workspace-created', name: body.name }
      currentWorkspaces = [created, ...currentWorkspaces]
      return json({ workspace: created }, 201)
    }
    if (url.endsWith('/api/workspace-locators'))
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
    if (url.endsWith('/api/sessions/session-1/invocations') && method === 'POST') {
      lastMessageRequestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      currentEvents = [...currentEvents, { ...eventRecord, id: 2, seq: 1 }]
      return json({ artifacts: [], events: currentEvents, files: [], session: sessionRecord }, 201)
    }
    if (url.endsWith('/api/sessions'))
      return json({ sessions: currentSessions })
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
    window.history.replaceState(null, '', '/workers/people-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Collapse Demo People' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Collapse Demo Release' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to QA' })).toBeTruthy()
    expect(within(switcher).queryByText('Demo Workspace')).toBeNull()
    expect(within(switcher).queryByText('Screen candidate')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
  })

  it('opens a workspace route as an app-owned mounted surface instead of Host session composition', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-demo-people',
      sessionId: null,
      surfaceId: 'workbench',
      workerId: 'people-worker',
      workspaceId: 'workspace-1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/mount/workbench?workerId=people-worker&workspaceId=workspace-1&theme=light', expect.objectContaining({ headers: {} }))
    expect(screen.queryByText('What do you want to build in Demo Workspace?')).toBeNull()
    expect(screen.queryByRole('combobox', { name: /capability|skill|template/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /\$ skill/i })).toBeNull()
    expect(lastSessionRequestBody).toBeNull()
  })

  it('renders descriptor workbench through the micro-app mount path without legacy route projection', async () => {
    currentApps = [hostedApp({
      appId: 'aiworker-demo-people',
      appName: 'Demo People',
    })]
    window.history.replaceState(null, '', '/workers/people-worker')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.tagName).toBe('MICRO-APP')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('name')).toBe('aiworker-demo-people--workbench')
    expect(microApp.getAttribute('baseroute')).toBe('/workbench')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&theme=light')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-demo-people',
      sessionId: null,
      surfaceId: 'workbench',
      workerId: 'people-worker',
      workspaceId: null,
    })
    expect(fetch).toHaveBeenCalledWith('/api/mount/workbench?workerId=people-worker&theme=light', expect.objectContaining({ headers: {} }))
    expect(screen.queryByTestId('universal-workbench')).toBeNull()
    expect(screen.queryByText('/legacy-workbench')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(lastSessionRequestBody).toBeNull()
  })

  it('passes the resolved dark Host theme to mounted route URL and micro-app data', async () => {
    currentSettings = { ...currentSettings, appearance: 'dark' }
    currentApps = [
      hostedApp({
        appId: 'aiworker-demo-people',
        appName: 'Demo People',
      }),
    ]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-1&theme=dark')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-demo-people',
      surfaceId: 'workbench',
      theme: 'dark',
      workerId: 'people-worker',
      workspaceId: 'workspace-1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/mount/workbench?workerId=people-worker&workspaceId=workspace-1&theme=dark', expect.objectContaining({ headers: {} }))
  })

  it('updates mounted route theme data when Host appearance changes without reloading', async () => {
    currentApps = [
      hostedApp({
        appId: 'aiworker-demo-people',
        appName: 'Demo People',
      }),
    ]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench') as HTMLElement & { data?: Record<string, unknown> }
    expect(microApp.data).toMatchObject({ theme: 'light' })

    openHostSettings()
    const settingsDialog = screen.getByRole('dialog', { name: 'Local Host Settings' })
    selectSettingsTab(within(settingsDialog).getByRole('tab', { name: /Appearance/ }))
    const appearanceGroup = await screen.findByRole('group', { name: 'Appearance' })
    fireEvent.click(within(appearanceGroup).getByRole('radio', { name: /Dark Workspace/ }))

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
      expect(microApp.data).toMatchObject({ theme: 'dark' })
      expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-1&theme=dark')
    })
  })

  it('updates Host workspace locator when a mounted app selects a workspace', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'release-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      hostedApp({
        appId: 'aiworker-demo-release',
        appName: 'Demo Release',
      }),
    ]
    const qaWorkspace = { ...workspace, id: 'release-workspace', name: 'QA Workspace', workerId: 'release-worker', updatedAt: '2026-05-24T06:49:06.848Z' }
    currentWorkspaces = []
    const staleForeignWorkspaceRefresh = deferred<typeof workspace[]>()
    workspaceDataResponses = [[], staleForeignWorkspaceRefresh.promise, [qaWorkspace]]
    window.history.replaceState(null, '', '/workers/release-worker')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo Release Workbench')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-release/micro-app/workbench?workerId=release-worker&theme=light')

    await waitFor(() => {
      expect(microAppRouteMock.dataListeners.has('aiworker-demo-release--workbench')).toBe(true)
    })
    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-demo-release--workbench')?.({
        appId: 'aiworker-demo-release',
        surfaceId: 'workbench',
        type: 'locator:workspace-selected',
        workerId: 'people-worker',
        workspaceId: 'release-workspace',
      })
    })
    expect(window.location.pathname).toBe('/workers/release-worker')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-release/micro-app/workbench?workerId=release-worker&theme=light')

    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-demo-release--workbench')?.({
        appId: 'aiworker-demo-release',
        surfaceId: 'workbench',
        type: 'locator:workspace-selected',
        workerId: 'release-worker',
        workspaceId: 'workspace-1',
      })
    })
    expect(window.location.pathname).toBe('/workers/release-worker')

    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-demo-release--workbench')?.({
        appId: 'aiworker-demo-release',
        surfaceId: 'workbench',
        type: 'locator:workspace-selected',
        workerId: 'release-worker',
        workspaceId: 'release-workspace',
      })
    })

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/release-worker/workspaces/release-workspace')
    })
    await waitFor(() => {
      expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-release/micro-app/workbench?workerId=release-worker&workspaceId=release-workspace&theme=light')
    })
    await waitFor(() => {
      expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'release-workspace',
      })
    })

    await act(async () => {
      staleForeignWorkspaceRefresh.resolve([{ ...workspace, workerId: 'people-worker' }])
      await staleForeignWorkspaceRefresh.promise
    })
    expect(window.location.pathname).toBe('/workers/release-worker/workspaces/release-workspace')
    await waitFor(() => {
      expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-release/micro-app/workbench?workerId=release-worker&workspaceId=release-workspace&theme=light')
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
    window.history.replaceState(null, '', '/workers/people-worker')
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
      expect(fetch).toHaveBeenCalledWith('/api/workers/people-worker/config/skill-overlay%3Ainterview-brief', expect.objectContaining({
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
      expect(fetch).toHaveBeenCalledWith('/api/workers/people-worker/config/skill-overlay%3Acustom-skill', expect.objectContaining({
        body: expect.stringContaining('"sourceRef":"descriptor://engine/skills/custom-skill"'),
        method: 'PUT',
      }))
    })
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More actions for custom-skill' }))
    fireEvent.click(await screen.findByText('Duplicate'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workers/people-worker/config/skill-overlay%3Acustom-skill-2', expect.objectContaining({
        body: expect.stringContaining('"sourceRef":"descriptor://engine/skills/custom-skill"'),
        method: 'PUT',
      }))
    })

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More actions for custom-skill-2' }))
    fireEvent.click(await screen.findByText('Delete'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workers/people-worker/config/skill-overlay%3Acustom-skill-2/archive', expect.objectContaining({
        method: 'POST',
      }))
    })
  })

  it('keeps Worker configuration scoped away from workspace projection', async () => {
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')
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
    window.history.replaceState(null, '', '/workers/people-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure QA' }))

    expect(screen.getByRole('dialog', { name: 'Worker configuration' })).toBeTruthy()
    expect(screen.getByText('QA worker overlay')).toBeTruthy()
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workers/release-worker/config', expect.objectContaining({
        headers: {},
      }))
    })
    expect(window.location.pathname).toBe('/workers/people-worker')
  })

  it('does not expose a workbench switch because descriptor v1 resolves one production workbench', async () => {
    currentSouls = [
      ...currentSouls,
      {
        defaultCapabilities: [CUSTOM_TEMPLATE_ID],
        description: 'Custom workspace',
        id: CUSTOM_SOUL_ID,
        name: 'AIWorker Custom',
        status: 'available',
      },
    ]
    currentCapabilities = [
      ...currentCapabilities,
      {
        description: 'Explore a custom workspace.',
        id: CUSTOM_TEMPLATE_ID,
        inputHints: ['Workspace context'],
        name: 'Explore',
        outputKind: 'custom-exploration',
        promptRef: './product/workflows/explore/prompt.md',
        soulId: CUSTOM_SOUL_ID,
      },
    ]
    currentWorkers = [
      ...currentWorkers,
      { createdAt: now, defaultEngineId: 'codex', id: 'custom-worker', metadataJson: {}, name: 'Custom', soulId: CUSTOM_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      hostedApp({
        appId: 'aiworker-demo-people',
        appName: 'Demo People',
      }),
      hostedApp({
        appId: 'aiworker-demo-release',
        appName: 'Demo Release',
      }),
      hostedApp({
        appId: 'aiworker-custom',
        appName: 'AIWorker Custom',
      }),
    ]
    window.history.replaceState(null, '', '/workers/people-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure HR' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure QA' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure Custom' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
  })

  it('keeps descriptor workbench resolution single-entry across workers', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'people-worker', metadataJson: {}, name: 'HR Primary', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: now, defaultEngineId: 'codex', id: 'people-worker-secondary', metadataJson: {}, name: 'HR Secondary', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: now, defaultEngineId: 'codex', id: 'release-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      hostedApp({
        appId: 'aiworker-demo-people',
        appName: 'Demo People',
      }),
    ]
    window.history.replaceState(null, '', '/workers/people-worker')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure HR Primary' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(within(switcher).getByRole('button', { name: 'Configure HR Secondary' }))
    expect(screen.queryByRole('button', { name: /^Workbench/ })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Workbench routes' })).toBeNull()
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
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]

    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')
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
    expect(screen.queryByRole('button', { name: /Demo People \(1\)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Demo Release \(1\)/ })).toBeNull()
    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.tagName).toBe('MICRO-APP')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('name')).toBe('aiworker-demo-people--workbench')
    expect(microApp.getAttribute('baseroute')).toBe('/workbench')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-1&theme=light')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-demo-people',
      surfaceId: 'workbench',
      theme: 'light',
      workerId: 'people-worker',
      workspaceId: 'workspace-1',
    })
    expect(fetch).toHaveBeenCalledWith('/api/mount/workbench?workerId=people-worker&workspaceId=workspace-1&theme=light', expect.objectContaining({ headers: {} }))
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
      name: 'Second Demo Workspace',
      workerId: 'people-worker',
    }
    currentApps = [{
      ...hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' }),
    }]
    currentWorkspaces = [workspace, secondWorkspace]
    microAppRouteMock.getMountedMicroAppCurrentRoute.mockResolvedValue({ pathname: '/workbench' })
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    const firstMicroApp = await screen.findByTitle('Demo People Workbench')
    expect(firstMicroApp.getAttribute('name')).toBe('aiworker-demo-people--workbench')

    await waitFor(() => {
      expect(microAppRouteMock.listeners.has('aiworker-demo-people--workbench')).toBe(true)
    })
    microAppRouteMock.listeners.get('aiworker-demo-people--workbench')?.(
      { pathname: '/workbench/profiles/profile-ben' },
      { pathname: '/workbench' },
    )

    act(() => {
      window.history.pushState(null, '', '/workers/people-worker/workspaces/workspace-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTitle('Demo People Workbench')).toBe(firstMicroApp)
    expect(firstMicroApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-2&theme=light')
    await waitFor(() => {
      expect((firstMicroApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'workspace-2',
      })
    })

    await waitFor(() => {
      expect(microAppRouteMock.listeners.has('aiworker-demo-people--workbench')).toBe(true)
    })
    microAppRouteMock.listeners.get('aiworker-demo-people--workbench')?.(
      { pathname: '/workbench/profiles/profile-stella' },
      { pathname: '/workbench' },
    )

    act(() => {
      window.history.pushState(null, '', '/workers/people-worker/workspaces/workspace-1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTitle('Demo People Workbench')).toBe(firstMicroApp)
    expect(firstMicroApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-1&theme=light')
    await waitFor(() => {
      expect((firstMicroApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'workspace-1',
      })
    })
    await waitFor(() => {
      expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenLastCalledWith('aiworker-demo-people--workbench', '/workbench/profiles/profile-ben')
    })

    act(() => {
      window.history.pushState(null, '', '/workers/people-worker/workspaces/workspace-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByTitle('Demo People Workbench')).toBe(firstMicroApp)
    expect(firstMicroApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-2&theme=light')
    await waitFor(() => {
      expect((firstMicroApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'workspace-2',
      })
    })
    await waitFor(() => {
      expect(microAppRouteMock.replaceMountedMicroAppRoute).toHaveBeenLastCalledWith('aiworker-demo-people--workbench', '/workbench/profiles/profile-stella')
    })
  })

  it('does not reinterpret session engine state when a Soul App owns the mounted route', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    currentArtifacts = []
    currentEvents = [{
      ...eventRecord,
      id: 12,
      payloadJson: {
        agentEvent: {
          detail: 'add /tmp/demo-workspace/artifacts/session-1/candidate-screen.md (completed)',
          kind: 'status',
          label: 'file_change',
        },
      },
      seq: 1,
      type: 'status',
    }]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-demo-people',
      sessionId: 'session-1',
      surfaceId: 'workbench',
      workerId: 'people-worker',
      workspaceId: 'workspace-1',
    })
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).not.toHaveProperty('turns')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).not.toHaveProperty('engineStatus')
    expect(fetch).toHaveBeenCalledWith('/api/mount/workbench?workerId=people-worker&workspaceId=workspace-1&sessionId=session-1&theme=light', expect.objectContaining({ headers: {} }))
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
    expect(within(switcher).getByRole('button', { name: 'Collapse Demo People' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Collapse Demo Release' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).getByRole('button', { name: 'Switch to QA' })).toBeTruthy()
    expect(within(switcher).queryByText('Demo Workspace')).toBeNull()
    expect(within(switcher).queryByRole('button', { name: 'Screen candidate' })).toBeNull()
  })

  it('keeps installed Soul Apps out of the worker rail and shows them in Settings', async () => {
    currentApps = [
      hostedApp({
        appId: 'aiworker-demo-people',
        appName: 'Demo People',
        permissions: Array.from({ length: 10 }, (_, index) => ({
          action: index % 2 === 0 ? 'read' : 'write',
          kind: 'storage',
          reason: 'Access HR app-owned data.',
          target: `aiworker-demo-people-${index}`,
        })),
      }),
      hostedApp({
        appId: 'aiworker-demo-release',
        appName: 'Demo Release',
        permissions: [
          { action: 'read', kind: 'storage', reason: 'Read app-scoped QA domain metadata.', target: 'aiworker-demo-release' },
          { action: 'write', kind: 'storage', reason: 'Write app-scoped QA domain metadata.', target: 'aiworker-demo-release' },
          { action: 'read', kind: 'search', reason: 'Read app-owned QA search descriptors.', target: 'aiworker-demo-release' },
          { action: 'write', kind: 'search', reason: 'Publish app-owned QA search descriptors.', target: 'aiworker-demo-release' },
          { action: 'read', kind: 'connector', reason: 'Read CI evidence through Host connector broker.', target: 'ci' },
        ],
        status: 'disabled',
      }),
    ]

    render(<WorkerStudio />)

    await screen.findByTestId('worker-switcher')
    expect(screen.getByLabelText('Host actions')).toBeTruthy()
    expect(document.querySelectorAll('.entry-header.workspace-header')).toHaveLength(0)
    expect(document.querySelector('.hr-people-header')).toBeNull()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(screen.queryByText('People Profiles')).toBeNull()
    expect(await screen.findByTitle('Demo People Workbench')).toBeTruthy()

    expect(screen.queryByRole('button', { name: 'New people profile' })).toBeNull()
    expect(screen.queryByPlaceholderText('Search people profiles')).toBeNull()
    expect(screen.queryByPlaceholderText('Search workspaces...')).toBeNull()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/actions/'))).toBe(false)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/search?providerId='))).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Soul Apps (2)')).toBeNull()
    expect(screen.queryByText('Enabled · 0.1.0')).toBeNull()
    expect(screen.queryByText('10 access entries')).toBeNull()
    expect(screen.queryByText('API /api/apps/aiworker-demo-people')).toBeNull()
    expect(screen.queryByText('Route People workbench · /hr/people')).toBeNull()
    expect(screen.queryByText('3 mounted workbenches')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Developer details' })).toBeNull()

    openHostSettings()
    const dialog = await screen.findByRole('dialog', { name: 'Local Host Settings' })
    selectSettingsTab(within(dialog).getByRole('tab', { name: /Soul Apps/ }))

    expect(await within(dialog).findByRole('heading', { name: 'Soul Apps' })).toBeTruthy()
    expect(within(dialog).getByText('Demo People')).toBeTruthy()
    const hrAppCard = within(dialog).getByText('Demo People').closest('[data-slot="card"]')
    expect(hrAppCard).toBeTruthy()
    expect(within(dialog).getByText('Enabled · 0.1.0')).toBeTruthy()
    const permissionsBadge = within(dialog).getByText('10 access entries')
    expect(permissionsBadge.getAttribute('data-slot')).toBe('badge')
    expect(within(dialog).getAllByText('1 mounted workbench').some(item => item.getAttribute('data-slot') === 'badge')).toBe(true)
    const archiveHrButton = within(dialog).getByRole('button', { name: 'Archive Demo People' })
    expect(archiveHrButton.getAttribute('data-slot')).toBe('button')
    expect(archiveHrButton.classList.contains('settings-action-button')).toBe(false)
    expect(archiveHrButton.querySelector('span')).toBeNull()
    expect(within(dialog).getByText('API /api/apps/aiworker-demo-people')).toBeTruthy()
    expect(within(dialog).getByText('Demo Release')).toBeTruthy()
    expect(within(dialog).getByText('Disabled · 0.1.0')).toBeTruthy()
    expect(within(dialog).getByText('5 access entries')).toBeTruthy()
    const searchPermissionBadges = within(dialog).getAllByText('search:read:aiworker-demo-release')
    const qaAppAccess = searchPermissionBadges[0]?.closest('[aria-label="Demo Release app access"]')
    expect(qaAppAccess?.getAttribute('data-slot')).toBe('item-group')
    const appAccessLabels = within(dialog).getAllByText('App access')
    expect(appAccessLabels.some(label => label.getAttribute('data-slot') === 'kbd')).toBe(true)
    expect(appAccessLabels.every(label => !label.classList.contains('font-mono'))).toBe(true)
    expect(searchPermissionBadges.some(node => node.closest('[data-slot="item-actions"]'))).toBe(true)
    expect(within(dialog).getAllByText('search:read:aiworker-demo-release').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('storage:write:aiworker-demo-release').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('search:write:aiworker-demo-release').length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable Demo Release' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/app-installation/apps/aiworker-demo-release/enable', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(within(dialog).getAllByText('Enabled · 0.1.0').length).toBeGreaterThan(1)
    })
  })

  it('prefers an app-owned mounted route frame over the Host embedded HR renderer', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]

    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.tagName).toBe('MICRO-APP')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('name')).toBe('aiworker-demo-people--workbench')
    expect(microApp.getAttribute('router-mode')).toBe('search')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=people-worker&workspaceId=workspace-1&theme=light')
    expect(screen.queryByText('Soul App mounted route')).toBeNull()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/mount/workbench?workerId=people-worker&workspaceId=workspace-1&theme=light', expect.objectContaining({ headers: {} }))

    await waitFor(() => {
      expect(microAppRouteMock.dataListeners.has('aiworker-demo-people--workbench')).toBe(true)
    })
    vi.mocked(fetch).mockClear()
    microAppRouteMock.dataListeners.get('aiworker-demo-people--workbench')?.({
      actionId: 'create-people-profile',
      appId: 'aiworker-demo-people',
      input: { source: 'soul-workbench' },
      surfaceId: 'workbench',
      type: 'action',
    })

    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/actions/'))).toBe(false)
    expect(microAppRouteMock.pushMountedMicroAppRoute).not.toHaveBeenCalledWith('aiworker-demo-people--workbench', '/hr/profiles/new')
  })

  it('keeps worker identity in the Host worker switcher without duplicated worker rail labels', async () => {
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')
    const switcher = screen.getByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).getByText('Demo People').getAttribute('data-slot')).toBe('item-title')
    expect(within(switcher).getAllByText('Soul worker').every(item => item.getAttribute('data-slot') === 'item-description')).toBe(true)
    expect(within(switcher).getByRole('button', { name: 'Configure HR' })).toBeTruthy()
    const inactiveMore = within(switcher).getByRole('button', { name: 'Configure QA' })
    expect(inactiveMore.getAttribute('data-sidebar')).toBe('menu-action')
    expect(inactiveMore.className).toContain('md:opacity-0')
    fireEvent.click(within(switcher).getByRole('button', { name: 'Collapse Demo Release' }))
    expect(within(switcher).queryByRole('button', { name: 'Switch to QA' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'HR' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Demo People \(1\)/ })).toBeNull()
    expect(switcher.querySelector('.status-dot')).toBeNull()
    expect(switcher.querySelector('.worker-list-item-meta')).toBeNull()
  })

  it('disambiguates duplicate worker names with stable ids in the Host worker switcher', async () => {
    currentWorkers = [
      { createdAt: '2026-05-24T06:49:06.848Z', defaultEngineId: 'codex', id: 'e2e-people-codex-20260524', metadataJson: {}, name: 'e2e-people-codex', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: '2026-05-25T06:49:06.848Z', defaultEngineId: 'codex', id: 'e2e-people-codex-20260525', metadataJson: {}, name: 'e2e-people-codex', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentWorkspaces = [
      { ...workspace, id: 'workspace-20260524', workerId: 'e2e-people-codex-20260524' },
      { ...workspace, id: 'workspace-20260525', workerId: 'e2e-people-codex-20260525' },
    ]
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]

    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to e2e-people-codex (e2e-people-codex-20260524)' })).toBeTruthy()
    const secondWorkerButton = within(switcher).getByRole('button', { name: 'Switch to e2e-people-codex (e2e-people-codex-20260525)' })
    expect(within(switcher).getByText('id e2e-peop...0524 / 2026-05-24').getAttribute('data-slot')).toBe('item-description')
    expect(within(switcher).getByText('id e2e-peop...0525 / 2026-05-25').getAttribute('data-slot')).toBe('item-description')

    fireEvent.click(secondWorkerButton)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/e2e-people-codex-20260525')
    })
    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.getAttribute('data-slot')).toBe('soul-app-mounted-micro-app')
    expect(microApp.getAttribute('url')).toBe('/api/apps/aiworker-demo-people/micro-app/workbench?workerId=e2e-people-codex-20260525&theme=light')
  })

  it('routes directly to a worker and updates capabilities with worker identity', async () => {
    window.history.replaceState(null, '', '/workers/release-worker')
    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')

    await waitFor(() => {
      expect(screen.getByText('release-worker')).toBeTruthy()
      expect(screen.getAllByText('Release Gate').length).toBeGreaterThan(0)
      expect(screen.queryByText('candidate-screen')).toBeNull()
    })
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    const capabilityHeading = screen.getByText('Capability (1)')
    expect(capabilityHeading).toBeTruthy()
    expect(capabilityHeading.closest('[data-slot="item-group"]')).toBeTruthy()
    expect(capabilityHeading.closest('[data-slot="card"]')).toBeNull()
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
      id: 'release-workspace',
      name: 'QA Release Workspace',
      workerId: 'release-worker',
    }]
    currentApps = [hostedApp({ appId: 'aiworker-demo-release', appName: 'Demo Release' })]
    window.history.replaceState(null, '', '/workers/release-worker')

    render(<WorkerStudio />)

    await screen.findByLabelText('Host actions')

    expect(screen.queryByRole('button', { name: 'New release gate' })).toBeNull()
    expect(screen.queryByPlaceholderText('Search releases')).toBeNull()

    expect(screen.queryByPlaceholderText('Search workspaces...')).toBeNull()
    expect(document.querySelector('.toolbar-search input')).toBeNull()
    expect(screen.queryByRole('button', { name: /QA Release Workspace/ })).toBeNull()
    expect(await screen.findByTitle('Demo Release Workbench')).toBeTruthy()
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
      expect(fetch).toHaveBeenCalledWith('/api/workers', expect.objectContaining({
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
      hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' }),
      hostedApp({ appId: 'aiworker-demo-release', appName: 'Demo Release' }),
    ]

    render(<WorkerStudio />)

    expect(await screen.findByText('Choose a Soul App to start')).toBeTruthy()
    expect(screen.getAllByText('Demo People').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Demo Release').length).toBeGreaterThan(0)
    const startHrButton = screen.getByRole('button', { name: 'Start Demo People' })
    const startQaButton = screen.getByRole('button', { name: 'Start Demo Release' })
    expect(startHrButton.getAttribute('data-slot')).toBe('button')
    expect(startQaButton.getAttribute('data-slot')).toBe('button')
    expect(startHrButton.querySelector('span')).toBeNull()
    expect(startQaButton.querySelector('span')).toBeNull()
    expect(startHrButton.closest('[data-slot="card"]')).toBeTruthy()
    expect(startHrButton.classList.contains('first-run-app-card')).toBe(false)
    expect(screen.queryByText('aiworker-demo-people · 0 permissions')).toBeNull()
    expect(screen.queryByText('API /api/apps/aiworker-demo-people')).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Soul catalog' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Start Demo People' }))

    const dialog = screen.getByRole('dialog', { name: 'Create worker' })
    expect((within(dialog).getByLabelText('Worker name') as HTMLInputElement).value).toBe('Demo People')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create worker' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/workers', expect.objectContaining({
        body: expect.stringContaining(`"soulId":"${HR_SOUL_ID}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/worker-created')
    })
  })

  it('passes session locator context to app-owned mounted session surfaces without Host turn submission', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Demo People Workbench')
    expect(microApp.getAttribute('name')).toBe('aiworker-demo-people--workbench')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      appId: 'aiworker-demo-people',
      sessionId: 'session-1',
      surfaceId: 'workbench',
      workerId: 'people-worker',
      workspaceId: 'workspace-1',
    })
    expect(screen.queryByLabelText('Follow-up turn')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send turn' })).toBeNull()
    expect(writtenFiles).toHaveLength(0)
    expect(lastMessageRequestBody).toBeNull()
  })

  it('keeps Host from rendering session detail or artifact preview failures for app-owned mounted sessions', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    currentArtifactRawStatus = 500
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('Demo People Workbench')).toBeTruthy()
    expect(screen.queryByTestId('session-detail-panel')).toBeNull()
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull()
    expect(screen.queryByText('Local file 500: /api/local/workspaces/workspace-1/files/raw/artifacts/session-1/candidate-screen.md')).toBeNull()
  })

  it('keeps workspace routes on app-owned mounted surfaces when a Soul App route exists', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    currentSessions = []
    currentArtifacts = []
    currentEvents = []
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('Demo People Workbench')).toBeTruthy()
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(screen.queryByText('Workspace navigation')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(screen.queryByText('What do you want to build in Demo Workspace?')).toBeNull()
  })

  it('keeps session routes free of Host-level new-session navigation', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('Demo People Workbench')).toBeTruthy()
    expect(document.querySelector('.workspace-context-card')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to workspace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(window.location.pathname).toBe('/workers/people-worker/workspaces/workspace-1/sessions/session-1')
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
  })

  it('keeps a selected session route under the active worker without exposing sessions in Host sidebar', async () => {
    currentApps = [hostedApp({ appId: 'aiworker-demo-people', appName: 'Demo People' })]
    window.history.replaceState(null, '', '/workers/people-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByTitle('Demo People Workbench')).toBeTruthy()
    const switcher = screen.getByTestId('worker-switcher')
    expect(within(switcher).getByRole('button', { name: 'Switch to HR' })).toBeTruthy()
    expect(within(switcher).queryByText('Demo Workspace')).toBeNull()
    expect(within(switcher).queryByRole('button', { name: 'Screen candidate' })).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Current worker' })).toBeNull()
    expect(window.location.pathname).toBe('/workers/people-worker/workspaces/workspace-1/sessions/session-1')
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
