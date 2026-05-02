import type { WorkerSSEEvent } from './api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeEvents } from './api'
import { __resetBearerForTests, setBearerToken } from './lib/auth'

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  })
}

describe('worker api subscribeEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    __resetBearerForTests()
  })

  it('ignores SSE keepalive comments and delivers a later event', async () => {
    setBearerToken('wtk_test_token')
    const events: WorkerSSEEvent[] = []
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
      ': connected\n\n',
      ': keepalive\n\n',
      'event: orchestrator.finished\n',
      'data: {"conversationId":"conv-1","taskId":"task-1"}\n\n',
    ]))

    await subscribeEvents(new AbortController().signal, event => events.push(event))

    expect(fetchMock).toHaveBeenCalledWith('/api/worker/events/stream', {
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
    })
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer wtk_test_token')
    expect(events).toEqual([
      {
        type: 'orchestrator.finished',
        data: { conversationId: 'conv-1', taskId: 'task-1' },
      },
    ])
  })
})
