import { WORKER_API_TOKEN_PATTERN } from '@aiworker/shared'
import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import {
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from './client'
import { registerWorker, RegistryConflictError } from './service'

const registerBody = z.object({
  baseUrl: z.string().url(),
  apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN, 'apiToken must match wtk_<base64url>'),
  displayName: z.string().min(1).max(80),
})

export interface RegistryRoutesOptions {
  masterKeyHex: string
}

/**
 * Build the manager's `/api/workers` registry router. PLAN-004 3.1 only
 * mounts `POST /register`; 3.2 adds list/get/patch/delete and a proxy; 3.3
 * adds the liveness poller.
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

  return routes
}
