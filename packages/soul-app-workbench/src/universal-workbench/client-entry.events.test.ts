import type { LocalSessionEvent } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'

import { isTerminalSessionStatus, loadSessionEvents, mergeSessionEvents } from './client-entry'

describe('universal workbench mounted session events', () => {
  it('loads incremental session events through the mounted API and merges them without duplicate replay', async () => {
    const originalFetch = globalThis.fetch
    const requestedUrls: string[] = []
    globalThis.fetch = (async (input) => {
      requestedUrls.push(String(input))
      return Response.json({
        events: [
          sessionEvent({ id: 2, seq: 2, type: 'assistant_delta' }),
          sessionEvent({ id: 3, seq: 3, type: 'tool' }),
        ],
      })
    }) as typeof fetch

    try {
      const nextEvents = await loadSessionEvents('/mounted', 'worker-1', 'session-1', 1)

      expect(requestedUrls).toEqual(['/mounted/api/sessions/session-1/events?workerId=worker-1&after=1'])
      expect(mergeSessionEvents([
        sessionEvent({ id: 1, seq: 1, type: 'status' }),
        sessionEvent({ id: 2, seq: 2, type: 'assistant_delta' }),
      ], nextEvents)).toEqual([
        sessionEvent({ id: 1, seq: 1, type: 'status' }),
        sessionEvent({ id: 2, seq: 2, type: 'assistant_delta' }),
        sessionEvent({ id: 3, seq: 3, type: 'tool' }),
      ])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('detects terminal session statuses used to stop mounted polling', () => {
    expect(isTerminalSessionStatus('failed')).toBe(true)
    expect(isTerminalSessionStatus('succeeded')).toBe(true)
    expect(isTerminalSessionStatus('cancelled')).toBe(true)
    expect(isTerminalSessionStatus('completed')).toBe(true)
    expect(isTerminalSessionStatus('active')).toBe(false)
    expect(isTerminalSessionStatus('running')).toBe(false)
    expect(isTerminalSessionStatus(null)).toBe(false)
  })
})

function sessionEvent(input: {
  id: number
  seq: number
  type: LocalSessionEvent['type']
}): LocalSessionEvent {
  return {
    createdAt: '2026-05-23T00:00:00.000Z',
    id: input.id,
    invocationId: null,
    payloadJson: {},
    seq: input.seq,
    sessionId: 'session-1',
    turnId: null,
    type: input.type,
  }
}
