import type { WorkerRuntime } from '@zonease/aiworker-core'
import { OpenAPIHono } from '@hono/zod-openapi'

import { BrainJournalService } from '@zonease/aiworker-core'
import { AppError } from '@zonease/aiworker-shared'
import { agentTasks, conversations, getWorkerDb, messages } from '@zonease/aiworker-storage-sqlite/worker'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

// REFACTOR-006 P2：8KB 上限来自 OpenAI/Anthropic 单次 user message 常见
// 上下文段限制——超过这个数量时 prompt 几乎一定会被分段或拒绝；同时也是
// SQLite 单行写入的舒适区。trim 后再校验长度避免空白绕过。
const submitTaskBody = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(8000, 'prompt exceeds 8000 characters'),
})

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

  routes.get('/tasks/:id/journal', (c) => {
    const runtime = getRuntime()
    const trace = new BrainJournalService({
      config: runtime.config,
      workerId: runtime.workerId,
    }).getTaskTrace(c.req.param('id'))
    if (trace === null) {
      return c.json({
        error: {
          code: 'not-found',
          message: 'task not found',
        },
      }, 404)
    }
    return c.json({ journal: trace })
  })

  routes.post('/tasks', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = submitTaskBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid task body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    const task = await getRuntime().orchestrator.submitTask(parsed.data.prompt)
    return c.json({ task }, 201)
  })

  routes.post('/conversations/:id/messages', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = submitTaskBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'invalid-body',
          message: 'invalid conversation message body',
          details: parsed.error.flatten().fieldErrors,
        },
      }, 400)
    }
    try {
      const task = await getRuntime().orchestrator.continueConversation(c.req.param('id'), parsed.data.prompt)
      return c.json({ task }, 201)
    }
    catch (err) {
      if (err instanceof AppError)
        return c.json(err.toJSON(), err.status as 400)
      throw err
    }
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
