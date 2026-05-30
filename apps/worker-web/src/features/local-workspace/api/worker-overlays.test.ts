// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadWorkerOverlay, projectWorkerWorkspaceOverlay } from './worker-overlays'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker overlay API', () => {
  it('keeps overlay saves on worker config values', () => {
    const source = readFileSync('src/features/local-workspace/api/worker-overlays.ts', 'utf8')

    expect(source).not.toContain('saveWorkerOverlay')
    expect(source).not.toContain('method: \'PUT\'')
    expect(source).not.toContain('/api/local/workers/')
  })

  it('loads worker overlay through the canonical worker config route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      overlay: { assets: [], workerId: 'worker-1' },
    }))))

    await loadWorkerOverlay('worker-1')

    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config', expect.any(Object))
  })

  it('refreshes workspace projection through the canonical target broker route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      projection: {
        receipt: null,
        workspace: { id: 'workspace-1' },
      },
      target: 'codex',
    }))))

    await projectWorkerWorkspaceOverlay('worker-1', 'workspace-1')

    expect(fetch).toHaveBeenCalledWith('/api/projections/codex/refresh', expect.objectContaining({
      body: JSON.stringify({
        workerId: 'worker-1',
        workspaceId: 'workspace-1',
      }),
      method: 'POST',
    }))
  })
})
