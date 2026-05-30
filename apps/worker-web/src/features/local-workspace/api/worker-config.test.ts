// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { archiveWorkerConfigValue, loadWorkerConfig, saveWorkerConfigValue } from './worker-config'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker config API', () => {
  it('loads worker-scoped Host config through the canonical broker route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      config: {
        values: [],
      },
      workerId: 'worker-1',
    }))))

    await loadWorkerConfig('worker-1')

    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config', expect.any(Object))
  })

  it('saves and archives worker config values through encoded canonical broker routes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      config: {
        archived: false,
        configKey: 'skill-overlay:freeform-session',
        source: 'web',
        updatedAt: '2026-05-27T00:00:00.000Z',
        value: {
          checksum: null,
          enabled: true,
          kind: 'skill-overlay',
          options: {
            replaces: 'descriptor://engine/skills/freeform-session',
          },
          sourceRef: 'descriptor://engine/skills/freeform-overlay',
          target: 'codex',
          updatedAt: '2026-05-27T00:00:00.000Z',
          updatedBy: 'web',
        },
        workerId: 'worker-1',
      },
    }))))

    await saveWorkerConfigValue('worker-1', 'skill-overlay:freeform-session', {
      enabled: true,
      kind: 'skill-overlay',
      options: {
        replaces: 'descriptor://engine/skills/freeform-session',
      },
      sourceRef: 'descriptor://engine/skills/freeform-overlay',
      target: 'codex',
    })
    await archiveWorkerConfigValue('worker-1', 'skill-overlay:freeform-session')

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/workers/worker-1/config/skill-overlay%3Afreeform-session', expect.objectContaining({
      body: JSON.stringify({
        enabled: true,
        kind: 'skill-overlay',
        options: {
          replaces: 'descriptor://engine/skills/freeform-session',
        },
        sourceRef: 'descriptor://engine/skills/freeform-overlay',
        target: 'codex',
      }),
      method: 'PUT',
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/workers/worker-1/config/skill-overlay%3Afreeform-session/archive', expect.objectContaining({
      method: 'POST',
    }))
  })
})
