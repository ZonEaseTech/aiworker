import { OpenAPIHono } from '@hono/zod-openapi'
import { WorkerArtifactService } from '@zonease/aiworker-core'
import { z } from 'zod'

const listArtifactsQuery = z.object({
  conversationId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  runId: z.string().trim().min(1).optional(),
  status: z.enum(['available', 'missing', 'archived']).optional(),
})

export function buildArtifactRoutes() {
  const routes = new OpenAPIHono()

  routes.get('/', (c) => {
    const parsed = listArtifactsQuery.safeParse({
      conversationId: c.req.query('conversationId'),
      limit: c.req.query('limit'),
      runId: c.req.query('runId'),
      status: c.req.query('status'),
    })
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-query',
          message: 'invalid artifact query',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    const artifacts = new WorkerArtifactService().listArtifacts(parsed.data)
    return c.json({ artifacts })
  })

  routes.get('/:id', (c) => {
    const artifact = new WorkerArtifactService().getArtifact(c.req.param('id'))
    if (artifact === null) {
      return c.json({
        error: {
          code: 'not-found',
          message: 'artifact not found',
        },
      }, 404)
    }
    return c.json({ artifact })
  })

  return routes
}
