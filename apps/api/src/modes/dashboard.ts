import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import consola from 'consola'

import { dashboardConfig } from '../config/dashboard'
import { buildRegistryRoutes } from '../dashboard/registry/routes'
import { getFleetSupervisor } from '../dashboard/supervisor/service'
import { initFleetDb, runFleetMigrations } from '../db/fleet'
import { errorHandler, requestLogger } from '../shared'

export async function createDashboardApp() {
  initFleetDb(dashboardConfig.FLEET_DB_PATH)
  runFleetMigrations(dashboardConfig.FLEET_MIGRATIONS_FOLDER)
  consola.info(`[dashboard] fleet.db ready at ${dashboardConfig.FLEET_DB_PATH}`)

  // PLAN-004 3.4: the docker supervisor only comes online when the operator
  // opts in via MANAGER_CAN_LAUNCH. With the flag off the manager is a pure
  // registry and never constructs the DockerClient, so default deploys have
  // no docker-socket dependency.
  const supervisor = dashboardConfig.MANAGER_CAN_LAUNCH ? getFleetSupervisor() : null
  if (supervisor)
    consola.info('[dashboard] MANAGER_CAN_LAUNCH=true — /api/workers/launch-local is enabled')

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

  app.route('/api/workers', buildRegistryRoutes({
    masterKeyHex: dashboardConfig.AIWORKER_MASTER_KEY,
    canLaunch: dashboardConfig.MANAGER_CAN_LAUNCH,
    supervisor,
  }))

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
