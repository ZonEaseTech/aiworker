import type { WorkerSSEEvent } from './api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { continueConversation, subscribeEvents, testExecutor } from './api'
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

  it('posts continuation prompts to the selected conversation messages path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      task: {
        id: 'task-continue',
        status: 'queued',
        prompt: 'hello',
        createdAt: '2026-05-02T21:00:00.000Z',
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 201,
    }))

    const task = await continueConversation('conv/with/slash', 'hello')

    expect(task.id).toBe('task-continue')
    expect(fetchMock).toHaveBeenCalledWith('/api/worker/orchestrator/conversations/conv%2Fwith%2Fslash/messages', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ prompt: 'hello' }),
    })
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('times out executor test requests and aborts the fetch', async () => {
    let signal: AbortSignal | undefined
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      signal = init?.signal as AbortSignal | undefined
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    })

    await expect(testExecutor({ probe: true }, { timeoutMs: 1 }))
      .rejects
      .toMatchObject({ code: 'network', message: 'executor test timed out after 1ms' })

    expect(fetchMock).toHaveBeenCalledWith('/api/worker/executor/test', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ probe: true }),
      signal: expect.any(AbortSignal),
    })
    expect(signal?.aborted).toBe(true)
  })
})
