// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchInvocationEvents, fetchSessionDetail, submitSessionInvocation } from './session-invocations'

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

  it('can request a non-blocking invocation response for streaming chat', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [],
      files: [],
      invocation: { id: 'inv-stream', sessionId: 'session-1', status: 'running' },
      session: { id: 'session-1', status: 'active' },
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await submitSessionInvocation('session-1', { input: 'stream now', waitForCompletion: false })

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session-1/invocations', expect.objectContaining({
      body: JSON.stringify({ input: 'stream now', waitForCompletion: false }),
      method: 'POST',
    }))
  })

  it('fetches invocation events with optional after/limit paging through the canonical engine route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [{ createdAt: '2026-06-01T00:00:00.000Z', id: 1, invocationId: 'inv-1', payloadJson: {}, seq: 1, sessionId: 'session-1', type: 'assistant_delta' }],
      invocation: { id: 'inv-1', status: 'running' },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchInvocationEvents('inv 1', { after: 3, limit: 10 })

    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv%201/events?after=3&limit=10', expect.any(Object))
    expect(result.events).toHaveLength(1)
    expect(result.invocation).toMatchObject({ id: 'inv-1', status: 'running' })
  })

  it('fetches invocation events without query params when paging is omitted', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [], invocation: { id: 'inv-1', status: 'queued' } })))
    vi.stubGlobal('fetch', fetchMock)

    await fetchInvocationEvents('inv-1')

    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-1/events', expect.any(Object))
  })

  it('fetches session detail with persisted invocations and events for reload replay', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [{
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 2,
        invocationId: 'inv-1',
        payloadJson: { data: { text: 'persisted reply' } },
        seq: 1,
        sessionId: 'session 1',
        type: 'assistant_delta',
      }],
      invocations: [{ id: 'inv-1', sessionId: 'session 1', seq: 1, status: 'succeeded' }],
      session: { id: 'session 1', status: 'active' },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchSessionDetail('session 1')

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session%201', expect.any(Object))
    expect(result.invocations).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ invocationId: 'inv-1', type: 'assistant_delta' })
  })
})
