import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { checkHermes, checkOpenclaw, getHealthStatus } from './service'

const serviceHealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  latency: z.number().optional(),
  error: z.string().optional(),
})

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  services: z.object({
    hermes: serviceHealthSchema,
    openclaw: serviceHealthSchema,
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

const hermesRoute = createRoute({
  method: 'get',
  path: '/hermes',
  tags: ['Health'],
  summary: 'Hermes API health check',
  responses: {
    200: {
      content: { 'application/json': { schema: serviceHealthSchema } },
      description: 'Hermes health status',
    },
  },
})

const openclawRoute = createRoute({
  method: 'get',
  path: '/openclaw',
  tags: ['Health'],
  summary: 'OpenClaw gateway health check',
  responses: {
    200: {
      content: { 'application/json': { schema: serviceHealthSchema } },
      description: 'OpenClaw health status',
    },
  },
})

health.openapi(healthRoute, async (c) => {
  const result = await getHealthStatus()
  return c.json(result, 200)
})

health.openapi(hermesRoute, async (c) => {
  const result = await checkHermes()
  return c.json(result, 200)
})

health.openapi(openclawRoute, async (c) => {
  const result = await checkOpenclaw()
  return c.json(result, 200)
})

export { health }
