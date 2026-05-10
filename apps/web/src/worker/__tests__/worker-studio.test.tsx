import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkerStudio } from '../worker-studio'

const now = '2026-05-10T00:00:00.000Z'
const workspace = {
  createdAt: now,
  id: 'local',
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

const settings = {
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

const caseRecord = {
  body: 'Candidate context',
  createdAt: now,
  id: 'case-1',
  metadataJson: {},
  selectedSkillId: 'candidate-screen',
  selectedSoulId: 'hr',
  status: 'completed',
  title: 'Screen candidate',
  updatedAt: now,
  workspaceId: 'local',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status,
    })

    if (url.endsWith('/api/local/info'))
      return json({ runtimeVersion: 'test', startedAt: now, workerId: 'local-worker', workspace })
    if (url.endsWith('/api/local/souls'))
      return json({ souls })
    if (url.endsWith('/api/local/templates'))
      return json({ templates })
    if (url.endsWith('/api/local/cases') && method === 'POST')
      return json({ case: { ...caseRecord, id: 'case-created', title: 'New candidate case' } }, 201)
    if (url.endsWith('/api/local/cases'))
      return json({ cases: [caseRecord] })
    if (url.endsWith('/api/local/runs') && method === 'POST')
      return json({ artifacts: [], events: [], files: [], lessons: [], review: null, run: { caseId: 'case-created', createdAt: now, error: null, executor: 'local', finishedAt: now, id: 'run-created', metadataJson: {}, prompt: 'Run', startedAt: now, status: 'succeeded', summary: 'Done', updatedAt: now, workspaceId: 'local' } }, 201)
    if (url.endsWith('/api/local/runs'))
      return json({ runs: [] })
    if (url.endsWith('/api/local/files'))
      return json({ files: [] })
    if (url.endsWith('/api/local/artifacts'))
      return json({ artifacts: [] })
    if (url.endsWith('/api/local/reviews'))
      return json({ reviews: [] })
    if (url.endsWith('/api/local/lessons'))
      return json({ lessons: [] })
    if (url.endsWith('/api/local/events'))
      return json({ events: [] })
    if (url.endsWith('/api/local/settings') && method === 'PATCH')
      return json({ settings: { ...settings, language: 'zh-CN' } })
    if (url.endsWith('/api/local/settings'))
      return json({ settings })
    if (url.endsWith('/api/local/settings/engines/rescan'))
      return json({ engines: settings.engines, settings })
    if (url.endsWith('/api/local/settings/engines/test'))
      return json({ result: { engineId: 'codex', message: 'Codex CLI responded.', status: 'pass' } })

    return json({}, 404)
  }))
})

describe('worker studio', () => {
  it('renders Soul catalog as the first screen without import or work-order entrypoints', async () => {
    render(<WorkerStudio />)

    expect(await screen.findByText('Vertical Soul workspace')).toBeTruthy()
    expect(screen.getByLabelText('Soul catalog')).toBeTruthy()
    expect(screen.getByText('HR')).toBeTruthy()
    expect(screen.getByText('PM')).toBeTruthy()
    expect(screen.getByText('QA')).toBeTruthy()
    expect(screen.getByText('DevOps')).toBeTruthy()
    expect(screen.getAllByText('Candidate Screen').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Create case and run').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Import/i)).toBeNull()
    expect(screen.queryByText(/work order/i)).toBeNull()
    expect(screen.queryByText(/Open Design/i)).toBeNull()
    expect(screen.queryByText(/Nexu/i)).toBeNull()
  })

  it('creates a case and run with selected Soul and skill metadata', async () => {
    render(<WorkerStudio />)

    await screen.findAllByText('Candidate Screen')
    fireEvent.change(screen.getByLabelText('Case name'), { target: { value: 'New candidate case' } })
    fireEvent.change(screen.getByLabelText('Business context'), { target: { value: 'Role and candidate packet.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create case and run' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/cases', expect.objectContaining({
        body: expect.stringContaining('"selectedSoulId":"hr"'),
        method: 'POST',
      }))
      expect(fetch).toHaveBeenCalledWith('/api/local/runs', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('opens settings, rescans/tests engines, and autosaves settings changes', async () => {
    render(<WorkerStudio />)

    await screen.findByText('AIWorker')
    expect(screen.queryByRole('dialog', { name: 'AIWorker configuration' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Open settings'))

    expect(screen.getByRole('dialog', { name: 'AIWorker configuration' })).toBeTruthy()
    expect(screen.getByText('Local CLI / BYOK')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Language' }))
    fireEvent.click(screen.getByRole('button', { name: 'zh-CN' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/test', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings/engines/rescan', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/settings', expect.objectContaining({ method: 'PATCH' }))
    })
  })
})
