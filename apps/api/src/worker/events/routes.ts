import type { WorkerRuntime } from '@zonease/aiworker-core'
import { OpenAPIHono } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'

const DEFAULT_KEEPALIVE_MS = 5_000

export interface EventRoutesOptions {
  keepaliveMs?: number
}

/**
 * Event-stream router. The `getRuntime` thunk is re-evaluated per connection
 *  so PLAN-004 2.2 hot-reloads attach streams to the fresh event bus. Active
 *  streams opened against the previous bus drop naturally when the old
 *  runtime is disposed.
 */
export function buildEventRoutes(getRuntime: () => WorkerRuntime, options: EventRoutesOptions = {}) {
  const routes = new OpenAPIHono()
  const keepaliveMs = options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS

  routes.get('/stream', (c) => {
    const bus = getRuntime().bus
    return streamSSE(c, async (stream) => {
      let unsub = () => {}
      let done = false
      let keepalive: ReturnType<typeof setInterval> | undefined
      let resolveDone: () => void = () => {}
      const donePromise = new Promise<void>((resolve) => {
        resolveDone = resolve
      })
      const cleanup = () => {
        if (done)
          return
        done = true
        unsub()
        if (keepalive)
          clearInterval(keepalive)
        c.req.raw.signal.removeEventListener('abort', cleanup)
        resolveDone()
      }
      unsub = bus.on((event) => {
        if (done)
          return
        void stream.writeSSE({
          event: event.type,
          data: JSON.stringify({ ...event.payload, at: event.at }),
        })
      })
      stream.onAbort(cleanup)
      c.req.raw.signal.addEventListener('abort', cleanup, { once: true })
      await stream.write(': connected\n\n')
      if (keepaliveMs > 0) {
        keepalive = setInterval(() => {
          void stream.write(': keepalive\n\n')
        }, keepaliveMs)
        if (typeof (keepalive as unknown as { unref?: () => void }).unref === 'function')
          (keepalive as unknown as { unref: () => void }).unref()
      }
      await donePromise
    })
  })

  return routes
}
