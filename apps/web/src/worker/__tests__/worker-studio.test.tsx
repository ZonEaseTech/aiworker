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
const HR_PROFILE_UPDATE_PROPOSAL = `${HR_SOUL_ID}.profile-update-proposal`

function expandProfileTools(): HTMLElement {
  const expandButton = screen.queryByRole('button', { name: 'Expand Profile Workbench' })
  if (expandButton)
    fireEvent.click(expandButton)
  return document.querySelector('.hr-profile-tools-panel') as HTMLElement
}

function openHostSettings() {
  fireEvent.click(screen.getByRole('button', { name: /^Platform settings(?:\s|$)/ }))
}

async function openProfilePatchReviewFromRail() {
  fireEvent.click(await screen.findByRole('button', { name: 'Review profile patch' }))
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
    prompt: 'Summarize profile',
    reviewRubric: ['Evidence is grounded.'],
    soulId: HR_SOUL_ID,
  },
  {
    description: 'Draft a reviewable candidate profile update.',
    id: HR_PROFILE_UPDATE_PROPOSAL,
    inputHints: ['Candidate materials', 'Accepted README baseline'],
    name: 'Profile Update Proposal',
    outputKind: 'profile-update-proposal',
    prompt: 'Draft profile update proposal',
    reviewRubric: ['Accepted README draft is reviewable.'],
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
let currentProfiles: Record<string, string>
let currentArtifactRawContent: string
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
      routes?: Array<{ id?: string, label: string, path: string, surface?: { renderer: 'host-descriptor' | 'sandboxed-frame' | 'trusted-module' } }>
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
  currentProfiles = {
    'workspace-1': [
      '# Hiring Workspace',
      '',
      '## Current Profile Summary',
      '',
      'Accepted profile summary.',
      '',
      '## Identity And Basics',
      '',
      '- Lifecycle: Candidate',
      '- Target role: Senior Product Manager',
      '',
      '## Role Context And Responsibilities',
      '',
      'Own product discovery and marketplace growth execution.',
      '',
      '## Capabilities And Stack',
      '',
      '- SQL analytics',
      '- Experiment design',
      '',
      '## Confirmed Facts',
      '',
      '- Completed recruiter screen.',
      '',
      '## Evidence Status',
      '',
      '| Signal | Status | Source |',
      '| --- | --- | --- |',
      '| Product discovery | Supported | Interview notes |',
      '',
      '## Risks And Gaps',
      '',
      '- Reference check is missing.',
      '',
      '## Next HR Actions',
      '',
      '- Request reviewer decision.',
      '',
      '## Review State',
      '',
      'Accepted profile baseline is reviewed.',
      '',
      '## Accepted External Sections',
      '',
      '- Interview Brief: reviews/interview-brief.md',
      '',
    ].join('\n'),
  }
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
    if (url.endsWith('/api/local/apps/aiworker-qa/security-review')) {
      const ciAvailable = currentSettings.connectors.some(connector => connector.id === 'ci')
      return json({
        appId: 'aiworker-qa',
        connectors: {
          optional: [],
          required: [{
            access: ['read'],
            available: ciAvailable,
            enabled: currentSettings.connectors.some(connector => connector.id === 'ci' && connector.enabled),
            id: 'ci',
            reason: 'Read CI and test evidence through the Host connector broker.',
            required: true,
            scopes: ['runs.read'],
          }],
        },
        descriptorPermissions: [],
        healthStatus: 'pass',
        manifestPermissions: [],
        status: 'disabled',
        summary: {
          canEnable: ciAvailable,
          descriptorPermissionCount: 0,
          disabledRequiredConnectorIds: ciAvailable ? ['ci'] : [],
          manifestPermissionCount: 0,
          missingRequiredConnectorIds: ciAvailable ? [] : ['ci'],
          optionalConnectorCount: 0,
          requiredConnectorCount: 1,
          warnings: ciAvailable ? ['Required connectors are not enabled: ci'] : ['Required connectors are not available: ci'],
        },
      })
    }
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
    if (url.endsWith('/api/local/apps/aiworker-hr/actions/configure-hr') && method === 'POST') {
      return json({
        action: { id: 'configure-hr', protocolAction: 'configuration.open' },
        result: { ok: true, message: 'HR configuration is owned by the HR app.' },
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
      currentProfiles[created.id] = `# Current Profile Summary\n\n${created.name} does not have an approved profile revision yet.\n`
      return json({ workspace: created }, 201)
    }
    if (url.endsWith('/api/local/workspaces'))
      return json({ workspaces: currentWorkspaces })
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
      const requestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      lastSessionRequestBody = requestBody
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
    const profileMatch = url.match(/\/api\/local\/workspaces\/([^/]+)\/profile$/)
    if (profileMatch && method === 'GET') {
      const workspaceId = profileMatch[1]!
      const workspaceName = currentWorkspaces.find(item => item.id === workspaceId)?.name ?? 'People Profile'
      return new Response(currentProfiles[workspaceId] ?? `# Current Profile Summary\n\n${workspaceName} does not have an approved profile revision yet.\n`, {
        headers: { 'content-type': 'text/plain' },
      })
    }
    const profileRevisionMatch = url.match(/\/api\/local\/workspaces\/([^/]+)\/profile-revisions$/)
    if (profileRevisionMatch && method === 'POST') {
      const workspaceId = profileRevisionMatch[1]!
      const body = init?.body
        ? JSON.parse(String(init.body)) as {
          artifactId?: string
          findingsJson?: Array<Record<string, unknown>>
          profileMarkdown?: string
          risksJson?: Array<Record<string, unknown>>
          verdict?: 'pass' | 'warn'
        }
        : {}
      currentProfiles[workspaceId] = body.profileMarkdown ?? '# Candidate Screen\n\nEvidence summary.\n'
      const review = {
        artifactId: body.artifactId ?? 'artifact-1',
        createdAt: now,
        findingsJson: body.findingsJson ?? [{ message: 'Approved from HR workbench.' }],
        id: 'review-profile-1',
        risksJson: body.risksJson ?? [],
        sessionId: 'session-1',
        turnId: 'turn-1',
        verdict: body.verdict ?? 'pass',
        workspaceId,
      }
      currentReviews = [review, ...currentReviews]
      return json({
        profileRevision: {
          git: { hash: 'abc123', status: 'created' },
          profilePath: 'README.md',
          review,
          reviewPath: 'reviews/review-profile-1.md',
          tag: null,
        },
      }, 201)
    }
    if (url.includes('/api/local/workspaces/') && url.includes('/files/raw/')) {
      return new Response(currentArtifactRawContent, { headers: { 'content-type': 'text/plain' } })
    }
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
  it('skips legacy workers whose Souls are no longer projected', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'devops-worker', metadataJson: {}, name: 'DevOps', soulId: 'devops', status: 'active', updatedAt: now },
      ...workers.map(worker => ({ ...worker })),
    ]

    render(<WorkerStudio />)

    expect(await screen.findByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.getByRole('button', { name: /HR \(1\)/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /DevOps/ })).toBeNull()
    expect(screen.queryByText('Loading Soul workspace...')).toBeNull()
  })

  it('falls back to first-run Soul App home when every persisted worker is orphaned', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'devops-worker', metadataJson: {}, name: 'DevOps', soulId: 'devops', status: 'active', updatedAt: now },
    ]

    render(<WorkerStudio />)

    expect(await screen.findByRole('heading', { name: 'Choose a Soul App to start' })).toBeTruthy()
    expect(screen.getByText('No enabled Soul Apps')).toBeTruthy()
    expect(screen.queryByText('Loading Soul workspace...')).toBeNull()
  })

  it('renders HR as a specialized workbench without import or work-order entrypoints', async () => {
    render(<WorkerStudio />)

    expect(await screen.findByLabelText('Host actions')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'Hide sidebar' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Open workspace terminal' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Open right panel' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'New Soul worker' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Soul Apps' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(document.querySelector('.workspace-sidebar-collapsed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }))
    expect(document.querySelector('.workspace-sidebar-collapsed')).toBeNull()
    expect(screen.getAllByLabelText('Current worker').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /HR \(1\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /QA \(1\)/ })).toBeTruthy()
    expect(screen.getAllByText('HR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('QA').length).toBeGreaterThan(0)
    expect(await screen.findByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'People Workbench' })).toBeNull()
    expect(document.querySelector('.hr-people-header')).toBeNull()
    expect(screen.queryByText('PEOPLE PROFILE WORKBENCH')).toBeNull()
    expect(screen.queryByText('Profile Actions')).toBeNull()
    const profileList = screen.getByLabelText('People Profiles')
    expect(profileList).toBeTruthy()
    expect(within(profileList).getByText('People Profiles')).toBeTruthy()
    expect(within(profileList).getByRole('button', { name: /New profile/ })).toBeTruthy()
    expect(screen.queryByPlaceholderText('Search people profiles')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Select a people profile' })).toBeTruthy()
    expect(screen.queryByLabelText('Current Profile Summary')).toBeNull()
    expect(document.querySelector('.hr-profile-details')).toBeNull()
    expect(document.querySelector('.hr-profile-tools-rail')).toBeNull()
    const candidateSectionToggle = screen.getByRole('button', { name: /Candidates/ })
    expect(candidateSectionToggle.closest('.studio-collapsible-group')).toBeTruthy()
    expect(profileList.querySelector('.studio-collapsible-group-drawer')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Needs attention/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide Profile List' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand Profile Tools' })).toBeNull()
    expect(screen.queryByLabelText('Collapsed Profile Tools')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Hiring Workspace profile' }))
    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')
    expect(within(hrDetails).getByRole('heading', { name: 'Hiring Workspace People Profile' })).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Hide Profile List' })).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Expand Profile Workbench' })).toBeTruthy()
    expect(await within(hrDetails).findByText('Accepted profile summary.')).toBeTruthy()
    expect(within(hrDetails).getByText('Identity And Basics')).toBeTruthy()
    expect(within(hrDetails).getByText('Role Context And Responsibilities')).toBeTruthy()
    expect(within(hrDetails).getByText('Capabilities And Stack')).toBeTruthy()
    const profileSourceTags = within(hrDetails).getByLabelText('Profile sources')
    expect(profileSourceTags.textContent).toContain('Artifact evidence1')
    expect(profileSourceTags.textContent).toContain('Session context1')
    expect(profileSourceTags.textContent).toContain('Review records0')
    expect(await within(hrDetails).findByText('Profile patch ready')).toBeTruthy()
    expect(within(hrDetails).getByText('10 sections changed')).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Review profile patch' })).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Review profile patch' }).textContent).toBe('Review')
    expect(within(hrDetails).queryByText('Profile sources')).toBeNull()
    expect(within(hrDetails).queryByText('Profile Patch')).toBeNull()
    expect(within(hrDetails).queryByText('Review guardrails')).toBeNull()
    expect(within(hrDetails).queryByText('View focus')).toBeNull()
    expect(within(hrDetails).queryByText('Active view')).toBeNull()
    expect(screen.queryByLabelText('Collapsed Profile Workbench')).toBeNull()
    expect(document.querySelector('.hr-profile-tools-rail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Profile Workbench' }))
    const profileTools = document.querySelector('.hr-profile-tools-panel') as HTMLElement
    const profileToolsText = profileTools.textContent ?? ''
    expect(profileToolsText.indexOf('Recent Sessions')).toBeLessThan(profileToolsText.indexOf('Complete Hiring Workspace candidate profile'))
    expect(within(profileTools).queryByText('Next Profile Step')).toBeNull()
    expect(within(profileTools).queryByText('Profile Patch')).toBeNull()
    expect(within(profileTools).queryByText('Review guardrails')).toBeNull()
    expect(within(profileTools).queryByText('Artifact evidence')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Review profile patch' })).toHaveLength(1)
    expect(screen.queryByTestId('hr-artifact-markdown-preview')).toBeNull()
    expect(screen.queryByRole('button', { name: /Summarize profile/ })).toBeNull()
    expect(within(profileTools).queryByText('Screen candidate')).toBeNull()
    expect(within(profileTools).queryByText('Active')).toBeNull()
    expect(within(profileTools).getByRole('button', { name: /Open Evidence organization session/ })).toBeTruthy()
    expect(screen.queryByText('Capability template (6)')).toBeNull()
    expect(document.querySelector('.count-pill')).toBeNull()
    expect(screen.queryByText('Examples')).toBeNull()
    expect(screen.queryByText('Domain systems')).toBeNull()
    expect(screen.queryByText(/Import/i)).toBeNull()
    expect(screen.queryByText(/work order/i)).toBeNull()
    expect(screen.queryByText(/Open Design/i)).toBeNull()
    expect(screen.queryByText(/Nexu/i)).toBeNull()
  })

  it('centers the README profile and promotes a proposed change through review', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')
    const currentProfile = await within(hrDetails).findByTestId('hr-current-profile-summary')

    expect(within(currentProfile).getByText('Accepted profile summary.')).toBeTruthy()
    fireEvent.click(within(hrDetails).getByRole('button', { name: 'Review profile patch' }))
    const profilePatchReview = await screen.findByTestId('hr-profile-patch-review')
    expect(await within(profilePatchReview).findByText('Profile Patch Review')).toBeTruthy()
    expect(within(profilePatchReview).getAllByText('Current README').length).toBeGreaterThan(0)
    expect(within(profilePatchReview).getAllByText('Proposed README').length).toBeGreaterThan(0)
    expect((await within(profilePatchReview).findAllByText('Reviewed profile summary.')).length).toBeGreaterThan(0)

    fireEvent.click(within(profilePatchReview).getByRole('button', { name: 'Approve into README' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workspaces/workspace-1/profile-revisions', expect.objectContaining({
        body: expect.stringContaining('"artifactId":"artifact-1"'),
        method: 'POST',
      }))
    })
    expect(fetch).toHaveBeenCalledWith('/api/local/workspaces/workspace-1/profile-revisions', expect.objectContaining({
      body: expect.stringContaining('"profileMarkdown":"# Accepted Ada Profile\\n\\n## Current Profile Summary\\n\\nReviewed profile summary."'),
      method: 'POST',
    }))
    const updatedProfile = await screen.findByTestId('hr-current-profile-summary')
    await waitFor(() => {
      expect(within(updatedProfile).getByText('Reviewed profile summary.')).toBeTruthy()
    })
  })

  it('allows approving a whole README proposal when section-level diff is unavailable', async () => {
    currentProfiles['workspace-1'] = '# Current Profile Summary\n\nNo approved profile revision yet.\n'
    currentArtifactRawContent = [
      '# Profile Update Proposal',
      '',
      '```aiworker-profile-readme',
      '# Accepted Ben Profile',
      '',
      'Ben has a reviewed profile baseline.',
      '```',
      '',
    ].join('\n')
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    await screen.findByLabelText('Hiring Workspace People Profile')
    await openProfilePatchReviewFromRail()
    const profilePatchReview = await screen.findByTestId('hr-profile-patch-review')

    expect((await within(profilePatchReview).findAllByText('Profile README')).length).toBeGreaterThan(0)
    expect(within(profilePatchReview).getByText('Ben has a reviewed profile baseline.')).toBeTruthy()
    const approveButton = within(profilePatchReview).getByRole('button', { name: 'Approve into README' }) as HTMLButtonElement
    expect(approveButton.disabled).toBe(false)

    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workspaces/workspace-1/profile-revisions', expect.objectContaining({
        body: expect.stringContaining('"profileMarkdown":"# Accepted Ben Profile\\n\\nBen has a reviewed profile baseline."'),
        method: 'POST',
      }))
    })
  })

  it('approves an unfenced person-profile artifact through product-owned README synthesis', async () => {
    currentProfiles['workspace-1'] = '# Ben\n\nNo accepted HR profile yet.\n'
    currentArtifactRawContent = [
      '# Person Profile Snapshot Proposal: Ben',
      '',
      'Generated: 2026-05-17 19:35 CST',
      'Soul worker: AIWorker HR',
      'Proposal status: Human review required before any accepted profile promotion',
      '',
      '## Current Profile Snapshot',
      '',
      'This is a profile-bound snapshot proposal for the person target labeled `Ben`.',
      'The accepted profile surface states that no approved profile revision exists.',
      '',
      '## Confirmed Facts',
      '',
      '| Claim | Evidence | Confidence |',
      '| --- | --- | --- |',
      '| The selected workbench action is `Summarize profile`. | active-context.md:11-18 | High |',
      '',
      '## Missing Or Conflicting Evidence',
      '',
      '- No approved profile revision exists.',
      '- No verified lifecycle status is available.',
      '',
      '## Human Reviewer Next Actions',
      '',
      '1. Confirm whether `Ben` is the correct target profile for this workspace.',
    ].join('\n')
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    await screen.findByLabelText('Hiring Workspace People Profile')
    await openProfilePatchReviewFromRail()
    const profilePatchReview = await screen.findByTestId('hr-profile-patch-review')
    const approveButton = within(profilePatchReview).getByRole('button', { name: 'Approve into README' }) as HTMLButtonElement

    expect(await within(profilePatchReview).findByText('Profile patch ready')).toBeTruthy()
    expect(approveButton.disabled).toBe(false)
    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workspaces/workspace-1/profile-revisions', expect.objectContaining({
        method: 'POST',
      }))
    })
    const promotionCall = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url).endsWith('/api/local/workspaces/workspace-1/profile-revisions') && init?.method === 'POST')
    const body = JSON.parse(String(promotionCall?.[1]?.body)) as { profileMarkdown?: string }
    expect(body.profileMarkdown).toContain('# Ben People Profile')
    expect(body.profileMarkdown).toContain('## Current Profile Summary')
    expect(body.profileMarkdown).toContain('The selected workbench action')
    expect(body.profileMarkdown).not.toMatch(/Proposal status|snapshot proposal|no approved profile revision/i)
  })

  it('shows a profile revision review before approving a proposed change', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')
    fireEvent.click(await within(hrDetails).findByRole('button', { name: 'Review profile patch' }))
    const profilePatchReview = await screen.findByTestId('hr-profile-patch-review')

    expect(await within(profilePatchReview).findByText('Profile patch ready')).toBeTruthy()
    expect(within(profilePatchReview).getByText('Changed sections')).toBeTruthy()
    expect(within(profilePatchReview).getAllByText('Current README').length).toBeGreaterThan(0)
    expect(within(profilePatchReview).getByText('Accepted profile summary.')).toBeTruthy()
    expect(within(profilePatchReview).getAllByText('Proposed README').length).toBeGreaterThan(0)
    expect((await within(profilePatchReview).findAllByText('Reviewed profile summary.')).length).toBeGreaterThan(0)
    expect((within(profilePatchReview).getByRole('button', { name: 'Approve into README' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not expose profile revision approval when the artifact has no accepted README draft', async () => {
    currentArtifactRawContent = '# Profile Update Proposal\n\nNo accepted profile draft yet.\n'
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')

    expect(within(hrDetails).queryByRole('button', { name: 'Review profile patch' })).toBeNull()
    expandProfileTools()
    const profileTools = document.querySelector('.hr-profile-tools-panel') as HTMLElement
    expect(within(profileTools).queryByText('Profile Patch')).toBeNull()
    expect(screen.queryByTestId('hr-profile-patch-review')).toBeNull()
  })

  it('does not show an actionable patch strip when a README proposal has no section changes', async () => {
    const stableProfileMarkdown = [
      '# Hiring Workspace',
      '',
      '## Current Profile Summary',
      '',
      'Accepted profile summary.',
      '',
      '## Identity And Basics',
      '',
      '- Lifecycle: Candidate',
      '',
      '## Role Context And Responsibilities',
      '',
      'Own product discovery and marketplace growth execution.',
      '',
      '## Review State',
      '',
      'Accepted profile baseline is confirmed.',
      '',
    ].join('\n')
    currentProfiles['workspace-1'] = stableProfileMarkdown
    currentArtifactRawContent = [
      '# Candidate Screen',
      '',
      '```aiworker-profile-readme',
      stableProfileMarkdown,
      '```',
      '',
    ].join('\n')
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')

    await waitFor(() => {
      expect(within(hrDetails).queryByText('Profile patch ready')).toBeNull()
    })
    expect(within(hrDetails).queryByRole('button', { name: 'Review profile patch' })).toBeNull()
  })

  it('keeps profile details stable while lifecycle list sections are expanded', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    expect(screen.queryByText('Profile Actions')).toBeNull()
    const profileTools = expandProfileTools()
    const profileToolsText = profileTools.textContent ?? ''
    expect(profileToolsText.indexOf('Recent Sessions')).toBeLessThan(profileToolsText.indexOf('Complete Hiring Workspace candidate profile'))
    expect(within(profileTools).queryByText('Next Profile Step')).toBeNull()
    expect(within(profileTools).queryByText('Artifact evidence')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Employees/ }))

    await waitFor(() => {
      expect(screen.getByText('No profiles in this section.')).toBeTruthy()
    })
    const hrDetails = document.querySelector('.hr-profile-details') as HTMLElement
    expect(within(hrDetails).queryByText('Profile Patch')).toBeNull()
    expect(within(hrDetails).getByLabelText('Profile sources').textContent).toContain('Artifact evidence1')
  })

  it('toggles HR side panels from the header controls', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    expect(document.querySelector('.hr-profile-list-panel')).toBeTruthy()
    expect(document.querySelector('.hr-profile-tools-rail')).toBeNull()
    expect(document.querySelector('.hr-profile-tools-panel')).toBeNull()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Hide Profile List' }))
    expect(document.querySelector('.hr-profile-list-panel')).toBeNull()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-list')).toBe(true)
    expect(screen.getByRole('button', { name: 'Show Profile List' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Profile Workbench' }))
    expect(document.querySelector('.hr-profile-tools-panel')).toBeTruthy()
    expect(document.querySelector('.hr-profile-tools-rail')).toBeNull()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(false)
    expect(screen.getByRole('button', { name: 'Collapse Profile Workbench' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show Profile List' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Profile Workbench' }))
    expect(document.querySelector('.hr-profile-list-panel')).toBeTruthy()
    expect(document.querySelector('.hr-profile-tools-rail')).toBeNull()
    expect(document.querySelector('.hr-profile-tools-panel')).toBeNull()
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(true)
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

  it('uses the compact icon button primitive for profile and host chrome actions', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const profileList = screen.getByLabelText('People Profiles')
    fireEvent.click(screen.getByRole('button', { name: 'Open Hiring Workspace profile' }))
    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')
    const iconButtons = [
      screen.getByRole('button', { name: 'Hide sidebar' }),
      screen.getByRole('button', { name: 'Open workspace terminal' }),
      screen.getByRole('button', { name: 'Open right panel' }),
      within(profileList).getByRole('button', { name: 'New profile' }),
      within(hrDetails).getByRole('button', { name: 'Hide Profile List' }),
      within(hrDetails).getByRole('button', { name: 'Expand Profile Workbench' }),
      within(hrDetails).getByRole('button', { name: 'Refresh workspace' }),
      within(hrDetails).getByRole('button', { name: 'Open platform settings' }),
    ]

    for (const button of iconButtons) {
      expect(button.classList.contains('icon-button')).toBe(true)
      expect(button.classList.contains('icon-btn')).toBe(false)
    }

    const hostSidebarToggle = screen.getByRole('button', { name: 'Hide sidebar' })
    expect(hostSidebarToggle.getAttribute('aria-pressed')).toBe('true')
    expect(hostSidebarToggle.querySelector('.lucide-panel-left')).toBeTruthy()
    fireEvent.click(hostSidebarToggle)
    expect(screen.getByRole('button', { name: 'Show sidebar' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Open workspace terminal' }).querySelector('.lucide-panel-bottom')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open right panel' }).querySelector('.lucide-panel-right')).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Hide Profile List' }).querySelector('.lucide-panel-left')).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Expand Profile Workbench' }).querySelector('.lucide-panel-right')).toBeTruthy()
    expect(document.querySelector('.lucide-panel-left-open, .lucide-panel-left-close, .lucide-panel-right-open, .lucide-panel-right-close')).toBeNull()
  })

  it('groups workers by Soul and keeps each category collapsible', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const qaGroupToggle = screen.getByRole('button', { name: /QA \(1\)/ })
    const qaGroup = qaGroupToggle.closest('.studio-collapsible-group')
    const visibleOptionTexts = () => screen.getAllByRole('option').map(option => option.textContent ?? '')

    expect(qaGroup).toBeTruthy()
    expect(qaGroup?.querySelector('.studio-collapsible-group-drawer')).toBeTruthy()
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
    expect(screen.getByLabelText('Host actions')).toBeTruthy()
    expect(document.querySelectorAll('.entry-header.workspace-header')).toHaveLength(0)
    expect(document.querySelector('.hr-people-header')).toBeNull()
    const profileList = screen.getByLabelText('People Profiles')
    expect(screen.queryByPlaceholderText('Search people profiles')).toBeNull()
    expect(within(profileList).getByRole('button', { name: 'New people profile' })).toBeTruthy()
    fireEvent.click(within(profileList).getByRole('button', { name: 'New people profile' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/actions/create-people-profile', expect.objectContaining({ method: 'POST' }))
    })
    const actionCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/api/local/apps/aiworker-hr/actions/create-people-profile'))
    const actionBody = JSON.parse(String(actionCall?.[1]?.body)) as Record<string, Record<string, string>>
    expect(actionBody).toMatchObject({
      input: { source: 'soul-workbench' },
      scope: { workerId: 'hr-worker' },
    })
    expect(actionBody.input).not.toHaveProperty('workerId')
    expect(actionBody.input).not.toHaveProperty('workspaceId')
    const createWorkspaceDialog = await screen.findByRole('dialog', { name: 'Create workspace' })
    expect(createWorkspaceDialog).toBeTruthy()
    expect(screen.queryByText('People profile draft created.')).toBeNull()
    expect(document.querySelector('.shell-action-status')).toBeNull()
    fireEvent.click(within(createWorkspaceDialog).getAllByRole('button', { name: 'Close dialog' })[0]!)

    fireEvent.click(screen.getByRole('button', { name: 'Open Hiring Workspace profile' }))
    const hrDetails = await screen.findByLabelText('Hiring Workspace People Profile')
    expect(within(hrDetails).getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Evidence' })).toBeTruthy()
    expect(within(hrDetails).getByRole('button', { name: 'Configure HR' })).toBeTruthy()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/local/apps/aiworker-hr/search'))).toBe(false)
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(true)
    fireEvent.click(within(hrDetails).getByRole('button', { name: 'Evidence' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/actions/toggle-evidence-drawer', expect.objectContaining({ method: 'POST' }))
    })
    expect(document.querySelector('.hr-people-layout')?.classList.contains('without-profile-tools')).toBe(false)
    fireEvent.click(within(hrDetails).getByRole('button', { name: 'Configure HR' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/apps/aiworker-hr/actions/configure-hr', expect.objectContaining({ method: 'POST' }))
    })
    expect(await screen.findByText('HR configuration is owned by the HR app.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Soul Apps (2)')).toBeNull()
    expect(screen.queryByText('Enabled · 0.1.0')).toBeNull()
    expect(screen.queryByText('10 permissions')).toBeNull()
    expect(screen.queryByText('API /api/local/apps/aiworker-hr')).toBeNull()
    expect(screen.queryByText('Route People workbench · /hr/people')).toBeNull()
    expect(screen.queryByText('4 mounted contributions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Developer details' })).toBeNull()

    openHostSettings()
    const dialog = await screen.findByRole('dialog', { name: 'Platform Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Soul Apps/ }))

    expect(within(dialog).getByRole('heading', { name: 'Soul Apps' })).toBeTruthy()
    expect(within(dialog).getByText('AIWorker HR')).toBeTruthy()
    expect(within(dialog).getByText('Enabled · 0.1.0')).toBeTruthy()
    expect(within(dialog).getByText('10 permissions')).toBeTruthy()
    expect(within(dialog).getByText('4 mounted contributions')).toBeTruthy()
    expect(within(dialog).getByText('API /api/local/apps/aiworker-hr')).toBeTruthy()
    expect(within(dialog).getByText('AIWorker QA')).toBeTruthy()
    expect(within(dialog).getByText('Disabled · 0.1.0')).toBeTruthy()
    expect(within(dialog).getByText('5 permissions')).toBeTruthy()
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

  it('blocks Soul App enablement when Host security review cannot enable the app', async () => {
    currentSettings = {
      ...currentSettings,
      connectors: currentSettings.connectors.filter(connector => connector.id !== 'ci'),
    }
    currentApps = [{
      appId: 'aiworker-qa',
      manifest: {
        connectors: {
          optional: [],
          required: [{
            access: ['read'],
            id: 'ci',
            reason: 'Read CI and test evidence through the Host connector broker.',
            scopes: ['runs.read'],
          }],
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
    }]

    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    openHostSettings()
    const dialog = await screen.findByRole('dialog', { name: 'Platform Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Soul Apps/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable AIWorker QA' }))

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
      expect(calls).toContain('/api/local/apps/aiworker-qa/security-review')
      expect(calls).not.toContain('/api/local/apps/aiworker-qa/enable')
    })
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Required connectors are not available: ci')
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
    expect(screen.getByRole('listbox', { name: 'Soul' })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /QA/ }))
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

    await screen.findByTestId('hr-people-workbench')
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
    const profileTools = expandProfileTools()
    expect(profileTools.querySelector('select.hr-composer-template-select')).toBeNull()
    expect(profileTools.querySelector('.hr-composer-template-select.studio-select')).toBeTruthy()
    expect(within(profileTools).getByLabelText('Proposal type').textContent).toContain('Candidate profile draft')
    fireEvent.click(within(profileTools).getByLabelText('Proposal type'))
    expect(document.querySelector('.hr-composer-template-select-content')).toBeTruthy()
    expect(document.querySelector('.hr-composer-template-select-content')?.getAttribute('data-side')).toBe('top')
    fireEvent.keyDown(within(profileTools).getByLabelText('Proposal type'), { key: 'Escape' })
    expect(within(profileTools).getByRole('button', { name: /Generate profile draft/ }).textContent).not.toContain('Generate profile draft')
    fireEvent.change(within(profileTools).getByLabelText('Candidate material'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(within(profileTools).getByRole('button', { name: /Generate profile draft/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions/stream', expect.objectContaining({
        body: expect.stringContaining(`"capabilityTemplateId":"${HR_PROFILE_UPDATE_PROPOSAL}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created/sessions/session-created')
    })
  })

  it('submits multiple candidate material files with the profile draft session', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    const profileTools = expandProfileTools()
    const fileInput = profileTools.querySelector('input.hr-material-file-input') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    const resume = new File(['resume evidence'], 'ada-resume.txt', { type: 'text/plain' })
    const notes = new File(['interview notes'], 'round-one.md', { type: 'text/markdown' })

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [resume, notes] } })
    })

    expect(within(profileTools).getByText('ada-resume.txt')).toBeTruthy()
    expect(within(profileTools).getByText('round-one.md')).toBeTruthy()
    expect(within(profileTools).getByLabelText('Attached candidate materials').textContent).toContain('2')

    fireEvent.change(within(profileTools).getByLabelText('Candidate material'), { target: { value: 'Use these materials first.' } })
    fireEvent.click(within(profileTools).getByRole('button', { name: /Generate profile draft/ }))

    await waitFor(() => {
      expect(writtenFiles).toHaveLength(2)
      expect(lastSessionRequestBody).not.toBeNull()
    })
    expect(writtenFiles.map(file => file.path)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^evidence\/uploads\/.+\/ada-resume\.txt$/),
      expect.stringMatching(/^evidence\/uploads\/.+\/round-one\.md$/),
    ]))
    expect(writtenFiles[0]?.body).toContain('resume evidence')
    const metadata = lastSessionRequestBody?.metadata as { attachedMaterials?: Array<{ name: string, path: string }>, materialCount?: number }
    expect(metadata.materialCount).toBe(2)
    expect(metadata.attachedMaterials?.map(item => item.name)).toEqual(['ada-resume.txt', 'round-one.md'])
    expect(String(lastSessionRequestBody?.context)).toContain('Attached candidate material')
    expect(String(lastSessionRequestBody?.context)).toContain('evidence/uploads/')
  })

  it('navigates from the HR worker workbench to the created session after a profile action', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker')
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    fireEvent.click(screen.getByRole('button', { name: 'Open Hiring Workspace profile' }))
    const profileTools = expandProfileTools()
    fireEvent.change(within(profileTools).getByLabelText('Candidate material'), { target: { value: 'Target: Hiring Workspace\n\nSummarize profile.' } })
    fireEvent.click(within(profileTools).getByRole('button', { name: /Generate profile draft/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-1/sessions/stream', expect.objectContaining({
        body: expect.stringContaining(`"capabilityTemplateId":"${HR_PROFILE_UPDATE_PROPOSAL}"`),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-created-worker-route')
    })
  })

  it('does not force navigation back to a streaming session after the operator leaves the workspace route', async () => {
    deferCreatedSessionStream = true
    render(<WorkerStudio />)

    await screen.findByTestId('hr-people-workbench')
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }))
    const dialog = screen.getByRole('dialog', { name: 'Create workspace' })
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: 'New candidate workspace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created')
    })

    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    const profileTools = expandProfileTools()
    fireEvent.change(within(profileTools).getByLabelText('Candidate material'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(within(profileTools).getByRole('button', { name: /Generate profile draft/ }))
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
    expandProfileTools()
    expect(screen.getByText('Complete Hiring Workspace candidate profile')).toBeTruthy()
    expect(screen.queryByText('Next Profile Step')).toBeNull()
    expect(screen.getByText('People Profiles')).toBeTruthy()
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
    const profileTools = document.querySelector('.hr-profile-tools-panel') as HTMLElement
    fireEvent.click(await within(profileTools).findByRole('button', { name: /Open Evidence organization session/ }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
    })
    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    expect(screen.getAllByLabelText('Current worker').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'New Soul worker' })).toBeTruthy()
    const hostLocator = screen.getByLabelText('Current Soul worker')
    expect(within(hostLocator).getByText('AIWorker HR')).toBeTruthy()
    expect(within(hostLocator).getByText('HR')).toBeTruthy()
    expect(screen.queryByText('Workspace navigation')).toBeNull()
    expect(document.querySelector('.workspace-context-card')).toBeNull()
    expect(screen.queryByText('Workspace sessions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to worker' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to workspace' })).toBeTruthy()
    expect(screen.queryByTestId('new-project-panel')).toBeNull()
    expect(screen.getByText('Session events')).toBeTruthy()
    expect(screen.getByText('Memory candidates')).toBeTruthy()
    expect(document.querySelector('.session-progress-card')).toBeTruthy()
    expect(document.querySelector('.studio-collapsible-group')).toBeTruthy()
    expect(document.querySelector('.artifact-preview-frame')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open artifact settings' })).toBeNull()

    const chatActions = document.querySelector('.worker-chat-actions') as HTMLElement
    const settingsButton = within(chatActions).getByRole('button', { name: 'Open platform settings' })
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

    fireEvent.click(screen.getByRole('button', { name: 'Back to workspace' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1')
    })
    expect(await screen.findByTestId('hr-people-workbench')).toBeTruthy()
  })

  it('keeps an empty workspace route in the Soul workbench without Host workspace navigation', async () => {
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

    expect(await screen.findByLabelText('Host actions')).toBeTruthy()
    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
    expect(screen.queryByText('Workspace navigation')).toBeNull()
    expect(document.querySelector('.workspace-context-card')).toBeNull()
    expect(screen.queryByText('Workspace sessions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expandProfileTools()
    expect(screen.getByText('Complete Hiring Workspace candidate profile')).toBeTruthy()
    expect(screen.queryByText('Next Profile Step')).toBeNull()
    expect(screen.getByText('People Profiles')).toBeTruthy()
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
    expect(screen.queryByText('What do you want to build in Hiring Workspace?')).toBeNull()
    expect(screen.queryByText('No sessions in this workspace yet.')).toBeNull()
    expect(document.querySelector('.workspace-overview-panel')).toBeNull()
    expect(document.querySelector('.workspace-session-grid')).toBeNull()
    expect(document.querySelector('.rail-workspace-list')).toBeNull()
    expect(screen.queryByTestId('new-project-panel')).toBeNull()
    expect(screen.queryByLabelText('Soul catalog')).toBeNull()
  })

  it('keeps session routes free of Host-level new-session navigation', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    expect(document.querySelector('.workspace-context-card')).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to workspace' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
    expect(screen.queryByTestId('new-session-panel')).toBeNull()
  })

  it('returns from a selected session route through the Soul worker navigation', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')

    render(<WorkerStudio />)

    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    const workerRail = screen.getByRole('listbox', { name: 'Current worker' })
    fireEvent.click(within(workerRail).getByRole('option', { name: 'HR' }))

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

    await screen.findByLabelText('Host actions')
    expect(screen.queryByRole('dialog', { name: 'Platform Settings' })).toBeNull()

    openHostSettings()

    expect(screen.getByRole('dialog', { name: 'Platform Settings' })).toBeTruthy()
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
    expect(screen.getByRole('dialog', { name: '平台设置' })).toBeTruthy()
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

    act(() => media.setMatches(true))

    await waitFor(() => {
      expect(screen.getByTestId('worker-studio-shell').getAttribute('data-theme')).toBe('dark')
    })
  })

  it('persists dark appearance and applies the dark theme without reloading', async () => {
    render(<WorkerStudio />)

    await screen.findByTestId('worker-studio-shell')
    openHostSettings()
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
