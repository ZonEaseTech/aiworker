import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AppError } from '../../shared'
import { getSkill, listSkills, triggerSync } from './service'
import { skillDetailResponseSchema, skillListResponseSchema, syncResponseSchema } from './types'

const skills = new OpenAPIHono()

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Skills'],
  summary: 'List all skills',
  responses: {
    200: {
      content: { 'application/json': { schema: skillListResponseSchema } },
      description: 'Skill list',
    },
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/:name',
  tags: ['Skills'],
  summary: 'Get skill detail',
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: skillDetailResponseSchema } },
      description: 'Skill detail',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } },
      description: 'Skill not found',
    },
  },
})

const syncRoute = createRoute({
  method: 'post',
  path: '/sync',
  tags: ['Skills'],
  summary: 'Trigger skill sync',
  responses: {
    200: {
      content: { 'application/json': { schema: syncResponseSchema } },
      description: 'Sync result',
    },
  },
})

skills.openapi(listRoute, (c) => {
  return c.json(listSkills(), 200)
})

skills.openapi(detailRoute, (c) => {
  const { name } = c.req.valid('param')
  const skill = getSkill(name)
  if (!skill)
    throw AppError.notFound(`Skill '${name}' not found`)
  return c.json(skill, 200)
})

skills.openapi(syncRoute, (c) => {
  return c.json(triggerSync(), 200)
})

export { skills }
