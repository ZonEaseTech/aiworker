import type { WorkerRuntime } from '@zonease/aiworker-core'

import { OpenAPIHono } from '@hono/zod-openapi'
import { BrainCaseService, BrainInboxService } from '@zonease/aiworker-core'
import { AppError } from '@zonease/aiworker-shared'
import { z } from 'zod'

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const rerunTaskBody = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(8000, 'prompt exceeds 8000 characters').optional(),
})

const lessonProposeBody = z.object({
  scopeId: z.string().trim().min(1).optional(),
  soulId: z.string().trim().min(1).optional(),
})

export function buildCaseRoutes(getRuntime: () => WorkerRuntime) {
  const routes = new OpenAPIHono()

  routes.get('/', (c) => {
    const parsed = listQuery.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-query',
          message: 'invalid case list query',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    const runtime = getRuntime()
    const cases = new BrainCaseService({
      config: runtime.config,
      workerId: runtime.workerId,
    }).listCases(parsed.data)
    return c.json({ cases })
  })

  routes.get('/:taskId', (c) => {
    const runtime = getRuntime()
    const file = new BrainCaseService({
      config: runtime.config,
      workerId: runtime.workerId,
    }).getCaseFile(c.req.param('taskId'))
    if (file === null) {
      return c.json({
        error: {
          code: 'not-found',
          message: 'case not found',
        },
      }, 404)
    }
    return c.json({ case: file })
  })

  routes.post('/:taskId/rerun', async (c) => {
    const raw = await c.req.json().catch(() => ({}))
    const parsed = rerunTaskBody.safeParse(raw ?? {})
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid case rerun body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const task = await getRuntime().orchestrator.rerunTask(c.req.param('taskId'), parsed.data)
      return c.json({ task }, 201)
    }
    catch (err) {
      if (err instanceof AppError)
        return c.json(err.toJSON(), err.status as 400)
      throw err
    }
  })

  routes.post('/:taskId/lessons/propose', async (c) => {
    const raw = await c.req.json().catch(() => ({}))
    const parsed = lessonProposeBody.safeParse(raw ?? {})
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid lesson proposal body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const result = new BrainInboxService().proposeFromTask(c.req.param('taskId'), parsed.data)
      return c.json(result, 201)
    }
    catch (err) {
      return c.json({
        error: {
          code: 'proposal-failed',
          message: err instanceof Error ? err.message : String(err),
        },
      }, 400)
    }
  })

  return routes
}
