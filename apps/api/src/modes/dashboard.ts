import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import consola from 'consola'

import { dashboardConfig } from '../config/dashboard'
import { buildRegistryRoutes } from '../dashboard/registry/routes'
import { initFleetDb, runFleetMigrations } from '../db/fleet'
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
