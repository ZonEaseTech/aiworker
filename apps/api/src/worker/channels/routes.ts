import type { ChannelRegistry } from './registry'
import { OpenAPIHono } from '@hono/zod-openapi'
import consola from 'consola'

import { AppError } from '../../shared'

export function buildChannelRoutes(registry: ChannelRegistry, workerId: string, onEnvelope: (envelope: unknown) => void | Promise<void>) {
  const routes = new OpenAPIHono()

  routes.post('/:channel/webhook', async (c) => {
    const channel = c.req.param('channel') as import('@aiworker/shared').ChannelType
    const binding = registry.get(channel)
    if (!binding)
      throw AppError.notFound(`Channel ${channel} is not bound to this worker`)
    const adapter = registry.adapter(channel)
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
      await onEnvelope(env)
    return c.json({ ok: true, accepted: envelopes.length })
  })

  return routes
}
