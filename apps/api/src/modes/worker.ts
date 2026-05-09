import type { WorkerModeState } from '@zonease/aiworker-core'
import type { WorkerConfig } from '@zonease/aiworker-shared'
import path from 'node:path'

import { OpenAPIHono, z } from '@hono/zod-openapi'
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
import { adminStaticMiddleware } from '../worker/admin/serve-static'
import { buildBrainRoutes } from '../worker/brain/routes'
import { buildCaseRoutes } from '../worker/cases/routes'
import { buildChannelRoutes } from '../worker/channels/routes'
import { buildEventRoutes } from '../worker/events/routes'
import { evolutionRoutes } from '../worker/evolution/routes'
import { buildBearerAuth } from '../worker/management/bearer-auth'
import { buildManagementRoutes } from '../worker/management/routes'
import { buildOrchestratorRoutes } from '../worker/orchestrator/routes'

const DEFAULT_WORKER_RUNTIME_VERSION = 'dev'

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
   * 调用方（如 `aiworker serve`）注册的 hook，在 `state.runtime` 已经原子换成
   * `nextRuntime` 之后、`previous.dispose()` 解绑老 bus 之前同步触发。
   * 顺序很关键：必须晚于 swap（hook 里 `state.runtime` 已是新 runtime），
   * 必须早于 dispose（subscriber 重新订阅完成后老 bus 才能被解掉）。
   *
   * gateway-client 用它把 subscriber 重新挂到新 bus 上——老 bus 被 dispose
   * 之后就不会再发事件，subscriber 的旧 unsubscribe 闭包是死的。
   */
  onRuntimeReloaded?: () => void
  /**
   * PLAN-022 / FEAT-033：worker bundle 静态根目录绝对路径。CLI 在启动时决议
   * （npm install 后是 `<cli-bin>/web/worker`，源码 dev 时是
   * `<repo>/apps/web/dist/worker`）。未传 → `/admin/*` 不挂载，访问 404；不
   * 阻塞 bootstrap。
   */
  webStaticDir?: string
  /** Runtime/package version surfaced by `/api/worker/info` and OpenAPI docs. */
  runtimeVersion?: string
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
  const runtimeVersion = options.runtimeVersion ?? DEFAULT_WORKER_RUNTIME_VERSION

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

  let lastReload: Promise<void> = Promise.resolve()

  async function doReloadRuntime(nextStoredConfig: WorkerConfig, newVersion: number): Promise<void> {
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

  function reloadRuntime(nextStoredConfig: WorkerConfig, newVersion: number): Promise<void> {
    const run = lastReload
      .catch(() => undefined)
      .then(() => doReloadRuntime(nextStoredConfig, newVersion))
    lastReload = run
    return run
  }

  const app = new OpenAPIHono()
  app.use(requestLogger)
  app.onError(errorHandler)

  // PLAN-022 / FEAT-033：worker bundle 静态托管。挂在 bearer-auth 之前——
  // `/admin/*` 是公开面（与 `/health`、channel webhook 同等级），不携带
  // 业务数据；`/api/worker/*` 仍走 bearer-auth。fail-closed 公开模式下要靠
  // 反代 basic-auth 把陌生人挡在 `/admin/` 之外（见 BUG-007 / BUG-019）。
  if (options.webStaticDir) {
    const dir = options.webStaticDir
    app.get('/admin', c => c.redirect('/admin/', 308))
    app.use('/admin/*', adminStaticMiddleware(dir))
  }

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
      // TODO-016: self-identification fields so callers using a stale
      // bearer can diagnose "I'm talking to the wrong worker" without auth.
      // Paths are non-sensitive (no token, no secret); they let curl-based
      // smoke scripts confirm they hit the expected worker.db / project.
      workerHome: path.dirname(workerEnv.WORKER_DB_PATH),
      runtimeVersion,
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
  app.route('/api/worker/cases', buildCaseRoutes(() => state.runtime))
  app.route('/api/worker/evolution', evolutionRoutes)
  app.route('/api/worker/events', buildEventRoutes(() => state.runtime))
  app.route('/api/worker/brain', buildBrainRoutes({
    getWorkerId: () => state.workerId,
    getDecisionPipelineConfig: () => {
      const decisionPipeline = state.runtime.config.orchestrator?.decisionPipeline
      const result: { intentEvaluator?: 'heuristic' | 'llm', qualityEvaluator?: 'heuristic' | 'llm', qualityMode?: 'observe' | 'warn' | 'retry' | 'block', qualityThreshold?: number, conversationClassifierEnabled?: boolean } = {
        intentEvaluator: decisionPipeline?.intentClassifier?.evaluator ?? 'heuristic',
        qualityEvaluator: decisionPipeline?.qualityGate?.evaluator ?? 'heuristic',
        qualityMode: decisionPipeline?.qualityGate?.mode ?? 'observe',
        conversationClassifierEnabled: true,
      }
      if (decisionPipeline?.qualityGate?.threshold !== undefined)
        result.qualityThreshold = decisionPipeline.qualityGate.threshold
      return result
    },
  }))
  app.route('/api/worker', buildManagementRoutes({ getState: () => state, reloadRuntime, runtimeVersion }))

  // BUG-065: sub-router endpoints register paths via plain `app.get(...)` so
  // `OpenAPIHono.doc()` can't reflect them. Re-register the operator-facing
  // surface here as typed routes pointing at the existing handlers — keeps
  // diff small while populating `/openapi.json` paths and unblocking the
  // `/docs` Scalar UI. Coverage is intentionally partial; full conversion
  // tracked separately.
  registerWorkerOpenApiPaths(app)

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Worker API',
      version: runtimeVersion,
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

/**
 * BUG-065 minimal-diff fix. Re-declares the operator-facing endpoints at the
 * doc level so `app.doc('/openapi.json')` returns a non-empty `paths`
 * object. Each entry mirrors the canonical handler URL; the response schema
 * is intentionally lightweight (`z.object({}).passthrough()`) — the goal is
 * to populate the doc surface and unblock typed clients, not to fully
 * express every shape. Sub-routers continue serving the actual handlers.
 */
function registerWorkerOpenApiPaths(app: OpenAPIHono): void {
  const lightObject = z.object({}).passthrough().openapi('WorkerEndpointResponse')
  const errorObject = z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }).openapi('WorkerErrorResponse')

  const okJson = {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: lightObject } },
    },
  } as const
  const errJson = {
    description: 'Error',
    content: { 'application/json': { schema: errorObject } },
  } as const

  const docs: Array<{
    method: 'get' | 'post' | 'put' | 'delete'
    path: string
    summary: string
    tags: string[]
    requireAuth?: boolean
  }> = [
    { method: 'get', path: '/health', summary: 'Worker health snapshot (public)', tags: ['health'] },
    { method: 'get', path: '/api/worker/info', summary: 'Worker identity, brainSummary, scope manifest, runtime version', tags: ['management'], requireAuth: true },
    { method: 'get', path: '/api/worker/sessions', summary: 'Active orchestrator sessions', tags: ['management'], requireAuth: true },
    { method: 'get', path: '/api/worker/schedule', summary: 'Worker cron schedule snapshot', tags: ['management'], requireAuth: true },
    { method: 'get', path: '/api/worker/approvals', summary: 'Pending tool approval requests', tags: ['management'], requireAuth: true },
    { method: 'get', path: '/api/worker/brain/summary', summary: 'Brain summary aggregate (memories / skills / artifacts / admission)', tags: ['brain'], requireAuth: true },
    { method: 'post', path: '/api/worker/brain/inbox/from-task/{taskId}', summary: 'Create Brain Inbox admission proposals from task lessons', tags: ['brain'], requireAuth: true },
    { method: 'get', path: '/api/worker/brain/admission', summary: 'List admission proposals', tags: ['brain'], requireAuth: true },
    { method: 'get', path: '/api/worker/brain/admission/{id}', summary: 'Show admission proposal + decisions', tags: ['brain'], requireAuth: true },
    { method: 'post', path: '/api/worker/brain/admission/{id}/approve', summary: 'Approve a pending admission proposal', tags: ['brain'], requireAuth: true },
    { method: 'post', path: '/api/worker/brain/admission/{id}/apply', summary: 'Materialize an approved admission proposal (dry-run unless commit=true)', tags: ['brain'], requireAuth: true },
    { method: 'get', path: '/api/worker/cases', summary: 'List operator-facing Worker Case Files', tags: ['cases'], requireAuth: true },
    { method: 'get', path: '/api/worker/cases/{taskId}', summary: 'Show one Worker Case File with review decision and evidence', tags: ['cases'], requireAuth: true },
    { method: 'post', path: '/api/worker/cases/{taskId}/rerun', summary: 'Create a bounded rerun from one Worker Case', tags: ['cases'], requireAuth: true },
    { method: 'post', path: '/api/worker/cases/{taskId}/lessons/propose', summary: 'Create Brain admission proposals from one Worker Case lessons queue', tags: ['cases'], requireAuth: true },
    { method: 'get', path: '/api/worker/orchestrator/tasks', summary: 'List recent worker orchestrator tasks', tags: ['orchestrator'], requireAuth: true },
    { method: 'get', path: '/api/worker/orchestrator/tasks/{id}/journal', summary: 'Show Brain Journal trace for one worker task', tags: ['orchestrator'], requireAuth: true },
    { method: 'post', path: '/api/worker/orchestrator/tasks/{id}/rerun', summary: 'Create a bounded proof-loop rerun for one worker task', tags: ['orchestrator'], requireAuth: true },
    { method: 'post', path: '/api/worker/orchestrator/tasks', summary: 'Submit a worker orchestrator task', tags: ['orchestrator'], requireAuth: true },
    { method: 'get', path: '/api/worker/orchestrator/conversations', summary: 'List recent worker orchestrator conversations', tags: ['orchestrator'], requireAuth: true },
    { method: 'get', path: '/api/worker/orchestrator/conversations/{id}/messages', summary: 'List messages for a worker orchestrator conversation', tags: ['orchestrator'], requireAuth: true },
    { method: 'post', path: '/api/worker/orchestrator/conversations/{id}/messages', summary: 'Continue an existing worker orchestrator conversation', tags: ['orchestrator'], requireAuth: true },
    { method: 'get', path: '/api/worker/events/stream', summary: 'SSE stream of orchestrator events', tags: ['events'], requireAuth: true },
  ]

  for (const doc of docs) {
    const responses: Record<string, unknown> = { ...okJson }
    if (doc.requireAuth) {
      responses[401] = errJson
      responses[403] = errJson
    }
    app.openAPIRegistry.registerPath({
      method: doc.method,
      path: doc.path,
      summary: doc.summary,
      tags: doc.tags,
      ...(doc.requireAuth ? { security: [{ bearerAuth: [] }] } : {}),
      responses: responses as never,
    })
  }

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'Worker bearer token. Obtain via `aiworker token rotate` or first-run mint.',
  })
}
