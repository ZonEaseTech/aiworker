// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useInvocationEvents } from './use-invocation-events'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

interface FakeEventSourceInstance {
  closed: boolean
  url: string
  emit: (data: unknown) => void
  emitDone: (cursor: number) => void
}

function installFakeEventSource(): FakeEventSourceInstance[] {
  const instances: FakeEventSourceInstance[] = []

  class FakeEventSource implements FakeEventSourceInstance {
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

  vi.stubGlobal('EventSource', FakeEventSource)
  return instances
}

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
    const instances = installFakeEventSource()

    vi.stubGlobal('fetch', fetchMock)

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
    const instances = installFakeEventSource()

    vi.stubGlobal('fetch', fetchMock)

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

    act(() => {
      instances[0]!.emit({
        data: { text: 'streamed over sse' },
        id: 9,
        invocationId: 'inv-sse',
        type: 'invocation.output.delta',
      })
    })

    await waitFor(() => {
      expect(result.current.turns[0]?.items[0]).toMatchObject({ kind: 'assistant-markdown', markdown: 'streamed over sse' })
    })
    instances[0]!.emitDone(9)

    await waitFor(() => {
      expect(instances[0]!.closed).toBe(true)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-sse/events?after=9', expect.any(Object))
  })

  it('publishes terminal status from SSE events instead of keeping the seeded running invocation', async () => {
    const fetchMock = vi.fn()
    const instances = installFakeEventSource()

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useInvocationEvents('inv-sse-terminal-direct', {
      initialInvocation: { id: 'inv-sse-terminal-direct', status: 'running' },
      intervalMs: 1000,
      sessionId: 'session-sse',
    }))

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })

    act(() => {
      instances[0]!.emit({
        id: 11,
        invocationId: 'inv-sse-terminal-direct',
        type: 'invocation.completed',
      })
    })

    await waitFor(() => {
      expect(result.current.invocation).toMatchObject({ id: 'inv-sse-terminal-direct', status: 'succeeded' })
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reattaches the JSON tail on SSE done before closing the stream', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      events: [{
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 5,
        invocationId: 'inv-sse-tail',
        payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'tail from json reattach' } },
        seq: 5,
        sessionId: 'session-sse',
        type: 'assistant_delta',
      }],
      invocation: { id: 'inv-sse-tail', status: 'succeeded' },
    })))
    const instances = installFakeEventSource()

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useInvocationEvents('inv-sse-tail', {
      initialInvocation: { id: 'inv-sse-tail', status: 'running' },
      sessionId: 'session-sse',
    }))

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    act(() => {
      instances[0]!.emit({
        id: 4,
        invocationId: 'inv-sse-tail',
        label: 'running',
        type: 'invocation.progress',
      })
      instances[0]!.emitDone(5)
    })

    await waitFor(() => {
      expect(result.current.turns[0]?.items.some(item => item.kind === 'assistant-markdown')).toBe(true)
    })
    expect(result.current.invocation).toMatchObject({ id: 'inv-sse-tail', status: 'succeeded' })
    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-sse-tail/events?after=4', expect.any(Object))
    expect(instances[0]!.closed).toBe(true)
  })

  it('polls the JSON tail while SSE is open so missed tail frames still appear', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('after=0')) {
        return new Response(JSON.stringify({
          events: [],
          invocation: { id: 'inv-sse-poll-tail', status: 'running' },
        }))
      }
      return new Response(JSON.stringify({
        events: [{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 5,
          invocationId: 'inv-sse-poll-tail',
          payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'tail from scheduled poll' } },
          seq: 5,
          sessionId: 'session-sse',
          type: 'assistant_delta',
        }],
        invocation: { id: 'inv-sse-poll-tail', status: 'succeeded' },
      }))
    })
    const instances = installFakeEventSource()

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useInvocationEvents('inv-sse-poll-tail', {
      initialInvocation: { id: 'inv-sse-poll-tail', status: 'running' },
      intervalMs: 1,
      sessionId: 'session-sse',
    }))

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    act(() => {
      instances[0]!.emit({
        id: 4,
        invocationId: 'inv-sse-poll-tail',
        label: 'running',
        type: 'invocation.progress',
      })
    })

    await waitFor(() => {
      expect(result.current.turns[0]?.items.some(item => item.kind === 'assistant-markdown')).toBe(true)
    })
    expect(result.current.invocation).toMatchObject({ id: 'inv-sse-poll-tail', status: 'succeeded' })
    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-sse-poll-tail/events?after=4', expect.any(Object))
    expect(instances[0]!.closed).toBe(true)
  })

  it('does not reset collected SSE events when the same initial invocation reports a terminal status', async () => {
    const fetchMock = vi.fn()
    const instances = installFakeEventSource()

    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ status }: { status: 'running' | 'succeeded' }) => useInvocationEvents('inv-status-echo', {
        initialEvents: [{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-status-echo',
          payloadJson: { status: 'running' },
          seq: 1,
          sessionId: 'session-sse',
          type: 'status',
        }],
        initialInvocation: { id: 'inv-status-echo', status },
        intervalMs: 1000,
        sessionId: 'session-sse',
      }),
      { initialProps: { status: 'running' } },
    )

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    act(() => {
      instances[0]!.emit({
        data: { text: 'kept after status echo' },
        id: 7,
        invocationId: 'inv-status-echo',
        type: 'invocation.output.delta',
      })
    })

    await waitFor(() => {
      expect(result.current.turns[0]?.items.some(item => item.kind === 'assistant-markdown')).toBe(true)
    })

    rerender({ status: 'succeeded' })

    await waitFor(() => {
      expect(result.current.turns[0]?.items.some(item => item.kind === 'assistant-markdown')).toBe(true)
    })
    expect(instances).toHaveLength(1)
  })
})
