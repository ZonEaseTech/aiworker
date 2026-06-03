// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useInvocationEvents } from './use-invocation-events'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useInvocationEvents', () => {
  it('returns no turns and a null invocation when invocationId is null', () => {
    const { result } = renderHook(() => useInvocationEvents(null))
    expect(result.current.turns).toEqual([])
    expect(result.current.invocation).toBeNull()
  })

  it('fetches events and builds transcript turns, stopping on a terminal invocation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [{
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 1,
        invocationId: 'inv-1',
        payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'hi' } },
        seq: 1,
        sessionId: 's1',
        type: 'assistant_delta',
      }],
      invocation: { id: 'inv-1', status: 'succeeded' },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useInvocationEvents('inv-1', { eventSource: false, intervalMs: 10 }))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(1)
    })
    const assistant = result.current.turns[0]!.items.find(item => item.kind === 'assistant-markdown')
    expect(assistant).toMatchObject({ kind: 'assistant-markdown', markdown: 'hi' })
    expect(result.current.invocation).toMatchObject({ id: 'inv-1', status: 'succeeded' })

    // terminal invocation → polling stops; the events route is queried with the id cursor.
    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-1/events?after=0', expect.any(Object))
  })

  it('falls back to polling when no session id is available', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [{
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 1,
        invocationId: 'inv-poll-fallback',
        payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'polling fallback' } },
        seq: 1,
        sessionId: 's1',
        type: 'assistant_delta',
      }],
      invocation: { id: 'inv-poll-fallback', status: 'succeeded' },
    })))
    const instances: Array<{ url: string }> = []
    class FakeEventSource {
      constructor(readonly url: string) {
        instances.push({ url })
      }

      close() {}
    }

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', FakeEventSource)

    const { result } = renderHook(() => useInvocationEvents('inv-poll-fallback', {
      intervalMs: 10,
    }))

    await waitFor(() => {
      expect(result.current.turns[0]?.items[0]).toMatchObject({ kind: 'assistant-markdown', markdown: 'polling fallback' })
    })
    expect(instances).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-poll-fallback/events?after=0', expect.any(Object))
  })

  it('uses EventSource by default so the browser follows the SSE stream', async () => {
    const fetchMock = vi.fn()
    const instances: FakeEventSource[] = []
    class FakeEventSource {
      readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>()
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      closed = false
      constructor(readonly url: string) {
        instances.push(this)
      }

      addEventListener(event: string, listener: (event: MessageEvent) => void) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      }

      removeEventListener(event: string, listener: (event: MessageEvent) => void) {
        this.listeners.set(event, (this.listeners.get(event) ?? []).filter(item => item !== listener))
      }

      close() {
        this.closed = true
      }

      emit(data: unknown) {
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
      }

      emitDone(cursor: number) {
        for (const listener of this.listeners.get('done') ?? [])
          listener({ data: String(cursor) } as MessageEvent)
      }
    }

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', FakeEventSource)

    const { result } = renderHook(() => useInvocationEvents('inv-sse', {
      initialEvents: [],
      initialInvocation: { id: 'inv-sse', status: 'running' },
      intervalMs: 10,
      sessionId: 'session-sse',
    }))

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    expect(instances[0]!.url).toBe('/api/engine/invocations/inv-sse/events?after=0')

    instances[0]!.emit({
      data: { text: 'streamed over sse' },
      id: 9,
      invocationId: 'inv-sse',
      type: 'invocation.output.delta',
    })

    await waitFor(() => {
      expect(result.current.turns[0]?.items[0]).toMatchObject({ kind: 'assistant-markdown', markdown: 'streamed over sse' })
    })
    instances[0]!.emitDone(9)

    await waitFor(() => {
      expect(instances[0]!.closed).toBe(true)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
