// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectWorkerWorkspaceOverlay, saveWorkerOverlay } from './worker-overlays'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker overlay API', () => {
  it('saves worker overlay assets through the worker scoped endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      overlay: {
        assets: [],
        workerId: 'worker-1',
      },
    }))))

    await saveWorkerOverlay('worker-1', {
      assets: [{
        content: '# Skill\n',
        enabled: true,
        id: 'brief',
        kind: 'skill',
        target: 'codex',
      }],
    })

    expect(fetch).toHaveBeenCalledWith('/api/local/workers/worker-1/overlay', expect.objectContaining({ method: 'PUT' }))
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
