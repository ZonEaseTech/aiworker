/**
 * Runtime API base path for same-origin requests.
 *
 * The Workbench SPA can be served two ways:
 *  - Standalone (worker-owned web): the SPA lives at the origin root, so API
 *    requests use absolute `/api/...` paths (base === '').
 *  - Behind the Host tunnel: the SPA lives under `/workers/:id/`, and the Host
 *    strips that prefix before forwarding to the Worker. The browser, however,
 *    must request `/workers/:id/api/...` (and `/workers/:id/assets/...`) so the
 *    request reaches the Host worker route instead of the Host root (404).
 *
 * The prefix is computed synchronously in index.html (before Vite's asset tags,
 * so the `<base href>` it sets covers relative assets at any route depth) and
 * exposed as `window.__AIWORKER_API_BASE__`. This module reuses that single
 * source of truth and falls back to the pathname when it is absent (tests, SSR,
 * non-browser). The Worker prefix is bound to the entry URL for the lifetime of
 * the document, so recomputing per-request is unnecessary and SPA navigation
 * never changes the `/workers/:id` segment.
 */
declare global {
  interface Window {
    __AIWORKER_API_BASE__?: string
  }
}

function resolveApiBase(): string {
  if (typeof window === 'undefined')
    return ''
  if (typeof window.__AIWORKER_API_BASE__ === 'string')
    return window.__AIWORKER_API_BASE__
  if (!window.location)
    return ''
  const match = /^\/workers\/[^/]+/.exec(window.location.pathname)
  return match ? match[0] : ''
}

export const API_BASE = resolveApiBase()

/**
 * Prefix a same-origin API/asset path with the runtime {@link API_BASE}. A root
 * (standalone) document returns the path unchanged; a Host-tunneled document
 * returns `/workers/:id` + path so the request reaches the Worker route.
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
