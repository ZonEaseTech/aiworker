import type { WorkerModeState } from '@zonease/aiworker-core'
import type { WorkerConfig } from '@zonease/aiworker-shared'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import {
  buildWorkerRuntime,
  enumerateSecretPaths,
  getSecretsVault,
  hydrateSecrets,
  loadOrMintIdentity,
  loadOrSeedConfig,
  printBootstrapIfJustMinted,
  ProcessManager,
  workerEnv,
} from '@zonease/aiworker-core'
import { getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'
import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'
import { buildChannelRoutes } from '../worker/channels/routes'
import { buildEventRoutes } from '../worker/events/routes'
import { evolutionRoutes } from '../worker/evolution/routes'
import { buildBearerAuth } from '../worker/management/bearer-auth'
import { buildManagementRoutes } from '../worker/management/routes'
import { buildOrchestratorRoutes } from '../worker/orchestrator/routes'

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

export interface BootstrapWorkerAppOptions {
  /**
   * 调用方（如 `aiw serve`）注册的 hook，在 `state.runtime` 已经原子换成
   * `nextRuntime` 之后、`previous.dispose()` 解绑老 bus 之前同步触发。
   * 顺序很关键：必须晚于 swap（hook 里 `state.runtime` 已是新 runtime），
   * 必须早于 dispose（subscriber 重新订阅完成后老 bus 才能被解掉）。
   *
   * gateway-client 用它把 subscriber 重新挂到新 bus 上——老 bus 被 dispose
   * 之后就不会再发事件，subscriber 的旧 unsubscribe 闭包是死的。
   */
  onRuntimeReloaded?: () => void
}

/**
 * Self-sufficient worker bootstrap: init worker.db, mint identity on first
 * boot, load (or seed) config, hydrate secrets from the vault, and build the
 * runtime. Returns the assembled Hono app plus a mutable `state` object whose
 * `runtime` ref is atomically replaced by `reloadRuntime` when PLAN-004 2.2
 * management API pushes a new config.
 */
export async function bootstrapWorkerApp(options: BootstrapWorkerAppOptions = {}): Promise<{
  app: OpenAPIHono
  port: number
  state: WorkerModeState
  /**
   * Hot-reload entry point shared by HTTP `PUT /config` and gateway-client
   * `config.put` — atomically swaps `state.runtime` to a runtime built around
   * the new stored config. Throwing here does NOT roll back the persisted
   * config; callers downgrade their `runtimeReload` field instead.
   */
  reloadRuntime: (nextStoredConfig: WorkerConfig, newVersion: number) => Promise<void>
}> {
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
    // hook 必须在 swap 之后、dispose 之前调——subscriber 此时才能从新 bus
    // 拿到 listener；一旦 previous.dispose() 跑完，老 bus 上即使有事件也
    // 不会再到达 subscriber（且新事件本来也是从新 bus 出的）。
    if (options.onRuntimeReloaded) {
      try {
        options.onRuntimeReloaded()
      }
      catch (err) {
        consola.warn(`[worker ${state.workerId}] onRuntimeReloaded hook failed: ${String(err)}`)
      }
    }
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

  // BUG-015: bearer-auth 必须挂在 `/api/worker/*` 顶层而非各 sub-router 内部，
  // 否则 orchestrator / evolution / events 会落在防护外。`/health` 与 channels
  // webhook 不在该前缀下，仍按原计划公开。
  app.use('/api/worker/*', buildBearerAuth({
    getIdentity: () => ({ tokenPlaintext: state.tokenPlaintext }),
  }))

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

  return { app, port: workerEnv.PORT, state, reloadRuntime }
}

/** Back-compat wrapper — used by `src/index.ts`. */
export async function createWorkerApp(): Promise<{ app: OpenAPIHono, port: number }> {
  const { app, port } = await bootstrapWorkerApp()
  return { app, port }
}
