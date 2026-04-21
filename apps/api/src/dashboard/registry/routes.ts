import { WORKER_API_TOKEN_PATTERN } from '@aiworker/shared'
import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import {
  WorkerClient,
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from './client'
import {
  decryptTokenFor,
  deleteWorker,
  getById,
  getWorkerById,
  listWorkers,
  recordAuditEvent,
  registerWorker,
  RegistryConflictError,
  RegistryNotFoundError,
  updateWorker,
} from './service'

const registerBody = z.object({
  baseUrl: z.string().url(),
  apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN, 'apiToken must match wtk_<base64url>'),
  displayName: z.string().min(1).max(80),
})

const updateBody = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    baseUrl: z.string().url().optional(),
  })
  .refine(value => value.displayName !== undefined || value.baseUrl !== undefined, {
    message: 'at least one of displayName or baseUrl must be provided',
  })

export interface RegistryRoutesOptions {
  masterKeyHex: string
  /** Test hook — swap in an in-memory `WorkerClient` for the proxy route. */
  buildProxyClient?: (baseUrl: string, apiToken: string) => Pick<WorkerClient, 'passThrough'>
}

/** Hop-by-hop request headers the manager must never forward to workers. */
const STRIPPED_REQUEST_HEADERS = new Set([
  'authorization',
  'host',
  'connection',
  'content-length',
])

/** Hop-by-hop response headers the manager must not forward back to callers. */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
])

/**
 * Build the manager's `/api/workers` registry router:
 *   POST   /register                       — 3.1
 *   GET    /                               — 3.2
 *   GET    /:id                            — 3.2
 *   PATCH  /:id                            — 3.2
 *   DELETE /:id                            — 3.2
 *   ALL    /:id/proxy/worker/*             — 3.2 transparent pass-through
 */
export function buildRegistryRoutes(options: RegistryRoutesOptions) {
  const routes = new OpenAPIHono()

  routes.post('/register', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = registerBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid register payload',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }

    try {
      const row = await registerWorker(parsed.data, { masterKeyHex: options.masterKeyHex })
      // The bearer token never leaves the manager process — strip the
      // encrypted-at-rest columns before returning the row.
      return c.json({
        id: row.id,
        baseUrl: row.baseUrl,
        displayName: row.displayName,
        addedAt: row.addedAt,
        addedBy: row.addedBy,
        lastSeenAt: row.lastSeenAt,
        lastSeenState: row.lastSeenState,
        lastConfigVersion: row.lastConfigVersion,
      }, 201)
    }
    catch (err) {
      if (err instanceof RegistryConflictError)
        return c.json({ error: { code: 'already-registered', workerId: err.workerId } }, 409)
      if (err instanceof WorkerClientAuthError)
        return c.json({ error: { code: 'auth-failed' } }, 401)
      if (err instanceof WorkerClientNetworkError)
        return c.json({ error: { code: 'worker-unreachable', message: err.message } }, 502)
      if (err instanceof WorkerClientInvalidResponseError)
        return c.json({ error: { code: 'invalid-worker-info', message: err.message } }, 502)
      throw err
    }
  })

  routes.get('/', (c) => {
    return c.json({ workers: listWorkers() })
  })

  routes.get('/:id', (c) => {
    const row = getWorkerById(c.req.param('id'))
    if (!row)
      return c.json({ error: { code: 'not-found' } }, 404)
    return c.json(row)
  })

  routes.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json().catch(() => null)
    const parsed = updateBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid patch payload',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const row = updateWorker(id, parsed.data)
      return c.json(row)
    }
    catch (err) {
      if (err instanceof RegistryNotFoundError)
        return c.json({ error: { code: 'not-found' } }, 404)
      throw err
    }
  })

  routes.delete('/:id', (c) => {
    try {
      deleteWorker(c.req.param('id'))
      return c.body(null, 204)
    }
    catch (err) {
      if (err instanceof RegistryNotFoundError)
        return c.json({ error: { code: 'not-found' } }, 404)
      throw err
    }
  })

  // Transparent pass-through: ALL /api/workers/:id/proxy/worker/*
  //
  // The route extracts the trailing path segment, decrypts the registered
  // bearer token, and forwards the request to {baseUrl}/api/worker/<path>
  // via WorkerClient.passThrough. The raw Response (status + body +
  // content-type) is returned unchanged, modulo hop-by-hop header stripping.
  // Non-GET traffic is audited as `worker.proxied` so the event log stays
  // useful without being flooded by 3.3's polling GETs.
  routes.all('/:id/proxy/worker/*', async (c) => {
    const id = c.req.param('id')
    const row = getById(id)
    if (!row)
      return c.json({ error: { code: 'not-found' } }, 404)

    const url = new URL(c.req.url)
    const marker = `/${id}/proxy/worker/`
    const markerIdx = url.pathname.indexOf(marker)
    const suffix = markerIdx === -1 ? '' : url.pathname.slice(markerIdx + marker.length)
    const proxyPath = suffix + url.search

    const method = c.req.method.toUpperCase()
    const forwardedHeaders: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase()))
        forwardedHeaders[key] = value
    })

    let forwardedBody: unknown
    if (method !== 'GET' && method !== 'HEAD') {
      const contentType = c.req.header('content-type') ?? ''
      if (contentType.includes('application/json')) {
        forwardedBody = await c.req.json().catch(() => undefined)
      }
      else {
        const buf = await c.req.arrayBuffer()
        forwardedBody = buf.byteLength > 0 ? buf : undefined
      }
    }

    const apiToken = decryptTokenFor(row, options.masterKeyHex)
    const client = options.buildProxyClient
      ? options.buildProxyClient(row.baseUrl, apiToken)
      : new WorkerClient({ baseUrl: row.baseUrl, apiToken })

    let upstream: Response
    try {
      upstream = await client.passThrough(method, proxyPath, forwardedBody, forwardedHeaders)
    }
    catch (err) {
      if (err instanceof WorkerClientNetworkError)
        return c.json({ error: { code: 'worker-unreachable', message: err.message } }, 502)
      throw err
    }

    if (method !== 'GET' && method !== 'HEAD') {
      recordAuditEvent({
        actor: 'dashboard',
        action: 'worker.proxied',
        workerId: id,
        detail: {
          method,
          path: suffix,
          upstreamStatus: upstream.status,
        },
      })
    }

    const responseHeaders = new Headers()
    upstream.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase()))
        responseHeaders.set(key, value)
    })
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  })

  return routes
}
