// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { submitSessionInvocation } from './session-invocations'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session invocations API', () => {
  it('submits a session-level follow-up invocation through the canonical broker route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [],
      files: [],
      invocation: { id: 'inv-1', sessionId: 'session-1', status: 'queued' },
      session: { id: 'session-1', status: 'active' },
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitSessionInvocation('session 1', { input: 'build the thing' })

    // canonical follow-up route is session-level and the sessionId is URL-encoded.
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session%201/invocations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ input: 'build the thing' }),
    }))
    expect(result.invocation).toMatchObject({ id: 'inv-1', status: 'queued' })
    expect(result.session).toMatchObject({ id: 'session-1', status: 'active' })
  })

  it('forwards optional invocation metadata in the request body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [],
      files: [],
      invocation: { id: 'inv-2', sessionId: 'session-1', status: 'queued' },
      session: { id: 'session-1', status: 'active' },
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await submitSessionInvocation('session-1', { input: 'continue', metadata: { source: 'composer' } })

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session-1/invocations', expect.objectContaining({
      body: JSON.stringify({ input: 'continue', metadata: { source: 'composer' } }),
    }))
  })
})
