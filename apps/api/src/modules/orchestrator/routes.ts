import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { AppError } from '../../shared'
import * as service from './service'
import {
  agentTaskSchema,
  listTasksQuerySchema,
  listTasksResponseSchema,
  submitTaskBodySchema,
  submitTaskResponseSchema,
  taskDetailResponseSchema,
  taskIdParamSchema,
} from './types'

const orchestrator = new OpenAPIHono()

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

const submitRoute = createRoute({
  method: 'post',
  path: '/tasks',
  tags: ['Orchestrator'],
  summary: 'Submit a new agent task to the orchestrator queue',
  request: {
    body: {
      content: { 'application/json': { schema: submitTaskBodySchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: submitTaskResponseSchema } },
      description: 'Task accepted',
    },
  },
})

orchestrator.openapi(submitRoute, (c) => {
  const body = c.req.valid('json')
  const task = service.submitTask({
    prompt: body.prompt,
    autoWriteback: body.autoWriteback,
  })
  return c.json({
    id: task.id,
    status: task.status,
    createdAt: task.createdAt,
  }, 200)
})

const listRoute = createRoute({
  method: 'get',
  path: '/tasks',
  tags: ['Orchestrator'],
  summary: 'List agent tasks, newest first',
  request: {
    query: listTasksQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: listTasksResponseSchema } },
      description: 'Paginated task list',
    },
  },
})

orchestrator.openapi(listRoute, (c) => {
  const query = c.req.valid('query')
  const result = service.listTasks({ limit: query.limit, cursor: query.cursor })
  return c.json(result, 200)
})

const detailRoute = createRoute({
  method: 'get',
  path: '/tasks/:id',
  tags: ['Orchestrator'],
  summary: 'Fetch a task with its full transcript and tool calls',
  request: {
    params: taskIdParamSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: taskDetailResponseSchema } },
      description: 'Task detail',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Task not found',
    },
  },
})

orchestrator.openapi(detailRoute, (c) => {
  const { id } = c.req.valid('param')
  const detail = service.getTaskDetail(id)
  if (!detail)
    throw AppError.notFound(`Task not found: ${id}`)
  return c.json(detail, 200)
})

const cancelRoute = createRoute({
  method: 'post',
  path: '/tasks/:id/cancel',
  tags: ['Orchestrator'],
  summary: 'Request cancellation of a running or queued task',
  request: {
    params: taskIdParamSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: agentTaskSchema } },
      description: 'Updated task',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Task not found',
    },
  },
})

orchestrator.openapi(cancelRoute, (c) => {
  const { id } = c.req.valid('param')
  const task = service.cancelTask(id)
  return c.json(task, 200)
})

export { orchestrator }
