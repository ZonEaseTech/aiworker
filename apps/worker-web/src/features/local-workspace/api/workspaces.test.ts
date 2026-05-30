// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorkspace } from './workspaces'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('workspace API', () => {
  it('creates workspace locators through the canonical broker route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      workspace: {
        createdAt: '2026-05-27T00:00:00.000Z',
        id: 'workspace-created',
        metadataJson: {},
        name: 'Demo Workspace',
        rootPath: '/tmp/demo-workspace',
        sourcePointersJson: [],
        status: 'active',
        type: 'workspace',
        updatedAt: '2026-05-27T00:00:00.000Z',
        workerId: 'worker-1',
      },
    }))))

    await createWorkspace('worker-1', {
      metadata: { soulId: 'demo-soul-app' },
      name: 'Demo Workspace',
    })

    expect(fetch).toHaveBeenCalledWith('/api/workspace-locators', expect.objectContaining({
      body: JSON.stringify({
        workerId: 'worker-1',
        metadata: { soulId: 'demo-soul-app' },
        name: 'Demo Workspace',
      }),
      method: 'POST',
    }))
  })
})
