import type { WorkerConfig } from '@aiworker/shared'
import { OpenAPIHono } from '@hono/zod-openapi'

import { AppError } from '../../shared'
import { getFleetSupervisor } from '../supervisor/service'
import {
  createWorker,
  deleteWorker,
  getRedactedConfig,
  getWorker,
  listWorkerSummaries,
  updateWorker,
} from './service'

export const fleetRoutes = new OpenAPIHono()

fleetRoutes.get('/', (c) => {
  return c.json({ workers: listWorkerSummaries() })
})

fleetRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    slug?: string
    description?: string
    config: WorkerConfig
  }>()
  const worker = await createWorker(body)
  const supervisor = getFleetSupervisor()
  try {
    await supervisor.spawn(worker)
  }
  catch (err) {
    throw AppError.internal(`Worker created but container spawn failed: ${String(err)}`)
  }
  return c.json({ worker }, 201)
})

fleetRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const worker = getWorker(id)
  if (!worker)
    throw AppError.notFound(`Worker ${id} not found`)
  const config = getRedactedConfig(id)
  const supervisor = getFleetSupervisor()
  const state = await supervisor.inspect(worker).catch(() => ({ state: 'unknown' as const }))
  return c.json({ worker, config, containerState: state.state })
})

fleetRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const worker = await updateWorker(id, body)
  return c.json({ worker })
})

fleetRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const removeData = c.req.query('removeData') === 'true'
  const worker = getWorker(id)
  if (worker) {
    await getFleetSupervisor().remove(worker, removeData).catch(() => undefined)
  }
  await deleteWorker(id)
  return c.json({ ok: true })
})

fleetRoutes.post('/:id/start', async (c) => {
  const id = c.req.param('id')
  const worker = getWorker(id)
  if (!worker)
    throw AppError.notFound(`Worker ${id} not found`)
  const containerId = await getFleetSupervisor().spawn(worker)
  return c.json({ ok: true, containerId })
})

fleetRoutes.post('/:id/stop', async (c) => {
  const id = c.req.param('id')
  const worker = getWorker(id)
  if (!worker)
    throw AppError.notFound(`Worker ${id} not found`)
  await getFleetSupervisor().stop(worker)
  return c.json({ ok: true })
})

fleetRoutes.post('/:id/restart', async (c) => {
  const id = c.req.param('id')
  const worker = getWorker(id)
  if (!worker)
    throw AppError.notFound(`Worker ${id} not found`)
  const containerId = await getFleetSupervisor().restart(worker)
  return c.json({ ok: true, containerId })
})

fleetRoutes.get('/:id/logs', async (c) => {
  const id = c.req.param('id')
  const worker = getWorker(id)
  if (!worker)
    throw AppError.notFound(`Worker ${id} not found`)
  const tail = Number(c.req.query('tail') ?? '200')
  const text = await getFleetSupervisor().logs(worker, { tail })
  return c.text(text)
})
