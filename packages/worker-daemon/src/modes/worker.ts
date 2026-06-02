import type { HostedSoulApp, LocalSettingsConfig, LocalWorkerOverlayAsset, MountedMicroAppHostData, SoulAppEngineTarget } from '@zonease/aiworker-soul-descriptor'
import type { SessionRow, WorkerRow, WorkspaceRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { LocalExecutor, LocalWorkerRuntime, LocalWorkerRuntimeOptions, WorkerApiAuthProvider, WorkerOrchestrator } from '@zonease/aiworker-worker-runtime'

import type { Context } from 'hono'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { redactEngineBridgeValue } from '@zonease/aiworker-engine-bridge'
import { listBaselineAssets } from '@zonease/aiworker-engine-projection'
import {
  AppError,
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
  createLocalBearerAuthProvider,
  createWorkerOrchestrator,
  LocalEngineResolutionError,
  resolveLocalCliEngine,
  workerEnv,
} from '@zonease/aiworker-worker-runtime'
import { streamSSE } from 'hono/streaming'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'
import { registerLocalOpenApiPaths } from './worker/openapi'
import {
  createBrokerEngineInvocationBodySchema,
  createBrokerSessionBodySchema,
  createSessionInvocationBodySchema,
  createWorkerBodySchema,
  createWorkspaceLocatorBodySchema,
  installAppBodySchema,
  parseJsonBody,
  patchSessionBodySchema,
  patchSettingsBodySchema,
  patchWorkerBodySchema,
  patchWorkspaceBodySchema,
  projectionRefreshBodySchema,
  reconcileEngineInvocationBodySchema,
  workerConfigValueBodySchema,
} from './worker/schemas'
import { loadLocalSettings, readLocalConnectorSettings, readLocalEngineSettings, saveLocalSettings, scanLocalEngines } from './worker/settings'
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
  now?: () => string
}

export interface LocalDaemonState {
  authProvider: WorkerApiAuthProvider
  host: WorkerOrchestrator
  startedAt: string
  runtimeVersion: string
  runtimes: Map<string, LocalWorkerRuntime>
  now?: () => string
}

interface MountedSurfaceContribution {
  id: string
  kind: 'artifact-preview' | 'panel' | 'route' | 'workspace-widget'
  label: string
  path?: string
  surface: {
    entry: string
    renderer: 'micro-app'
    requiredPermissions?: readonly string[]
    scope: 'app' | 'artifact' | 'session' | 'workspace'
  }
  target?: string
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
  const workersRoot = options.workersRoot ?? path.join(path.dirname(dbPath), 'workers')
  const runtimes = new Map<string, LocalWorkerRuntime>()
  const host = createWorkerOrchestrator({
    engineBridge: options.engineBridge,
    executor: options.executor,
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
    now: options.now,
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

  // Host↔Worker 控制契约面（被动 server；Host 是 client）。今由 mounted 配置
  // micro-app 承载，契约 transport-agnostic（worker-control-protocol）。这些端点只
  // 读/接收控制信封，不得触碰 session/invocation/projection/engine 逻辑（C5）。
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
      templateId: worker.appId,
      version: state.runtimeVersion,
      health: { ready: true },
      configMicroAppEntry: '/api/mount/workbench',
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
  app.post('/api/workers', async (c) => {
    const result = await parseJsonBody(c, createWorkerBodySchema, 'CREATE_WORKER_INVALID')
    if (!result.ok)
      return result.response
    let created
    try {
      created = await state.host.createSoulWorker({
        defaultEngineId: result.data.defaultEngineId,
        id: result.data.id,
        metadata: result.data.metadata,
        name: result.data.name,
        appId: result.data.appId,
      })
    }
    catch (error) {
      const response = hostMetadataValidationResponse(c, 'CREATE_WORKER_INVALID', error)
      if (response)
        return response
      throw error
    }
    state.runtimes.set(created.worker.id, created.runtime)
    return c.json({ worker: created.worker, snapshot: created.snapshot }, 201)
  })
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
        rootPath: result.data.rootPath,
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
    // Workspace-scoped files back the mounted workbench artifacts surface (session
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
  app.get('/api/sessions/:sessionId', (c) => {
    const session = getSession(c.req.param('sessionId'))
    if (!session)
      return notFound(c, 'session')
    return c.json(redactBrokerOutput({ session, invocations: sessionInvocations(session.id), events: listSessionEvents(session.id) }))
  })
  app.patch('/api/sessions/:sessionId', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    const result = await parseJsonBody(c, patchSessionBodySchema, 'PATCH_SESSION_INVALID')
    if (!result.ok)
      return result.response
    try {
      return c.json({ session: updateSession({
        id: session.id,
        metadataJson: result.data.metadata ? { ...(session.metadataJson ?? {}), ...result.data.metadata } : undefined,
        status: result.data.status,
        title: result.data.title,
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
    // text/event-stream consumers (EventSource in the mounted workbench) get a live
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
      engines: scanLocalEngines(),
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

  app.get('/api/mount/workbench', async (c) => {
    const workerId = c.req.query('workerId')
    const workspaceId = c.req.query('workspaceId')
    const sessionId = c.req.query('sessionId')
    if (!workerId)
      return c.json({ error: { code: 'MOUNT_CONTEXT_INVALID', message: 'workerId is required.' } }, 400)
    const worker = requireWorker(workerId)
    const workspace = workspaceId ? requireWorkerWorkspace(worker.id, workspaceId) : null
    const session = sessionId ? requireWorkerSession(worker.id, sessionId) : null
    if (workspace && session && session.workspaceId !== workspace.id)
      return c.json({ error: { code: 'MOUNT_CONTEXT_INVALID', message: `Session ${session.id} does not belong to workspace ${workspace.id}` } }, 400)
    if (worker.status === 'archived')
      return c.json({ error: { code: 'MOUNT_CONTEXT_INVALID', message: `Worker ${worker.id} is archived and cannot mount workbench.` } }, 400)
    if (workspace?.status === 'archived')
      return c.json({ error: { code: 'MOUNT_CONTEXT_INVALID', message: `Workspace ${workspace.id} is archived and cannot mount workbench.` } }, 400)
    if (session?.status === 'archived')
      return c.json({ error: { code: 'MOUNT_CONTEXT_INVALID', message: `Session ${session.id} is archived and cannot mount workbench.` } }, 400)
    const app = state.host.getApp(worker.appId)
    if (!app)
      return notFound(c, 'Soul App')
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    const contribution = descriptorWorkbenchContribution(app)
    if (!contribution)
      return c.json({ error: { code: 'WORKBENCH_ENTRY_NOT_FOUND', message: `Soul App does not declare a mounted workbench entry: ${app.appId}` } }, 404)
    const sourceUrl = new URL(c.req.url)
    const entry = `${appOwnedApiRoutePrefix(app)}${contribution.surface.entry}`
    return c.json({
      locator: {
        sessionId: session?.id ?? null,
        workerId: worker.id,
        workspaceId: workspace?.id ?? null,
      },
      microApp: {
        data: mountedMicroAppData(c, state, app, contribution),
        name: `${app.appId}--${contribution.id}`,
        url: `${entry}${sourceUrl.search}`,
      },
      mount: {
        appId: app.appId,
        entry,
        surfaceId: contribution.id,
        type: contribution.surface.renderer,
      },
      routerMode: 'search',
      surface: publicMountedSurfaceContribution(contribution),
    })
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

  // A Soul has no app-owned API: this route is GET-only and serves the mounted
  // workbench micro-app bundle (entry HTML + sibling assets) under the descriptor
  // workbench directory. It is not a proxy to any Soul-owned local service.
  app.get('/api/apps/:appId/:path{.+}', (c) => {
    return serveMountedWorkbenchAsset(c, state)
  })

  registerLocalOpenApiPaths(app)
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Local Daemon API',
      version: runtimeVersion,
      description: 'Local Shell and Engine Bridge API for Soul Apps, Soul workers, workspaces, sessions, artifacts, files, the mounted workbench, native engine invocations, and settings.',
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

  return { app, port: workerEnv.PORT, state }
}

export async function createWorkerApp(): Promise<{ app: OpenAPIHono, port: number }> {
  const { app, port } = await bootstrapWorkerApp()
  return { app, port }
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

function workerConfigResponse(workerId: string) {
  return {
    values: listWorkerConfigValues(workerId).map(row => workerConfigValueResponse(row, false)),
  }
}

function sessionInvocations(sessionId: string) {
  return listEngineInvocations(sessionId).sort((left, right) => left.seq - right.seq)
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

function requireWorkerSession(workerId: string, sessionId: string): SessionRow {
  requireWorker(workerId)
  const session = requireSession(sessionId)
  if (session.workerId !== workerId)
    throw AppError.badRequest(`Session ${sessionId} does not belong to worker ${workerId}`)
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

function serveMountedWorkbenchAsset(c: Context, state: LocalDaemonState): Promise<Response> | Response {
  const appId = c.req.param('appId')
  if (!appId)
    return notFound(c, 'Soul App')
  const app = state.host.getApp(appId)
  if (!app)
    return notFound(c, 'Soul App')
  if (app.status !== 'enabled')
    return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
  return serveMountedWorkbenchAssetForApp(c, app)
}

async function serveMountedWorkbenchAssetForApp(c: Context, app: HostedSoulApp): Promise<Response> {
  // A Soul is a descriptor-only template with no app-owned API: the only thing
  // served under /api/apps/:appId is the mounted workbench micro-app bundle.
  const staticResponse = await descriptorMountedAssetResponse(c, app)
  if (staticResponse)
    return staticResponse
  return notFound(c, 'mounted workbench asset')
}

function appOwnedApiRoutePrefix(app: HostedSoulApp): string {
  return app.api.routePrefix ?? `/api/apps/${app.appId}`
}

function mountContextExpiry(state: LocalDaemonState): string {
  const base = state.now ? Date.parse(state.now()) : Date.now()
  return new Date(base + 5 * 60_000).toISOString()
}

function publicMountedSurfaceContribution(contribution: MountedSurfaceContribution) {
  return {
    id: contribution.id,
    kind: contribution.kind,
    label: contribution.label,
    path: contribution.path ?? null,
    renderer: contribution.surface.renderer,
    requiredPermissions: contribution.surface.requiredPermissions ?? [],
    scope: contribution.surface.scope,
    target: contribution.target ?? null,
  }
}

function mountedMicroAppData(
  c: Context,
  state: LocalDaemonState,
  app: HostedSoulApp,
  contribution: MountedSurfaceContribution,
): MountedMicroAppHostData {
  return {
    appId: app.appId,
    artifactId: c.req.query('artifactId') ?? null,
    expiresAt: mountContextExpiry(state),
    mountTokenPresent: false,
    routePrefix: appOwnedApiRoutePrefix(app),
    sessionId: c.req.query('sessionId') ?? null,
    surfaceId: contribution.id,
    surfaceKind: contribution.kind,
    surfaceScope: contribution.surface.scope,
    theme: c.req.query('theme') ?? null,
    workerId: c.req.query('workerId') ?? null,
    workspaceId: c.req.query('workspaceId') ?? null,
  }
}

async function descriptorMountedAssetResponse(c: Context, app: HostedSoulApp): Promise<Response | null> {
  if (app.sourceKind !== 'descriptor-path')
    return null

  const sourceUrl = new URL(c.req.url)
  const appPrefix = `/api/apps/${app.appId}/`
  const relativeRequestPath = decodeURIComponent(sourceUrl.pathname.slice(appPrefix.length))
  const contribution = descriptorWorkbenchContribution(app)
  if (!contribution)
    return null

  const workbenchEntry = app.descriptor?.workbench?.entry
  if (typeof workbenchEntry !== 'string' || workbenchEntry.length === 0)
    return null

  // The mounted workbench is a built micro-app bundle (方案 C): serve its entry
  // AND its sibling bundle assets. The contribution entry is a virtual path
  // (e.g. `micro-app/workbench`). micro-app resolves the bundle's relative asset
  // refs (`./assets/index.js`) against that entry treated as a DIRECTORY, so the
  // browser requests `micro-app/workbench/assets/index.js`. That entry directory
  // maps to the descriptor workbench directory (e.g. `web/workbench`): the entry
  // itself maps to the descriptor entry file, and `<entry>/<asset>` maps to the
  // same-named bundle asset under the workbench directory.
  const entryRelative = contribution.surface.entry.replace(/^\//, '')
  const workbenchDirRelative = path.posix.dirname(workbenchEntry.replace(/^dist\//, ''))
  let descriptorAssetPath: null | string = null
  if (relativeRequestPath === entryRelative)
    descriptorAssetPath = workbenchEntry.replace(/^dist\//, '')
  else if (relativeRequestPath.startsWith(`${entryRelative}/`))
    descriptorAssetPath = path.posix.join(workbenchDirRelative, relativeRequestPath.slice(entryRelative.length + 1))
  if (!descriptorAssetPath)
    return null

  const descriptorRoot = path.dirname(app.sourceRef)
  const resolvedAsset = path.resolve(descriptorRoot, descriptorAssetPath)
  const resolvedRoot = path.resolve(descriptorRoot)
  if (!isPathInside(resolvedAsset, resolvedRoot)) {
    return new Response(JSON.stringify({ error: { code: 'DESCRIPTOR_ASSET_PATH_INVALID', message: 'Descriptor mounted asset escapes descriptor root.' } }), {
      headers: { 'content-type': 'application/json' },
      status: 400,
    })
  }

  try {
    const body = await readFile(resolvedAsset)
    return new Response(body, {
      headers: { 'content-type': contentTypeForMountedAsset(resolvedAsset) },
    })
  }
  catch {
    return new Response(JSON.stringify({ error: { code: 'DESCRIPTOR_ASSET_NOT_FOUND', message: `Descriptor mounted asset not found: ${contribution.id}` } }), {
      headers: { 'content-type': 'application/json' },
      status: 404,
    })
  }
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function contentTypeForMountedAsset(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.html')
    return 'text/html; charset=utf-8'
  if (extension === '.css')
    return 'text/css; charset=utf-8'
  if (extension === '.js')
    return 'text/javascript; charset=utf-8'
  if (extension === '.json')
    return 'application/json'
  if (extension === '.svg')
    return 'image/svg+xml'
  return 'application/octet-stream'
}

function descriptorWorkbenchContribution(app: HostedSoulApp): MountedSurfaceContribution | null {
  if (app.descriptor?.workbench?.type !== 'micro-app')
    return null

  return {
    id: app.mountedWorkbench.id,
    kind: 'route',
    label: 'Workbench',
    path: app.mountedWorkbench.path,
    surface: {
      entry: app.mountedWorkbench.entry,
      renderer: app.mountedWorkbench.renderer,
      scope: app.mountedWorkbench.scope,
    },
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
    ...(body.metadata ?? {}),
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
    invocationResult = await runtime.startInvocation({ ...invocationInput, sessionId: currentSession.id })
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
