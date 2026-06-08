// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.resetModules()
  vi.unstubAllGlobals()
})

interface FakeEventSourceInstance {
  url: string
}

function installFakeEventSource(): FakeEventSourceInstance[] {
  const instances: FakeEventSourceInstance[] = []
  class FakeEventSource implements FakeEventSourceInstance {
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor(readonly url: string) {
      instances.push(this)
    }

    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  vi.stubGlobal('EventSource', FakeEventSource)
  return instances
}

// API_BASE is resolved at module load, so set the Host-tunneled entry path,
// reset modules, then dynamically import the hook to recompute the prefix.
async function loadHookAt(pathname: string) {
  window.history.replaceState(null, '', pathname)
  vi.resetModules()
  return (await import('./use-invocation-events')).useInvocationEvents
}

describe('useInvocationEvents EventSource base path', () => {
  it('prefixes the SSE EventSource URL with the worker base under the Host tunnel', async () => {
    const instances = installFakeEventSource()
    vi.stubGlobal('fetch', vi.fn())
    const useInvocationEvents = await loadHookAt('/workers/w_X/workspaces/ws/sessions/s_1')

    renderHook(() => useInvocationEvents('inv-sse', {
      initialEvents: [],
      initialInvocation: { id: 'inv-sse', status: 'running' },
      intervalMs: 10,
      sessionId: 'session-sse',
    }))

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    expect(instances[0]!.url).toBe('/workers/w_X/api/engine/invocations/inv-sse/events?after=0')
  })

  it('leaves the SSE EventSource URL absolute at the standalone root entry', async () => {
    const instances = installFakeEventSource()
    vi.stubGlobal('fetch', vi.fn())
    const useInvocationEvents = await loadHookAt('/')

    renderHook(() => useInvocationEvents('inv-sse', {
      initialEvents: [],
      initialInvocation: { id: 'inv-sse', status: 'running' },
      intervalMs: 10,
      sessionId: 'session-sse',
    }))

    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    expect(instances[0]!.url).toBe('/api/engine/invocations/inv-sse/events?after=0')
  })
})
