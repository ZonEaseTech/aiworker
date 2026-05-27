import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocalWorkspaceData } from './workspace-data'

const responses: Record<string, unknown> = {
  '/api/local/apps': { apps: [] },
  '/api/local/info': { runtimeVersion: 'test', startedAt: '2026-05-09T00:00:00.000Z', workers: [] },
  '/api/local/sessions': { sessions: [] },
  '/api/local/settings': { settings: { language: 'en' } },
  '/api/local/souls': { souls: [] },
  '/api/local/capabilities': {
    capabilities: [{
      description: 'Freeform session work',
      id: 'aiworker-freeform.default',
      inputHints: [],
      name: 'Freeform',
      outputKind: 'session',
      promptRef: 'dist/product/capabilities/default/prompt.md',
      soulId: 'aiworker-freeform',
    }],
  },
  '/api/local/workers': { workers: [] },
  '/api/local/workspaces': { workspaces: [] },
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
    expect(paths).toContain('/api/local/capabilities')
    expect(data).not.toHaveProperty('turns')
    expect(data).not.toHaveProperty('templates')
    expect(data.capabilities.map(capability => capability.id)).toEqual(['aiworker-freeform.default'])
  })
})
