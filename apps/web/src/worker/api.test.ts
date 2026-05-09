import type { WorkerSSEEvent } from './api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { continueConversation, getInfo, getReviewFile, getWorkerArtifact, listReviews, listRuns, listWorkerArtifacts, promoteReviewLessons, rerunReview, submitTask, subscribeEvents, testExecutor } from './api'
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
    window.history.pushState(null, '', '/')
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

  it('posts prompts to the worker runs path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      run: {
        id: 'run-new',
        status: 'queued',
        prompt: 'hello',
        createdAt: '2026-05-02T21:00:00.000Z',
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 201,
    }))

    const task = await submitTask('hello')

    expect(task.id).toBe('run-new')
    expect(fetchMock).toHaveBeenCalledWith('/api/worker/runs', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ prompt: 'hello' }),
    })
  })

  it('lists worker runs from the worker runs path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      runs: [
        {
          id: 'run-1',
          status: 'succeeded',
          prompt: 'done',
          createdAt: '2026-05-09T08:00:00.000Z',
        },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))

    const result = await listRuns()

    expect(result.runs[0]?.id).toBe('run-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/worker/runs', {
      headers: expect.any(Headers),
    })
  })

  it('uses worker artifact metadata REST paths for list/show', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        artifacts: [
          {
            conversationId: 'conv-1',
            createdAt: '2026-05-09T09:00:00.000Z',
            hash: null,
            id: 'artifact-1',
            kind: 'markdown',
            metadata: {},
            mimeType: 'text/markdown',
            relativePath: 'reports/summary.md',
            runId: 'run-1',
            sizeBytes: 42,
            source: 'executor',
            status: 'available',
            title: 'Summary',
            updatedAt: '2026-05-09T09:00:00.000Z',
          },
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        artifact: { id: 'artifact/with/slash', relativePath: 'reports/detail.md' },
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))

    const listed = await listWorkerArtifacts({ runId: 'run-1', status: 'available', limit: 12 })
    const shown = await getWorkerArtifact('artifact/with/slash')

    expect(listed.artifacts[0]?.relativePath).toBe('reports/summary.md')
    expect(shown.artifact.id).toBe('artifact/with/slash')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/worker/artifacts?runId=run-1&status=available&limit=12')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/worker/artifacts/artifact%2Fwith%2Fslash')
  })

  it('posts continuation prompts to the worker runs path with conversationId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      run: {
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
    expect(fetchMock).toHaveBeenCalledWith('/api/worker/runs', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ conversationId: 'conv/with/slash', prompt: 'hello' }),
    })
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('uses Worker Review REST paths for list/show/rerun/lesson promotion', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ reviews: [] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ review: { taskId: 'task/with/slash' } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run: { id: 'rerun-1' } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ promotion: { proposals: [] } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }))

    await listReviews(12)
    await getReviewFile('task/with/slash')
    await rerunReview('task/with/slash', 'repair')
    await promoteReviewLessons('task/with/slash')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/worker/reviews?limit=12')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/worker/reviews/task%2Fwith%2Fslash')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/worker/reviews/task%2Fwith%2Fslash/rerun')
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify({ prompt: 'repair' }),
      method: 'POST',
    })
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/worker/reviews/task%2Fwith%2Fslash/lessons/promote')
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({}),
      method: 'POST',
    })
  })

  it('attaches bearer Authorization on fleet-hosted worker bridge requests', async () => {
    const originalUrl = window.location.href
    window.history.pushState(null, '', '/w/w_aaaabbbbcccd/config')
    setBearerToken('wtk_test_token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      brains: [],
      channels: [],
      configVersion: 1,
      executor: { type: 'codex', status: 'healthy' },
      startedAt: '2026-05-06T00:00:00.000Z',
      workerId: 'w_aaaabbbbcccd',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))

    await getInfo()

    expect(fetchMock).toHaveBeenCalledWith('/w/w_aaaabbbbcccd/api/worker/info', {
      headers: expect.any(Headers),
    })
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer wtk_test_token')

    window.history.pushState(null, '', originalUrl)
  })

  it('attaches bearer Authorization on fleet-hosted worker SSE bridge requests', async () => {
    const originalUrl = window.location.href
    window.history.pushState(null, '', '/w/w_aaaabbbbcccd/')
    setBearerToken('wtk_test_token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
      ': connected\n\n',
    ]))

    await subscribeEvents(new AbortController().signal, () => {})

    expect(fetchMock).toHaveBeenCalledWith('/w/w_aaaabbbbcccd/api/worker/events/stream', {
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
    })
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Accept')).toBe('text/event-stream')
    expect(headers.get('Authorization')).toBe('Bearer wtk_test_token')

    window.history.pushState(null, '', originalUrl)
  })

  it('normalizes top-level bearer auth failures without exposing raw JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'auth-failed',
      message: 'missing Authorization header',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    }))

    await expect(getInfo()).rejects.toMatchObject({
      code: 'auth-required',
      message: 'missing Authorization header',
      name: 'WorkerApiError',
      status: 401,
    })
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
