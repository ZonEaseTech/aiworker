import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { checkBrain, checkExecutor, getHealthStatus } from './service'

const serviceHealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  name: z.string().optional(),
  lastChecked: z.string().optional(),
  error: z.string().optional(),
})

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  services: z.object({
    brain: serviceHealthSchema,
    executor: serviceHealthSchema,
  }),
})

const health = new OpenAPIHono()

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Overall health check',
  responses: {
    200: {
      content: { 'application/json': { schema: healthResponseSchema } },
      description: 'Service health status',
    },
  },
})

const brainRoute = createRoute({
  method: 'get',
  path: '/brain',
  tags: ['Health'],
  summary: 'Brain provider health check',
  responses: {
    200: {
      content: { 'application/json': { schema: serviceHealthSchema } },
      description: 'Brain provider health status',
    },
  },
})

const executorRoute = createRoute({
  method: 'get',
  path: '/executor',
  tags: ['Health'],
  summary: 'Executor provider health check',
  responses: {
    200: {
      content: { 'application/json': { schema: serviceHealthSchema } },
      description: 'Executor provider health status',
    },
  },
})

health.openapi(healthRoute, async (c) => {
  const result = await getHealthStatus()
  return c.json(result, 200)
})

health.openapi(brainRoute, async (c) => {
  const result = await checkBrain()
  return c.json(result, 200)
})

health.openapi(executorRoute, async (c) => {
  const result = await checkExecutor()
  return c.json(result, 200)
})

export { health }
