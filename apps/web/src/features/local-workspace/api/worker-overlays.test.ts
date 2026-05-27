// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectWorkerWorkspaceOverlay } from './worker-overlays'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker overlay API', () => {
  it('keeps legacy overlay API read and projection only while saves use worker config values', () => {
    const source = readFileSync('src/features/local-workspace/api/worker-overlays.ts', 'utf8')

    expect(source).not.toContain('saveWorkerOverlay')
    expect(source).not.toContain('method: \'PUT\'')
  })

  it('projects worker overlay assets into a worker workspace through the worker scoped endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      projection: {
        receipt: null,
        workspace: { id: 'workspace-1' },
      },
    }))))

    await projectWorkerWorkspaceOverlay('worker-1', 'workspace-1')

    expect(fetch).toHaveBeenCalledWith('/api/local/workers/worker-1/workspaces/workspace-1/projection', expect.objectContaining({ method: 'POST' }))
  })
})
