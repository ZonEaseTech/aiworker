import type { WorkerEventBus } from './bus'
import { OpenAPIHono } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'

export function buildEventRoutes(bus: WorkerEventBus) {
  const routes = new OpenAPIHono()

  routes.get('/stream', (c) => {
    return streamSSE(c, async (stream) => {
      const unsub = bus.on((event) => {
        void stream.writeSSE({
          event: event.type,
          data: JSON.stringify({ ...event.payload, at: event.at }),
        })
      })
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => {
          unsub()
          resolve()
        })
      })
    })
  })

  return routes
}
