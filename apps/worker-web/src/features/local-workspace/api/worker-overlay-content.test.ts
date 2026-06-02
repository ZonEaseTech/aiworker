// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalApiError } from '../../../shared/api/local-client'
import { getOverlayContent, putOverlayContent, resetOverlayContent } from './worker-overlay-content'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker overlay content API', () => {
  it('reads overlay content through the encoded content route with a target query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      checksum: 'sha256:x',
      content: '# body',
      editable: true,
      source: 'baseline',
      sourceRef: 'descriptor://engine/skills/briefing-brief',
    }))))

    const result = await getOverlayContent('worker-1', 'skill-overlay:briefing-brief', 'codex')

    expect(result.content).toBe('# body')
    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config/skill-overlay%3Abriefing-brief/content?target=codex', expect.any(Object))
  })

  it('writes overlay content through PUT with the content body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      checksum: 'sha256:y',
      content: 'next',
      editable: true,
      source: 'overlay',
      sourceRef: 'worker-overlay://skills/custom-skill/SKILL.md',
    }))))

    await putOverlayContent('worker-1', 'skill-overlay:custom-skill', { content: 'next', target: 'codex' })

    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config/skill-overlay%3Acustom-skill/content', expect.objectContaining({
      body: JSON.stringify({ content: 'next', target: 'codex' }),
      method: 'PUT',
    }))
  })

  it('resets overlay content by archiving the overlay config envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ config: { archived: true } }))))

    await resetOverlayContent('worker-1', 'skill-overlay:custom-skill')

    expect(fetch).toHaveBeenCalledWith('/api/workers/worker-1/config/skill-overlay%3Acustom-skill/archive', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('throws a LocalApiError carrying the daemon code/message on a 422 secret rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'WORKER_CONFIG_CONTENT_SECRET', message: 'literal secrets are not allowed in worker overlay content' },
    }), { headers: { 'content-type': 'application/json' }, status: 422 })))

    await expect(putOverlayContent('worker-1', 'skill-overlay:custom-skill', { content: 'sk-abc' }))
      .rejects
      .toMatchObject({
        code: 'WORKER_CONFIG_CONTENT_SECRET',
        message: 'literal secrets are not allowed in worker overlay content',
        status: 422,
      })
    await expect(putOverlayContent('worker-1', 'skill-overlay:custom-skill', { content: 'sk-abc' }))
      .rejects
      .toBeInstanceOf(LocalApiError)
  })
})
