import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkerStudio } from '../worker-studio'

const now = '2026-05-10T00:00:00.000Z'
const workspace = {
  createdAt: now,
  id: 'soul-workspace',
  name: 'Hiring Workspace',
  rootPath: '/tmp/hiring',
  updatedAt: now,
}

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

const projectRecord = {
  body: 'Candidate context',
  createdAt: now,
  id: 'project-1',
  metadataJson: {},
  selectedSkillId: 'candidate-screen',
  selectedSoulId: 'hr',
  status: 'completed',
  title: 'Screen candidate',
  updatedAt: now,
  workspaceId: 'soul-workspace',
}

const runRecord = {
  projectId: 'project-1',
  createdAt: now,
  error: null,
  executor: 'workspace-template',
  finishedAt: now,
  id: 'run-1',
  metadataJson: {},
  prompt: 'Run',
  startedAt: now,
  status: 'succeeded',
  summary: 'Generated Candidate Screen.',
  updatedAt: now,
  workspaceId: 'soul-workspace',
}

const artifactRecord = {
  createdAt: now,
  id: 'artifact-1',
  kind: 'candidate-screen',
  metadataJson: {},
  path: 'runs/run-1/candidate-screen.md',
  runId: 'run-1',
  status: 'available',
  title: 'Candidate Screen',
  updatedAt: now,
  workspaceId: 'soul-workspace',
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
      return json({ runtimeVersion: 'test', startedAt: now, workerId: 'soul-worker', workspace })
    if (url.endsWith('/api/local/souls'))
      return json({ souls })
    if (url.endsWith('/api/local/templates'))
      return json({ templates })
    if (url.endsWith('/api/local/projects') && method === 'POST')
      return json({ project: { ...projectRecord, id: 'project-created', title: 'New candidate project' } }, 201)
    if (url.endsWith('/api/local/projects'))
      return json({ projects: [projectRecord] })
    if (url.endsWith('/api/local/runs') && method === 'POST')
      return json({ artifacts: [artifactRecord], events: [], files: [], lessons: [], review: null, run: { ...runRecord, projectId: 'project-created', id: 'run-created' } }, 201)
    if (url.endsWith('/api/local/runs'))
      return json({ runs: [runRecord] })
    if (url.endsWith('/api/local/files'))
      return json({ files: [] })
    if (url.includes('/api/local/files/raw/'))
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
    expect(screen.getAllByText('Create project and run').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Import/i)).toBeNull()
    expect(screen.queryByText(/work order/i)).toBeNull()
    expect(screen.queryByText(/Open Design/i)).toBeNull()
    expect(screen.queryByText(/Nexu/i)).toBeNull()
    expect(await screen.findByText(/Evidence summary/i)).toBeTruthy()
  })

  it('creates a project and run with selected Soul and skill metadata', async () => {
    render(<WorkerStudio />)

    await screen.findAllByText('Candidate Screen')
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'New candidate project' } })
    fireEvent.change(screen.getByLabelText('Business context'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create project and run' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/projects', expect.objectContaining({
        body: expect.stringContaining('"selectedSoulId":"hr"'),
        method: 'POST',
      }))
      expect(fetch).toHaveBeenCalledWith('/api/local/runs', expect.objectContaining({ method: 'POST' }))
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
    expect(screen.getAllByText('创建项目并运行').length).toBeGreaterThan(0)
    expect(screen.queryByText('Create project and run')).toBeNull()
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
