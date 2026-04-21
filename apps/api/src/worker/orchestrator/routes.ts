import type { WorkerRuntime } from '../runtime'
import { OpenAPIHono } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'

import { getWorkerDb } from '../../db/worker'
import { agentTasks, conversations, messages } from '../../db/worker/schema'
import { AppError } from '../../shared'

/**
 * Orchestrator router. The `getRuntime` thunk is re-evaluated at every request
 *  so PLAN-004 2.2 hot-reloads pick up a fresh orchestrator without remounts.
 */
export function buildOrchestratorRoutes(getRuntime: () => WorkerRuntime) {
  const routes = new OpenAPIHono()

  routes.get('/tasks', (c) => {
    const rows = getWorkerDb().select().from(agentTasks).orderBy(desc(agentTasks.createdAt)).limit(200).all()
    return c.json({ tasks: rows })
  })

  routes.post('/tasks', async (c) => {
    const body = await c.req.json<{ prompt: string }>()
    if (!body.prompt || !body.prompt.trim())
      throw AppError.badRequest('prompt is required')
    const task = await getRuntime().orchestrator.submitTask(body.prompt.trim())
    return c.json({ task }, 201)
  })

  routes.get('/conversations', (c) => {
    const rows = getWorkerDb().select().from(conversations).orderBy(desc(conversations.lastActiveAt)).limit(200).all()
    return c.json({ conversations: rows })
  })

  routes.get('/conversations/:id/messages', (c) => {
    const id = c.req.param('id')
    const rows = getWorkerDb().select().from(messages).where(eq(messages.conversationId, id)).all()
    return c.json({ messages: rows })
  })

  return routes
}
