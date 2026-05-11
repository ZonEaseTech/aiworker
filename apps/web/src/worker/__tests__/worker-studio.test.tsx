import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  { defaultTemplates: ['candidate-screen'], description: 'Recruiting workspace', domain: 'hr-recruiting', id: 'hr', name: 'HR', status: 'available' },
  { defaultTemplates: ['prd-draft'], description: 'Product workspace', domain: 'product-management', id: 'pm', name: 'PM', status: 'available' },
  { defaultTemplates: ['regression-matrix'], description: 'QA workspace', domain: 'quality-assurance', id: 'qa', name: 'QA', status: 'available' },
  { defaultTemplates: ['deploy-checklist'], description: 'Operations workspace', domain: 'devops-sre', id: 'devops', name: 'DevOps', status: 'available' },
  { defaultTemplates: [], description: 'Later', domain: 'finance', id: 'finance', name: 'Finance', status: 'coming_soon' },
]

const templates = [
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

const baseSettings = {
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
}

let currentArtifacts: typeof artifactRecord[]
let currentEvents: typeof eventRecord[]
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
let currentTurns: typeof turnRecord[]
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
    if ((url.endsWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions/stream') || url.endsWith('/api/local/workspaces/workspace-created/sessions/stream')) && method === 'POST') {
      const createdSession = { ...sessionRecord, workspaceId: 'workspace-created', id: 'session-created', title: 'New candidate workspace' }
      const createdTurn = { ...turnRecord, id: 'turn-created', sessionId: 'session-created' }
      const createdArtifact = { ...artifactRecord, id: 'artifact-created', sessionId: 'session-created', turnId: 'turn-created', workspaceId: 'workspace-created' }
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
      }
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
  it('renders the worker-first workspace home without import or work-order entrypoints', async () => {
    render(<WorkerStudio />)

    expect(await screen.findByText('Soul Workspace')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByLabelText('Current worker')).toBeTruthy()
    expect(screen.getAllByText('HR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('QA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DevOps').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Candidate Screen').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Current worker').length).toBeGreaterThan(0)
    expect(screen.getByText('hr-worker')).toBeTruthy()
    expect(screen.getByText('Worker ID')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeTruthy()
    const workspaceList = document.querySelector('.workspace-list')
    expect(workspaceList?.classList.contains('workspace-grid')).toBe(true)
    expect(workspaceList?.classList.contains('design-grid-list')).toBe(false)
    expect(screen.queryByText('Examples')).toBeNull()
    expect(screen.queryByText('Domain systems')).toBeNull()
    expect(screen.queryByText(/Import/i)).toBeNull()
    expect(screen.queryByText(/work order/i)).toBeNull()
    expect(screen.queryByText(/Open Design/i)).toBeNull()
    expect(screen.queryByText(/Nexu/i)).toBeNull()
    expect(screen.queryByText(/Evidence summary/i)).toBeNull()
  })

  it('uses the compact icon button primitive for chrome actions', async () => {
    render(<WorkerStudio />)

    await screen.findByText('hr-worker')

    const iconButtons = [
      screen.getByRole('button', { name: 'Create worker' }),
      screen.getByRole('button', { name: 'Refresh workspace' }),
      screen.getByRole('button', { name: 'Open settings' }),
    ]

    for (const button of iconButtons) {
      expect(button.classList.contains('icon-button')).toBe(true)
      expect(button.classList.contains('icon-btn')).toBe(false)
    }
  })

  it('switches the Soul rail and updates capability templates with worker identity', async () => {
    render(<WorkerStudio />)

    await screen.findByText('hr-worker')
    const pmWorkerOption = screen.getAllByRole('option', { name: /PM/ })
      .find(option => option.textContent?.includes('Active'))
    expect(pmWorkerOption).toBeTruthy()
    fireEvent.click(pmWorkerOption!)

    await waitFor(() => {
      expect(screen.getByText('pm-worker')).toBeTruthy()
      expect(screen.getAllByText('PRD Draft').length).toBeGreaterThan(0)
      expect(screen.queryByText('candidate-screen')).toBeNull()
    })
  })

  it('creates a worker from the compact worker list dialog', async () => {
    render(<WorkerStudio />)

    await screen.findByText('hr-worker')
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
    expect(within(catalog).getByText('hr-recruiting')).toBeTruthy()
    expect(within(catalog).getByRole('option', { name: /PM/ })).toBeTruthy()
  })

  it('creates a workspace session turn with selected Soul worker and skill metadata', async () => {
    render(<WorkerStudio />)

    await screen.findAllByText('Candidate Screen')
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    const dialog = screen.getByRole('dialog', { name: 'Create workspace' })
    fireEvent.change(within(dialog).getByLabelText('Project name'), { target: { value: 'New candidate workspace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created')
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces', expect.objectContaining({
        body: expect.stringContaining('"soulId":"hr"'),
        method: 'POST',
      }))
    })

    fireEvent.change(screen.getByLabelText('Business context'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces/workspace-created/sessions/stream', expect.objectContaining({
        body: expect.stringContaining('"capabilityTemplateId":"candidate-screen"'),
        method: 'POST',
      }))
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created/sessions/session-created')
    })
  })

  it('does not force navigation back to a streaming session after the operator leaves the workspace route', async () => {
    deferCreatedSessionStream = true
    render(<WorkerStudio />)

    await screen.findAllByText('Candidate Screen')
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    const dialog = screen.getByRole('dialog', { name: 'Create workspace' })
    fireEvent.change(within(dialog).getByLabelText('Project name'), { target: { value: 'New candidate workspace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-created')
    })

    fireEvent.change(screen.getByLabelText('Business context'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))
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
    render(<WorkerStudio />)

    fireEvent.click(await screen.findByRole('button', { name: /Hiring Workspace/ }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1')
    })
    expect(screen.getByTestId('new-session-panel')).toBeTruthy()
    expect(screen.getByText('What do you want to build in Hiring Workspace?')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Screen candidate/ }))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
    })
    expect(await screen.findByText('AIWorker Engine')).toBeTruthy()
    expect(screen.getByText('Workspace navigation')).toBeTruthy()
    expect(screen.getByText('Current worker')).toBeTruthy()
    expect(screen.getByText('hr-worker')).toBeTruthy()
    expect(screen.getAllByText('Current workspace').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Workspace sessions').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Back to worker/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Back to workspace/ }).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('new-project-panel')).toBeNull()
    expect(screen.getByText('Session events')).toBeTruthy()
    expect(screen.getByText('Memory candidates')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse session detail' }))
    expect(screen.getByRole('button', { name: 'Expand session detail' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand session detail' }))
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
    expect(screen.getByTestId('new-session-panel')).toBeTruthy()
    expect(screen.getByText('What do you want to build in Hiring Workspace?')).toBeTruthy()
    expect(screen.getAllByText('No sessions in this workspace yet.').length).toBeGreaterThan(0)
    expect(document.querySelector('.workspace-overview-panel')).toBeNull()
    expect(document.querySelector('.workspace-session-grid')).toBeNull()
    const otherWorkspaceList = document.querySelector('.rail-workspace-list') as HTMLElement
    expect(within(otherWorkspaceList).queryByText('Hiring Workspace')).toBeNull()
    expect(within(otherWorkspaceList).getByText('Offer Workspace')).toBeTruthy()
    expect(otherWorkspaceList.querySelector('.rail-workspace-item.active')).toBeNull()
    expect(screen.queryByTestId('new-project-panel')).toBeNull()
    expect(screen.queryByLabelText('Soul catalog')).toBeNull()
  })

  it('opens settings, rescans/tests engines, and autosaves settings changes', async () => {
    render(<WorkerStudio />)

    await screen.findByText('AIWorker')
    expect(screen.queryByRole('dialog', { name: 'Configure Soul workspace' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Open settings'))

    expect(screen.getByRole('dialog', { name: 'Configure Soul workspace' })).toBeTruthy()
    expect(screen.getByText('Local CLI / BYOK')).toBeTruthy()
    expect(screen.queryByText('All changes saved')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))
    fireEvent.click(screen.getByRole('button', { name: /Language/ }))
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/test', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/rescan', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings', expect.objectContaining({ method: 'PATCH' }))
      expect(document.documentElement.lang).toBe('zh-CN')
    })
    expect(screen.getByRole('dialog', { name: '配置 Soul 工作区' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '创建工作区' })).toBeTruthy()
    expect(screen.queryByText('Create workspace session')).toBeNull()
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
