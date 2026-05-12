import type { LocalSessionEvent, LocalSettingsConfig, LocalTurn } from '@zonease/aiworker-shared'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { engineIconSrc } from '../../features/settings/model'
import { WorkerStudio } from '../worker-studio'

const now = '2026-05-10T00:00:00.000Z'
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
  { createdAt: now, defaultEngineId: 'codex', id: 'hr-worker', metadataJson: {}, name: 'HR', soulId: 'hr', status: 'active', updatedAt: now },
  { createdAt: now, defaultEngineId: 'codex', id: 'pm-worker', metadataJson: {}, name: 'PM', soulId: 'pm', status: 'active', updatedAt: now },
  { createdAt: now, defaultEngineId: 'codex', id: 'qa-worker', metadataJson: {}, name: 'QA', soulId: 'qa', status: 'active', updatedAt: now },
  { createdAt: now, defaultEngineId: 'codex', id: 'devops-worker', metadataJson: {}, name: 'DevOps', soulId: 'devops', status: 'active', updatedAt: now },
]

const souls = [
  { defaultTemplates: ['person-profile', 'lifecycle-next-step', 'candidate-screen', 'interview-brief', 'onboarding-plan', 'offboarding-summary', 'evidence-matrix', 'hiring-risk'], description: 'People operations workspace', domain: 'hr-people-ops', id: 'hr', name: 'HR', status: 'available' },
  { defaultTemplates: ['prd-draft'], description: 'Product workspace', domain: 'product-management', id: 'pm', name: 'PM', status: 'available' },
  { defaultTemplates: ['regression-matrix'], description: 'QA workspace', domain: 'quality-assurance', id: 'qa', name: 'QA', status: 'available' },
  { defaultTemplates: ['deploy-checklist'], description: 'Operations workspace', domain: 'devops-sre', id: 'devops', name: 'DevOps', status: 'available' },
  { defaultTemplates: [], description: 'Later', domain: 'finance', id: 'finance', name: 'Finance', status: 'coming_soon' },
]

const templates = [
  {
    description: 'Create a source-backed HR profile snapshot.',
    id: 'person-profile',
    inputHints: ['Person context', 'Lifecycle stage'],
    name: 'Person Profile',
    outputKind: 'person-profile',
    prompt: 'Summarize profile',
    reviewRubric: ['Evidence is grounded.'],
    soulId: 'hr',
  },
  {
    description: 'Prepare the next HR touchpoint.',
    id: 'lifecycle-next-step',
    inputHints: ['Person profile', 'Open questions'],
    name: 'Lifecycle Next Step',
    outputKind: 'lifecycle-next-step',
    prompt: 'Prepare next step',
    reviewRubric: ['Next action is concrete.'],
    soulId: 'hr',
  },
  {
    description: 'Prepare a role rubric.',
    id: 'role-rubric',
    inputHints: ['Role', 'Signals'],
    name: 'Role Rubric',
    outputKind: 'role-rubric',
    prompt: 'Build role rubric',
    reviewRubric: ['Criteria are role-related.'],
    soulId: 'hr',
  },
  {
    description: 'Screen a candidate against a role.',
    id: 'candidate-screen',
    inputHints: ['Role', 'Candidate packet'],
    name: 'Candidate Screen',
    outputKind: 'candidate-screen',
    prompt: 'Screen candidate',
    reviewRubric: ['Evidence is grounded.'],
    soulId: 'hr',
  },
  {
    description: 'Draft an interview brief.',
    id: 'interview-brief',
    inputHints: ['Candidate packet', 'Rubric'],
    name: 'Interview Brief',
    outputKind: 'interview-brief',
    prompt: 'Draft interview brief',
    reviewRubric: ['Questions are evidence-backed.'],
    soulId: 'hr',
  },
  {
    description: 'Draft an onboarding plan.',
    id: 'onboarding-plan',
    inputHints: ['Employee profile', 'Role expectations'],
    name: 'Onboarding Plan',
    outputKind: 'onboarding-plan',
    prompt: 'Draft onboarding plan',
    reviewRubric: ['Owners and risks are explicit.'],
    soulId: 'hr',
  },
  {
    description: 'Prepare an offboarding summary.',
    id: 'offboarding-summary',
    inputHints: ['Departing employee context', 'Handoff notes'],
    name: 'Offboarding Summary',
    outputKind: 'offboarding-summary',
    prompt: 'Prepare offboarding summary',
    reviewRubric: ['Sensitive details are minimized.'],
    soulId: 'hr',
  },
  {
    description: 'Compare candidates against the role rubric.',
    id: 'evidence-matrix',
    inputHints: ['Role rubric', 'Candidate packets'],
    name: 'Evidence Matrix',
    outputKind: 'evidence-matrix',
    prompt: 'Build evidence matrix',
    reviewRubric: ['Missing signals are visible.'],
    soulId: 'hr',
  },
  {
    description: 'Prepare a roundup packet.',
    id: 'roundup-packet',
    inputHints: ['Evidence matrix', 'Interview notes'],
    name: 'Roundup Packet',
    outputKind: 'roundup-packet',
    prompt: 'Draft roundup packet',
    reviewRubric: ['Decision remains human-owned.'],
    soulId: 'hr',
  },
  {
    description: 'Review hiring risk.',
    id: 'hiring-risk',
    inputHints: ['Artifact', 'Policy'],
    name: 'Hiring Risk',
    outputKind: 'hiring-risk',
    prompt: 'Check hiring risk',
    reviewRubric: ['Protected-class inference is absent.'],
    soulId: 'hr',
  },
  {
    description: 'Draft a PRD.',
    id: 'prd-draft',
    inputHints: ['Goal', 'User evidence'],
    name: 'PRD Draft',
    outputKind: 'prd-draft',
    prompt: 'Draft PRD',
    reviewRubric: ['Scope is explicit.'],
    soulId: 'pm',
  },
]

const themeMediaQuery = '(prefers-color-scheme: dark)'

const baseSettings: LocalSettingsConfig = {
  appearance: 'system',
  byok: { apiKeyRef: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', provider: 'openai-compatible' },
  connectors: [{ enabled: false, id: 'ats', name: 'ATS / HRIS', status: 'not_configured' }],
  engineId: 'codex',
  engines: [{ command: 'codex', id: 'codex', installed: true, name: 'Codex CLI', path: '/usr/local/bin/codex', version: 'codex 1.0.0' }],
  executionMode: 'local-cli',
  externalMcpServers: [{ command: '', enabled: false, id: 'team-context', name: 'Team context MCP' }],
  language: 'en',
  localMcpServer: { enabled: true, url: 'http://127.0.0.1:4319/mcp' },
  updatedAt: now,
}

const sessionRecord = {
  capabilityTemplateId: 'candidate-screen',
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
    if (url.endsWith('/api/local/workers') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) as { name: string, soulId: string } : { name: 'Created worker', soulId: 'hr' }
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
    expect(screen.getByRole('button', { name: /PM \(1\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /QA \(1\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /DevOps \(1\)/ })).toBeTruthy()
    expect(screen.getAllByText('HR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('QA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DevOps').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Person Profile').length).toBeGreaterThan(0)
    expect(screen.getByTestId('hr-people-workbench')).toBeTruthy()
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
    const pmGroupToggle = screen.getByRole('button', { name: /PM \(1\)/ })
    const visibleOptionTexts = () => screen.getAllByRole('option').map(option => option.textContent ?? '')

    expect(pmGroupToggle.getAttribute('aria-expanded')).toBe('true')
    expect(visibleOptionTexts().includes('PM')).toBe(true)

    fireEvent.click(pmGroupToggle)

    expect(pmGroupToggle.getAttribute('aria-expanded')).toBe('false')
    expect(visibleOptionTexts().includes('PM')).toBe(false)

    fireEvent.click(pmGroupToggle)

    expect(pmGroupToggle.getAttribute('aria-expanded')).toBe('true')
    expect(visibleOptionTexts().includes('PM')).toBe(true)
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
    const pmWorkerOption = screen.getByRole('option', { name: 'PM' })
    expect(pmWorkerOption).toBeTruthy()
    fireEvent.click(pmWorkerOption)

    await waitFor(() => {
      expect(screen.getByText('pm-worker')).toBeTruthy()
      expect(screen.getAllByText('PRD Draft').length).toBeGreaterThan(0)
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
    fireEvent.click(within(dialog).getByRole('option', { name: /PM/ }))
    expect(dialog.querySelector('.studio-select.open')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Worker name'), { target: { value: 'Product Worker' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create worker' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers', expect.objectContaining({
        body: expect.stringContaining('"soulId":"pm"'),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/worker-created')
    })
  })

  it('uses a vertical Soul selector when no workers exist', async () => {
    currentWorkers = []
    currentWorkspaces = []
    currentSessions = []
    currentArtifacts = []

    render(<WorkerStudio />)

    expect((await screen.findAllByText('No worker')).length).toBeGreaterThan(0)
    const catalog = screen.getByRole('listbox', { name: 'Soul catalog' })
    expect(within(catalog).getByRole('option', { name: /HR/ })).toBeTruthy()
    expect(within(catalog).getByText('hr-people-ops')).toBeTruthy()
    expect(within(catalog).getByRole('option', { name: /PM/ })).toBeTruthy()
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
        body: expect.stringContaining('"soulId":"hr"'),
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
        body: expect.stringContaining('"capabilityTemplateId":"person-profile"'),
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
        body: expect.stringContaining('"capabilityTemplateId":"person-profile"'),
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
    window.history.pushState(null, '', '/workers/pm-worker')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions/stream', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/pm-worker')
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
