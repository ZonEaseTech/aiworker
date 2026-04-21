import type { Envelope } from '@aiworker/shared'
import type { WorkerRuntime } from '../runtime'
import { OpenAPIHono } from '@hono/zod-openapi'
import consola from 'consola'

import { AppError } from '../../shared'

/**
 * Channel webhook router. The `getRuntime` thunk is re-evaluated at every
 * request so that PLAN-004 2.2 hot-reloads swap in a fresh `ChannelRegistry`
 * + `Orchestrator` without re-mounting the router.
 */
export function buildChannelRoutes(getRuntime: () => WorkerRuntime, workerId: string) {
  const routes = new OpenAPIHono()

  routes.post('/:channel/webhook', async (c) => {
    const runtime = getRuntime()
    const channel = c.req.param('channel') as import('@aiworker/shared').ChannelType
    const binding = runtime.channels.get(channel)
    if (!binding)
      throw AppError.notFound(`Channel ${channel} is not bound to this worker`)
    const adapter = runtime.channels.adapter(channel)
    const rawBody = await c.req.text()
    const headers: Record<string, string | undefined> = {}
    c.req.raw.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })
    try {
      await adapter.verify(rawBody, headers, binding)
    }
    catch (err) {
      consola.warn(`[channel:${channel}] signature verification failed: ${String(err)}`)
      return c.json({ ok: false, error: 'signature verification failed' }, 401)
    }
    const envelopes = await adapter.toEnvelopes(rawBody, workerId)
    for (const env of envelopes)
      await runtime.orchestrator.ingest(env as Envelope)
    return c.json({ ok: true, accepted: envelopes.length })
  })

  return routes
}
