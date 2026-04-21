import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import consola from 'consola'

import { dashboardConfig } from '../config/dashboard'
import { fleetRoutes } from '../dashboard/fleet/routes'
import { buildRegistryRoutes } from '../dashboard/registry/routes'
import { getFleetSupervisor } from '../dashboard/supervisor/service'
import { initFleetDb, runFleetMigrations } from '../db/fleet'
import { errorHandler, requestLogger } from '../shared'

export async function createDashboardApp() {
  initFleetDb(dashboardConfig.FLEET_DB_PATH)
  runFleetMigrations(dashboardConfig.FLEET_MIGRATIONS_FOLDER)
  consola.info(`[dashboard] fleet.db ready at ${dashboardConfig.FLEET_DB_PATH}`)

  const supervisor = getFleetSupervisor()
  try {
    await supervisor.ensureInfrastructure()
    consola.info(`[dashboard] docker network ${dashboardConfig.AIWORKER_NETWORK} ready`)
  }
  catch (err) {
    consola.warn(`[dashboard] docker not reachable yet: ${String(err)}. Fleet control plane will run, but worker spawn will fail until docker is up.`)
  }

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
  app.route('/api/workers', fleetRoutes)

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
