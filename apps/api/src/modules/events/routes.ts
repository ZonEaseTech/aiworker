import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import consola from 'consola'
import { streamSSE } from 'hono/streaming'

import { eventBus } from './event-bus'
import { listRecentSyncEvents } from './service'
import {
  broadcastRequestSchema,
  broadcastResponseSchema,
  recentEventsQuerySchema,
  recentEventsResponseSchema,
} from './types'

const events = new OpenAPIHono()

const broadcastRoute = createRoute({
  method: 'post',
  path: '/broadcast',
  tags: ['Events'],
  summary: 'Broadcast an event to SSE subscribers',
  request: {
    body: {
      content: { 'application/json': { schema: broadcastRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: broadcastResponseSchema } },
      description: 'Broadcast dispatched',
    },
  },
})

const recentRoute = createRoute({
  method: 'get',
  path: '/recent',
  tags: ['Events'],
  summary: 'List recent sync events',
  request: {
    query: recentEventsQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: recentEventsResponseSchema } },
      description: 'Recent sync events',
    },
  },
})

const streamRoute = createRoute({
  method: 'get',
  path: '/stream',
  tags: ['Events'],
  summary: 'Server-Sent Events stream of bus events',
  responses: {
    200: {
      description: 'SSE stream',
      content: { 'text/event-stream': { schema: z.string() } },
    },
  },
})

events.openapi(broadcastRoute, async (c) => {
  const body = c.req.valid('json')
  eventBus.publish({ type: body.type, payload: body.payload })
  return c.json({ success: true }, 200)
})

events.openapi(recentRoute, async (c) => {
  const { limit } = c.req.valid('query')
  const result = await listRecentSyncEvents(limit)
  return c.json(result, 200)
})

events.openapi(streamRoute, (c) => {
  return streamSSE(c, async (stream) => {
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let resolveClose: (() => void) | null = null

    const done = new Promise<void>((resolve) => {
      resolveClose = resolve
    })

    const unsubscribe = eventBus.subscribe((event) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      }).catch((err) => {
        consola.debug('[events] SSE write failed:', err instanceof Error ? err.message : err)
        resolveClose?.()
      })
    })

    const cleanup = () => {
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
      unsubscribe()
      resolveClose?.()
    }

    stream.onAbort(() => {
      consola.debug('[events] SSE client aborted')
      cleanup()
    })

    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ type: 'connected', payload: {}, timestamp: new Date().toISOString() }),
    })

    heartbeat = setInterval(() => {
      stream.writeSSE({ data: '', event: 'heartbeat' }).catch((err) => {
        consola.debug('[events] SSE heartbeat failed:', err instanceof Error ? err.message : err)
        cleanup()
      })
    }, 15_000)

    await done
  })
})

export { events }
