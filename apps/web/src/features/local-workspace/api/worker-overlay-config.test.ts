// @vitest-environment happy-dom
import type { LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-protocol'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { saveWorkerOverlayConfigValues } from './worker-overlay-config'

const updatedAt = '2026-05-27T00:00:00.000Z'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker overlay config API', () => {
  it('syncs overlay assets through canonical worker config values only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      config: {
        archived: false,
        configKey: 'skill-overlay:interview-brief',
        updatedAt,
        value: null,
        workerId: 'worker-1',
      },
    }))))

    const previousAssets = [
      overlaySkill({ id: 'interview-brief', sourceRef: 'descriptor://engine/skills/interview-brief', target: 'codex' }),
      overlaySkill({ id: 'stale-skill', sourceRef: 'descriptor://engine/skills/stale-skill', target: 'codex' }),
    ]
    const nextAssets = [
      overlaySkill({ enabled: false, id: 'interview-brief', sourceRef: 'descriptor://engine/skills/interview-brief', target: 'codex' }),
      overlaySkill({ id: 'custom-skill', sourceRef: 'descriptor://engine/skills/custom-source', target: 'codex' }),
      overlaySkill({ id: 'custom-skill', sourceRef: 'descriptor://engine/skills/custom-source', target: 'claude-code' }),
    ]

    await saveWorkerOverlayConfigValues('worker-1', previousAssets, nextAssets)

    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config/skill-overlay%3Ainterview-brief', expect.objectContaining({
      body: expect.stringContaining('"enabled":false'),
      method: 'PUT',
    }))
    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config/skill-overlay%3Acustom-skill', expect.objectContaining({
      body: expect.stringContaining('"target":"all"'),
      method: 'PUT',
    }))
    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config/skill-overlay%3Astale-skill/archive', expect.objectContaining({
      method: 'POST',
    }))
    const legacyArchivePath = [
      '/api/workers/worker-1/config',
      ['overlay', 'skill', 'codex', 'interview-brief'].join('%3A'),
      'archive',
    ].join('/')
    expect(fetch).not.toHaveBeenCalledWith(legacyArchivePath, expect.anything())
  })
})

function overlaySkill(input: { enabled?: boolean, id: string, sourceRef: string, target: string }): LocalWorkerOverlayAsset {
  return {
    checksum: null,
    enabled: input.enabled ?? true,
    id: input.id,
    kind: 'skill',
    metadataJson: {},
    optionsJson: {},
    source: 'overlay',
    sourceRef: input.sourceRef,
    target: input.target,
    updatedAt,
  }
}
