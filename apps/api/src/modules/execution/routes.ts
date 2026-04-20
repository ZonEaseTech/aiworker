import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import { AppError } from '../../shared'
import { getExecutionLog, getExecutionStats, listExecutionLogs } from './service'
import {
  executionDetailResponseSchema,
  executionListQuerySchema,
  executionListResponseSchema,
  executionStatsResponseSchema,
} from './types'

const execution = new OpenAPIHono()

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Execution'],
  summary: 'List execution logs',
  request: {
    query: executionListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: executionListResponseSchema } },
      description: 'Execution log list',
    },
  },
})

const statsRoute = createRoute({
  method: 'get',
  path: '/stats',
  tags: ['Execution'],
  summary: 'Aggregate execution statistics',
  responses: {
    200: {
      content: { 'application/json': { schema: executionStatsResponseSchema } },
      description: 'Execution statistics',
    },
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/:id',
  tags: ['Execution'],
  summary: 'Get an execution log by id',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: executionDetailResponseSchema } },
      description: 'Execution log detail',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } },
      description: 'Execution log not found',
    },
  },
})

execution.openapi(statsRoute, async (c) => {
  const result = await getExecutionStats()
  return c.json(result, 200)
})

execution.openapi(listRoute, async (c) => {
  const query = c.req.valid('query')
  const result = await listExecutionLogs(query)
  return c.json(result, 200)
})

execution.openapi(detailRoute, async (c) => {
  const { id } = c.req.valid('param')
  const numericId = Number(id)
  if (!Number.isFinite(numericId))
    throw AppError.notFound(`Execution log '${id}' not found`)
  const log = await getExecutionLog(numericId)
  if (!log)
    throw AppError.notFound(`Execution log '${id}' not found`)
  return c.json(log, 200)
})

export { execution }
