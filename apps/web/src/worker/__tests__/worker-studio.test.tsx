import type { LocalSessionEvent, LocalSettingsConfig, LocalTurn } from '@zonease/aiworker-shared'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { engineIconSrc } from '../../features/settings/model'
import { WorkerStudio } from '../worker-studio'

const now = '2026-05-10T00:00:00.000Z'
const HR_SOUL_ID = 'aiworker-hr'
const QA_SOUL_ID = 'aiworker-qa'
const HR_PERSON_PROFILE = `${HR_SOUL_ID}.person-profile`
const HR_LIFECYCLE_NEXT_STEP = `${HR_SOUL_ID}.lifecycle-next-step`
const HR_CANDIDATE_SCREEN = `${HR_SOUL_ID}.candidate-screen`
const HR_INTERVIEW_BRIEF = `${HR_SOUL_ID}.interview-brief`
const HR_ONBOARDING_PLAN = `${HR_SOUL_ID}.onboarding-plan`
const HR_OFFBOARDING_SUMMARY = `${HR_SOUL_ID}.offboarding-summary`
const HR_EVIDENCE_MATRIX = `${HR_SOUL_ID}.evidence-matrix`
const HR_HIRING_RISK = `${HR_SOUL_ID}.hiring-risk`

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
  { defaultTemplates: [HR_PERSON_PROFILE, HR_LIFECYCLE_NEXT_STEP, HR_CANDIDATE_SCREEN, HR_INTERVIEW_BRIEF, HR_ONBOARDING_PLAN, HR_OFFBOARDING_SUMMARY, HR_EVIDENCE_MATRIX, HR_HIRING_RISK], description: 'People operations workspace', domain: 'hr-people-ops', id: HR_SOUL_ID, name: 'AIWorker HR', status: 'available' },
  { defaultTemplates: ['aiworker-qa.release-gate'], description: 'QA workspace', domain: 'quality-assurance', id: QA_SOUL_ID, name: 'AIWorker QA', status: 'available' },
]

const templates = [
  {
    description: 'Create a source-backed HR profile snapshot.',
    id: HR_PERSON_PROFILE,
    inputHints: ['Person context', 'Lifecycle stage'],
    name: 'Person Profile',
    outputKind: 'person-profile',
    prompt: 'Summarize profile',
    reviewRubric: ['Evidence is grounded.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare the next HR touchpoint.',
    id: HR_LIFECYCLE_NEXT_STEP,
    inputHints: ['Person profile', 'Open questions'],
    name: 'Lifecycle Next Step',
    outputKind: 'lifecycle-next-step',
    prompt: 'Prepare next step',
    reviewRubric: ['Next action is concrete.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare a role rubric.',
    id: `${HR_SOUL_ID}.role-rubric`,
    inputHints: ['Role', 'Signals'],
    name: 'Role Rubric',
    outputKind: 'role-rubric',
    prompt: 'Build role rubric',
    reviewRubric: ['Criteria are role-related.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Screen a candidate against a role.',
    id: HR_CANDIDATE_SCREEN,
    inputHints: ['Role', 'Candidate packet'],
    name: 'Candidate Screen',
    outputKind: 'candidate-screen',
    prompt: 'Screen candidate',
    reviewRubric: ['Evidence is grounded.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an interview brief.',
    id: HR_INTERVIEW_BRIEF,
    inputHints: ['Candidate packet', 'Rubric'],
    name: 'Interview Brief',
    outputKind: 'interview-brief',
    prompt: 'Draft interview brief',
    reviewRubric: ['Questions are evidence-backed.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft an onboarding plan.',
    id: HR_ONBOARDING_PLAN,
    inputHints: ['Employee profile', 'Role expectations'],
    name: 'Onboarding Plan',
    outputKind: 'onboarding-plan',
    prompt: 'Draft onboarding plan',
    reviewRubric: ['Owners and risks are explicit.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare an offboarding summary.',
    id: HR_OFFBOARDING_SUMMARY,
    inputHints: ['Departing employee context', 'Handoff notes'],
    name: 'Offboarding Summary',
    outputKind: 'offboarding-summary',
    prompt: 'Prepare offboarding summary',
    reviewRubric: ['Sensitive details are minimized.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Compare candidates against the role rubric.',
    id: HR_EVIDENCE_MATRIX,
    inputHints: ['Role rubric', 'Candidate packets'],
    name: 'Evidence Matrix',
    outputKind: 'evidence-matrix',
    prompt: 'Build evidence matrix',
    reviewRubric: ['Missing signals are visible.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Prepare a roundup packet.',
    id: `${HR_SOUL_ID}.roundup-packet`,
    inputHints: ['Evidence matrix', 'Interview notes'],
    name: 'Roundup Packet',
    outputKind: 'roundup-packet',
    prompt: 'Draft roundup packet',
    reviewRubric: ['Decision remains human-owned.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Review hiring risk.',
    id: HR_HIRING_RISK,
    inputHints: ['Artifact', 'Policy'],
    name: 'Hiring Risk',
    outputKind: 'hiring-risk',
    prompt: 'Check hiring risk',
    reviewRubric: ['Protected-class inference is absent.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Summarize release readiness.',
    id: 'aiworker-qa.release-gate',
    inputHints: ['Test evidence', 'Known defects'],
    name: 'Release Gate',
    outputKind: 'release-gate',
    prompt: 'Summarize release gate',
    reviewRubric: ['Recommendation is explicit.'],
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
  localMcpServer: { enabled: true, url: 'http://127.0.0.1:4319/mcp' },
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

const lessonRecord = {
  createdAt: now,
  evidenceJson: [{ turnId: 'turn-1' }],
  id: 'lesson-1',
  sourceReviewId: null,
  statement: 'Keep hiring evidence attached to the candidate screen.',
  status: 'proposed',
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
let currentLessons: typeof lessonRecord[]
let currentReviews: Array<{
  artifactId: string | null
  createdAt: string
  findingsJson: Array<Record<string, unknown>>
  id: string
  risksJson: Array<Record<string, unknown>>
  sessionId: string | null
  turnId: string | null
  verdict: 'needs_review' | 'pass' | 'warn' | 'fail'
  workspaceId: string
}>
let currentSettings: typeof baseSettings
let currentSessions: typeof sessionRecord[]
let currentTurns: LocalTurn[]
let currentWorkers: typeof workers
let currentWorkspaces: typeof workspace[]
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
      routes?: Array<{ id?: string, label: string, path: string, surface?: { renderer: 'host-descriptor' | 'sandboxed-frame' | 'trusted-module' } }>
      shell?: {
        actions?: Array<{
          id: string
          label: string
          protocolAction: string
          requiredPermissions?: string[]
          slot: 'action' | 'drawer-toggle' | 'refresh'
        }>
        primaryAction?: {
          id: string
          label: string
          protocolAction: string
          requiredPermissions?: string[]
          slot: 'primary'
        }
        search?: {
          id: string
          label: string
          placeholder: string
          protocolProvider: string
          requiredPermissions?: string[]
        }
        settings?: {
          id: string
          label: string
          protocolAction: string
          requiredPermissions?: string[]
        }
      }
      workspaceWidgets?: Array<{ id: string, label: string, surface?: { renderer: 'host-descriptor' | 'sandboxed-frame' | 'trusted-module' } }>
    }
  }
  mountedContribution?: {
    apiRoutePrefix: string | null
    artifactPreviewIds: string[]
    descriptorSurfaceIds?: string[]
    frameSurfaceIds?: string[]
    panelIds: string[]
    reviewPanelIds: string[]
    routePaths: string[]
    surfaceIds?: string[]
    shell?: {
      actions?: Array<{
        id: string
        label: string
        protocolAction: string
        requiredPermissions?: string[]
        slot: 'action' | 'drawer-toggle' | 'refresh'
      }>
      primaryAction?: {
        id: string
        label: string
        protocolAction: string
        requiredPermissions?: string[]
        slot: 'primary'
      }
      search?: {
        id: string
        label: string
        placeholder: string
        protocolProvider: string
        requiredPermissions?: string[]
      }
      settings?: {
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
  currentTurns = [{ ...turnRecord }]
  currentArtifacts = [{ ...artifactRecord }]
  currentReviews = []
  currentLessons = [{ ...lessonRecord }]
  currentEvents = [{ ...eventRecord }]
  currentWorkers = workers.map(worker => ({ ...worker }))
  currentApps = []
  deferCreatedSessionStream = false
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
        catalog: { apps: currentApps, souls, templates },
        review: { appId: 'aiworker-qa', summary: { disabledRequiredConnectorIds: ['ci'] } },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-qa/disable') && method === 'POST') {
      const disabled = currentApps.find(app => app.appId === 'aiworker-qa')
      currentApps = currentApps.map(app => app.appId === 'aiworker-qa' ? { ...app, status: 'disabled' } : app)
      return json({
        app: disabled ? { ...disabled, status: 'disabled' } : null,
        catalog: { apps: currentApps, souls, templates },
        review: { appId: 'aiworker-qa', summary: { disabledRequiredConnectorIds: ['ci'] } },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/surfaces/hr-home')) {
      return json({
        actions: [{ id: 'create-profile-review', label: 'Create review' }],
        fields: [
          { label: 'Domain', value: 'hr-people-ops' },
          { label: 'Evidence broker', value: 'ats' },
        ],
        status: 'ready',
        title: 'HR Mounted Workbench',
        type: 'aiworker.surface.descriptor.v1',
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/surfaces/hr-people-widget')) {
      return json({
        frame: {
          sandbox: 'allow-scripts allow-forms',
          title: 'People widget',
          url: 'about:blank',
        },
        surface: { id: 'hr-people-widget', kind: 'workspace-widget', label: 'People widget', renderer: 'sandboxed-frame' },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/frames/widgets/hr-people-widget')) {
      return new Response('<!doctype html><html><body><h1>People widget</h1></body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/actions/create-people-profile') && method === 'POST') {
      return json({
        action: { id: 'create-people-profile', protocolAction: 'peopleProfiles.create' },
        result: { ok: true, message: 'People profile draft created.', refresh: true },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/actions/toggle-evidence-drawer') && method === 'POST') {
      return json({
        action: { id: 'toggle-evidence-drawer', protocolAction: 'drawers.evidence.toggle' },
        result: { ok: true, message: 'Evidence drawer intent emitted.' },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/actions/refresh-people') && method === 'POST') {
      return json({
        action: { id: 'refresh-people', protocolAction: 'people.refresh' },
        result: { ok: true, message: 'People data refreshed.', refresh: true },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/actions/hr-settings') && method === 'POST') {
      return json({
        action: { id: 'hr-settings', protocolAction: 'settings.open' },
        result: { ok: true, message: 'HR settings opened.' },
      })
    }
    if (url.endsWith('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada&limit=8')) {
      return json({
        providerId: 'peopleProfiles.search',
        items: [{
          appId: 'aiworker-hr',
          authority: 'soul-app',
          id: 'profile-ada',
          kind: 'people-profile',
          summary: 'Staff engineer candidate profile',
          title: 'Ada Lovelace',
        }],
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
    if (url.endsWith('/api/local/souls'))
      return json({ souls })
    if (url.endsWith('/api/local/templates'))
      return json({ templates })
    if (url.endsWith('/api/local/workers/hr-worker/workspaces') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as { name: string } : { name: 'New candidate workspace' }
      const created = { ...workspace, id: 'workspace-created', name: body.name }
      currentWorkspaces = [created, ...currentWorkspaces]
      return json({ workspace: created }, 201)
    }
    if (url.endsWith('/api/local/workspaces'))
      return json({ workspaces: currentWorkspaces })
    const workerSessionStreamMatch = url.match(/\/api\/local\/workers\/hr-worker\/workspaces\/([^/]+)\/sessions\/stream$/)
    const workspaceSessionStreamMatch = url.match(/\/api\/local\/workspaces\/([^/]+)\/sessions\/stream$/)
    const streamWorkspaceId = workerSessionStreamMatch?.[1] ?? workspaceSessionStreamMatch?.[1]
    if (streamWorkspaceId && method === 'POST') {
      const sessionId = streamWorkspaceId === 'workspace-created' ? 'session-created' : 'session-created-worker-route'
      const turnId = streamWorkspaceId === 'workspace-created' ? 'turn-created' : 'turn-created-worker-route'
      const artifactId = streamWorkspaceId === 'workspace-created' ? 'artifact-created' : 'artifact-created-worker-route'
      const workspaceName = currentWorkspaces.find(item => item.id === streamWorkspaceId)?.name ?? 'New candidate workspace'
      const createdSession = { ...sessionRecord, workspaceId: streamWorkspaceId, id: sessionId, title: workspaceName }
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
            controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify({ artifacts: [createdArtifact], events: [], files: [], lessons: [], review: null, session: createdSession, turn: createdTurn })}\n\n`))
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
      return json({ artifacts: [createdArtifact], events: [], files: [], lessons: [], review: null, session: createdSession, turn: createdTurn }, 201)
    }
    if ((url.endsWith('/api/local/workers/hr-worker/sessions/session-1/messages/stream') || url.endsWith('/api/local/sessions/session-1/turns/stream')) && method === 'POST') {
      const nextTurn = {
        ...turnRecord,
        id: 'turn-2',
        input: 'Add interview risks.',
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
          controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify({ artifacts: [], events: currentEvents, files: [], lessons: [], review: null, session: sessionRecord, turn: nextTurn })}\n\n`))
          controller.close()
        },
      }), { headers: { 'content-type': 'text/event-stream' }, status: 200 })
    }
    if ((url.endsWith('/api/local/workers/hr-worker/sessions/session-1/messages') || url.endsWith('/api/local/sessions/session-1/turns')) && method === 'POST') {
      const nextTurn = {
        ...turnRecord,
        id: 'turn-2',
        input: 'Add interview risks.',
        response: 'Updated Candidate Screen.',
        seq: 2,
      }
      currentTurns = [...currentTurns, nextTurn]
      currentEvents = [...currentEvents, { ...eventRecord, id: 2, seq: 1, turnId: 'turn-2' }]
      return json({ artifacts: [], events: currentEvents, files: [], lessons: [], review: null, session: sessionRecord, turn: nextTurn }, 201)
    }
    if (url.endsWith('/api/local/sessions'))
      return json({ sessions: currentSessions })
    if (url.endsWith('/api/local/turns'))
      return json({ turns: currentTurns })
    if (url.endsWith('/api/local/files'))
      return json({ files: [] })
    if (url.includes('/api/local/workspaces/') && url.includes('/files/raw/'))
      return new Response('# Candidate Screen\n\nEvidence summary.\n', { headers: { 'content-type': 'text/plain' } })
    if (url.endsWith('/api/local/artifacts'))
      return json({ artifacts: currentArtifacts })
    if (url.endsWith('/api/local/reviews') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as Partial<(typeof currentReviews)[number]> : {}
      const review = {
        artifactId: body.artifactId ?? 'artifact-1',
        createdAt: now,
        findingsJson: body.findingsJson ?? [{ message: 'Human review requested from Worker Web.' }],
        id: 'review-1',
        risksJson: body.risksJson ?? [],
        sessionId: body.sessionId ?? 'session-1',
        turnId: body.turnId ?? 'turn-1',
        verdict: body.verdict ?? 'needs_review',
        workspaceId: body.workspaceId ?? 'workspace-1',
      }
      currentReviews = [review]
      return json({ review }, 201)
    }
    if (url.endsWith('/api/local/reviews'))
      return json({ reviews: currentReviews })
    if (url.endsWith('/api/local/lessons/lesson-1') && method === 'PATCH') {
      const body = init?.body ? JSON.parse(String(init.body)) as { status: typeof lessonRecord.status } : { status: 'accepted' }
      currentLessons = currentLessons.map(lesson => lesson.id === 'lesson-1' ? { ...lesson, status: body.status } : lesson)
      return json({ lesson: currentLessons[0] })
    }
    if (url.endsWith('/api/local/lessons'))
      return json({ lessons: currentLessons })
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
  it('renders HR as a specialized workbench without import or work-order entrypoints', async () => {
    render(<WorkerStudio />)

    expect(await screen.findByText('Soul Workspace')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByLabelText('Current worker')).toBeTruthy()
    expect(screen.getByRole('button', { name: /HR \(1\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /QA \(1\)/ })).toBeTruthy()
    expect(screen.getAllByText('HR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('QA').length).toBeGreaterThan(0)
    expect(await screen.findByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.getAllByText('Person Profile').length).toBeGreaterThan(0)
    expect(screen.getAllByText('People Workbench').length).toBeGreaterThan(0)
    expect(screen.queryByText('PEOPLE PROFILE WORKBENCH')).toBeNull()
    expect(screen.getByText('Profile Tools')).toBeTruthy()
    expect(screen.getByText('Profile List')).toBeTruthy()
    const hrDetails = document.querySelector('.hr-profile-details') as HTMLElement
    expect(within(hrDetails).getByText('Profile Details')).toBeTruthy()
    expect(within(hrDetails).getByText('Profile sources')).toBeTruthy()
    expect(within(hrDetails).getByText('Artifact preview')).toBeTruthy()
    expect(within(hrDetails).queryByText('View focus')).toBeNull()
    expect(within(hrDetails).queryByText('Active view')).toBeNull()
    expect(within(hrDetails).queryByRole('button', { name: /Candidates/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Candidates/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Needs attention/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hide Profile List' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide Profile Tools' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /New profile/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Summarize profile/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open Screen candidate session/ })).toBeTruthy()
    expect(screen.queryByText('Capability template (6)')).toBeNull()
    expect(document.querySelector('.count-pill')).toBeNull()
    expect(screen.queryByText('Examples')).toBeNull()
    expect(screen.queryByText('Domain systems')).toBeNull()
    expect(screen.queryByText(/Import/i)).toBeNull()
    expect(screen.queryByText(/work order/i)).toBeNull()
    expect(screen.queryByText(/Open Design/i)).toBeNull()
    expect(screen.queryByText(/Nexu/i)).toBeNull()
    expect(await screen.findByText('Evidence summary.')).toBeTruthy()
  })

  it('keeps profile details stable while lifecycle list sections are expanded', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    expect(screen.getByText('Artifact evidence')).toBeTruthy()
    expect(screen.getByText('Profile Tools')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Employees/ }))

    await waitFor(() => {
      expect(screen.getByText('No profiles in this section.')).toBeTruthy()
    })
    const hrDetails = document.querySelector('.hr-profile-details') as HTMLElement
    expect(within(hrDetails).getByText('Artifact preview')).toBeTruthy()
    expect(within(hrDetails).getByText('Artifact evidence').parentElement?.textContent).toContain('1')
  })

  it('toggles HR side panels from the header controls', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    expect(document.querySelector('.hr-profile-list-panel')).toBeTruthy()
    expect(document.querySelector('.hr-profile-tools-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hide Profile List' }))
    expect(document.querySelector('.hr-profile-list-panel')).toBeNull()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-list')).toBe(true)
    expect(screen.getByRole('button', { name: 'Show Profile List' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hide Profile Tools' }))
    expect(document.querySelector('.hr-profile-tools-panel')).toBeNull()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(true)
    expect(screen.getByRole('button', { name: 'Show Profile Tools' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show Profile List' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Profile Tools' }))
    expect(document.querySelector('.hr-profile-list-panel')).toBeTruthy()
    expect(document.querySelector('.hr-profile-tools-panel')).toBeTruthy()
  })

  it('treats needs-review records as pending instead of reviewed in the HR profile loop', async () => {
    currentReviews = [{
      artifactId: 'artifact-1',
      createdAt: now,
      findingsJson: [{ message: 'External engine artifact generated; human review is required.' }],
      id: 'review-needs-review',
      risksJson: [],
      sessionId: 'session-1',
      turnId: 'turn-1',
      verdict: 'needs_review',
      workspaceId: 'workspace-1',
    }]

    render(<WorkerStudio />)

    const profileCards = await screen.findAllByRole('button', { name: /Open Hiring Workspace profile/ })
    const profileCard = profileCards.at(0)
    if (!profileCard) {
      throw new Error('Expected at least one Hiring Workspace profile card')
    }
    expect(profileCard.textContent).toContain('Artifact ready for review')
    expect(profileCard.textContent).toContain('Request review')
    expect(profileCard.textContent).not.toContain('reviewed')
  })

  it('shows engine-running status while a session is generating without an artifact', async () => {
    currentArtifacts = []
    currentReviews = []
    currentTurns = [{ ...turnRecord, response: null, status: 'running' }]
    currentEvents = []
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect((await screen.findAllByText('Agent is generating')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The agent is generating a reviewable artifact. Streamed events will keep updating.').length).toBeGreaterThan(0)
    expect(screen.getByText('The preview will unlock after the first artifact enters the index.')).toBeTruthy()
  })

  it('distinguishes written artifact files from indexed artifacts', async () => {
    currentArtifacts = []
    currentReviews = []
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

    expect((await screen.findAllByText('File written, indexing')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The engine wrote an artifact file. AIWorker is finalizing the session before it appears in the artifact preview.').length).toBeGreaterThan(0)
    expect(screen.getByText('The artifact file is written and will appear here after session finalization.')).toBeTruthy()
  })

  it('shows indexed artifacts as human-review work instead of completed automation', async () => {
    currentReviews = [{
      artifactId: 'artifact-1',
      createdAt: now,
      findingsJson: [{ message: 'External engine artifact generated; human review is required.' }],
      id: 'review-needs-review',
      risksJson: [],
      sessionId: 'session-1',
      turnId: 'turn-1',
      verdict: 'needs_review',
      workspaceId: 'workspace-1',
    }]
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect((await screen.findAllByText('Artifact ready for review')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The artifact is indexed. Human review is required before lesson or memory promotion.').length).toBeGreaterThan(0)
    expect(screen.queryByText('Review recorded')).toBeNull()
  })

  it('uses the compact icon button primitive for add and chrome actions', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const iconButtons = [
      screen.getByRole('button', { name: 'Create worker' }),
      screen.getByRole('button', { name: 'Refresh workspace' }),
      screen.getByRole('button', { name: 'Open settings' }),
    ]

    for (const button of iconButtons) {
      expect(button.classList.contains('icon-button')).toBe(true)
      expect(button.classList.contains('icon-btn')).toBe(false)
    }
    expect(screen.getByRole('button', { name: 'New profile' }).classList.contains('icon-button')).toBe(false)
  })

  it('groups workers by Soul and keeps each category collapsible', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const qaGroupToggle = screen.getByRole('button', { name: /QA \(1\)/ })
    const visibleOptionTexts = () => screen.getAllByRole('option').map(option => option.textContent ?? '')

    expect(qaGroupToggle.getAttribute('aria-expanded')).toBe('true')
    expect(visibleOptionTexts().includes('QA')).toBe(true)

    fireEvent.click(qaGroupToggle)

    expect(qaGroupToggle.getAttribute('aria-expanded')).toBe('false')
    expect(visibleOptionTexts().includes('QA')).toBe(false)

    fireEvent.click(qaGroupToggle)

    expect(qaGroupToggle.getAttribute('aria-expanded')).toBe('true')
    expect(visibleOptionTexts().includes('QA')).toBe(true)
  })

  it('keeps installed Soul Apps out of the worker rail and shows them in Settings', async () => {
    currentApps = [
      {
        appId: 'aiworker-hr',
        manifest: {
          name: 'AIWorker HR',
          permissions: Array.from({ length: 8 }, (_, index) => ({ id: `perm-${index}` })),
          ui: {
            artifactPreviews: [{ id: 'person-profile-preview', label: 'Person profile preview' }],
            panels: [{ id: 'people-panel', label: 'People panel' }],
            reviewPanels: [{ id: 'hr-review', label: 'HR review' }],
            routes: [{ id: 'hr-home', label: 'People workbench', path: '/hr/people', surface: { renderer: 'host-descriptor' } }],
            shell: {
              actions: [
                {
                  id: 'refresh-people',
                  label: 'Refresh',
                  protocolAction: 'people.refresh',
                  requiredPermissions: ['storage:read:aiworker-hr'],
                  slot: 'refresh',
                },
                {
                  id: 'toggle-evidence-drawer',
                  label: 'Evidence',
                  protocolAction: 'drawers.evidence.toggle',
                  requiredPermissions: ['connector:read:ats'],
                  slot: 'drawer-toggle',
                },
              ],
              primaryAction: {
                id: 'create-people-profile',
                label: 'New people profile',
                protocolAction: 'peopleProfiles.create',
                requiredPermissions: ['storage:write:aiworker-hr'],
                slot: 'primary',
              },
              search: {
                id: 'people-profile-search',
                label: 'Search people profiles',
                placeholder: 'Search people profiles',
                protocolProvider: 'peopleProfiles.search',
                requiredPermissions: ['storage:read:aiworker-hr'],
              },
              settings: {
                id: 'hr-settings',
                label: 'HR settings',
                protocolAction: 'settings.open',
                requiredPermissions: ['api:serve:/api/local/apps/aiworker-hr'],
              },
            },
            workspaceWidgets: [{ id: 'hr-people-widget', label: 'People widget', surface: { renderer: 'sandboxed-frame' } }],
          },
        },
        mountedContribution: {
          apiRoutePrefix: '/api/local/apps/aiworker-hr',
          artifactPreviewIds: ['person-profile-preview'],
          descriptorSurfaceIds: ['hr-home'],
          frameSurfaceIds: ['hr-people-widget'],
          panelIds: ['people-panel'],
          reviewPanelIds: ['hr-review'],
          routePaths: ['/hr/people'],
          surfaceIds: ['hr-home', 'hr-people-widget'],
          shell: {
            actions: [
              {
                id: 'refresh-people',
                label: 'Refresh',
                protocolAction: 'people.refresh',
                requiredPermissions: ['storage:read:aiworker-hr'],
                slot: 'refresh',
              },
              {
                id: 'toggle-evidence-drawer',
                label: 'Evidence',
                protocolAction: 'drawers.evidence.toggle',
                requiredPermissions: ['connector:read:ats'],
                slot: 'drawer-toggle',
              },
            ],
            primaryAction: {
              id: 'create-people-profile',
              label: 'New people profile',
              protocolAction: 'peopleProfiles.create',
              requiredPermissions: ['storage:write:aiworker-hr'],
              slot: 'primary',
            },
            search: {
              id: 'people-profile-search',
              label: 'Search people profiles',
              placeholder: 'Search people profiles',
              protocolProvider: 'peopleProfiles.search',
              requiredPermissions: ['storage:read:aiworker-hr'],
            },
            settings: {
              id: 'hr-settings',
              label: 'HR settings',
              protocolAction: 'settings.open',
              requiredPermissions: ['api:serve:/api/local/apps/aiworker-hr'],
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
            { action: 'read', kind: 'connector', reason: 'Read CI evidence through Host connector broker.', target: 'ci' },
          ],
          ui: {
            artifactPreviews: [],
            panels: [],
            reviewPanels: [],
            routes: [],
            shell: {
              primaryAction: {
                id: 'create-release-gate',
                label: 'New release gate',
                protocolAction: 'releaseGates.create',
                requiredPermissions: ['storage:write:aiworker-qa'],
                slot: 'primary',
              },
              search: {
                id: 'release-search',
                label: 'Search releases',
                placeholder: 'Search releases',
                protocolProvider: 'releases.search',
                requiredPermissions: ['storage:read:aiworker-qa'],
              },
            },
          },
        },
        mountedContribution: {
          apiRoutePrefix: '/api/local/apps/aiworker-qa',
          artifactPreviewIds: [],
          descriptorSurfaceIds: [],
          frameSurfaceIds: [],
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

    await screen.findByText('AIWorker HR (1)')
    await screen.findByTestId('hr-people-workbench')
    expect(document.querySelectorAll('.entry-header.workspace-header')).toHaveLength(1)
    const hrHeader = document.querySelector('.hr-people-header') as HTMLElement
    expect(await screen.findByText('New people profile')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search people profiles')).toBeTruthy()
    expect(within(hrHeader).getByRole('button', { name: 'New people profile' })).toBeTruthy()
    expect(within(hrHeader).getByPlaceholderText('Search people profiles')).toBeTruthy()
    expect(within(hrHeader).getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(within(hrHeader).getByRole('button', { name: 'Evidence' })).toBeTruthy()
    expect(within(hrHeader).getByRole('button', { name: 'HR settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New people profile' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/actions/create-people-profile', expect.objectContaining({ method: 'POST' }))
    })
    const actionCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/api/local/apps/aiworker-hr/actions/create-people-profile'))
    const actionBody = JSON.parse(String(actionCall?.[1]?.body)) as Record<string, Record<string, string>>
    expect(actionBody).toMatchObject({
      input: { source: 'worker-shell' },
      scope: { workerId: 'hr-worker' },
    })
    expect(actionBody.input).not.toHaveProperty('workerId')
    expect(actionBody.input).not.toHaveProperty('workspaceId')
    expect(await screen.findByText('People profile draft created.')).toBeTruthy()
    const createWorkspaceDialog = screen.getByRole('dialog', { name: 'Create workspace' })
    expect(createWorkspaceDialog).toBeTruthy()
    fireEvent.click(within(createWorkspaceDialog).getAllByRole('button', { name: 'Close dialog' })[0]!)

    fireEvent.change(screen.getByPlaceholderText('Search people profiles'), { target: { value: 'ada' } })
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada&limit=8', expect.anything())
    })
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('Staff engineer candidate profile')).toBeTruthy()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(false)
    fireEvent.click(within(hrHeader).getByRole('button', { name: 'Evidence' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/actions/toggle-evidence-drawer', expect.objectContaining({ method: 'POST' }))
    })
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(true)
    fireEvent.click(within(hrHeader).getByRole('button', { name: 'HR settings' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/actions/hr-settings', expect.objectContaining({ method: 'POST' }))
    })
    const appSettingsDialog = await screen.findByRole('dialog', { name: 'Configure Soul workspace' })
    expect(within(appSettingsDialog).getByRole('button', { name: /Soul Apps/ })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Close settings'))
    expect(screen.queryByText('Soul Apps (2)')).toBeNull()
    expect(screen.queryByText('Enabled · 0.1.0')).toBeNull()
    expect(screen.queryByText('8 permissions')).toBeNull()
    expect(screen.queryByText('API /api/local/apps/aiworker-hr')).toBeNull()
    expect(screen.queryByText('Route People workbench · /hr/people')).toBeNull()
    expect(screen.queryByText('4 mounted contributions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Developer details' })).toBeNull()

    fireEvent.click(within(hrHeader).getByRole('button', { name: 'HR settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configure Soul workspace' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Soul Apps/ }))

    expect(within(dialog).getByRole('heading', { name: 'Soul Apps' })).toBeTruthy()
    expect(within(dialog).getByText('AIWorker HR')).toBeTruthy()
    expect(within(dialog).getByText('Enabled · 0.1.0')).toBeTruthy()
    expect(within(dialog).getByText('8 permissions')).toBeTruthy()
    expect(within(dialog).getByText('4 mounted contributions')).toBeTruthy()
    expect(within(dialog).getByText('API /api/local/apps/aiworker-hr')).toBeTruthy()
    expect(within(dialog).getByText('AIWorker QA')).toBeTruthy()
    expect(within(dialog).getByText('Disabled · 0.1.0')).toBeTruthy()
    expect(within(dialog).getByText('3 permissions')).toBeTruthy()
    expect(within(dialog).getByText('connector:read:ci')).toBeTruthy()
    expect(within(dialog).getByText('ci · not enabled')).toBeTruthy()
    expect(within(dialog).getAllByText('storage:write:aiworker-qa').length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable AIWorker QA' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-qa/enable', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(within(dialog).getAllByText('Enabled · 0.1.0').length).toBeGreaterThan(1)
    })
  })

  it('keeps worker status as a trailing dot without duplicated item labels', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const hrWorkerOption = screen.getByRole('option', { name: 'HR' })

    expect(hrWorkerOption.textContent?.trim()).toBe('HR')
    expect(hrWorkerOption.querySelector('.worker-list-item-main + .status-dot')).toBeTruthy()
    expect(hrWorkerOption.querySelector('.worker-list-item-meta')).toBeNull()
  })

  it('switches the Soul rail and updates capability templates with worker identity', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const qaWorkerOption = screen.getByRole('option', { name: 'QA' })
    expect(qaWorkerOption).toBeTruthy()
    fireEvent.click(qaWorkerOption)

    await waitFor(() => {
      expect(screen.getByText('qa-worker')).toBeTruthy()
      expect(screen.getAllByText('Release Gate').length).toBeGreaterThan(0)
      expect(screen.queryByText('candidate-screen')).toBeNull()
    })
    expect(screen.queryByTestId('hr-people-workbench')).toBeNull()
    expect(screen.getByText('Capability template (1)')).toBeTruthy()
  })

  it('creates a worker from the compact worker list dialog', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    fireEvent.click(screen.getByRole('button', { name: 'Create worker' }))

    const dialog = screen.getByRole('dialog', { name: 'Create worker' })
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Soul' }))
    expect(dialog.querySelector('.studio-select.open')).toBeTruthy()
    expect(within(dialog).getByRole('listbox', { name: 'Soul' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('option', { name: /QA/ }))
    expect(dialog.querySelector('.studio-select.open')).toBeNull()
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
          apiRoutePrefix: '/api/local/apps/aiworker-hr',
          artifactPreviewIds: [],
          descriptorSurfaceIds: [],
          frameSurfaceIds: [],
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
          apiRoutePrefix: '/api/local/apps/aiworker-qa',
          artifactPreviewIds: [],
          descriptorSurfaceIds: [],
          frameSurfaceIds: [],
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
    expect(screen.getByRole('button', { name: 'Start AIWorker HR' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start AIWorker QA' })).toBeTruthy()
    expect(screen.queryByText('aiworker-hr · 0 permissions')).toBeNull()
    expect(screen.queryByText('API /api/local/apps/aiworker-hr')).toBeNull()
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

  it('creates a workspace session turn with selected Soul worker and skill metadata', async () => {
    render(<WorkerStudio />)

    await screen.findAllByText('Person Profile')
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }))
    const dialog = screen.getByRole('dialog', { name: 'Create workspace' })
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: 'New candidate workspace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created')
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces', expect.objectContaining({
        body: expect.stringContaining(`"soulId":"${HR_SOUL_ID}"`),
        method: 'POST',
      }))
    })

    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    const actionList = document.querySelector('.hr-action-list') as HTMLElement
    fireEvent.click(within(actionList).getByRole('button', { name: /Summarize profile/ }))
    expect((screen.getByLabelText('Context for the next profile proposal') as HTMLTextAreaElement).value).toContain('Summarize profile')
    fireEvent.click(screen.getByRole('button', { name: /Generate person-profile/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions/stream', expect.objectContaining({
        body: expect.stringContaining(`"capabilityTemplateId":"${HR_PERSON_PROFILE}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created/sessions/session-created')
    })
  })

  it('navigates from the HR worker workbench to the created session after a profile action', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const actionList = document.querySelector('.hr-action-list') as HTMLElement
    fireEvent.click(within(actionList).getByRole('button', { name: /Summarize profile/ }))
    expect((screen.getByLabelText('Context for the next profile proposal') as HTMLTextAreaElement).value).toContain('Target: Hiring Workspace')
    fireEvent.click(screen.getByRole('button', { name: /Generate person-profile/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-1/sessions/stream', expect.objectContaining({
        body: expect.stringContaining(`"capabilityTemplateId":"${HR_PERSON_PROFILE}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-created-worker-route')
    })
  })

  it('does not force navigation back to a streaming session after the operator leaves the workspace route', async () => {
    deferCreatedSessionStream = true
    render(<WorkerStudio />)

    await screen.findAllByText('Person Profile')
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }))
    const dialog = screen.getByRole('dialog', { name: 'Create workspace' })
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: 'New candidate workspace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created')
    })

    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Context for the next profile proposal'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(screen.getByRole('button', { name: /Generate person-profile/ }))
    window.history.pushState(null, '', '/workers/qa-worker')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions/stream', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/qa-worker')
    })
  })

  it('continues an existing session and wires review and memory actions', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1')
    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.getByText('Profile Tools')).toBeTruthy()
    expect(screen.getByText('Profile List')).toBeTruthy()
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
    const profileTools = document.querySelector('.hr-profile-tools-panel') as HTMLElement
    fireEvent.click(await within(profileTools).findByRole('button', { name: /Open Screen candidate session/ }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
    })
    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    expect(screen.getByText('Workspace navigation')).toBeTruthy()
    expect(screen.getByText('Current worker')).toBeTruthy()
    expect(screen.getByText('hr-worker')).toBeTruthy()
    expect(screen.getAllByText('Current workspace').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Workspace sessions').length).toBeGreaterThan(0)
    const workspaceContextCard = document.querySelector('.workspace-context-card') as HTMLElement
    expect(within(workspaceContextCard).getByRole('button', { name: 'Back to worker' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Back to worker' }).length).toBe(1)
    expect(screen.queryByRole('button', { name: 'Back to workspace' })).toBeNull()
    expect(screen.queryByTestId('new-project-panel')).toBeNull()
    expect(screen.getByText('Session events')).toBeTruthy()
    expect(screen.getByText('Memory candidates')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open artifact settings' })).toBeNull()

    const chatActions = document.querySelector('.worker-chat-actions') as HTMLElement
    const settingsButton = within(chatActions).getByRole('button', { name: 'Open settings' })
    const drawerToggle = within(chatActions).getByRole('button', { name: 'Collapse session detail' })
    expect(drawerToggle.getAttribute('aria-pressed')).toBe('true')
    expect(settingsButton.nextElementSibling).toBe(drawerToggle)
    expect(drawerToggle.classList.contains('active')).toBe(true)

    fireEvent.click(drawerToggle)
    expect(document.querySelector('.detail-drawer-collapsed')).toBeTruthy()
    const expandDrawerToggle = within(chatActions).getByRole('button', { name: 'Expand session detail' })
    expect(expandDrawerToggle.getAttribute('aria-pressed')).toBe('false')
    expect(expandDrawerToggle.classList.contains('active')).toBe(false)
    expect(document.querySelector('.session-panel.collapsed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Expand session detail' })).toBeTruthy()
    fireEvent.click(expandDrawerToggle)
    expect(screen.getByText('Session events')).toBeTruthy()

    const chatLog = screen.getByTestId('worker-chat-log')
    const scrollTo = vi.fn()
    Object.defineProperty(chatLog, 'clientHeight', { configurable: true, value: 300 })
    Object.defineProperty(chatLog, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(chatLog, 'scrollTo', { configurable: true, value: scrollTo })
    Object.defineProperty(chatLog, 'scrollTop', { configurable: true, value: 100, writable: true })
    fireEvent.scroll(chatLog)
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 1000 })

    fireEvent.change(screen.getByLabelText('Follow-up turn'), { target: { value: 'Add interview risks.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send turn' }))
    expect(screen.getByText('Add interview risks.')).toBeTruthy()

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/sessions/session-1/messages/stream', expect.objectContaining({
        body: expect.stringContaining('Add interview risks.'),
        method: 'POST',
      }))
      expect(screen.getByText('Add interview risks.')).toBeTruthy()
      expect(screen.getByText('Added interview risks.')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/reviews', expect.objectContaining({ method: 'POST' }))
      expect(screen.getByText('Needs review')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/lessons/lesson-1', expect.objectContaining({ method: 'PATCH' }))
      expect(screen.getByText('Accepted')).toBeTruthy()
    })
  })

  it('keeps an empty workspace route in workspace navigation instead of the creation surface', async () => {
    const otherWorkspace = {
      ...workspace,
      id: 'workspace-2',
      name: 'Offer Workspace',
      rootPath: '/tmp/offer',
    }
    currentWorkspaces = [{ ...workspace }, otherWorkspace]
    currentSessions = []
    currentTurns = []
    currentArtifacts = []
    currentEvents = []
    currentLessons = []
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')

    render(<WorkerStudio />)

    expect(await screen.findByText('Workspace navigation')).toBeTruthy()
    expect(screen.getAllByText('Current workspace').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Workspace sessions').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'New session' }).classList.contains('icon-button')).toBe(true)
    expect(screen.getByRole('button', { name: 'Create workspace' }).classList.contains('icon-button')).toBe(true)
    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.getByText('Profile Tools')).toBeTruthy()
    expect(screen.getByText('Profile List')).toBeTruthy()
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
    expect(screen.queryByText('What do you want to build in Hiring Workspace?')).toBeNull()
    expect(screen.getAllByText('No sessions in this workspace yet.').length).toBeGreaterThan(0)
    expect(document.querySelector('.workspace-overview-panel')).toBeNull()
    expect(document.querySelector('.workspace-session-grid')).toBeNull()
    const otherWorkspaceList = document.querySelector('.rail-workspace-list') as HTMLElement
    expect(within(otherWorkspaceList).queryByText('Hiring Workspace')).toBeNull()
    expect(within(otherWorkspaceList).getByText('Offer Workspace')).toBeTruthy()
    expect(otherWorkspaceList.querySelector('.rail-workspace-item.active')).toBeNull()
    expect(screen.queryByTestId('new-project-panel')).toBeNull()
    expect(screen.queryByLabelText('Soul catalog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to worker' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker')
    })
  })

  it('uses the workspace sessions header action to start a new session', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    const workspaceContextCard = document.querySelector('.workspace-context-card') as HTMLElement
    expect(within(workspaceContextCard).getByRole('button', { name: 'Back to worker' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to workspace' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1')
    })
    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.getByText('Profile Tools')).toBeTruthy()
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
  })

  it('returns from a selected session route back to the worker page', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    const workspaceContextCard = document.querySelector('.workspace-context-card') as HTMLElement
    fireEvent.click(within(workspaceContextCard).getByRole('button', { name: 'Back to worker' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker')
    })
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

    await screen.findByText('AIWorker')
    expect(screen.queryByRole('dialog', { name: 'Configure Soul workspace' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Open settings'))

    expect(screen.getByRole('dialog', { name: 'Configure Soul workspace' })).toBeTruthy()
    expect(screen.getByText('Local CLI / BYOK')).toBeTruthy()
    expect(screen.queryByText('All changes saved')).toBeNull()
    const codexIcon = document.querySelector('[data-engine-icon="codex"] .agent-icon-shape') as HTMLElement
    expect(codexIcon).toBeTruthy()
    expect(codexIcon.getAttribute('style')).toContain('/engine-icons/openai.svg')
    const cursorIcon = document.querySelector('[data-engine-icon="cursor"] .agent-icon-shape') as HTMLElement
    expect(cursorIcon).toBeTruthy()
    expect(cursorIcon.getAttribute('style')).toContain('/engine-icons/cursor.svg')
    const testButton = screen.getByRole('button', { name: 'Test' })
    const rescanButton = screen.getByRole('button', { name: 'Rescan' })
    expect(testButton.classList.contains('settings-action-button')).toBe(true)
    expect(rescanButton.classList.contains('settings-action-button')).toBe(true)
    expect(testButton.classList.contains('icon-btn')).toBe(false)
    expect(rescanButton.classList.contains('icon-btn')).toBe(false)
    fireEvent.click(testButton)
    fireEvent.click(rescanButton)
    fireEvent.click(screen.getByRole('button', { name: /Language/ }))
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/test', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/rescan', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings', expect.objectContaining({ method: 'PATCH' }))
      expect(document.documentElement.lang).toBe('zh-CN')
    })
    expect(screen.getByRole('dialog', { name: '配置 Soul 工作区' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '新建人员档案' })).toBeTruthy()
    expect(screen.queryByText('Create workspace session')).toBeNull()
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

    expect(await screen.findByText('Soul Workspace')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByLabelText('Workspace language')).toBeTruthy()
  })

  it('applies system appearance from the operating-system color scheme and updates on changes', async () => {
    const media = installMatchMedia(false)

    render(<WorkerStudio />)

    const shell = await screen.findByTestId('worker-studio-shell')
    expect(shell.getAttribute('data-appearance')).toBe('system')
    expect(shell.getAttribute('data-theme')).toBe('light')

    act(() => media.setMatches(true))

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
    })
  })

  it('persists dark appearance and applies the dark theme without reloading', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('worker-studio-shell')
    fireEvent.click(screen.getByLabelText('Open settings'))
    fireEvent.click(screen.getByText('System / light / dark'))
    fireEvent.click(screen.getByRole('button', { name: /Dark Workspace/ }))

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-appearance')).toBe('dark')
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
      expect(fetch).toHaveBeenCalledWith('/api/local/settings', expect.objectContaining({
        body: JSON.stringify({ appearance: 'dark' }),
        method: 'PATCH',
      }))
    })
  })
})
