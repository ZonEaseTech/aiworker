import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AppError } from '../../shared'
import { getMemory, getMemoryIndex, listMemories, searchMemories, writeFeedback, writeMemory } from './service'
import {
  memoryDetailResponseSchema,
  memoryIndexResponseSchema,
  memoryListResponseSchema,
  memorySearchResponseSchema,
  writeFeedbackInputSchema,
  writeMemoryInputSchema,
  writeMemoryResponseSchema,
} from './types'

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

const indexRoute = createRoute({
  method: 'get',
  path: '/index',
  tags: ['Memory'],
  summary: 'Get MEMORY.md index',
  responses: {
    200: {
      content: { 'application/json': { schema: memoryIndexResponseSchema } },
      description: 'Memory index',
    },
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/:id',
  tags: ['Memory'],
  summary: 'Get memory by ID',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: memoryDetailResponseSchema } },
      description: 'Memory detail',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } },
      description: 'Memory not found',
    },
  },
})

const createRoute_ = createRoute({
  method: 'post',
  path: '/',
  tags: ['Memory'],
  summary: 'Create a new memory',
  request: {
    body: {
      content: { 'application/json': { schema: writeMemoryInputSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: writeMemoryResponseSchema } },
      description: 'Memory created',
    },
  },
})

const feedbackRoute = createRoute({
  method: 'post',
  path: '/feedback',
  tags: ['Memory'],
  summary: 'Write execution feedback as memory',
  request: {
    body: {
      content: { 'application/json': { schema: writeFeedbackInputSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: writeMemoryResponseSchema } },
      description: 'Feedback memory created',
    },
  },
})

memory.openapi(listRoute, async (c) => {
  const result = await listMemories()
  return c.json(result, 200)
})

memory.openapi(searchRoute, async (c) => {
  const { q } = c.req.valid('query')
  const result = await searchMemories(q)
  return c.json(result, 200)
})

memory.openapi(indexRoute, async (c) => {
  const result = await getMemoryIndex()
  return c.json(result, 200)
})

memory.openapi(detailRoute, async (c) => {
  const { id } = c.req.valid('param')
  const result = await getMemory(id)
  if (!result)
    throw AppError.notFound(`Memory '${id}' not found`)
  return c.json(result, 200)
})

memory.openapi(createRoute_, async (c) => {
  const input = c.req.valid('json')
  const result = await writeMemory(input)
  return c.json(result, 201)
})

memory.openapi(feedbackRoute, async (c) => {
  const input = c.req.valid('json')
  const result = await writeFeedback(input)
  return c.json(result, 201)
})

export { memory }
