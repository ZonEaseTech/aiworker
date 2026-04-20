import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

import { getServiceConfig } from './service'
import { configResponseSchema } from './types'

const configRouter = new OpenAPIHono()

const getRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Config'],
  summary: 'Read brain and executor configuration (no secrets)',
  responses: {
    200: {
      content: { 'application/json': { schema: configResponseSchema } },
      description: 'Service configuration',
    },
  },
})

configRouter.openapi(getRoute, async (c) => {
  return c.json(getServiceConfig(), 200)
})

export { configRouter }
