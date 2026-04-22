import type { WorkerConfig } from '@aiworker/shared'
import type { WorkerRuntime } from '../worker/runtime'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import consola from 'consola'

import { workerEnv } from '../config/worker'
import { getWorkerDb, initWorkerDb, runWorkerMigrations } from '../db/worker'
import { errorHandler, requestLogger } from '../shared'
import { loadOrMintIdentity, loadOrSeedConfig, printBootstrapIfJustMinted } from '../worker/bootstrap'
import { buildChannelRoutes } from '../worker/channels/routes'
import { enumerateSecretPaths, hydrateSecrets } from '../worker/config/secret-paths'
import { buildEventRoutes } from '../worker/events/routes'
import { evolutionRoutes } from '../worker/evolution/routes'
import { buildManagementRoutes } from '../worker/management/routes'
import { ProcessManager } from '../worker/orchestrator/process-manager'
import { buildOrchestratorRoutes } from '../worker/orchestrator/routes'
import { buildWorkerRuntime } from '../worker/runtime'
import { getSecretsVault } from '../worker/secrets'

export interface WorkerModeState {
  workerId: string
  runtime: WorkerRuntime
  configVersion: number
  startedAt: string
  /**
   * Current plaintext bearer token that callers of `/api/worker/*` must
   * present. Mutated in place by `POST /api/worker/token/rotate` so the
   * auth middleware picks up the new token on the next request.
   */
  tokenPlaintext: string
}

async function hydrateStoredConfig(stored: WorkerConfig): Promise<WorkerConfig> {
  const vault = getSecretsVault()
  const expectedPaths = new Set(enumerateSecretPaths(stored).map(p => p.path))
  const map = new Map<string, string>()
  for (const path of expectedPaths) {
    const value = await vault.get(path)
    if (value !== null)
      map.set(path, value)
  }
  return hydrateSecrets(stored, map)
}

/**
 * Self-sufficient worker bootstrap: init worker.db, mint identity on first
 * boot, load (or seed) config, hydrate secrets from the vault, and build the
 * runtime. Returns the assembled Hono app plus a mutable `state` object whose
 * `runtime` ref is atomically replaced by `reloadRuntime` when PLAN-004 2.2
 * management API pushes a new config.
 */
export async function bootstrapWorkerApp(): Promise<{ app: OpenAPIHono, port: number, state: WorkerModeState }> {
  initWorkerDb(workerEnv.WORKER_DB_PATH)
  runWorkerMigrations(workerEnv.WORKER_MIGRATIONS_FOLDER)

  const vault = getSecretsVault()
  const db = getWorkerDb()

  const identity = await loadOrMintIdentity(db, vault, {
    ...(workerEnv.AIWORKER_FORCE_ID === undefined ? {} : { forceId: workerEnv.AIWORKER_FORCE_ID }),
    ...(workerEnv.AIWORKER_FORCE_TOKEN === undefined ? {} : { forceToken: workerEnv.AIWORKER_FORCE_TOKEN }),
  })
  printBootstrapIfJustMinted(identity.workerId, identity.token, db, identity.justMinted)

  consola.info(`[worker ${identity.workerId}] worker.db ready at ${workerEnv.WORKER_DB_PATH}`)

  const stored = await loadOrSeedConfig(db)
  const hydrated = await hydrateStoredConfig(stored.config)

  // ProcessManager 跨 hot-reload 持久化（FEAT-015 / PLAN-007 §架构承诺 5）：
  // bootstrap 时 new 一次，之后每次 reloadRuntime 只调 setLimits。
  const processes = new ProcessManager({
    maxConcurrentTotal: workerEnv.MAX_CONCURRENT_TOTAL,
    perEngineLimits: { ...workerEnv.perEngineLimits },
    stallTimeoutMs: workerEnv.PROCESS_STALL_TIMEOUT_MS,
    killTimeoutMs: workerEnv.PROCESS_KILL_TIMEOUT_MS,
    autoCleanupDelayMs: workerEnv.PROCESS_AUTO_CLEANUP_DELAY_MS,
    gcIntervalMs: workerEnv.PROCESS_GC_INTERVAL_MS,
  })

  const runtime = buildWorkerRuntime(identity.workerId, hydrated, { processes })
  consola.info(`[worker ${identity.workerId}] runtime built — brains=${hydrated.brains.length} executor=${hydrated.executor.engine}/${hydrated.executor.variant} channels=${runtime.channels.list().length}`)

  const state: WorkerModeState = {
    workerId: identity.workerId,
    runtime,
    configVersion: stored.version,
    startedAt: new Date().toISOString(),
    tokenPlaintext: identity.token,
  }

  async function reloadRuntime(nextStoredConfig: WorkerConfig, newVersion: number): Promise<void> {
    const nextHydrated = await hydrateStoredConfig(nextStoredConfig)
    // ProcessManager 跨 reload 复用——只刷新容量，不重建实例（活跃进程 +
    // 队列保留）。env 现在是 process-level，setLimits 会取最新 env 值。
    processes.setLimits({
      maxConcurrentTotal: workerEnv.MAX_CONCURRENT_TOTAL,
      perEngineLimits: { ...workerEnv.perEngineLimits },
    })
    const nextRuntime = buildWorkerRuntime(state.workerId, nextHydrated, { processes })
    const previous = state.runtime
    state.runtime = nextRuntime
    state.configVersion = newVersion
    try {
      previous.dispose()
    }
    catch (err) {
      consola.warn(`[worker ${state.workerId}] previous runtime dispose failed: ${String(err)}`)
    }
    consola.info(`[worker ${state.workerId}] runtime reloaded to config version ${newVersion}`)
  }

  const app = new OpenAPIHono()
  app.use(requestLogger)
  app.onError(errorHandler)

  app.get('/health', async (c) => {
    const [brainHealth, executorHealth] = await Promise.all([
      state.runtime.brain.health().catch(() => null),
      state.runtime.executor.health().catch(() => null),
    ])
    return c.json({
      mode: 'worker',
      workerId: state.workerId,
      status: 'ok',
      brain: brainHealth,
      executor: executorHealth,
      configVersion: state.configVersion,
      startedAt: state.startedAt,
      checkedAt: new Date().toISOString(),
    })
  })

  // Public surface: `/{channel}/webhook` at the root so that external platforms
  // can register simple URLs. The `{workerId}` segment is stripped by Caddy —
  // the worker container only ever sees its own suffix.
  app.route(
    '/',
    buildChannelRoutes(() => state.runtime, state.workerId),
  )

  app.route('/api/worker/orchestrator', buildOrchestratorRoutes(() => state.runtime))
  app.route('/api/worker/evolution', evolutionRoutes)
  app.route('/api/worker/events', buildEventRoutes(() => state.runtime))
  app.route('/api/worker', buildManagementRoutes({ getState: () => state, reloadRuntime }))

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Worker API',
      version: '0.2.0',
      description: `Per-worker surface: channels, orchestrator, memory, skills, execution, evolution. Worker id: ${state.workerId}`,
    },
  })

  app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }))

  return { app, port: workerEnv.PORT, state }
}

/** Back-compat wrapper — used by `src/index.ts`. */
export async function createWorkerApp(): Promise<{ app: OpenAPIHono, port: number }> {
  const { app, port } = await bootstrapWorkerApp()
  return { app, port }
}
