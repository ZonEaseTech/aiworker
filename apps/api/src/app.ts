import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

const app = new OpenAPIHono()

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ status: z.string() }),
        },
      },
      description: 'Health check response',
    },
  },
})

app.openapi(healthRoute, (c) => {
  return c.json({ status: 'ok' }, 200)
})

export { app }
