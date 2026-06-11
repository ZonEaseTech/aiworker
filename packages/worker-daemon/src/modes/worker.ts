import type { BaselineAssetStoreKind } from '@zonease/aiworker-engine-projection'
import type { LocalEngineStatus, LocalSettingsConfig, LocalWorkerOverlayAsset, SoulAppEngineTarget } from '@zonease/aiworker-soul-descriptor'
import type { SessionRow, WorkerRow, WorkspaceRow } from '@zonease/aiworker-storage-sqlite/worker'

import type { LocalExecutor, LocalWorkerRuntime, LocalWorkerRuntimeOptions, WorkerApiAuthProvider, WorkerOrchestrator } from '@zonease/aiworker-worker-runtime'
import type { Context } from 'hono'
import type { checkInToHost, WorkerAccessTunnelHandle } from './worker/provision-client'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { redactEngineBridgeValue } from '@zonease/aiworker-engine-bridge'
import { listBaselineAssets, readBaselineAssetContent } from '@zonease/aiworker-engine-projection'
import { resolveWorkerOverlayFile } from '@zonease/aiworker-fs-layout'
import {
  AppError,
  parseWorkerOverlaySourceRef,
} from '@zonease/aiworker-soul-descriptor'
import {
  closeWorkerDb,
  deleteSession,
  deleteWorker,
  deleteWorkerConfigValue,
  deleteWorkspace,
  getEngineInvocation,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listEngineInvocations,
  listFiles,
  listSessionEvents,
  listSessions,
  listWorkerConfigValues,
  listWorkerOverlayAssets,
  listWorkers,
  listWorkspaces,
  resolveSingleActiveWorker,
  runWorkerMigrations,
  updateSession,
  updateWorkspace,
  upsertWorker,
  upsertWorkerConfigValue,
} from '@zonease/aiworker-storage-sqlite/worker'
import {
  parseWorkerAssignmentEnvelope,
  parseWorkerLifecycle,
} from '@zonease/aiworker-worker-control-protocol'

import {
  applyUserTitle,
  createLocalBearerAuthProvider,
  createWorkerOrchestrator,
  LocalEngineResolutionError,
  resolveLocalCliEngine,
  stripSessionTitleSourceMetadata,
  workerEnv,
} from '@zonease/aiworker-worker-runtime'
import { streamSSE } from 'hono/streaming'
import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'
import { registerLocalOpenApiPaths } from './worker/openapi'
import { connectWorkerAccessTunnel, maybeProvisionCheckIn } from './worker/provision-client'
import {
  createBrokerEngineInvocationBodySchema,
  createBrokerSessionBodySchema,
  createSessionInvocationBodySchema,
  createWorkspaceLocatorBodySchema,
  installAppBodySchema,
  parseJsonBody,
  patchSessionBodySchema,
  patchSettingsBodySchema,
  patchWorkerBodySchema,
  patchWorkspaceBodySchema,
  projectionRefreshBodySchema,
  reconcileEngineInvocationBodySchema,
  workerConfigContentBodySchema,
  workerConfigValueBodySchema,
} from './worker/schemas'
import { loadLocalSettings, readLocalConnectorSettings, readLocalEngineSettings, saveLocalSettings, scanEnginesForDaemon, setEngineScanner } from './worker/settings'
import { serveWorkerWeb, serveWorkerWebAsset } from './worker/web-static'

const DEFAULT_RUNTIME_VERSION = 'dev'

export interface BootstrapWorkerAppOptions {
  dbPath?: string
  engineBridge?: LocalWorkerRuntimeOptions['engineBridge']
  officialAppsRoot?: string
  webStaticDir?: string
  migrationsFolder?: string
  workersRoot?: string
  token?: string
  runtimeVersion?: string
  executor?: LocalExecutor
  // 引擎扫描缝(镜像 executor 注入):不传则用真实 scanLocalEngines;测试注入 fake,
  // 使 settings 加载 / rescan 路由不 shell 出真实引擎 CLI。
  engineScanner?: () => LocalEngineStatus[]
  // 会话自动命名缝:不传则关闭(单元/集成测试不会自动 spawn 取名引擎);
  // 真实 CLI 入口 (aiworker start/daemon) 传 true 开启。见 docs/runtime.md。
  sessionAutoName?: boolean
  now?: () => string
  provisionCheckIn?: typeof checkInToHost
  connectWorkerAccessTunnel?: typeof connectWorkerAccessTunnel
}

export interface LocalDaemonState {
  authProvider: WorkerApiAuthProvider
  host: WorkerOrchestrator
  startedAt: string
  runtimeVersion: string
  runtimes: Map<string, LocalWorkerRuntime>
  // Worker home root the daemon and runtime/projection share: overlay content
  // files live under `<workersRoot>/overlays`, sibling to `<workersRoot>/workspaces`.
  // Must NOT diverge from the runtime's view.
  workersRoot: string
  now?: () => string
  // 关停 daemon:dispose 所有运行体(排空各自事件总线,断开还活着的 SSE live-tail
  // 订阅),必须在 closeWorkerDb 之前调用,否则关库后被触发的订阅回调会撞上
  // "Worker database not initialized"。幂等。
  shutdown: () => void
}

export async function bootstrapWorkerApp(options: BootstrapWorkerAppOptions = {}): Promise<{
  app: OpenAPIHono
  port: number
  state: LocalDaemonState
}> {
  const dbPath = options.dbPath ?? workerEnv.WORKER_DB_PATH
  await mkdir(path.dirname(dbPath), { recursive: true })
  closeWorkerDb()
  initWorkerDb(dbPath)
  runWorkerMigrations(options.migrationsFolder ?? workerEnv.WORKER_MIGRATIONS_FOLDER)

  const runtimeVersion = options.runtimeVersion ?? DEFAULT_RUNTIME_VERSION
  const workersRoot = options.workersRoot ?? path.dirname(dbPath)
  const runtimes = new Map<string, LocalWorkerRuntime>()
  const workerAccessTunnels = new Set<WorkerAccessTunnelHandle>()
  // 安装引擎扫描器(默认 = 真实 scanLocalEngines),必须早于任何 settings 加载
  // (bootstrapOfficialSoulApps / runtime.init / 后续请求路径)。
  setEngineScanner(options.engineScanner ?? null)
  const host = createWorkerOrchestrator({
    engineBridge: options.engineBridge,
    executor: options.executor,
    sessionAutoName: options.sessionAutoName ?? false,
    now: options.now,
    officialAppsRoot: options.officialAppsRoot,
    registryContext: () => {
      const settings = readLocalConnectorSettings()
      return {
        availableConnectorIds: settings.connectors.map(connector => connector.id),
        enabledConnectorIds: settings.connectors.filter(connector => connector.enabled).map(connector => connector.id),
        hostVersion: runtimeVersion,
      }
    },
    workersRoot,
  })
  const state: LocalDaemonState = {
    authProvider: createLocalBearerAuthProvider({ token: options.token ?? workerEnv.AIWORKER_LOCAL_TOKEN }),
    host,
    runtimes,
    startedAt: new Date().toISOString(),
    runtimeVersion,
    workersRoot,
    now: options.now,
    shutdown: () => {
      for (const tunnel of workerAccessTunnels)
        tunnel.close()
      workerAccessTunnels.clear()
      for (const runtime of runtimes.values())
        runtime.dispose()
      runtimes.clear()
      // 重置回真实扫描器,防止本测试注入的 fake 泄漏到下一个测试。
      setEngineScanner(null)
    },
  }
  await state.host.bootstrapOfficialSoulApps()
  // C4:daemon 至多重建一个 active worker。>1 active 仅来自旧多路复用脏 DB →
  // fail-fast(loud > silent;静默 archive 是有后果的数据决策,应让操作者显式处理)。
  // 复用共享 resolver,使 bootstrap/control-route/CLI 对 "active" 的定义同源。
  const activeResolution = resolveSingleActiveWorker()
  if (activeResolution.kind === 'multiple') {
    throw new AppError(
      'DAEMON_MULTIPLE_ACTIVE_WORKERS',
      500,
      `Daemon DB holds more than one active worker (${activeResolution.workers.map(w => w.id).join(', ')}); a daemon hosts at most one active worker.`,
    )
  }
  if (activeResolution.kind === 'single') {
    const runtime = state.host.createRuntimeForWorker(activeResolution.worker)
    await runtime.init()
    runtimes.set(activeResolution.worker.id, runtime)
  }

  const app = new OpenAPIHono()
  // Standalone Workbench-prefix strip (mirror of Host's mapWorkerAccessPath).
  // Standalone serves the Workbench at the daemon root, so the SPA's runtime
  // <base href>/API_BASE compute `/workers/:id` from the entry URL and the
  // browser requests `/workers/:id/assets/x`, `/workers/:id/api/x`,
  // `/workers/:id/workspaces/...` even on a deep-route fresh reload. The daemon
  // only has root routes, so those prefixed paths would 404 (assets/API) or
  // mis-route. Strip a single leading `/workers/<seg>` and RE-DISPATCH the
  // request through the same app so it lands on the existing root handler. This
  // must run before every route (Hono selects the handler before middleware, so
  // mutating c.req.path is too late — re-entrant app.fetch re-runs full routing
  // on the stripped path). Behind the Host tunnel the prefix is already stripped
  // by the Host, so the daemon receives root paths and this is a no-op. The only
  // root route under `/workers/` is the SPA catch-all; `/api/workers/:workerId`
  // is under `^/api/`, so this never mis-strips worker-config/data routes.
  app.use('*', async (c, next) => {
    const stripped = stripWorkerWebPrefix(c.req.path)
    if (stripped === null)
      return next()
    const url = new URL(c.req.url)
    url.pathname = stripped
    return app.fetch(new Request(url, c.req.raw))
  })
  app.use(requestLogger)
  app.onError(errorHandler)
  app.use('/api/*', async (c, next) => {
    const result = state.authProvider.authenticate({ authorization: c.req.header('authorization') })
    if (result.status === 'denied')
      return c.json({ error: { code: 'UNAUTHORIZED', message: result.reason } }, 401)
    return next()
  })

  app.get('/health', c => c.json({
    mode: 'soul-workspace',
    status: 'ok',
    workers: listWorkers().map(worker => ({ id: worker.id, appId: worker.appId, status: worker.status })),
    runtimeVersion: state.runtimeVersion,
    startedAt: state.startedAt,
    checkedAt: new Date().toISOString(),
  }))

  // Host↔Worker 控制契约面（被动 server；Host 是 client）。Phase-2 Host 只消费
  // Worker 自描述、健康、assignment、lifecycle；可把员工导向 Worker 自有
  // Workbench URL，但不得 mount/frame/render Workbench。这些端点只读/接收控制
  // 信封，不得触碰 session/invocation/projection/engine 逻辑（C5）。
  app.get('/api/control/health', c => c.json({ ready: true }))

  app.get('/api/control/worker', (c) => {
    // C3:取该 daemon 唯一 active worker。复用共享 resolver(与 bootstrap/CLI 同源):
    // 恒取唯一 active,绝不在脏多-active DB 上静默取首元素;zero-active(fresh /
    // 全 archived)与 multiple-active 都 → 404,绝不猜。
    const resolution = resolveSingleActiveWorker()
    if (resolution.kind !== 'single')
      return c.json({ error: { code: 'WORKER_NOT_FOUND', message: 'no active worker registered' } }, 404)
    const worker = resolution.worker
    return c.json({
      workerId: worker.id,
      id: worker.appId,
      version: state.runtimeVersion,
      health: { ready: true },
      workbenchUrl: '/',
    })
  })

  app.put('/api/control/assignment', async (c) => {
    try {
      const envelope = parseWorkerAssignmentEnvelope(await c.req.json())
      return c.json({ assignment: envelope })
    }
    catch (error) {
      return c.json({ error: { code: 'CONTROL_ASSIGNMENT_INVALID', message: error instanceof Error ? error.message : String(error) } }, 400)
    }
  })

  app.post('/api/control/lifecycle', async (c) => {
    try {
      const lifecycle = parseWorkerLifecycle(await c.req.json())
      return c.json({ workerId: lifecycle.workerId, action: lifecycle.action })
    }
    catch (error) {
      return c.json({ error: { code: 'CONTROL_LIFECYCLE_INVALID', message: error instanceof Error ? error.message : String(error) } }, 400)
    }
  })

  app.get('/api/info', c => c.json({
    runtimeVersion: state.runtimeVersion,
    startedAt: state.startedAt,
    workers: listWorkers(),
  }))

  app.get('/api/app-installation/apps', c => c.json({ apps: state.host.listApps() }))
  app.post('/api/app-installation/install', async (c) => {
    const result = await parseJsonBody(c, installAppBodySchema, 'INSTALL_APP_INVALID')
    if (!result.ok)
      return result.response
    const { descriptor, descriptorPath } = result.data
    const app = typeof descriptorPath === 'string' && descriptorPath.trim()
      ? await state.host.installAppFromPath(descriptorPath)
      : state.host.installAppDescriptor({
          descriptor,
          sourceKind: 'inline',
          sourceRef: 'api:inline',
        })
    return c.json({ app, catalog: state.host.listCatalog() }, 201)
  })
  app.get('/api/app-installation/apps/:appId', (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return notFound(c, 'Soul App')
    return c.json({ app })
  })
  app.post('/api/app-installation/apps/:appId/enable', (c) => {
    const app = state.host.enableApp(c.req.param('appId'))
    return c.json({ app, catalog: state.host.listCatalog() })
  })
  app.post('/api/app-installation/apps/:appId/archive', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.archiveApp(appId)
    return c.json({ app, catalog: state.host.listCatalog() })
  })
  app.delete('/api/app-installation/apps/:appId', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.deleteApp(appId)
    return c.json({ app, catalog: state.host.listCatalog(), deleted: true })
  })

  app.get('/api/workers', c => c.json({ workers: listWorkers() }))
  app.get('/api/workers/:workerId', (c) => {
    const worker = getWorker(c.req.param('workerId'))
    if (!worker)
      return notFound(c, 'worker')
    return c.json({ worker, snapshot: requireRuntime(state, worker.id).snapshot() })
  })
  app.patch('/api/workers/:workerId', async (c) => {
    const existing = getWorker(c.req.param('workerId'))
    if (!existing)
      return notFound(c, 'worker')
    const result = await parseJsonBody(c, patchWorkerBodySchema, 'PATCH_WORKER_INVALID')
    if (!result.ok)
      return result.response
    let worker
    try {
      worker = upsertWorker({
        id: existing.id,
        appId: existing.appId,
        name: result.data.name ?? existing.name,
        status: result.data.status ?? existing.status,
        defaultEngineId: result.data.defaultEngineId ?? existing.defaultEngineId,
        metadataJson: result.data.metadata ?? existing.metadataJson,
      })
    }
    catch (error) {
      const response = hostMetadataValidationResponse(c, 'PATCH_WORKER_INVALID', error)
      if (response)
        return response
      throw error
    }
    const runtime = state.host.createRuntimeForWorker(worker)
    await runtime.init()
    state.runtimes.set(worker.id, runtime)
    return c.json({ worker, snapshot: runtime.snapshot() })
  })
  app.post('/api/workers/:workerId/archive', async (c) => {
    const existing = getWorker(c.req.param('workerId'))
    if (!existing)
      return notFound(c, 'worker')
    const worker = upsertWorker({
      id: existing.id,
      appId: existing.appId,
      name: existing.name,
      status: 'archived',
      defaultEngineId: existing.defaultEngineId,
      metadataJson: existing.metadataJson,
    })
    state.runtimes.delete(worker.id)
    return c.json({ worker })
  })
  app.delete('/api/workers/:workerId', async (c) => {
    const existing = getWorker(c.req.param('workerId'))
    if (!existing)
      return notFound(c, 'worker')
    const runtime = requireRuntime(state, existing.id)
    const cleanedTargets: string[] = []
    for (const workspace of listWorkspaces(existing.id, Number.MAX_SAFE_INTEGER)) {
      let cleanup: Awaited<ReturnType<LocalWorkerRuntime['cleanupWorkspaceProjectionReceipt']>>
      try {
        cleanup = await runtime.cleanupWorkspaceProjectionReceipt(workspace.id)
      }
      catch (error) {
        if (isInvalidProjectionReceiptError(error))
          return projectionReceiptStale(c, workspace.id)
        throw error
      }
      cleanedTargets.push(...cleanup?.cleanedTargets ?? [])
    }
    deleteWorker(existing.id)
    state.runtimes.delete(existing.id)
    return c.json({ cleanedTargets, deleted: true, worker: existing })
  })
  app.get('/api/workers/:workerId/config', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    return c.json({
      config: workerConfigResponse(worker.id),
      overlay: await workerOverlayResponse(state, worker.id),
      workerId: worker.id,
    })
  })
  app.put('/api/workers/:workerId/config/:configKey', async (c) => {
    return workerConfigMutationResponse(c, state, false)
  })
  app.patch('/api/workers/:workerId/config/:configKey', async (c) => {
    return workerConfigMutationResponse(c, state, false)
  })
  app.post('/api/workers/:workerId/config/:configKey/archive', async (c) => {
    return workerConfigMutationResponse(c, state, true)
  })
  app.get('/api/workers/:workerId/config/:configKey/content', async (c) => {
    return workerConfigContentReadResponse(c, state)
  })
  app.put('/api/workers/:workerId/config/:configKey/content', async (c) => {
    return workerConfigContentWriteResponse(c, state)
  })
  app.get('/api/workspace-locators', (c) => {
    const workerId = c.req.query('workerId')
    if (!workerId)
      return c.json({ workspaces: listWorkspaces() })
    requireRuntime(state, workerId)
    return c.json({ workspaces: listWorkspaces(workerId) })
  })
  app.post('/api/workspace-locators', async (c) => {
    const result = await parseJsonBody(c, createWorkspaceLocatorBodySchema, 'CREATE_WORKSPACE_LOCATOR_INVALID')
    if (!result.ok)
      return result.response
    const unavailableApp = unavailableSoulAppResponse(c, state, result.data.workerId)
    if (unavailableApp)
      return unavailableApp
    const runtime = requireRuntime(state, result.data.workerId)
    let workspace
    try {
      workspace = await runtime.createWorkspace({
        name: result.data.name,
        type: result.data.type ?? 'workspace',
        sourcePointers: result.data.sourcePointers ?? [],
        metadata: result.data.metadata ?? {},
      })
    }
    catch (error) {
      const response = hostMetadataValidationResponse(c, 'CREATE_WORKSPACE_LOCATOR_INVALID', error)
      if (response)
        return response
      throw error
    }
    return c.json({ workspace }, 201)
  })
  app.get('/api/workspace-locators/:workspaceId', (c) => {
    const workspace = getWorkspace(c.req.param('workspaceId'))
    if (!workspace)
      return notFound(c, 'workspace')
    return c.json({ workspace })
  })
  app.get('/api/workspace-locators/:workspaceId/files', (c) => {
    const workspace = getWorkspace(c.req.param('workspaceId'))
    if (!workspace)
      return notFound(c, 'workspace')
    // Workspace-scoped files back the Workbench artifacts surface (session
    // artifacts live in the workspace, not on a single invocation result).
    return c.json(redactBrokerOutput({ files: listFiles(workspace.id) }))
  })
  app.patch('/api/workspace-locators/:workspaceId', async (c) => {
    const result = await parseJsonBody(c, patchWorkspaceBodySchema, 'PATCH_WORKSPACE_LOCATOR_INVALID')
    if (!result.ok)
      return result.response
    try {
      return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), ...result.data }) })
    }
    catch (error) {
      const response = hostMetadataValidationResponse(c, 'PATCH_WORKSPACE_LOCATOR_INVALID', error)
      if (response)
        return response
      throw error
    }
  })
  app.post('/api/workspace-locators/:workspaceId/archive', (c) => {
    return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), status: 'archived' }) })
  })
  app.delete('/api/workspace-locators/:workspaceId', async (c) => {
    const workspace = getWorkspace(c.req.param('workspaceId'))
    if (!workspace)
      return notFound(c, 'workspace')
    let cleanup: Awaited<ReturnType<LocalWorkerRuntime['cleanupWorkspaceProjectionReceipt']>>
    try {
      cleanup = await requireRuntime(state, workspace.workerId).cleanupWorkspaceProjectionReceipt(workspace.id)
    }
    catch (error) {
      if (isInvalidProjectionReceiptError(error))
        return projectionReceiptStale(c, workspace.id)
      throw error
    }
    deleteWorkspace(workspace.id)
    return c.json({
      cleanedTargets: cleanup?.cleanedTargets ?? [],
      deleted: true,
      workspace,
    })
  })
  app.get('/api/sessions', (c) => {
    const workerId = c.req.query('workerId')
    const workspaceId = c.req.query('workspaceId')
    if (workspaceId) {
      const workspace = workerId ? requireWorkerWorkspace(workerId, workspaceId) : requireWorkspace(workspaceId)
      return c.json({ sessions: listSessions(workspace.id) })
    }
    if (workerId) {
      requireRuntime(state, workerId)
      const workspaceIds = new Set(listWorkspaces(workerId, Number.MAX_SAFE_INTEGER).map(workspace => workspace.id))
      return c.json({ sessions: listSessions().filter(session => workspaceIds.has(session.workspaceId)) })
    }
    return c.json({ sessions: listSessions() })
  })
  app.post('/api/sessions', async (c) => {
    const result = await parseJsonBody(c, createBrokerSessionBodySchema, 'CREATE_SESSION_INVALID')
    if (!result.ok)
      return result.response
    const workspace = requireWorkerWorkspace(result.data.workerId, result.data.workspaceId)
    return createWorkspaceSessionFromBody(c, state, workspace, result.data)
  })
  app.get('/api/sessions/:sessionId', async (c) => {
    const session = getSession(c.req.param('sessionId'))
    if (!session)
      return notFound(c, 'session')
    return c.json(redactBrokerOutput({
      session,
      invocations: await sessionInvocationsWithInputPreview(session),
      events: listSessionEvents(session.id),
    }))
  })
  app.patch('/api/sessions/:sessionId', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    const result = await parseJsonBody(c, patchSessionBodySchema, 'PATCH_SESSION_INVALID')
    if (!result.ok)
      return result.response
    try {
      const incomingMetadata = result.data.metadata
        ? { ...(session.metadataJson ?? {}), ...stripSessionTitleSourceMetadata(result.data.metadata) }
        : session.metadataJson
      const titlePatch = typeof result.data.title === 'string'
        ? applyUserTitle({ title: session.title, metadataJson: incomingMetadata }, result.data.title)
        : null
      const metadataJson = titlePatch
        ? titlePatch.metadataJson
        : result.data.metadata
          ? incomingMetadata
          : undefined
      return c.json({ session: updateSession({
        id: session.id,
        metadataJson,
        status: result.data.status,
        title: titlePatch?.title,
      }) })
    }
    catch (error) {
      const response = hostMetadataValidationResponse(c, 'PATCH_SESSION_INVALID', error)
      if (response)
        return response
      throw error
    }
  })
  app.post('/api/sessions/:sessionId/archive', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return c.json({ session: updateSession({ id: session.id, status: 'archived' }) })
  })
  app.delete('/api/sessions/:sessionId', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    deleteSession(session.id)
    return c.json({ deleted: true, session })
  })
  app.post('/api/sessions/:sessionId/invocations', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return createSessionInvocationResponse(c, state, session)
  })

  app.post('/api/engine/invocations', async (c) => {
    const result = await parseJsonBody(c, createBrokerEngineInvocationBodySchema, 'CREATE_ENGINE_INVOCATION_INVALID')
    if (!result.ok)
      return result.response
    const session = requireSession(result.data.sessionId)
    return createSessionInvocationFromBody(c, state, session, result.data, 'CREATE_ENGINE_INVOCATION_INVALID')
  })
  app.get('/api/engine/invocations/:invocationId', (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    return c.json(redactBrokerOutput({ invocation }))
  })
  app.get('/api/engine/invocations/:invocationId/events', async (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    const after = readNonNegativeInteger(c.req.query('after') ?? c.req.header('last-event-id'), 0)
    const limit = readPositiveInteger(c.req.query('limit'), 500)
    const session = requireSession(invocation.sessionId)
    const runtime = requireRuntime(state, session.workerId)
    // text/event-stream consumers (EventSource in the Workbench chat) get a live
    // SSE tail; everyone else keeps the snapshot JSON. Both reuse the same
    // reattach + redaction so SSE frames never leak what JSON would not.
    if ((c.req.header('accept') ?? '').includes('text/event-stream'))
      return engineInvocationEventsResponse(c, runtime, invocation.id, after)
    return c.json(redactBrokerOutput(await runtime.reattachEngineInvocationEvents(invocation.id, { after, limit })))
  })
  app.post('/api/engine/invocations/:invocationId/cancel', async (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    if (invocation.status !== 'queued' && invocation.status !== 'running')
      return c.json(redactBrokerOutput({ invocation }))
    const session = requireSession(invocation.sessionId)
    const result = await requireRuntime(state, session.workerId).cancelEngineInvocation(invocation.id)
    return c.json(result, 201)
  })
  app.post('/api/engine/invocations/:invocationId/reconcile', async (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    const result = await parseJsonBody(c, reconcileEngineInvocationBodySchema, 'RECONCILE_ENGINE_INVOCATION_INVALID')
    if (!result.ok)
      return result.response
    const session = requireSession(invocation.sessionId)
    return c.json(redactBrokerOutput(await requireRuntime(state, session.workerId).reconcileEngineInvocation(invocation.id, result.data)), 201)
  })

  app.get('/api/engine/targets', (c) => {
    const settings = readLocalEngineSettings()
    return c.json(settings)
  })
  app.get('/api/engine/targets/:target/readiness', (c) => {
    const settings = readLocalEngineSettings()
    const target = settings.engines.find(engine => engine.id === c.req.param('target'))
    if (!target)
      return c.json({ error: { code: 'ENGINE_TARGET_NOT_FOUND', message: 'Engine target not found.' } }, 404)
    return c.json({ target })
  })
  app.post('/api/engine/targets/rescan', (c) => {
    const current = loadLocalSettings()
    const settings = saveLocalSettings({
      ...current,
      engines: scanEnginesForDaemon(),
      updatedAt: new Date().toISOString(),
    })
    return c.json({ engines: settings.engines, settings })
  })
  app.post('/api/engine/targets/:target/test', (c) => {
    const settings = loadLocalSettings()
    const engineId = c.req.param('target')
    const engine = settings.engines.find(engine => engine.id === engineId)
    if (!engine)
      return c.json({ result: { engineId, message: 'Engine is not known in local settings.', status: 'fail' } }, 404)
    if (!engine.installed)
      return c.json({ result: { engineId, message: `${engine.name} is not installed on PATH.`, status: 'fail' } })
    return c.json({ result: { engineId, message: `${engine.name} responded as ${engine.version ?? engine.path}.`, status: 'pass' } })
  })

  app.post('/api/projections/:target/refresh', async (c) => {
    const target = readProjectionTarget(c.req.param('target'))
    if (!target)
      return c.json({ error: { code: 'PROJECTION_TARGET_INVALID', message: 'Projection target must be codex or claude-code.' } }, 400)
    const result = await parseJsonBody(c, projectionRefreshBodySchema, 'REFRESH_PROJECTION_INVALID')
    if (!result.ok)
      return result.response
    const workspace = requireWorkerWorkspace(result.data.workerId, result.data.workspaceId)
    const unavailableApp = unavailableSoulAppResponse(c, state, workspace.workerId)
    if (unavailableApp)
      return unavailableApp
    const projection = await requireRuntime(state, workspace.workerId).reprojectWorkspaceAssets(workspace.id, { engineTarget: target })
    return c.json({ projection, target })
  })
  app.get('/api/projections/receipts/:receiptId', (c) => {
    return projectionReceiptResponse(c, state)
  })
  app.post('/api/projections/receipts/:receiptId/cleanup', async (c) => {
    const receiptId = c.req.param('receiptId')
    const workspace = getWorkspace(receiptId)
    if (!workspace)
      return projectionReceiptMissing(c, receiptId)
    let result: Awaited<ReturnType<LocalWorkerRuntime['cleanupWorkspaceProjectionReceipt']>>
    try {
      result = await requireRuntime(state, workspace.workerId).cleanupWorkspaceProjectionReceipt(workspace.id)
    }
    catch (error) {
      if (isInvalidProjectionReceiptError(error))
        return projectionReceiptStale(c, receiptId)
      throw error
    }
    if (!result)
      return projectionReceiptMissing(c, receiptId)
    return c.json({
      cleaned: true,
      cleanedTargets: result.cleanedTargets,
      manifestPath: result.manifestPath,
      receiptId: result.receiptId,
      status: 'cleaned',
      workspaceId: result.workspace.id,
    }, 201)
  })

  app.get('/api/settings', (c) => {
    const settings = loadLocalSettings()
    return c.json({ settings })
  })
  app.patch('/api/settings', async (c) => {
    const result = await parseJsonBody(c, patchSettingsBodySchema, 'PATCH_SETTINGS_INVALID')
    if (!result.ok)
      return result.response
    const patch = result.data
    const current = loadLocalSettings()
    const settings = saveLocalSettings({
      ...current,
      ...patch,
      byok: { ...current.byok, ...(patch.byok ?? {}) },
      updatedAt: new Date().toISOString(),
    })
    return c.json({ settings })
  })

  registerLocalOpenApiPaths(app)
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Local Daemon API',
      version: runtimeVersion,
      description: 'Local Shell and Engine Bridge API for Soul Apps, Soul workers, workspaces, sessions, artifacts, files, native engine invocations, and settings.',
    },
  })
  app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }))
  app.get('/', async c => serveWorkerWeb(c, options.webStaticDir))
  app.get('/workers/:path{.+}', async c => serveWorkerWeb(c, options.webStaticDir))
  app.get('/workspaces/:path{.+}', async c => serveWorkerWeb(c, options.webStaticDir))
  app.get('/favicon.png', async c => serveWorkerWebAsset(c, options.webStaticDir, 'favicon.png'))
  app.get('/logo.png', async c => serveWorkerWebAsset(c, options.webStaticDir, 'logo.png'))
  app.get('/assets/:path{.+}', async c => serveWorkerWebAsset(c, options.webStaticDir, `assets/${c.req.param('path')}`))
  app.get('/fonts/:path{.+}', async c => serveWorkerWebAsset(c, options.webStaticDir, `fonts/${c.req.param('path')}`))
  app.get('/engine-icons/:path{.+}', async c => serveWorkerWebAsset(c, options.webStaticDir, `engine-icons/${c.req.param('path')}`))

  if (activeResolution.kind === 'single') {
    // worker-home = daemon 启动的 DB 目录。持久 `<worker-home>/access-token` 在则读回重连、跳过
    // check-in；撤销时（onclose 4401）从此处清盘。
    const workerHome = path.dirname(dbPath)
    // 诚实降级（AC#4b）：check-in 可能因 provision token 已被消费（first-provision 在落盘/建 worker 前
    // 崩溃后重启的 row2/row4）回 401 而抛。绝不让它拖垮 daemon——worker 本地照常运行，只是 tunnel 暂不可用。
    let checkIn: Awaited<ReturnType<typeof maybeProvisionCheckIn>> = null
    try {
      checkIn = await maybeProvisionCheckIn({
        activeResolution,
        checkIn: options.provisionCheckIn,
        env: process.env,
        runtimeVersion: state.runtimeVersion,
        // D6:持久 `<worker-home>/access-token` 在则读回重连、跳过 check-in（first-provision 与重启都走这条，
        // 免对已消费 provision token 二次 check-in）。
        workerHome,
      })
    }
    catch {
      // 不打印异常体（可能含 host 回包/token 痕迹）。诚实可操作:tunnel 暂不可用 + provision 可能已中断。
      console.warn('[aiworker-daemon] worker access check-in 失败:tunnel 暂不可用,worker 仍以本地模式运行;provision 可能已中断,需重新 provision。')
    }
    if (checkIn) {
      const tunnel = await (options.connectWorkerAccessTunnel ?? connectWorkerAccessTunnel)({
        access: checkIn.access,
        assignment: checkIn.assignment,
        env: process.env,
        localFetch: async request => app.fetch(request),
        // 撤销检测（onclose 4401）从这里清持久 token + 停重连循环。
        workerHome,
      })
      if (tunnel)
        workerAccessTunnels.add(tunnel)
    }
  }

  return { app, port: workerEnv.PORT, state }
}

export async function createWorkerApp(): Promise<{ app: OpenAPIHono, port: number }> {
  const { app, port } = await bootstrapWorkerApp()
  return { app, port }
}

/**
 * Strip a single leading `/workers/<seg>` Workbench prefix from a request path,
 * mirroring Host's mapWorkerAccessPath. Returns the root-relative remainder
 * (`/` when the prefix was the whole path), or null when there is no such prefix
 * (a genuine root path → middleware no-op). Pure + exported for unit testing.
 *
 * `/api/workers/:workerId` is under `^/api/` and never matches `^/workers/`, so
 * worker-config/data routes are not affected.
 */
export function stripWorkerWebPrefix(pathname: string): string | null {
  const match = /^\/workers\/[^/]+/.exec(pathname)
  if (!match)
    return null
  return pathname.slice(match[0].length) || '/'
}

/**
 * daemon 启动时的本地 API 暴露告警。
 *
 * - 有 token → null(静默,鉴权已到位)
 * - 无 token + loopback → 匿名开放提示
 * - 无 token + 非 loopback → 显著暴露告警
 *
 * 此函数为纯函数,便于单测;在 daemon 启动处调用并 console.warn 输出。
 */
function isLoopbackHost(host: string): boolean {
  if (host === '' || host === 'localhost' || host === '::1' || host === '[::1]')
    return true
  return /^127\./.test(host)
}

export function localApiExposureWarning(host: string, token: string | null | undefined): string | null {
  if (token)
    return null
  if (isLoopbackHost(host))
    return `[aiworker-daemon] 未配置 AIWORKER_LOCAL_TOKEN:/api/* 以本机匿名身份开放,请确保仅绑定 loopback。`
  return `[aiworker-daemon] AIWORKER_LOCAL_TOKEN 未配置且绑定到非 loopback 地址 ${host}:/api/* 将以匿名身份暴露,请配置 token 或改绑 127.0.0.1。`
}

async function workerOverlayResponse(state: LocalDaemonState, workerId: string) {
  const overlayAssets = listWorkerOverlayAssets(workerId).map(({ checksum, enabled, id, kind, metadataJson, optionsJson, source, sourceRef, target, updatedAt }) => ({
    checksum,
    enabled,
    id,
    kind,
    metadataJson: metadataJson as Record<string, unknown>,
    optionsJson: optionsJson as Record<string, unknown>,
    source,
    sourceRef,
    target,
    updatedAt,
  }))
  const worker = getWorker(workerId)
  if (!worker)
    return { assets: overlayAssets, workerId }

  const source = state.host.engineAssetSourceForWorker(worker)
  if (!source)
    return { assets: overlayAssets, workerId }

  const baselineAssets = await listBaselineAssets(source)
  const overlayKeyMap = new Map(
    overlayAssets.map((asset, index) => [`${asset.kind}:${asset.target}:${asset.id}`, index]),
  )
  const merged: LocalWorkerOverlayAsset[] = [...overlayAssets]
  for (const baseline of baselineAssets) {
    const key = `${baseline.kind}:${baseline.target}:${baseline.id}`
    const overlayIndex = overlayKeyMap.get(key)
    if (overlayIndex !== undefined) {
      const overlay = merged[overlayIndex] as LocalWorkerOverlayAsset
      if (!overlay.enabled)
        merged[overlayIndex] = { ...baseline, enabled: false }
    }
    else {
      merged.push(baseline)
    }
  }
  return { assets: merged, workerId }
}

async function workerConfigMutationResponse(c: Context, _state: LocalDaemonState, archived: boolean): Promise<Response> {
  const worker = requireWorker(String(c.req.param('workerId') ?? ''))
  const configKey = String(c.req.param('configKey') ?? '')
  const updatedAt = new Date().toISOString()
  if (archived) {
    deleteWorkerConfigValue(worker.id, configKey)
    return c.json({
      config: {
        archived: true,
        configKey,
        updatedAt,
        value: null,
        workerId: worker.id,
      },
    })
  }

  const result = await parseJsonBody(c, workerConfigValueBodySchema, 'WORKER_CONFIG_INVALID')
  if (!result.ok)
    return result.response
  const serialized = JSON.stringify(result.data)
  if (containsLiteralSecret(serialized)) {
    return c.json({
      error: {
        code: 'WORKER_CONFIG_SECRET',
        message: 'literal secrets are not allowed in Host worker config descriptors',
      },
    }, 422)
  }
  let saved
  try {
    saved = upsertWorkerConfigValue({
      configKey,
      configValueJson: {
        ...result.data,
        updatedAt,
        updatedBy: 'web',
      },
      source: 'web',
      workerId: worker.id,
      at: updatedAt,
    })
  }
  catch (error) {
    return c.json({
      error: {
        code: 'WORKER_CONFIG_INVALID',
        message: error instanceof Error ? error.message : 'Invalid Host worker config descriptor.',
      },
    }, 422)
  }

  return c.json({
    config: workerConfigValueResponse(saved, false),
  })
}

// configKey → overlay asset identity. The kind prefix selects the worker overlay
// store kind; the suffix is the asset name (skill id / entry-file path / mcp
// engine target). MCP is view-only (Option A): editable=false, redacted display.
interface OverlayConfigTarget {
  configKind: 'entry-file-overlay' | 'mcp-overlay' | 'skill-overlay'
  editable: boolean
  name: string
  storeKind: BaselineAssetStoreKind
  // The MCP engine target, only meaningful when storeKind === 'mcp'.
  engineTarget: SoulAppEngineTarget | null
}

function parseOverlayConfigKey(configKey: string): OverlayConfigTarget | null {
  const colon = configKey.indexOf(':')
  if (colon === -1)
    return null
  const prefix = configKey.slice(0, colon)
  const name = configKey.slice(colon + 1).trim()
  if (!name)
    return null
  if (prefix === 'skill-overlay')
    return { configKind: 'skill-overlay', editable: true, engineTarget: null, name, storeKind: 'skills' }
  if (prefix === 'entry-file-overlay')
    return { configKind: 'entry-file-overlay', editable: true, engineTarget: null, name, storeKind: 'entry-files' }
  if (prefix === 'mcp-overlay') {
    const engineTarget = name === 'codex' || name === 'claude-code' ? name : null
    return { configKind: 'mcp-overlay', editable: false, engineTarget, name, storeKind: 'mcp' }
  }
  return null
}

// The worker-overlay store path for an editable asset. Skills store the SKILL.md
// under `<name>/SKILL.md`; entry-files store at the raw path; the descriptor-side
// sourceRef path follows the same shape.
function overlayStorePath(asset: OverlayConfigTarget): string {
  if (asset.storeKind === 'skills')
    return path.posix.join(asset.name.replace(/\/SKILL\.md$/, ''), 'SKILL.md')
  return asset.name
}

function overlaySourceRef(asset: OverlayConfigTarget): string {
  return `worker-overlay://${asset.storeKind}/${overlayStorePath(asset)}`
}

// The worker overlay store root, derived from the daemon's configured Worker home
// so the daemon writes to the exact same `<workersRoot>/overlays` the orchestrator
// hands the runtime/projection. fs-layout's global-home resolver would diverge
// from a daemon configured with an explicit workersRoot.
function workerOverlaysRoot(state: LocalDaemonState): string {
  return path.join(state.workersRoot, 'overlays')
}

// Find an enabled worker-overlay config value for this configKey whose sourceRef
// points into the worker overlay store. Direct configKey lookup (not the
// kind:target:id baseline merge) — that is all the read path needs.
function enabledWorkerOverlaySourceRef(workerId: string, configKey: string): string | null {
  const row = listWorkerConfigValues(workerId).find(value => value.configKey === configKey)
  if (!row)
    return null
  const envelope = row.configValueJson as { enabled?: unknown, sourceRef?: unknown }
  if (envelope.enabled === false || typeof envelope.sourceRef !== 'string')
    return null
  return parseWorkerOverlaySourceRef(envelope.sourceRef) ? envelope.sourceRef : null
}

async function workerConfigContentReadResponse(c: Context, state: LocalDaemonState): Promise<Response> {
  const worker = requireWorker(String(c.req.param('workerId') ?? ''))
  const configKey = String(c.req.param('configKey') ?? '')
  const asset = parseOverlayConfigKey(configKey)
  if (!asset)
    return c.json({ error: { code: 'WORKER_CONFIG_CONTENT_UNSUPPORTED', message: 'configKey does not address editable overlay content.' } }, 400)

  const overlayRef = enabledWorkerOverlaySourceRef(worker.id, configKey)
  if (overlayRef) {
    const parsed = parseWorkerOverlaySourceRef(overlayRef)!
    const file = resolveWorkerOverlayFile(workerOverlaysRoot(state), parsed.kind, parsed.path)
    const content = await readFile(file, 'utf8')
    return c.json(workerConfigContentPayload(asset, content, 'overlay', overlayRef))
  }

  const source = state.host.engineAssetSourceForWorker(worker)
  if (!source)
    return notFound(c, 'baseline asset')
  const baseline = await readBaselineAssetContent(source, {
    name: asset.name,
    storeKind: asset.storeKind,
    target: asset.engineTarget,
  })
  if (!baseline)
    return notFound(c, 'baseline asset')
  return c.json(workerConfigContentPayload(asset, baseline.content, 'baseline', baseline.sourceRef))
}

function workerConfigContentPayload(
  asset: OverlayConfigTarget,
  content: string,
  contentSource: 'baseline' | 'overlay',
  sourceRef: string,
) {
  // MCP is view-only and may carry literal secrets in the author-owned native
  // file: redact on display via the SAME engine-bridge boundary used for native
  // MCP files everywhere else. Editable kinds never carry secrets (PUT rejects).
  const displayContent = asset.editable ? content : redactMcpFileContent(content)
  return {
    checksum: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    content: displayContent,
    editable: asset.editable,
    source: contentSource,
    sourceRef,
  }
}

function redactMcpFileContent(content: string): string {
  const redacted = redactEngineBridgeValue(content)
  return typeof redacted === 'string' ? redacted : ''
}

async function workerConfigContentWriteResponse(c: Context, state: LocalDaemonState): Promise<Response> {
  const worker = requireWorker(String(c.req.param('workerId') ?? ''))
  const configKey = String(c.req.param('configKey') ?? '')
  const asset = parseOverlayConfigKey(configKey)
  if (!asset)
    return c.json({ error: { code: 'WORKER_CONFIG_CONTENT_UNSUPPORTED', message: 'configKey does not address editable overlay content.' } }, 400)
  if (!asset.editable)
    return c.json({ error: { code: 'WORKER_CONFIG_CONTENT_READONLY', message: 'MCP overlay content is view-only and cannot be edited.' } }, 422)

  const result = await parseJsonBody(c, workerConfigContentBodySchema, 'WORKER_CONFIG_CONTENT_INVALID')
  if (!result.ok)
    return result.response
  const content = result.data.content
  // Reuse the same literal-secret detector the config-envelope mutation uses;
  // editable overlay bodies must not introduce secrets into worker-owned files.
  if (containsLiteralSecret(content)) {
    return c.json({
      error: {
        code: 'WORKER_CONFIG_CONTENT_SECRET',
        message: 'literal secrets are not allowed in worker overlay content',
      },
    }, 422)
  }

  // Content lives ONLY in the worker overlay file; the envelope holds just the
  // sourceRef + checksum (canon: no bulk content in worker metadata).
  const overlaysRoot = workerOverlaysRoot(state)
  const storePath = overlayStorePath(asset)
  const file = resolveWorkerOverlayFile(overlaysRoot, asset.storeKind, storePath)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content, 'utf8')

  const checksum = `sha256:${createHash('sha256').update(content).digest('hex')}`
  const sourceRef = overlaySourceRef(asset)
  const updatedAt = new Date().toISOString()
  // The overlay options point the projection at the descriptor asset this
  // overlay replaces (additive ADD has no baseline → no replaces).
  const baselineRef = baselineDescriptorRef(asset)
  let saved
  try {
    saved = upsertWorkerConfigValue({
      configKey,
      configValueJson: {
        checksum,
        enabled: true,
        kind: asset.configKind,
        options: baselineRef ? { replaces: baselineRef } : {},
        sourceRef,
        target: 'all',
        updatedAt,
        updatedBy: 'web',
      },
      source: 'web',
      workerId: worker.id,
      at: updatedAt,
    })
  }
  catch (error) {
    return c.json({
      error: {
        code: 'WORKER_CONFIG_CONTENT_INVALID',
        message: error instanceof Error ? error.message : 'Invalid worker overlay envelope.',
      },
    }, 422)
  }

  // Re-projection is lazy per the existing pattern: the new checksum moves the
  // workspace freshness marker (stale), and the next /api/projections refresh
  // materializes the edited content into every workspace (worker-scoped overlay).
  return c.json({
    checksum,
    config: workerConfigValueResponse(saved, false),
    content,
    editable: true,
    source: 'overlay',
    sourceRef,
  })
}

// Descriptor baseline sourceRef the overlay replaces, mirroring listBaselineAssets'
// sourceRef shape. ADD (new name with no baseline) still records this; the
// projection simply finds no matching baseline and applies the overlay additively.
function baselineDescriptorRef(asset: OverlayConfigTarget): string | null {
  if (asset.storeKind === 'skills')
    return `descriptor://engine/skills/${asset.name.replace(/\/SKILL\.md$/, '')}`
  if (asset.storeKind === 'entry-files')
    return `descriptor://engine/workspaceAssets/${asset.name}`
  return null
}

function workerConfigResponse(workerId: string) {
  return {
    values: listWorkerConfigValues(workerId).map(row => workerConfigValueResponse(row, false)),
  }
}

function sessionInvocations(sessionId: string) {
  return listEngineInvocations(sessionId).sort((left, right) => left.seq - right.seq)
}

async function sessionInvocationsWithInputPreview(session: SessionRow) {
  const workspace = getWorkspace(session.workspaceId)
  const invocations = sessionInvocations(session.id)
  if (!workspace)
    return invocations
  return Promise.all(invocations.map(async (invocation) => {
    const uiUserDisplayText = await readInvocationInputPreview(workspace, session, invocation.seq)
    if (!uiUserDisplayText)
      return invocation
    return {
      ...invocation,
      metadataJson: {
        ...(invocation.metadataJson ?? {}),
        uiUserDisplayText,
      },
    }
  }))
}

async function readInvocationInputPreview(workspace: WorkspaceRow, session: SessionRow, seq: number): Promise<string | null> {
  const padded = String(seq).padStart(4, '0')
  const invocationRoot = path.join(workspace.rootPath, '.aiworker', 'sessions', session.id, 'invocations', padded)
  const preview = await readRedactedInputPreview(path.join(invocationRoot, 'input-preview.md'))
  if (preview)
    return preview
  const promptPath = path.join(invocationRoot, 'prompt.md')
  try {
    const prompt = await readFile(promptPath, 'utf8')
    return invocationInputPreviewFromPrompt(prompt)
  }
  catch {
    return null
  }
}

async function readRedactedInputPreview(previewPath: string): Promise<string | null> {
  try {
    const preview = (await readFile(previewPath, 'utf8')).trim()
    if (preview.length === 0)
      return null
    const redacted = redactEngineBridgeValue(preview)
    return typeof redacted === 'string' && redacted.trim().length > 0 ? redacted : null
  }
  catch {
    return null
  }
}

function invocationInputPreviewFromPrompt(prompt: string): string | null {
  const marker = '\nInvocation request:\n'
  const markerIndex = prompt.lastIndexOf(marker)
  if (markerIndex < 0)
    return null
  const rawRequest = prompt.slice(markerIndex + marker.length)
  const materialsIndex = attachedSourceMaterialsIndex(rawRequest)
  const requestText = (materialsIndex >= 0 ? rawRequest.slice(0, materialsIndex) : rawRequest).trim()
  const preview = requestText || attachedSourceMaterialsPreview(rawRequest)
  if (!preview)
    return null
  const redacted = redactEngineBridgeValue(preview)
  return typeof redacted === 'string' && redacted.trim().length > 0 ? redacted : null
}

function attachedSourceMaterialsIndex(value: string): number {
  const markerIndex = value.indexOf('<attached_source_materials>')
  if (markerIndex < 0)
    return -1
  return markerIndex === 0 || value.charAt(markerIndex - 1) === '\n' ? markerIndex : -1
}

function attachedSourceMaterialsPreview(request: string): string | null {
  if (!request.includes('<attached_source_materials>'))
    return null
  const names = Array.from(request.matchAll(/<source_material name="([^"]+)"/g), match => unescapeSourceMaterialName(match[1] ?? ''))
    .filter(name => name.length > 0)
  return names.length > 0 ? `Attached source materials: ${names.join(', ')}` : 'Attached source materials'
}

function unescapeSourceMaterialName(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

const ENGINE_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'lost'])

// Stream an invocation's bridge events as text/event-stream frames. Replays
// everything past the resume cursor, then — if the invocation is still running —
// tails the runtime event bus until it reaches a terminal status. Each frame's
// `id` is the session-event id so EventSource resumes via Last-Event-ID, and a
// final `done` frame carries the next cursor. Reuses redactBrokerOutput so SSE
// never exposes secrets the JSON snapshot would redact.
interface EngineInvocationEventsSnapshot {
  bridgeEvents?: Array<Record<string, unknown>>
  invocation?: { status?: string }
  nextAfter?: number
}

async function engineInvocationEventsResponse(
  c: Context,
  runtime: LocalWorkerRuntime,
  invocationId: string,
  after: number,
): Promise<Response> {
  const readSnapshot = async (cursor: number): Promise<EngineInvocationEventsSnapshot> =>
    redactBrokerOutput(await runtime.reattachEngineInvocationEvents(invocationId, { after: cursor })) as EngineInvocationEventsSnapshot
  const snapshotStatus = (snapshot: EngineInvocationEventsSnapshot): string =>
    typeof snapshot.invocation?.status === 'string' ? snapshot.invocation.status : ''

  const initial = await readSnapshot(after)
  // A reconnecting EventSource for a finished invocation with nothing past its
  // cursor gets 204 No Content: per the SSE spec the client then stops WITHOUT a
  // client-side close() (which would abort the in-flight connection and surface as
  // a spurious request failure). This is how a terminal stream ends cleanly.
  if (ENGINE_TERMINAL_STATUSES.has(snapshotStatus(initial)) && (initial.bridgeEvents ?? []).length === 0)
    return c.body(null, 204)

  return streamSSE(c, async (stream) => {
    let cursor = after
    const writeSnapshot = async (snapshot: EngineInvocationEventsSnapshot): Promise<string> => {
      for (const bridgeEvent of snapshot.bridgeEvents ?? []) {
        // Default `message` event (no `event:` field) so an EventSource consumer
        // receives every bridge event via `onmessage` without pre-registering a
        // listener per dynamic bridge type; the type stays inside the data JSON.
        await stream.writeSSE({
          data: JSON.stringify(bridgeEvent),
          id: String(readNonNegativeInteger(bridgeEvent.id, cursor)),
        })
      }
      cursor = readNonNegativeInteger(snapshot.nextAfter, cursor)
      return snapshotStatus(snapshot)
    }
    const done = () => stream.writeSSE({ data: String(cursor), event: 'done' })
    if (ENGINE_TERMINAL_STATUSES.has(await writeSnapshot(initial))) {
      await done()
      return
    }
    // Still running: tail the bus until terminal. Serialise flushes via a promise
    // chain so concurrent emits cannot double-send the same events.
    //
    // unverified: no test exercises this live-tail branch — the local synchronous
    // executor drives every invocation to a terminal status before an EventSource
    // can connect, so reads always take the replay-then-close path above. This is
    // defensive code for a future asynchronous engine; verifying it requires a
    // controllable long-running invocation.
    await new Promise<void>((resolve) => {
      let pending = Promise.resolve()
      let settled = false
      const finish = (unsubscribe: () => void) => {
        if (settled)
          return
        settled = true
        unsubscribe()
        resolve()
      }
      const unsubscribe = runtime.bus.subscribe((event) => {
        if (event.invocationId !== invocationId)
          return
        pending = pending.then(async () => {
          if (settled)
            return
          if (ENGINE_TERMINAL_STATUSES.has(await writeSnapshot(await readSnapshot(cursor)))) {
            await done()
            finish(unsubscribe)
          }
        })
      })
      c.req.raw.signal.addEventListener('abort', () => finish(unsubscribe))
    })
  })
}

function redactBrokerOutput<T>(value: T): T {
  const structured = redactEngineBridgeValue(value)
  const serialized = JSON.stringify(structured)
  if (serialized == null)
    return structured as T
  const redacted = redactEngineBridgeValue(serialized)
  return typeof redacted === 'string' ? JSON.parse(redacted) as T : structured as T
}

function workerConfigValueResponse(
  row: ReturnType<typeof listWorkerConfigValues>[number],
  archived: boolean,
) {
  return {
    archived,
    configKey: row.configKey,
    source: row.source,
    updatedAt: row.updatedAt,
    value: row.configValueJson,
    workerId: row.workerId,
  }
}

async function projectionReceiptResponse(c: Context, state: LocalDaemonState): Promise<Response> {
  const receiptId = String(c.req.param('receiptId') ?? '')
  const workspace = getWorkspace(receiptId)
  if (!workspace)
    return projectionReceiptMissing(c, receiptId)
  const runtime = requireRuntime(state, workspace.workerId)
  let result: Awaited<ReturnType<LocalWorkerRuntime['readWorkspaceProjectionReceipt']>>
  try {
    result = await runtime.readWorkspaceProjectionReceipt(workspace.id)
  }
  catch (error) {
    if (isInvalidProjectionReceiptError(error))
      return projectionReceiptStale(c, receiptId)
    throw error
  }
  if (!result)
    return projectionReceiptMissing(c, receiptId)
  return c.json({
    manifestPath: result.manifestPath,
    receipt: result.receipt,
    receiptId: result.receiptId,
    status: 'found',
    workspaceId: result.workspace.id,
  })
}

function projectionReceiptMissing(c: Context, receiptId: string): Response {
  return c.json({
    error: {
      code: 'PROJECTION_RECEIPT_MISSING',
      message: 'Projection receipt not found.',
    },
    receipt: null,
    receiptId,
    status: 'not_found',
  }, 404)
}

function projectionReceiptStale(c: Context, receiptId: string): Response {
  return c.json({
    error: {
      code: 'PROJECTION_RECEIPT_STALE',
      message: 'Projection receipt is invalid.',
    },
    receipt: null,
    receiptId,
    status: 'stale',
  }, 409)
}

function containsLiteralSecret(content: string): boolean {
  const assignment = /["']?([\w-]*(?:api[_-]?key|authorization|password|secret|token)[\w-]*)["']?\s*[:=]\s*["']([^"'\n]+)["']/gi
  for (const match of content.matchAll(assignment)) {
    const value = match[2]?.trim() ?? ''
    if (value && !isSecretReference(value))
      return true
  }
  return /Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}/i.test(content)
}

function isSecretReference(value: string): boolean {
  return value.trim().length === 0 || value.startsWith('$') || value.startsWith('env:') || value.startsWith('secretref:')
}

function isInvalidProjectionReceiptError(error: unknown): boolean {
  return error instanceof SyntaxError
    || (error != null
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'PROJECTION_RECEIPT_STALE')
}

function readProjectionTarget(value: unknown): SoulAppEngineTarget | null {
  return value === 'codex' || value === 'claude-code' ? value : null
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function notFound(c: Context, resource: string) {
  return c.json({ error: { code: 'NOT_FOUND', message: `${resource} not found.` } }, 404)
}

function hostMetadataValidationResponse(c: Context, code: string, error: unknown): Response | null {
  if (!isHostMetadataValidationError(error))
    return null
  return c.json({
    error: {
      code,
      message: error instanceof Error ? error.message : 'Invalid Worker metadata.',
    },
  }, 422)
}

function isHostMetadataValidationError(error: unknown): boolean {
  return error instanceof Error
    && (error.message.startsWith('Literal secrets are not allowed in Worker metadata:')
      || error.message.startsWith('Full native MCP files are not allowed in Worker metadata:')
      || error.message.startsWith('Soul-owned payloads are not allowed in Worker metadata:'))
}

function requireRuntime(state: LocalDaemonState, workerId: string): LocalWorkerRuntime {
  const existing = state.runtimes.get(workerId)
  if (existing)
    return existing
  const worker = getWorker(workerId)
  if (!worker)
    throw AppError.notFound(`Worker not found: ${workerId}`)
  const runtime = state.host.createRuntimeForWorker(worker)
  state.runtimes.set(workerId, runtime)
  return runtime
}

function requireWorker(workerId: string): WorkerRow {
  const worker = getWorker(workerId)
  if (!worker)
    throw AppError.notFound(`Worker not found: ${workerId}`)
  return worker
}

function requireWorkspace(workspaceId: string): WorkspaceRow {
  const workspace = getWorkspace(workspaceId)
  if (!workspace)
    throw AppError.notFound(`Workspace not found: ${workspaceId}`)
  return workspace
}

function requireWorkerWorkspace(workerId: string, workspaceId: string): WorkspaceRow {
  requireWorker(workerId)
  const workspace = requireWorkspace(workspaceId)
  if (workspace.workerId !== workerId)
    throw AppError.badRequest(`Workspace ${workspaceId} does not belong to worker ${workerId}`)
  return workspace
}

function requireSession(sessionId: string): SessionRow {
  const session = getSession(sessionId)
  if (!session)
    throw AppError.notFound(`Session not found: ${sessionId}`)
  return session
}

function unavailableSoulAppResponse(c: Context, state: LocalDaemonState, workerId: string): Response | null {
  try {
    state.host.requireEnabledAppForWorker(workerId)
    return null
  }
  catch (error) {
    if (error instanceof AppError) {
      const status = error.status === 400 || error.status === 404 || error.status === 409 || error.status === 500
        ? error.status
        : 500
      return c.json(error.toJSON(), status)
    }
    throw error
  }
}

function resolvedExecutionMetadata(settings: LocalSettingsConfig, engineIdOverride?: string | null): Record<string, unknown> {
  if (settings.executionMode !== 'local-cli') {
    return {
      byok: settings.byok,
      engineCommand: null,
      engineId: settings.byok.provider,
      engineName: null,
      executionMode: 'byok',
    }
  }
  return resolvedLocalCliExecutionMetadata(settings, engineIdOverride?.trim() || settings.engineId)
}

function resolvedLocalCliExecutionMetadata(settings: LocalSettingsConfig, engineId: string, engineNameOverride?: string | null): Record<string, unknown> {
  let resolved: ReturnType<typeof resolveLocalCliEngine>
  try {
    resolved = resolveLocalCliEngine({
      engineId,
      engines: settings.engines,
    })
  }
  catch (error) {
    if (error instanceof LocalEngineResolutionError)
      throw AppError.badRequest(error.message, 'LOCAL_ENGINE_UNAVAILABLE')
    throw error
  }
  return {
    byok: settings.byok,
    engineCommand: resolved.engineCommand,
    engineId: resolved.engineId,
    engineName: engineNameOverride?.trim() || resolved.engineName,
    executionMode: resolved.executionMode,
  }
}

function sessionExecutionMetadata(session: SessionRow, settings: LocalSettingsConfig): Record<string, unknown> {
  const metadata = session.metadataJson
  const engineId = typeof metadata?.engineId === 'string' && metadata.engineId.trim().length > 0 ? metadata.engineId : null
  const executionMode = metadata?.executionMode === 'local-cli' || metadata?.executionMode === 'byok' ? metadata.executionMode : null
  if (!engineId || !executionMode)
    return resolvedExecutionMetadata(settings)
  const engineName = typeof metadata?.engineName === 'string' ? metadata.engineName : null
  if (executionMode === 'local-cli') {
    const engineCommand = typeof metadata?.engineCommand === 'string' && metadata.engineCommand.trim().length > 0 ? metadata.engineCommand : null
    if (!engineCommand)
      return resolvedLocalCliExecutionMetadata(settings, engineId, engineName)
    return {
      byok: settings.byok,
      engineCommand,
      engineId,
      engineName,
      executionMode,
    }
  }
  return {
    byok: settings.byok,
    engineCommand: typeof metadata?.engineCommand === 'string' ? metadata.engineCommand : null,
    engineId,
    engineName,
    executionMode,
  }
}

async function createWorkspaceSessionFromBody(
  c: Context,
  state: LocalDaemonState,
  workspace: WorkspaceRow,
  body: {
    engineId?: null | string
    input?: string
    metadata?: Record<string, unknown>
    title: string
  },
): Promise<Response> {
  const unavailableApp = unavailableSoulAppResponse(c, state, workspace.workerId)
  if (unavailableApp)
    return unavailableApp
  const runtime = requireRuntime(state, workspace.workerId)
  const settings = loadLocalSettings()
  const execution = resolvedExecutionMetadata(settings, body.engineId)
  const metadata = {
    ...stripSessionTitleSourceMetadata(body.metadata),
    ...execution,
  }
  let session
  try {
    session = await runtime.createSession({
      workspaceId: workspace.id,
      title: body.title,
      metadata,
    })
  }
  catch (error) {
    const response = hostMetadataValidationResponse(c, 'CREATE_SESSION_INVALID', error)
    if (response)
      return response
    throw error
  }
  if (!body.input || body.input.trim().length === 0)
    return c.json({ session }, 201)
  const invocationInput = {
    engineCommand: typeof execution.engineCommand === 'string' ? execution.engineCommand : null,
    engineId: String(execution.engineId),
    input: body.input,
    metadata,
  }
  try {
    return c.json(await runtime.startInvocation({ ...invocationInput, sessionId: session.id }), 201)
  }
  catch (error) {
    const response = hostMetadataValidationResponse(c, 'CREATE_SESSION_INVALID', error)
    if (response)
      return response
    throw error
  }
}

async function createSessionInvocationResponse(c: Context, state: LocalDaemonState, session: SessionRow): Promise<Response> {
  const result = await parseJsonBody(c, createSessionInvocationBodySchema, 'CREATE_SESSION_INVOCATION_INVALID')
  if (!result.ok)
    return result.response
  return createSessionInvocationFromBody(c, state, session, result.data, 'CREATE_SESSION_INVOCATION_INVALID')
}

async function createSessionInvocationFromBody(
  c: Context,
  state: LocalDaemonState,
  session: SessionRow,
  body: {
    engineCommand?: null | string
    engineId?: null | string
    input: string
    metadata?: Record<string, unknown>
    waitForCompletion?: boolean
  },
  invalidCode: string,
): Promise<Response> {
  const unavailableApp = unavailableSoulAppResponse(c, state, session.workerId)
  if (unavailableApp)
    return unavailableApp
  const runtime = requireRuntime(state, session.workerId)
  const settings = loadLocalSettings()
  const engineCommand = typeof body.engineCommand === 'string' && body.engineCommand.trim().length > 0 ? body.engineCommand.trim() : null
  const execution = engineCommand
    ? {
        byok: settings.byok,
        engineCommand,
        engineId: body.engineId?.trim() || (settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider),
        engineName: null,
        executionMode: 'local-cli',
      }
    : body.engineId
      ? resolvedExecutionMetadata(settings, body.engineId)
      : sessionExecutionMetadata(session, settings)
  let currentSession = session
  if (
    session.metadataJson?.executionMode === 'local-cli'
    && typeof session.metadataJson?.engineCommand !== 'string'
    && typeof execution.engineCommand === 'string'
  ) {
    try {
      currentSession = updateSession({
        id: session.id,
        metadataJson: {
          ...(session.metadataJson ?? {}),
          ...execution,
        },
      })
    }
    catch (error) {
      const response = hostMetadataValidationResponse(c, invalidCode, error)
      if (response)
        return response
      throw error
    }
  }
  const invocationInput = {
    engineCommand: typeof execution.engineCommand === 'string' ? execution.engineCommand : null,
    engineId: String(execution.engineId),
    input: body.input,
    metadata: {
      ...(currentSession.metadataJson ?? {}),
      ...(body.metadata ?? {}),
      ...execution,
    },
  }
  let invocationResult
  try {
    invocationResult = body.waitForCompletion === false
      ? await runtime.startInvocationDetached({ ...invocationInput, sessionId: currentSession.id })
      : await runtime.startInvocation({ ...invocationInput, sessionId: currentSession.id })
  }
  catch (error) {
    const response = hostMetadataValidationResponse(c, invalidCode, error)
    if (response)
      return response
    throw error
  }
  return c.json({
    events: invocationResult.events,
    files: invocationResult.files,
    invocation: invocationResult.invocation,
    session: invocationResult.session,
  }, 201)
}
