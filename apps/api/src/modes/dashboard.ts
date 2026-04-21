import process from 'node:process'

import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import consola from 'consola'

import { dashboardConfig } from '../config/dashboard'
import { WorkerPoller } from '../dashboard/registry/poll'
import { buildRegistryRoutes } from '../dashboard/registry/routes'
import { getFleetDb, initFleetDb, runFleetMigrations } from '../db/fleet'
import { errorHandler, requestLogger } from '../shared'

export async function createDashboardApp() {
  initFleetDb(dashboardConfig.FLEET_DB_PATH)
  runFleetMigrations(dashboardConfig.FLEET_MIGRATIONS_FOLDER)
  consola.info(`[dashboard] fleet.db ready at ${dashboardConfig.FLEET_DB_PATH}`)

  // PLAN-004 3.4 will gate the docker supervisor behind MANAGER_CAN_LAUNCH;
  // until then the manager only exposes the registry / proxy surface and
  // never touches docker.
  const app = new OpenAPIHono()

  app.use(requestLogger)
  app.onError(errorHandler)

  app.get('/health', (c) => {
    return c.json({
      mode: 'dashboard',
      status: 'ok',
      checkedAt: new Date().toISOString(),
    })
  })

  app.route('/api/workers', buildRegistryRoutes({ masterKeyHex: dashboardConfig.AIWORKER_MASTER_KEY }))

  // PLAN-004 3.3 — background /info poll keeps the registry's lastSeen* columns
  // fresh. Starts automatically; disabled when MANAGER_POLL_INTERVAL_MS=0.
  const poller = new WorkerPoller({
    db: getFleetDb(),
    masterKeyHex: dashboardConfig.AIWORKER_MASTER_KEY,
    intervalMs: dashboardConfig.MANAGER_POLL_INTERVAL_MS,
    jitterMs: dashboardConfig.MANAGER_POLL_JITTER_MS,
  })
  poller.start()
  registerShutdown(async () => {
    consola.info('[dashboard] stopping registry poller')
    await poller.stop()
  })

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Dashboard API',
      version: '0.2.0',
      description: 'Fleet management plane: worker registry, secrets vault, container supervisor.',
    },
  })

  app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }))

  return { app, port: dashboardConfig.PORT }
}

/**
 * Install SIGINT/SIGTERM handlers that drain async resources (registry poll
 * loop, future docker supervisor, ...) before the process exits. `handler` is
 * run at most once per signal; exceptions are logged but never crash the
 * shutdown path.
 */
function registerShutdown(handler: () => Promise<void>): void {
  let shuttingDown = false
  const run = async (signal: NodeJS.Signals) => {
    if (shuttingDown)
      return
    shuttingDown = true
    consola.info(`[dashboard] received ${signal}, shutting down`)
    try {
      await handler()
    }
    catch (err) {
      consola.error('[dashboard] shutdown hook failed', err)
    }
    process.exit(0)
  }
  process.once('SIGTERM', () => void run('SIGTERM'))
  process.once('SIGINT', () => void run('SIGINT'))
}
