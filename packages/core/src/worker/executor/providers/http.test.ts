import type { AgentEvent } from '@zonease/aiworker-shared'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'

import { OpenAICompatibleExecutor } from './http'

type FetchFn = typeof globalThis.fetch
type MockFetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function sseResponse(lines: string[], status = 200): Response {
  const body = `${lines.join('\n\n')}\n\n`
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function chunkedSseResponse(parts: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const part of parts)
        controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function textChunk(id: string, content: string, finishReason: string | null = null): string {
  const obj = {
    id,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-4o-mini',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: finishReason,
    }],
  }
  return `data: ${JSON.stringify(obj)}`
}

function toolCallChunk(
  id: string,
  toolIndex: number,
  fields: { id?: string, name?: string, args?: string },
  finishReason: string | null = null,
): string {
  const obj = {
    id,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-4o-mini',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: toolIndex,
          ...(fields.id ? { id: fields.id } : {}),
          type: 'function',
          function: {
            ...(fields.name ? { name: fields.name } : {}),
            ...(fields.args !== undefined ? { arguments: fields.args } : {}),
          },
        }],
      },
      finish_reason: finishReason,
    }],
  }
  return `data: ${JSON.stringify(obj)}`
}

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const event of iter)
    out.push(event)
  return out
}

describe('OpenAICompatibleExecutor', () => {
  const originalFetch = globalThis.fetch
  let fetchSpy: ReturnType<typeof spyOn<{ fetch: FetchFn }, 'fetch'>> | null = null

  beforeEach(() => {
    fetchSpy = null
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    globalThis.fetch = originalFetch
  })

  function mockFetch(impl: MockFetchImpl) {
    const holder = { fetch: impl as unknown as FetchFn }
    fetchSpy = spyOn(holder, 'fetch')
    globalThis.fetch = holder.fetch as FetchFn
    return fetchSpy
  }

  it('streams assistant_message_delta events in order', async () => {
    mockFetch(async () => sseResponse([
      textChunk('c1', 'Hello'),
      textChunk('c1', ', '),
      textChunk('c1', 'world!', 'stop'),
      'data: [DONE]',
    ]))

    const executor = new OpenAICompatibleExecutor({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      timeoutMs: 5_000,
    })

    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hi' }],
    }))

    const texts = events
      .filter(e => e.type === 'assistant_message_delta')
      .map(e => (e as { type: 'assistant_message_delta', delta: string }).delta)
    expect(texts).toEqual(['Hello', ', ', 'world!'])

    const finish = events.find(e => e.type === 'finish')
    expect(finish).toBeDefined()
    expect((finish as { reason: string }).reason).toBe('stop')
  })

  it('assembles tool_call deltas into a single tool_use event with a tool-kind action', async () => {
    mockFetch(async () => sseResponse([
      toolCallChunk('c1', 0, { id: 'call_abc', name: 'get_weather', args: '{"loc' }),
      toolCallChunk('c1', 0, { args: 'ation":' }),
      toolCallChunk('c1', 0, { args: '"Tokyo"}' }, 'tool_calls'),
      'data: [DONE]',
    ]))

    const executor = new OpenAICompatibleExecutor({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      timeoutMs: 5_000,
    })

    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'weather?' }],
    }))

    const toolUses = events.filter(e => e.type === 'tool_use')
    expect(toolUses).toHaveLength(1)
    const only = toolUses[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(only.id).toBe('call_abc')
    expect(only.name).toBe('get_weather')
    expect(only.arguments).toEqual({ location: 'Tokyo' })
    expect(only.action.kind).toBe('tool')

    const finish = events.find(e => e.type === 'finish') as Extract<AgentEvent, { type: 'finish' }> | undefined
    expect(finish?.reason).toBe('tool')
  })

  it('emits error event and terminates on non-2xx response', async () => {
    mockFetch(async () => new Response('rate limit exceeded', {
      status: 429,
      statusText: 'Too Many Requests',
    }))

    const executor = new OpenAICompatibleExecutor({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      timeoutMs: 5_000,
    })

    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hi' }],
    }))

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
    const err = events[0] as Extract<AgentEvent, { type: 'error' }>
    expect(err.error).toContain('429')
    expect(err.error).not.toContain('test-key')
  })

  it('handles SSE events split across multiple stream chunks', async () => {
    const firstChunk = textChunk('c1', 'part1')
    const secondChunk = textChunk('c1', 'part2', 'stop')
    const full = `${firstChunk}\n\n${secondChunk}\n\ndata: [DONE]\n\n`
    const mid = Math.floor(full.length / 2)

    mockFetch(async () => chunkedSseResponse([full.slice(0, mid), full.slice(mid)]))

    const executor = new OpenAICompatibleExecutor({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      timeoutMs: 5_000,
    })

    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hi' }],
    }))

    const texts = events
      .filter(e => e.type === 'assistant_message_delta')
      .map(e => (e as Extract<AgentEvent, { type: 'assistant_message_delta' }>).delta)
    expect(texts).toEqual(['part1', 'part2'])
  })

  it('reports health "down" when API key is missing', async () => {
    const executor = new OpenAICompatibleExecutor({
      baseUrl: 'https://api.openai.com',
      apiKey: undefined,
      model: 'gpt-4o-mini',
      timeoutMs: 5_000,
    })
    const status = await executor.health()
    expect(status.status).toBe('down')
    expect(status.name).toBe('openai-compatible')
  })

  it('run yields error when API key is missing', async () => {
    const executor = new OpenAICompatibleExecutor({
      baseUrl: 'https://api.openai.com',
      apiKey: undefined,
      model: 'gpt-4o-mini',
      timeoutMs: 5_000,
    })
    const events = await collect(executor.run({
      messages: [{ role: 'user', content: 'hi' }],
    }))
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
  })
})
