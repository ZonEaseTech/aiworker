import type { WorkerRuntime } from '../runtime'
import { OpenAPIHono } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'

/**
 * Event-stream router. The `getRuntime` thunk is re-evaluated per connection
 *  so PLAN-004 2.2 hot-reloads attach streams to the fresh event bus. Active
 *  streams opened against the previous bus drop naturally when the old
 *  runtime is disposed.
 */
export function buildEventRoutes(getRuntime: () => WorkerRuntime) {
  const routes = new OpenAPIHono()

  routes.get('/stream', (c) => {
    const bus = getRuntime().bus
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
