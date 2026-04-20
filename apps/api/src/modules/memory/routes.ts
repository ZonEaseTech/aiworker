import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { listMemories, searchMemories } from './service'
import { memoryListResponseSchema, memorySearchResponseSchema } from './types'

const memory = new OpenAPIHono()

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Memory'],
  summary: 'List all memories',
  responses: {
    200: {
      content: { 'application/json': { schema: memoryListResponseSchema } },
      description: 'Memory list',
    },
  },
})

const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  tags: ['Memory'],
  summary: 'Search memories',
  request: {
    query: z.object({ q: z.string().min(1) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: memorySearchResponseSchema } },
      description: 'Search results',
    },
  },
})

memory.openapi(listRoute, (c) => {
  return c.json(listMemories(), 200)
})

memory.openapi(searchRoute, (c) => {
  const { q } = c.req.valid('query')
  return c.json(searchMemories(q), 200)
})

export { memory }
