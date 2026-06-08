// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.resetModules()
})

// API_BASE is resolved once at module load from window.location.pathname, so each
// case sets the entry path first, then re-imports the module to recompute it.
async function loadBasePathAt(pathname: string) {
  window.history.replaceState(null, '', pathname)
  vi.resetModules()
  return import('./base-path')
}

describe('base-path', () => {
  it('derives the worker prefix from the Host-tunneled entry URL', async () => {
    const { API_BASE, apiUrl } = await loadBasePathAt('/workers/w_X')
    expect(API_BASE).toBe('/workers/w_X')
    expect(apiUrl('/api/sessions')).toBe('/workers/w_X/api/sessions')
  })

  it('keeps the worker prefix when the SPA navigates to a sub-route', async () => {
    const { API_BASE, apiUrl } = await loadBasePathAt('/workers/w_X/workspaces/ws')
    expect(API_BASE).toBe('/workers/w_X')
    expect(apiUrl('/api/engine/invocations/inv_1/events?after=0')).toBe(
      '/workers/w_X/api/engine/invocations/inv_1/events?after=0',
    )
  })

  it('uses an empty base at the standalone root entry so absolute API paths are unchanged', async () => {
    const { API_BASE, apiUrl } = await loadBasePathAt('/')
    expect(API_BASE).toBe('')
    expect(apiUrl('/api/sessions')).toBe('/api/sessions')
  })

  it('uses an empty base for standalone session sub-routes without a /workers prefix', async () => {
    const { API_BASE, apiUrl } = await loadBasePathAt('/workspaces/ws/sessions/s_1')
    expect(API_BASE).toBe('')
    expect(apiUrl('/api/sessions/s_1')).toBe('/api/sessions/s_1')
  })

  it('prefers the synchronous window.__AIWORKER_API_BASE__ computed in index.html', async () => {
    // index.html sets this before any module runs; the client must reuse it
    // rather than recomputing, so both agree at any route depth.
    window.history.replaceState(null, '', '/workers/w_X/workspaces/ws')
    ;(window as unknown as { __AIWORKER_API_BASE__?: string }).__AIWORKER_API_BASE__ = '/workers/w_X'
    vi.resetModules()
    const { API_BASE } = await import('./base-path')
    expect(API_BASE).toBe('/workers/w_X')
    delete (window as unknown as { __AIWORKER_API_BASE__?: string }).__AIWORKER_API_BASE__
  })

  it('documents why a document <base href> (not document-relative urls) is required at depth', () => {
    // Root cause of the original bug: relative `./assets/x` resolves against the
    // document directory, so at a deep route it escapes the worker asset root.
    // The index.html <base href> pins resolution to the prefix root instead.
    const deep = new URL('./assets/x', 'http://h/workers/w_X/workspaces/ws/sessions/s_1')
    expect(deep.pathname).toBe('/workers/w_X/workspaces/ws/sessions/assets/x')
    expect(deep.pathname).not.toBe('/assets/x')
    // With <base href="/workers/w_X/"> the same relative ref lands at the root.
    const withBase = new URL('./assets/x', 'http://h/workers/w_X/')
    expect(withBase.pathname).toBe('/workers/w_X/assets/x')
  })
})
