// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorker } from './workers'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker API', () => {
  it('creates workers through the canonical broker route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      worker: {
        createdAt: '2026-05-27T00:00:00.000Z',
        defaultEngineId: 'codex',
        id: 'worker-created',
        metadataJson: {},
        name: 'Created worker',
        appId: 'demo-soul-app',
        status: 'active',
        updatedAt: '2026-05-27T00:00:00.000Z',
      },
    }))))

    await createWorker({ name: 'Created worker', appId: 'demo-soul-app' })

    expect(fetch).toHaveBeenCalledWith('/api/workers', expect.objectContaining({
      body: JSON.stringify({ name: 'Created worker', appId: 'demo-soul-app' }),
      method: 'POST',
    }))
  })
})
