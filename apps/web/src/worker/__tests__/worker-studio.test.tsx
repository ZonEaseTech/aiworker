import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

let currentSettings: typeof baseSettings

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

function resetSettings() {
  currentSettings = {
    ...baseSettings,
    byok: { ...baseSettings.byok },
    connectors: baseSettings.connectors.map(item => ({ ...item })),
    engines: baseSettings.engines.map(item => ({ ...item })),
    externalMcpServers: baseSettings.externalMcpServers.map(item => ({ ...item })),
    localMcpServer: { ...baseSettings.localMcpServer },
  }
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
      return json({ runtimeVersion: 'test', startedAt: now, workers })
    if (url.endsWith('/api/local/workers'))
      return json({ workers })
    if (url.endsWith('/api/local/souls'))
      return json({ souls })
    if (url.endsWith('/api/local/templates'))
      return json({ templates })
    if (url.endsWith('/api/local/workers/hr-worker/workspaces') && method === 'POST')
      return json({ workspace: { ...workspace, id: 'workspace-created', name: 'New candidate workspace' } }, 201)
    if (url.endsWith('/api/local/workspaces'))
      return json({ workspaces: [workspace] })
    if (url.endsWith('/api/local/workspaces/workspace-created/sessions') && method === 'POST')
      return json({ artifacts: [artifactRecord], events: [], files: [], lessons: [], review: null, session: { ...sessionRecord, workspaceId: 'workspace-created', id: 'session-created' }, turn: { ...turnRecord, id: 'turn-created', sessionId: 'session-created' } }, 201)
    if (url.endsWith('/api/local/sessions'))
      return json({ sessions: [sessionRecord] })
    if (url.endsWith('/api/local/turns'))
      return json({ turns: [turnRecord] })
    if (url.endsWith('/api/local/files'))
      return json({ files: [] })
    if (url.includes('/api/local/workspaces/') && url.includes('/files/raw/'))
      return new Response('# Candidate Screen\n\nEvidence summary.\n', { headers: { 'content-type': 'text/plain' } })
    if (url.endsWith('/api/local/artifacts'))
      return json({ artifacts: [artifactRecord] })
    if (url.endsWith('/api/local/reviews'))
      return json({ reviews: [] })
    if (url.endsWith('/api/local/lessons'))
      return json({ lessons: [] })
    if (url.endsWith('/api/local/events'))
      return json({ events: [] })
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
  it('renders Soul catalog as the first screen without import or work-order entrypoints', async () => {
    render(<WorkerStudio />)

    expect(await screen.findByText('Soul Workspace')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByLabelText('Soul catalog')).toBeTruthy()
    expect(screen.getAllByText('HR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('QA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DevOps').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Candidate Screen').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Create workspace session').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Import/i)).toBeNull()
    expect(screen.queryByText(/work order/i)).toBeNull()
    expect(screen.queryByText(/Open Design/i)).toBeNull()
    expect(screen.queryByText(/Nexu/i)).toBeNull()
    expect(await screen.findByText(/Evidence summary/i)).toBeTruthy()
  })

  it('creates a workspace session turn with selected Soul worker and skill metadata', async () => {
    render(<WorkerStudio />)

    await screen.findAllByText('Candidate Screen')
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'New candidate workspace' } })
    fireEvent.change(screen.getByLabelText('Business context'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace session' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/workers/hr-worker/workspaces', expect.objectContaining({
        body: expect.stringContaining('"soulId":"hr"'),
        method: 'POST',
      }))
      expect(fetch).toHaveBeenCalledWith('/api/local/workspaces/workspace-created/sessions', expect.objectContaining({
        body: expect.stringContaining('"capabilityTemplateId":"candidate-screen"'),
        method: 'POST',
      }))
    })
  })

  it('opens settings, rescans/tests engines, and autosaves settings changes', async () => {
    render(<WorkerStudio />)

    await screen.findByText('AIWorker')
    expect(screen.queryByRole('dialog', { name: 'Configure Soul workspace' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Open settings'))

    expect(screen.getByRole('dialog', { name: 'Configure Soul workspace' })).toBeTruthy()
    expect(screen.getByText('Local CLI / BYOK')).toBeTruthy()
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
    expect(screen.getAllByText('创建工作区会话').length).toBeGreaterThan(0)
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
