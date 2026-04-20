import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { AppError } from '../../shared'
import { diffSkills, getConflicts, getSkill, listSkills, resolveConflict, syncSkills } from './service'
import {
  conflictListResponseSchema,
  conflictSchema,
  diffResponseSchema,
  resolveConflictRequestSchema,
  skillDetailResponseSchema,
  skillListResponseSchema,
  syncRequestSchema,
  syncResponseSchema,
} from './types'

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
  request: {
    body: {
      content: { 'application/json': { schema: syncRequestSchema } },
      required: false,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: syncResponseSchema } },
      description: 'Sync result',
    },
  },
})

const diffRoute = createRoute({
  method: 'get',
  path: '/diff',
  tags: ['Skills'],
  summary: 'Compute skill diff between Hermes and OpenClaw',
  responses: {
    200: {
      content: { 'application/json': { schema: diffResponseSchema } },
      description: 'Diff result',
    },
  },
})

const conflictsRoute = createRoute({
  method: 'get',
  path: '/conflicts',
  tags: ['Skills'],
  summary: 'List unresolved skill conflicts',
  responses: {
    200: {
      content: { 'application/json': { schema: conflictListResponseSchema } },
      description: 'Conflict list',
    },
  },
})

const resolveConflictRoute = createRoute({
  method: 'post',
  path: '/conflicts/:id/resolve',
  tags: ['Skills'],
  summary: 'Resolve a skill conflict',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { 'application/json': { schema: resolveConflictRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: conflictSchema } },
      description: 'Resolved conflict',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } },
      description: 'Conflict not found',
    },
  },
})

// Register routes — order matters: specific paths before parameterized ones
skills.openapi(diffRoute, async (c) => {
  const diff = await diffSkills()
  return c.json({ diff, total: diff.length }, 200)
})

skills.openapi(conflictsRoute, async (c) => {
  const conflicts = await getConflicts()
  return c.json({ conflicts, total: conflicts.length }, 200)
})

skills.openapi(resolveConflictRoute, async (c) => {
  const { id } = c.req.valid('param')
  const { resolution } = c.req.valid('json')
  const conflict = await resolveConflict(Number(id), resolution)
  if (!conflict)
    throw AppError.notFound(`Conflict '${id}' not found`)
  return c.json(conflict, 200)
})

skills.openapi(syncRoute, async (c) => {
  const body = c.req.valid('json')
  const direction = body.direction ?? 'bidirectional'
  const result = await syncSkills(direction)
  return c.json({ status: 'completed' as const, synced: result.synced, conflicts: result.conflicts }, 200)
})

skills.openapi(listRoute, async (c) => {
  const result = await listSkills()
  return c.json(result, 200)
})

skills.openapi(detailRoute, async (c) => {
  const { name } = c.req.valid('param')
  const skill = await getSkill(name)
  if (!skill)
    throw AppError.notFound(`Skill '${name}' not found`)
  return c.json(skill, 200)
})

export { skills }
