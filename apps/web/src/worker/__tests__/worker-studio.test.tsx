import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkerStudio } from '../worker-studio'

const workspace = {
  id: 'local',
  name: 'Hiring Workspace',
  rootPath: '/tmp/hiring',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
}

const brief = {
  id: 'brief-1',
  workspaceId: 'local',
  title: 'Screen candidate',
  body: 'Review packet',
  status: 'completed',
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt,
}

const run = {
  id: 'run-1',
  workspaceId: 'local',
  briefId: 'brief-1',
  status: 'succeeded',
  executor: 'local',
  prompt: 'Review packet',
  summary: 'Candidate review ready',
  error: null,
  metadataJson: {},
  startedAt: workspace.createdAt,
  finishedAt: workspace.updatedAt,
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    if (url.endsWith('/api/local/info'))
      return json({ workerId: 'local-worker', runtimeVersion: 'test', startedAt: workspace.createdAt, workspace })
    if (url.endsWith('/api/local/briefs') && method === 'POST')
      return json({ brief: { ...brief, id: 'brief-created', title: 'New work order', body: 'Created work order' } })
    if (url.endsWith('/api/local/briefs'))
      return json({ briefs: [brief] })
    if (url.endsWith('/api/local/runs') && method === 'POST')
      return json({ run: { ...run, id: 'run-created', briefId: 'brief-created' }, events: [], files: [], artifacts: [], review: null, lessons: [] })
    if (url.endsWith('/api/local/runs'))
      return json({ runs: [run] })
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

    return new Response('{}', { status: 404 })
  }))
})

describe('worker studio', () => {
  it('renders the AIWorker work order home without desktop chrome or default settings', async () => {
    const { container } = render(<WorkerStudio />)

    expect(await screen.findAllByText('AIWorker')).toHaveLength(1)
    expect(screen.getByLabelText('Work order creator')).toBeTruthy()
    expect(screen.getByLabelText('Work orders')).toBeTruthy()
    expect(screen.getByLabelText('Companion')).toBeTruthy()
    expect(screen.getByText('New work order')).toBeTruthy()
    expect(screen.getByText('Worker pack')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Set up AIWorker' })).toBeNull()
    expect(container.querySelector('.window-lights')).toBeNull()
    expect(screen.queryByText('Open Design')).toBeNull()
    expect(screen.queryByText('Nexu Labs')).toBeNull()
    expect(screen.queryByText('Import Claude Design ZIP')).toBeNull()
    expect(screen.queryByText('Trump')).toBeNull()
    expect(screen.queryByText('Review')).toBeNull()
    expect(screen.queryByText('Lessons')).toBeNull()
    expect(screen.queryByLabelText('Artifact canvas')).toBeNull()
  })

  it('opens settings only from the explicit settings trigger', async () => {
    render(<WorkerStudio />)

    await screen.findByText('AIWorker')
    expect(screen.queryByRole('dialog', { name: 'Set up AIWorker' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Open settings'))

    expect(screen.getByRole('dialog', { name: 'Set up AIWorker' })).toBeTruthy()
    expect(screen.getByText('Set up AIWorker')).toBeTruthy()
    expect(screen.getAllByText('Local CLI').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Codex CLI').length).toBeGreaterThan(0)
  })

  it('creates a work order through the local brief and run APIs', async () => {
    render(<WorkerStudio />)

    await screen.findByText('AIWorker')
    fireEvent.change(screen.getByLabelText('Work order name'), { target: { value: 'New work order' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/local/briefs', expect.objectContaining({ method: 'POST' }))
      expect(fetch).toHaveBeenCalledWith('/api/local/runs', expect.objectContaining({ method: 'POST' }))
    })
  })
})
