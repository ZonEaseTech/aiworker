import type { WorkerRuntime } from '@zonease/aiworker-core'

import { OpenAPIHono } from '@hono/zod-openapi'
import { WorkerReviewService, LessonPromotionService } from '@zonease/aiworker-core'
import { AppError } from '@zonease/aiworker-shared'
import { z } from 'zod'

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const rerunBody = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(8000, 'prompt exceeds 8000 characters').optional(),
})

const promoteBody = z.object({
  scopeId: z.string().trim().min(1).optional(),
  soulId: z.string().trim().min(1).optional(),
})

export function buildReviewRoutes(getRuntime: () => WorkerRuntime) {
  const routes = new OpenAPIHono()

  routes.get('/', (c) => {
    const parsed = listQuery.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-query',
          message: 'invalid review list query',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    const runtime = getRuntime()
    const reviews = new WorkerReviewService({
      config: runtime.config,
      workerId: runtime.workerId,
    }).listReviews(parsed.data)
    return c.json({ reviews })
  })

  routes.get('/:taskId', (c) => {
    const runtime = getRuntime()
    const review = new WorkerReviewService({
      config: runtime.config,
      workerId: runtime.workerId,
    }).getReview(c.req.param('taskId'))
    if (review === null) {
      return c.json({
        error: {
          code: 'not-found',
          message: 'review not found',
        },
      }, 404)
    }
    return c.json({ review })
  })

  routes.post('/:taskId/rerun', async (c) => {
    const raw = await c.req.json().catch(() => ({}))
    const parsed = rerunBody.safeParse(raw ?? {})
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid review rerun body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const runtime = getRuntime()
      const run = await runtime.orchestrator.rerunTask(c.req.param('taskId'), parsed.data)
      const review = new WorkerReviewService({
        config: runtime.config,
        workerId: runtime.workerId,
      }).getReview(run.id)
      return c.json({
        run,
        ...(review === null ? {} : { review }),
      }, 201)
    }
    catch (err) {
      if (err instanceof AppError)
        return c.json(err.toJSON(), err.status as 400)
      throw err
    }
  })

  routes.post('/:taskId/lessons/promote', async (c) => {
    const raw = await c.req.json().catch(() => ({}))
    const parsed = promoteBody.safeParse(raw ?? {})
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid lesson promotion body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const runtime = getRuntime()
      const promotion = new LessonPromotionService().promoteFromRun(c.req.param('taskId'), parsed.data)
      const review = new WorkerReviewService({
        config: runtime.config,
        workerId: runtime.workerId,
      }).getReview(c.req.param('taskId'))
      return c.json({
        promotion,
        ...(review === null ? {} : { review }),
      }, 201)
    }
    catch (err) {
      return c.json({
        error: {
          code: 'promotion-failed',
          message: err instanceof Error ? err.message : String(err),
        },
      }, 400)
    }
  })

  return routes
}
