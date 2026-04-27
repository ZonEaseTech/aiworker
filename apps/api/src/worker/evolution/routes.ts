import { OpenAPIHono } from '@hono/zod-openapi'
import { AppError } from '@zonease/aiworker-shared'
import { evolutionObservations, getWorkerDb, skillDrafts } from '@zonease/aiworker-storage-sqlite/worker'
import { desc, eq } from 'drizzle-orm'

export const evolutionRoutes = new OpenAPIHono()

evolutionRoutes.get('/observations', (c) => {
  const rows = getWorkerDb().select().from(evolutionObservations).orderBy(desc(evolutionObservations.noticedAt)).limit(200).all()
  return c.json({ observations: rows })
})

evolutionRoutes.get('/drafts', (c) => {
  const status = c.req.query('status')
  const q = getWorkerDb().select().from(skillDrafts).orderBy(desc(skillDrafts.createdAt)).limit(100)
  const rows = status ? q.where(eq(skillDrafts.status, status as 'pending' | 'approved' | 'rejected')).all() : q.all()
  return c.json({ drafts: rows })
})

evolutionRoutes.post('/drafts/:id/approve', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id))
    throw AppError.badRequest('invalid draft id')
  const body = await c.req.json<{ decidedBy?: string }>().catch(() => ({} as { decidedBy?: string }))
  const now = new Date().toISOString()
  getWorkerDb().update(skillDrafts).set({ status: 'approved', decidedAt: now, decidedBy: body.decidedBy ?? 'operator' }).where(eq(skillDrafts.id, id)).run()
  return c.json({ ok: true })
})

evolutionRoutes.post('/drafts/:id/reject', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id))
    throw AppError.badRequest('invalid draft id')
  const body = await c.req.json<{ decidedBy?: string }>().catch(() => ({} as { decidedBy?: string }))
  const now = new Date().toISOString()
  getWorkerDb().update(skillDrafts).set({ status: 'rejected', decidedAt: now, decidedBy: body.decidedBy ?? 'operator' }).where(eq(skillDrafts.id, id)).run()
  return c.json({ ok: true })
})
