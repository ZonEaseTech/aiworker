import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveSoulApp, enableSoulApp, loadLocalWorkspaceData } from './workspace-data'

const projectedSoul = {
  description: 'Open-ended Soul for freeform local work.',
  id: 'aiworker-freeform',
  name: 'AIWorker Freeform',
  status: 'available',
}

const retiredLocalSoulsPath = ['/api/local', 'souls'].join('/')

const responses: Record<string, unknown> = {
  '/api/app-installation/apps': {
    apps: [{
      appId: 'aiworker-freeform',
      projectedSoul,
      status: 'enabled',
    }],
  },
  '/api/info': { runtimeVersion: 'test', startedAt: '2026-05-09T00:00:00.000Z', workers: [] },
  '/api/sessions': { sessions: [] },
  '/api/settings': { settings: { language: 'en' } },
  '/api/workers': { workers: [] },
  '/api/workspace-locators': { workspaces: [] },
}

describe('loadLocalWorkspaceData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      const body = responses[path]
      if (!body)
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads Host shell data without the legacy transient turn feed', async () => {
    const data = await loadLocalWorkspaceData()
    const paths = vi.mocked(fetch).mock.calls.map(([path]) => String(path))

    expect(paths).not.toContain('/api/local/turns')
    expect(paths).not.toContain('/api/local/templates')
    expect(paths).not.toContain('/api/local/apps')
    expect(paths).not.toContain('/api/local/info')
    expect(paths).not.toContain('/api/local/settings')
    expect(paths).not.toContain('/api/local/workers')
    expect(paths).not.toContain('/api/local/workspaces')
    expect(paths).not.toContain('/api/local/sessions')
    expect(paths).not.toContain('/api/local/capabilities')
    expect(paths).not.toContain(retiredLocalSoulsPath)
    expect(paths).not.toContain('/api/capabilities')
    expect(paths).toContain('/api/app-installation/apps')
    expect(paths).toContain('/api/info')
    expect(paths).toContain('/api/settings')
    expect(paths).toContain('/api/workers')
    expect(paths).toContain('/api/workspace-locators')
    expect(paths).toContain('/api/sessions')
    expect(data).not.toHaveProperty('turns')
    expect(data).not.toHaveProperty('templates')
    expect(data).not.toHaveProperty('capabilities')
    expect(data.souls).toEqual([projectedSoul])
  })

  it('archives Soul Apps through the app-installation broker route', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ app: { appId: 'aiworker-freeform', status: 'disabled' } }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))

    await archiveSoulApp('aiworker-freeform')

    expect(fetch).toHaveBeenCalledWith('/api/app-installation/apps/aiworker-freeform/archive', expect.objectContaining({ method: 'POST' }))
  })

  it('enables Soul Apps through the app-installation broker route', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ app: { appId: 'aiworker-freeform', status: 'enabled' } }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))

    await enableSoulApp('aiworker-freeform')

    expect(fetch).toHaveBeenCalledWith('/api/app-installation/apps/aiworker-freeform/enable', expect.objectContaining({ method: 'POST' }))
  })
})
