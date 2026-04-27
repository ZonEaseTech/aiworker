import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { Envelope } from '@zonease/aiworker-shared'
import { OpenAPIHono } from '@hono/zod-openapi'

import { AppError } from '@zonease/aiworker-shared'
import consola from 'consola'

/**
 * Channel webhook router. The `getRuntime` thunk is re-evaluated at every
 * request so that PLAN-004 2.2 hot-reloads swap in a fresh `ChannelRegistry`
 * + `Orchestrator` without re-mounting the router.
 */
export function buildChannelRoutes(getRuntime: () => WorkerRuntime, workerId: string) {
  const routes = new OpenAPIHono()

  // Meta Cloud API subscription challenge. Must be registered before the
  // generic `:channel/webhook` POST so the GET variant is not swallowed.
  routes.get('/whatsapp/webhook', (c) => {
    const runtime = getRuntime()
    const binding = runtime.channels.get('whatsapp')
    if (!binding || binding.credentials.channel !== 'whatsapp')
      return c.text('whatsapp channel is not bound to this worker', 404)
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge') ?? ''
    if (mode === 'subscribe' && token === binding.credentials.verifyToken)
      return c.text(challenge, 200)
    return c.text('forbidden', 403)
  })

  routes.post('/:channel/webhook', async (c) => {
    const runtime = getRuntime()
    const channel = c.req.param('channel') as import('@zonease/aiworker-shared').ChannelType
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
    const envelopes = await adapter.toEnvelopes(rawBody, workerId, binding)
    for (const env of envelopes)
      await runtime.orchestrator.ingest(env as Envelope)
    return c.json({ ok: true, accepted: envelopes.length })
  })

  return routes
}
