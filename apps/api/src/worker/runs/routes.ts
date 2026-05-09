import type { WorkerRuntime } from '@zonease/aiworker-core'

import { OpenAPIHono } from '@hono/zod-openapi'
import { WorkerRunService } from '@zonease/aiworker-core'
import { AppError } from '@zonease/aiworker-shared'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

const DEFAULT_KEEPALIVE_MS = 5_000

const createRunBody = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(8000, 'prompt exceeds 8000 characters'),
  conversationId: z.string().trim().min(1).optional(),
})

export interface RunRoutesOptions {
  keepaliveMs?: number
}

export function buildRunRoutes(getRuntime: () => WorkerRuntime, options: RunRoutesOptions = {}) {
  const routes = new OpenAPIHono()
  const keepaliveMs = options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS

  routes.get('/', (c) => {
    const limitRaw = c.req.query('limit')
    const limit = limitRaw === undefined ? undefined : Number(limitRaw)
    const runs = createService(getRuntime()).listRuns({ limit })
    return c.json({ runs })
  })

  routes.post('/', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = createRunBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid run body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const run = await createService(getRuntime()).createRun(parsed.data)
      return c.json({ run }, 201)
    }
    catch (err) {
      if (err instanceof AppError)
        return c.json(err.toJSON(), err.status as 400)
      throw err
    }
  })

  routes.get('/:id', (c) => {
    const run = createService(getRuntime()).getRun(c.req.param('id'))
    if (run === null) {
      return c.json({
        error: {
          code: 'not-found',
          message: 'run not found',
        },
      }, 404)
    }
    return c.json({ run })
  })

  routes.post('/:id/cancel', async (c) => {
    try {
      const run = await createService(getRuntime()).cancelRun(c.req.param('id'))
      return c.json({ run })
    }
    catch (err) {
      if (err instanceof AppError)
        return c.json(err.toJSON(), err.status as 400)
      throw err
    }
  })

  routes.get('/:id/events', (c) => {
    const runId = c.req.param('id')
    const runtime = getRuntime()
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
      unsub = runtime.bus.on((event) => {
        if (done || event.payload.taskId !== runId)
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

function createService(runtime: WorkerRuntime): WorkerRunService {
  return new WorkerRunService({
    orchestrator: runtime.orchestrator,
    processes: runtime.processes,
  })
}
