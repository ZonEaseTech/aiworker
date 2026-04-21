import type { Envelope } from '@aiworker/shared'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import consola from 'consola'

import { workerConfig, workerConfigEnv } from '../config/worker'
import { initWorkerDb, runWorkerMigrations } from '../db/worker'
import { errorHandler, requestLogger } from '../shared'
import { buildChannelRoutes } from '../worker/channels/routes'
import { buildEventRoutes } from '../worker/events/routes'
import { evolutionRoutes } from '../worker/evolution/routes'
import { buildOrchestratorRoutes } from '../worker/orchestrator/routes'
import { buildWorkerRuntime } from '../worker/runtime'

export function createWorkerApp() {
  initWorkerDb(workerConfigEnv.WORKER_DB_PATH)
  runWorkerMigrations(workerConfigEnv.WORKER_MIGRATIONS_FOLDER)
  consola.info(`[worker ${workerConfigEnv.WORKER_ID}] worker.db ready at ${workerConfigEnv.WORKER_DB_PATH}`)

  const runtime = buildWorkerRuntime(workerConfigEnv.WORKER_ID, workerConfig)
  consola.info(`[worker ${workerConfigEnv.WORKER_ID}] runtime built — brains=${workerConfig.brains.length} executor=${workerConfig.executor.type} channels=${runtime.channels.list().length}`)

  const app = new OpenAPIHono()
  app.use(requestLogger)
  app.onError(errorHandler)

  app.get('/health', async (c) => {
    const [brainHealth, executorHealth] = await Promise.all([
      runtime.brain.health().catch(() => null),
      runtime.executor.health().catch(() => null),
    ])
    return c.json({
      mode: 'worker',
      workerId: workerConfigEnv.WORKER_ID,
      status: 'ok',
      brain: brainHealth,
      executor: executorHealth,
      configVersion: workerConfigEnv.WORKER_CONFIG_VERSION,
      checkedAt: new Date().toISOString(),
    })
  })

  // Public surface: `/{channel}/webhook` at the root so that external platforms
  // can register simple URLs. The `{workerId}` segment is stripped by Caddy —
  // the worker container only ever sees its own suffix.
  app.route('/', buildChannelRoutes(runtime.channels, workerConfigEnv.WORKER_ID, env => runtime.orchestrator.ingest(env as Envelope)))

  // Internal surface for the dashboard.
  app.route('/api/worker/orchestrator', buildOrchestratorRoutes(runtime.orchestrator))
  app.route('/api/worker/evolution', evolutionRoutes)
  app.route('/api/worker/events', buildEventRoutes(runtime.bus))

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Worker API',
      version: '0.2.0',
      description: `Per-worker surface: channels, orchestrator, memory, skills, execution, evolution. Worker id: ${workerConfigEnv.WORKER_ID}`,
    },
  })

  app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }))

  return { app, port: workerConfigEnv.PORT }
}
