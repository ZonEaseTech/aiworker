import { describe, expect, it } from 'bun:test'

import { invocationEventStreamPath, submitInvocation } from './broker-client'

describe('broker-client', () => {
  it('POSTs a session-level invocation and returns the new invocation id', async () => {
    const calls: Array<{ body: unknown, method?: string, url: string }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ body: init?.body ? JSON.parse(init.body as string) : undefined, method: init?.method, url })
      return new Response(JSON.stringify({ invocation: { id: 'inv-42', status: 'running' } }), {
        headers: { 'content-type': 'application/json' },
        status: 201,
      })
    }) as unknown as typeof fetch

    const result = await submitInvocation('sess-1', 'hello engine', fetchImpl)

    expect(result.invocationId).toBe('inv-42')
    expect(calls).toEqual([{ body: { input: 'hello engine' }, method: 'POST', url: '/api/sessions/sess-1/invocations' }])
  })

  it('throws when the broker rejects the invocation', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { code: 'NOPE' } }), { status: 400 })) as unknown as typeof fetch
    await expect(submitInvocation('sess-1', 'x', fetchImpl)).rejects.toThrow()
  })

  it('builds the invocation-scoped SSE event-stream path', () => {
    expect(invocationEventStreamPath('inv-42')).toBe('/api/engine/invocations/inv-42/events')
  })
})
