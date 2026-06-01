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

    const { result } = renderHook(() => useInvocationEvents('inv-1', { intervalMs: 10 }))

    await waitFor(() => {
      expect(result.current.turns).toHaveLength(1)
    })
    const assistant = result.current.turns[0]!.items.find(item => item.kind === 'assistant-markdown')
    expect(assistant).toMatchObject({ kind: 'assistant-markdown', markdown: 'hi' })
    expect(result.current.invocation).toMatchObject({ id: 'inv-1', status: 'succeeded' })

    // terminal invocation → polling stops; the events route is queried with the id cursor.
    expect(fetchMock).toHaveBeenCalledWith('/api/engine/invocations/inv-1/events?after=0', expect.any(Object))
  })
})
