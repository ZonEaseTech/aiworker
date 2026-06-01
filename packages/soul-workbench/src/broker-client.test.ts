import { describe, expect, it } from 'bun:test'

import { fetchEngineTargets, fetchWorkerConfig, fetchWorkspaceFiles, invocationEventStreamPath, submitInvocation } from './broker-client'

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

  it('lists workspace files for the artifacts surface', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ files: [{ id: 'f1', kind: 'generated', path: 'out/a.md' }] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }) as unknown as typeof fetch

    expect(await fetchWorkspaceFiles('ws-1', fetchImpl)).toEqual([{ id: 'f1', kind: 'generated', path: 'out/a.md' }])
    expect(calls).toEqual(['/api/workspace-locators/ws-1/files'])
  })

  it('throws when the workspace files request fails', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch
    await expect(fetchWorkspaceFiles('ws-1', fetchImpl)).rejects.toThrow()
  })

  it('reads worker config values from the config response', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ config: { values: [{ configKey: 'engine-selection', source: 'web', value: { kind: 'engine-selection' } }] }, workerId: 'w-1' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }) as unknown as typeof fetch

    expect(await fetchWorkerConfig('w-1', fetchImpl)).toEqual([{ configKey: 'engine-selection', source: 'web', value: { kind: 'engine-selection' } }])
    expect(calls).toEqual(['/api/workers/w-1/config'])
  })

  it('reads engine targets from the engine settings response', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ engines: [{ id: 'codex', installed: true, name: 'Codex' }] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }) as unknown as typeof fetch

    expect(await fetchEngineTargets(fetchImpl)).toEqual([{ id: 'codex', installed: true, name: 'Codex' }])
    expect(calls).toEqual(['/api/engine/targets'])
  })
})
