import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceApp } from '../workspace-app'

const workspace = {
  id: 'local',
  name: 'Hiring Workspace',
  rootPath: '/tmp/hiring',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/api/local/info'))
      return json({ workerId: 'local-worker', runtimeVersion: 'test', startedAt: workspace.createdAt, workspace })
    if (url.endsWith('/api/local/briefs'))
      return json({ briefs: [{ id: 'brief-1', workspaceId: 'local', title: 'Screen candidate', body: 'Review packet', status: 'completed', createdAt: workspace.createdAt, updatedAt: workspace.updatedAt }] })
    if (url.endsWith('/api/local/runs'))
      return json({ runs: [{ id: 'run-1', workspaceId: 'local', briefId: 'brief-1', status: 'succeeded', executor: 'local', prompt: 'Review packet', summary: 'Candidate review ready', error: null, metadataJson: {}, startedAt: workspace.createdAt, finishedAt: workspace.updatedAt, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt }] })
    if (url.endsWith('/api/local/files'))
      return json({ files: [{ id: 'file-1', workspaceId: 'local', path: 'reports/candidate.md', kind: 'generated', size: 22, mtime: 1, hash: 'h', source: 'run', createdAt: workspace.createdAt, updatedAt: workspace.updatedAt }] })
    if (url.endsWith('/api/local/artifacts'))
      return json({ artifacts: [{ id: 'artifact-1', workspaceId: 'local', runId: 'run-1', path: 'reports/candidate.md', kind: 'file', title: 'Candidate Review', status: 'available', metadataJson: {}, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt }] })
    if (url.endsWith('/api/local/reviews'))
      return json({ reviews: [{ id: 'review-1', workspaceId: 'local', runId: 'run-1', artifactId: 'artifact-1', verdict: 'pass', findingsJson: [{ message: 'Evidence attached' }], risksJson: [], createdAt: workspace.createdAt }] })
    if (url.endsWith('/api/local/lessons'))
      return json({ lessons: [{ id: 'lesson-1', workspaceId: 'local', sourceReviewId: 'review-1', statement: 'Keep evidence attached.', evidenceJson: [], status: 'proposed', createdAt: workspace.createdAt, updatedAt: workspace.updatedAt }] })
    if (url.endsWith('/api/local/events'))
      return json({ events: [] })
    if (url.endsWith('/api/local/files/raw/reports/candidate.md'))
      return new Response('Candidate file body', { status: 200 })
    return new Response('{}', { status: 404 })
  }))
})

describe('WorkspaceApp', () => {
  it('renders the local workspace surface', async () => {
    render(<WorkspaceApp />)

    expect(await screen.findByText('Hiring Workspace')).toBeTruthy()
    expect(screen.getAllByText('Screen candidate').length).toBeGreaterThan(0)
    expect(screen.getByText('Candidate Review')).toBeTruthy()
    expect(screen.getByText('Evidence attached')).toBeTruthy()
    expect(screen.getByText('Keep evidence attached.')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText(/Candidate file body|Candidate review ready/).length).toBeGreaterThan(0))
  })
})
