import type { HostAuthProvider, HostIdentity, HostRuntime, LocalExecutor, LocalWorkerRuntime } from '@zonease/aiworker-host-runtime'
import type { HostedSoulApp, LocalSettingsConfig, LocalWorkerOverlayAsset, MountedMicroAppHostData } from '@zonease/aiworker-soul-protocol'
import type { SessionRow, WorkerRow, WorkspaceRow } from '@zonease/aiworker-storage-sqlite/worker'

import type { Context } from 'hono'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import {
  createHostRuntime,
  createLocalBearerAuthProvider,
  listBaselineAssets,
  LocalEngineResolutionError,
  resolveLocalCliEngine,
  soulAppServiceEnv,
  workerEnv,
} from '@zonease/aiworker-host-runtime'
import {
  AppError,
  isLoopbackMountedServiceUrl,
  localWorkerOverlaySaveSchema,
} from '@zonease/aiworker-soul-protocol'
import {
  closeWorkerDb,
  deleteWorkerConfigValue,
  getEngineInvocation,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listSessionEvents,
  listSessions,
  listTurns,
  listWorkerOverlayAssets,
  listWorkers,
  listWorkspaces,
  runWorkerMigrations,
  updateEngineInvocation,
  updateSession,
  updateWorkspace,
  upsertWorker,
  upsertWorkerConfigValue,
  upsertWorkerOverlayAssets,
} from '@zonease/aiworker-storage-sqlite/worker'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'
import { registerLocalOpenApiPaths } from './worker/openapi'
import {
  createBrokerEngineInvocationBodySchema,
  createBrokerSessionBodySchema,
  createSessionBodySchema,
  createSessionMessageBodySchema,
  createWorkerBodySchema,
  createWorkspaceBodySchema,
  createWorkspaceLocatorBodySchema,
  installAppBodySchema,
  parseJsonBody,
  patchSessionBodySchema,
  patchSettingsBodySchema,
  patchWorkerBodySchema,
  patchWorkspaceBodySchema,
  projectionRefreshBodySchema,
  testEngineBodySchema,
  workerConfigValueBodySchema,
} from './worker/schemas'
import { loadLocalSettings, readLocalConnectorSettings, readLocalEngineSettings, saveLocalSettings, scanLocalEngines } from './worker/settings'
import { serveWorkerWeb, serveWorkerWebAsset } from './worker/web-static'

const DEFAULT_RUNTIME_VERSION = 'dev'
const REQUEST_IDENTITIES = new WeakMap<Context, HostIdentity>()

export interface BootstrapWorkerAppOptions {
  dbPath?: string
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
  authProvider: HostAuthProvider
  host: HostRuntime
  mountingAppServices: Map<string, Promise<MountedSoulAppService | null>>
  mountedAppServices: Map<string, MountedSoulAppService>
  startedAt: string
  runtimeVersion: string
  runtimes: Map<string, LocalWorkerRuntime>
  now?: () => string
}

interface MountedSoulAppService {
  baseUrl: string
  mountToken: string
  process?: ChildProcessByStdio<null, Readable, Readable>
}

interface MountedSurfaceContribution {
  id: string
  kind: 'artifact-preview' | 'panel' | 'review-panel' | 'route' | 'workspace-widget'
  label: string
  path?: string
  surface: {
    entry: string
    renderer: 'micro-app'
    requiredPermissions?: readonly string[]
    scope: 'app' | 'artifact' | 'review' | 'session' | 'workspace'
  }
  target?: string
}

const MOUNTED_PROXY_TIMEOUT_MS = 10_000
const MOUNTED_PROXY_STRIPPED_HEADERS = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-real-ip',
])

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
  const host = createHostRuntime({
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
    mountingAppServices: new Map(),
    mountedAppServices: new Map(),
    runtimes,
    startedAt: new Date().toISOString(),
    runtimeVersion,
    now: options.now,
  }
  await state.host.bootstrapOfficialSoulApps()
  for (const worker of listWorkers()) {
    const runtime = state.host.createRuntimeForWorker(worker)
    await runtime.init()
    runtimes.set(worker.id, runtime)
  }

  const app = new OpenAPIHono()
  app.use(requestLogger)
  app.onError(errorHandler)
  app.use('/api/*', async (c, next) => {
    if (authenticateMountedBrokerRequest(c, state))
      return next()
    const result = state.authProvider.authenticate({ authorization: c.req.header('authorization') })
    if (result.status === 'denied')
      return c.json({ error: { code: 'UNAUTHORIZED', message: result.reason } }, 401)
    if (result.status === 'authenticated')
      REQUEST_IDENTITIES.set(c, result.identity)
    return next()
  })

  app.get('/health', c => c.json({
    mode: 'soul-workspace',
    status: 'ok',
    workers: listWorkers().map(worker => ({ id: worker.id, soulId: worker.soulId, status: worker.status })),
    runtimeVersion: state.runtimeVersion,
    startedAt: state.startedAt,
    checkedAt: new Date().toISOString(),
  }))

  app.get('/api/local/info', c => c.json({
    runtimeVersion: state.runtimeVersion,
    startedAt: state.startedAt,
    workers: listWorkers(),
  }))

  app.get('/api/local/apps', c => c.json({ apps: state.host.listApps() }))
  app.post('/api/local/apps/install', async (c) => {
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
  app.get('/api/local/apps/:appId', (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return notFound(c, 'Soul App')
    return c.json({ app })
  })
  app.post('/api/local/apps/:appId/enable', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.enableApp(appId)
    return c.json({ app, catalog: state.host.listCatalog() })
  })
  app.post('/api/local/apps/:appId/disable', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.disableApp(appId)
    stopMountedSoulAppService(state, appId)
    return c.json({ app, catalog: state.host.listCatalog() })
  })
  app.post('/api/local/apps/:appId/healthcheck', c => c.json({ app: state.host.healthcheckApp(c.req.param('appId')) }))
  app.get('/api/local/souls', c => c.json({ souls: state.host.listSouls() }))
  app.get('/api/local/templates', c => c.json({ templates: state.host.listCapabilityTemplates() }))
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
    const app = state.host.disableApp(appId)
    stopMountedSoulAppService(state, appId)
    return c.json({ app, catalog: state.host.listCatalog() })
  })
  app.delete('/api/app-installation/apps/:appId', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.disableApp(appId)
    stopMountedSoulAppService(state, appId)
    return c.json({ app, catalog: state.host.listCatalog() })
  })

  app.get('/api/local/workers', c => c.json({ workers: listWorkers() }))
  app.post('/api/local/workers', async (c) => {
    const result = await parseJsonBody(c, createWorkerBodySchema, 'CREATE_WORKER_INVALID')
    if (!result.ok)
      return result.response
    const created = await state.host.createSoulWorker({
      defaultEngineId: result.data.defaultEngineId,
      id: result.data.id,
      metadata: result.data.metadata,
      name: result.data.name,
      soulId: result.data.soulId,
    })
    state.runtimes.set(created.worker.id, created.runtime)
    return c.json({ worker: created.worker, snapshot: created.snapshot }, 201)
  })
  app.get('/api/workers', c => c.json({ workers: listWorkers() }))
  app.post('/api/workers', async (c) => {
    const result = await parseJsonBody(c, createWorkerBodySchema, 'CREATE_WORKER_INVALID')
    if (!result.ok)
      return result.response
    const created = await state.host.createSoulWorker({
      defaultEngineId: result.data.defaultEngineId,
      id: result.data.id,
      metadata: result.data.metadata,
      name: result.data.name,
      soulId: result.data.soulId,
    })
    state.runtimes.set(created.worker.id, created.runtime)
    return c.json({ worker: created.worker, snapshot: created.snapshot }, 201)
  })
  app.get('/api/local/workers/:workerId', (c) => {
    const worker = getWorker(c.req.param('workerId'))
    if (!worker)
      return notFound(c, 'worker')
    return c.json({ worker, snapshot: requireRuntime(state, worker.id).snapshot() })
  })
  app.patch('/api/local/workers/:workerId', async (c) => {
    const existing = getWorker(c.req.param('workerId'))
    if (!existing)
      return notFound(c, 'worker')
    const result = await parseJsonBody(c, patchWorkerBodySchema, 'PATCH_WORKER_INVALID')
    if (!result.ok)
      return result.response
    const worker = upsertWorker({
      id: existing.id,
      soulId: existing.soulId,
      name: result.data.name ?? existing.name,
      status: result.data.status ?? existing.status,
      defaultEngineId: result.data.defaultEngineId ?? existing.defaultEngineId,
      metadataJson: result.data.metadata ?? existing.metadataJson,
    })
    const runtime = state.host.createRuntimeForWorker(worker)
    await runtime.init()
    state.runtimes.set(worker.id, runtime)
    return c.json({ worker, snapshot: runtime.snapshot() })
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
    const worker = upsertWorker({
      id: existing.id,
      soulId: existing.soulId,
      name: result.data.name ?? existing.name,
      status: result.data.status ?? existing.status,
      defaultEngineId: result.data.defaultEngineId ?? existing.defaultEngineId,
      metadataJson: result.data.metadata ?? existing.metadataJson,
    })
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
      soulId: existing.soulId,
      name: existing.name,
      status: 'disabled',
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
    const worker = upsertWorker({
      id: existing.id,
      soulId: existing.soulId,
      name: existing.name,
      status: 'disabled',
      defaultEngineId: existing.defaultEngineId,
      metadataJson: existing.metadataJson,
    })
    state.runtimes.delete(worker.id)
    return c.json({ worker })
  })
  app.get('/api/workers/:workerId/config', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    return c.json({ config: await workerOverlayResponse(state, worker.id), workerId: worker.id })
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
  app.get('/api/local/workers/:workerId/overlay', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    return c.json({ overlay: await workerOverlayResponse(state, worker.id) })
  })
  app.put('/api/local/workers/:workerId/overlay', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    const parsed = localWorkerOverlaySaveSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'WORKER_OVERLAY_INVALID',
          message: 'Invalid worker overlay payload.',
          issues: parsed.error.issues,
        },
      }, 400)
    }
    if (parsed.data.assets.some(asset => containsLiteralSecret(JSON.stringify(asset)))) {
      return c.json({
        error: {
          code: 'WORKER_OVERLAY_SECRET',
          message: 'literal secrets are not allowed in worker overlay descriptors',
        },
      }, 422)
    }
    upsertWorkerOverlayAssets(worker.id, parsed.data.assets.map(asset => ({
      checksum: asset.checksum,
      enabled: asset.enabled,
      id: asset.id,
      kind: asset.kind,
      metadataJson: asset.metadataJson,
      optionsJson: asset.optionsJson,
      sourceRef: asset.sourceRef,
      target: asset.target,
    })))
    return c.json({ overlay: await workerOverlayResponse(state, worker.id) })
  })
  app.get('/api/local/workers/:workerId/templates', (c) => {
    return c.json({ templates: state.host.listCapabilityTemplatesForWorker(c.req.param('workerId')) })
  })
  app.get('/api/local/workers/:workerId/templates/:templateId', (c) => {
    const template = requireTemplateForWorker(state, c.req.param('workerId'), c.req.param('templateId'))
    return c.json({ template })
  })

  app.get('/api/local/workspaces', c => c.json({ workspaces: listWorkspaces() }))
  app.get('/api/workspace-locators', c => c.json({ workspaces: listWorkspaces() }))
  app.post('/api/workspace-locators', async (c) => {
    const result = await parseJsonBody(c, createWorkspaceLocatorBodySchema, 'CREATE_WORKSPACE_LOCATOR_INVALID')
    if (!result.ok)
      return result.response
    const runtime = requireRuntime(state, result.data.workerId)
    const workspace = await runtime.createWorkspace({
      name: result.data.name,
      type: result.data.type ?? 'workspace',
      sourcePointers: result.data.sourcePointers ?? [],
      metadata: {
        ...(result.data.metadata ?? {}),
        requestedRootPath: result.data.rootPath,
      },
    })
    return c.json({ workspace }, 201)
  })
  app.get('/api/workspace-locators/:workspaceId', (c) => {
    const workspace = getWorkspace(c.req.param('workspaceId'))
    if (!workspace)
      return notFound(c, 'workspace')
    return c.json({ workspace })
  })
  app.patch('/api/workspace-locators/:workspaceId', async (c) => {
    const result = await parseJsonBody(c, patchWorkspaceBodySchema, 'PATCH_WORKSPACE_LOCATOR_INVALID')
    if (!result.ok)
      return result.response
    return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), ...result.data }) })
  })
  app.post('/api/workspace-locators/:workspaceId/archive', (c) => {
    return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), status: 'archived' }) })
  })
  app.delete('/api/workspace-locators/:workspaceId', (c) => {
    return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), status: 'archived' }) })
  })
  app.get('/api/local/workers/:workerId/workspaces', (c) => {
    const workerId = c.req.param('workerId')
    requireRuntime(state, workerId)
    return c.json({ workspaces: listWorkspaces(workerId) })
  })
  app.post('/api/local/workers/:workerId/workspaces', async (c) => {
    const runtime = requireRuntime(state, c.req.param('workerId'))
    const result = await parseJsonBody(c, createWorkspaceBodySchema, 'CREATE_WORKSPACE_INVALID')
    if (!result.ok)
      return result.response
    const workspace = await runtime.createWorkspace({
      name: result.data.name,
      type: result.data.type ?? 'workspace',
      sourcePointers: result.data.sourcePointers ?? [],
      metadata: result.data.metadata ?? {},
    })
    return c.json({ workspace }, 201)
  })
  app.get('/api/local/workers/:workerId/workspaces/:workspaceId', (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return c.json({ workspace })
  })
  app.patch('/api/local/workers/:workerId/workspaces/:workspaceId', async (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    const result = await parseJsonBody(c, patchWorkspaceBodySchema, 'PATCH_WORKSPACE_INVALID')
    if (!result.ok)
      return result.response
    return c.json({ workspace: updateWorkspace({ id: workspace.id, ...result.data }) })
  })
  app.post('/api/local/workers/:workerId/workspaces/:workspaceId/projection', async (c) => {
    const workerId = c.req.param('workerId')
    if (!getWorker(workerId))
      return notFound(c, 'worker')
    const workspace = getWorkspace(c.req.param('workspaceId'))
    if (!workspace || workspace.workerId !== workerId)
      return notFound(c, 'workspace')
    const projection = await requireRuntime(state, workerId).reprojectWorkspaceAssets(workspace.id)
    return c.json({ projection })
  })
  app.get('/api/local/workspaces/:workspaceId', (c) => {
    const workspace = getWorkspace(c.req.param('workspaceId'))
    if (!workspace)
      return notFound(c, 'workspace')
    return c.json({ workspace })
  })
  app.patch('/api/local/workspaces/:workspaceId', async (c) => {
    const result = await parseJsonBody(c, patchWorkspaceBodySchema, 'PATCH_WORKSPACE_INVALID')
    if (!result.ok)
      return result.response
    return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), ...result.data }) })
  })
  app.get('/api/local/sessions', c => c.json({ sessions: listSessions() }))
  app.get('/api/sessions', c => c.json({ sessions: listSessions() }))
  app.get('/api/local/turns', c => c.json({ turns: listTurns() }))
  app.get('/api/local/workers/:workerId/workspaces/:workspaceId/sessions', (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return c.json({ sessions: listSessions(workspace.id) })
  })
  app.post('/api/local/workers/:workerId/workspaces/:workspaceId/sessions', async (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return createWorkspaceSessionResponse(c, state, workspace, false)
  })
  app.post('/api/local/workers/:workerId/workspaces/:workspaceId/sessions/stream', async (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return createWorkspaceSessionResponse(c, state, workspace, true)
  })
  app.get('/api/local/workspaces/:workspaceId/sessions', (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return c.json({ sessions: listSessions(workspace.id) })
  })
  app.post('/api/local/workspaces/:workspaceId/sessions', async (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return createWorkspaceSessionResponse(c, state, workspace, false)
  })
  app.post('/api/local/workspaces/:workspaceId/sessions/stream', async (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return createWorkspaceSessionResponse(c, state, workspace, true)
  })
  app.post('/api/sessions', async (c) => {
    const result = await parseJsonBody(c, createBrokerSessionBodySchema, 'CREATE_SESSION_INVALID')
    if (!result.ok)
      return result.response
    const workspace = requireWorkerWorkspace(result.data.workerId, result.data.workspaceId)
    return createWorkspaceSessionFromBody(c, state, workspace, result.data, false)
  })
  app.get('/api/local/sessions/:sessionId', (c) => {
    const session = getSession(c.req.param('sessionId'))
    if (!session)
      return notFound(c, 'session')
    return c.json({ session, turns: listTurns(session.id), events: listSessionEvents(session.id) })
  })
  app.get('/api/sessions/:sessionId', (c) => {
    const session = getSession(c.req.param('sessionId'))
    if (!session)
      return notFound(c, 'session')
    return c.json({ session, events: listSessionEvents(session.id) })
  })
  app.patch('/api/sessions/:sessionId', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    const result = await parseJsonBody(c, patchSessionBodySchema, 'PATCH_SESSION_INVALID')
    if (!result.ok)
      return result.response
    return c.json({ session: updateSession({
      id: session.id,
      context: result.data.context,
      metadataJson: result.data.metadata ? { ...(session.metadataJson ?? {}), ...result.data.metadata } : undefined,
      status: result.data.status,
      title: result.data.title,
    }) })
  })
  app.post('/api/sessions/:sessionId/archive', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return c.json({ session: updateSession({ id: session.id, status: 'archived' }) })
  })
  app.delete('/api/sessions/:sessionId', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return c.json({ session: updateSession({ id: session.id, status: 'deleted' }) })
  })
  app.get('/api/local/workers/:workerId/sessions/:sessionId', (c) => {
    const session = requireWorkerSession(c.req.param('workerId'), c.req.param('sessionId'))
    return c.json({ session, turns: listTurns(session.id), events: listSessionEvents(session.id) })
  })
  app.get('/api/local/workers/:workerId/sessions/:sessionId/events', (c) => {
    const session = requireWorkerSession(c.req.param('workerId'), c.req.param('sessionId'))
    const after = Number(c.req.query('after') ?? c.req.header('last-event-id') ?? 0)
    const events = listSessionEvents(session.id, { after: Number.isFinite(after) ? after : 0 })
    return c.json({ events })
  })
  app.get('/api/local/workers/:workerId/sessions/:sessionId/turns', (c) => {
    const session = requireWorkerSession(c.req.param('workerId'), c.req.param('sessionId'))
    return c.json({ turns: listTurns(session.id) })
  })
  app.post('/api/local/workers/:workerId/sessions/:sessionId/messages', async (c) => {
    const session = requireWorkerSession(c.req.param('workerId'), c.req.param('sessionId'))
    return createSessionMessageResponse(c, state, session, false)
  })
  app.post('/api/local/workers/:workerId/sessions/:sessionId/messages/stream', async (c) => {
    const session = requireWorkerSession(c.req.param('workerId'), c.req.param('sessionId'))
    return createSessionMessageResponse(c, state, session, true)
  })
  app.get('/api/local/sessions/:sessionId/events', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    const after = Number(c.req.query('after') ?? c.req.header('last-event-id') ?? 0)
    const events = listSessionEvents(session.id, { after: Number.isFinite(after) ? after : 0 })
    return c.json({ events })
  })
  app.get('/api/local/sessions/:sessionId/turns', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return c.json({ turns: listTurns(session.id) })
  })
  app.post('/api/local/sessions/:sessionId/turns/stream', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return createSessionMessageResponse(c, state, session, true)
  })
  app.post('/api/local/sessions/:sessionId/turns', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return createSessionMessageResponse(c, state, session, false)
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
    return createSessionInvocationFromBody(c, state, session, result.data)
  })
  app.get('/api/engine/invocations/:invocationId', (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    return c.json({ invocation })
  })
  app.get('/api/engine/invocations/:invocationId/events', (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    const events = listSessionEvents(invocation.sessionId).filter(event => event.invocationId === invocation.id)
    return c.json({ events, invocationId: invocation.id })
  })
  app.post('/api/engine/invocations/:invocationId/cancel', (c) => {
    const invocation = getEngineInvocation(c.req.param('invocationId'))
    if (!invocation)
      return notFound(c, 'engine invocation')
    if (invocation.status !== 'queued' && invocation.status !== 'running')
      return c.json({ invocation })
    return c.json({ invocation: updateEngineInvocation({
      id: invocation.id,
      finishedAt: new Date().toISOString(),
      status: 'cancelled',
    }) })
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

  app.post('/api/projections/:target/refresh', async (c) => {
    const result = await parseJsonBody(c, projectionRefreshBodySchema, 'REFRESH_PROJECTION_INVALID')
    if (!result.ok)
      return result.response
    const workspace = requireWorkerWorkspace(result.data.workerId, result.data.workspaceId)
    const projection = await requireRuntime(state, workspace.workerId).reprojectWorkspaceAssets(workspace.id)
    return c.json({ projection, target: c.req.param('target') })
  })
  app.get('/api/projections/receipts/:receiptId', (c) => {
    return c.json({ receipt: null, receiptId: c.req.param('receiptId'), status: 'not_found' })
  })
  app.post('/api/projections/receipts/:receiptId/cleanup', (c) => {
    return c.json({ cleaned: false, receiptId: c.req.param('receiptId'), status: 'not_found' })
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
    const app = state.host.getApp(worker.soulId)
    if (!app)
      return notFound(c, 'Soul App')
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    const contribution = descriptorWorkbenchContribution(app)
    if (!contribution)
      return c.json({ error: { code: 'WORKBENCH_ENTRY_NOT_FOUND', message: `Soul App does not declare a mounted workbench entry: ${app.appId}` } }, 404)
    const service = await resolveMountedSoulAppServiceOrResponse(c, state, app)
    if (service instanceof Response)
      return service
    const sourceUrl = new URL(c.req.url)
    const entry = `${appOwnedApiRoutePrefix(app)}${contribution.surface.entry}`
    return c.json({
      locator: {
        sessionId: session?.id ?? null,
        workerId: worker.id,
        workspaceId: workspace?.id ?? null,
      },
      microApp: {
        data: mountedMicroAppData(c, state, app, service, contribution),
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

  app.get('/api/local/settings', (c) => {
    const settings = loadLocalSettings()
    return c.json({ settings })
  })
  app.get('/api/local/settings/engines', (c) => {
    const settings = readLocalEngineSettings()
    return c.json(settings)
  })
  app.patch('/api/local/settings', async (c) => {
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
  app.post('/api/local/settings/engines/rescan', (c) => {
    const current = loadLocalSettings()
    const settings = saveLocalSettings({
      ...current,
      engines: scanLocalEngines(),
      updatedAt: new Date().toISOString(),
    })
    return c.json({ engines: settings.engines, settings })
  })
  app.post('/api/local/settings/engines/test', async (c) => {
    const result = await parseJsonBody(c, testEngineBodySchema, 'TEST_ENGINE_INVALID')
    if (!result.ok)
      return result.response
    const settings = loadLocalSettings()
    const engineId = result.data.engineId ?? settings.engineId
    const engine = settings.engines.find(engine => engine.id === engineId)
    if (!engine)
      return c.json({ result: { engineId, message: 'Engine is not known in local settings.', status: 'fail' } }, 404)
    if (!engine.installed)
      return c.json({ result: { engineId, message: `${engine.name} is not installed on PATH.`, status: 'fail' } })
    return c.json({ result: { engineId, message: `${engine.name} responded as ${engine.version ?? engine.path}.`, status: 'pass' } })
  })

  app.all('/api/local/apps/:appId/:path{.+}', (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return notFound(c, 'Soul App')
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    return proxyMountedSoulAppApi(c, state, app)
  })
  app.all('/api/apps/:appId/:path{.+}', (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return notFound(c, 'Soul App')
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    return proxyMountedSoulAppApi(c, state, app)
  })

  registerLocalOpenApiPaths(app)
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Local Daemon API',
      version: runtimeVersion,
      description: 'Local Shell and Engine Bridge API for Soul Apps, Soul workers, workspaces, sessions, artifacts, files, mounted app APIs, native engine invocations, and settings.',
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

function authenticateMountedBrokerRequest(c: Context, state: LocalDaemonState): boolean {
  const appId = brokerAppIdFromPath(new URL(c.req.url).pathname)
  if (!appId)
    return false
  const token = c.req.header('x-aiworker-mount-token')
  if (!token)
    return false
  const mounted = state.mountedAppServices.get(appId)
  return mounted ? secureStringEqual(token, mounted.mountToken) : false
}

function brokerAppIdFromPath(pathname: string): string | null {
  const match = /^\/api\/(?:local\/)?apps\/([^/]+)\/broker(?:\/|$)/.exec(pathname)
  if (!match?.[1])
    return null
  try {
    return decodeURIComponent(match[1])
  }
  catch {
    return null
  }
}

function secureStringEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
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

  const result = await parseJsonBody(c, workerConfigValueBodySchema, 'WORKER_CONFIG_VALUE_INVALID')
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
        updatedAt: readString(result.data.updatedAt, updatedAt),
        updatedBy: readString(result.data.updatedBy, 'web'),
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
    config: {
      archived: false,
      configKey,
      updatedAt: saved.updatedAt,
      value: saved.configValueJson,
      workerId: worker.id,
    },
  })
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
  return value.trim().length === 0 || value.startsWith('$') || value.startsWith('env:')
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function notFound(c: Context, resource: string) {
  return c.json({ error: { code: 'NOT_FOUND', message: `${resource} not found.` } }, 404)
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

function requireTemplateForWorker(state: LocalDaemonState, workerId: string, templateId: unknown) {
  return state.host.requireCapabilityTemplateForWorker(workerId, templateId)
}

function enrichTemplateMetadata(_state: LocalDaemonState, _workerId: string, _templateId: string, metadata: Record<string, unknown>): Record<string, unknown> {
  return metadata
}

async function proxyMountedSoulAppApi(c: Context, state: LocalDaemonState, app: HostedSoulApp): Promise<Response> {
  const staticResponse = await descriptorMountedAssetResponse(c, app)
  if (staticResponse)
    return staticResponse

  const service = await mountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service

  const sourceUrl = new URL(c.req.url)
  const targetUrl = new URL(`/${c.req.param('path')}`, service.baseUrl)
  targetUrl.search = sourceUrl.search
  const headers = mountedProxyHeaders(c.req.raw.headers)
  applyMountedProxyContextHeaders(headers, c, state, app, service)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MOUNTED_PROXY_TIMEOUT_MS)
  try {
    const res = await fetch(targetUrl, {
      body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : c.req.raw.body,
      headers,
      method: c.req.method,
      redirect: 'manual',
      signal: controller.signal,
    })
    const responseHeaders = new Headers(res.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('transfer-encoding')
    return new Response(res.body, {
      headers: responseHeaders,
      status: res.status,
      statusText: res.statusText,
    })
  }
  catch (error) {
    const aborted = controller.signal.aborted
    return c.json({
      error: {
        code: aborted ? 'SOUL_APP_SERVICE_TIMEOUT' : 'SOUL_APP_SERVICE_UNREACHABLE',
        message: aborted
          ? `Mounted Soul App service timed out after ${MOUNTED_PROXY_TIMEOUT_MS}ms.`
          : error instanceof Error ? error.message : String(error),
      },
      routePrefix: appOwnedApiRoutePrefix(app),
    }, aborted ? 504 : 502)
  }
  finally {
    clearTimeout(timeout)
  }
}

function mountedProxyHeaders(source: Headers): Headers {
  const headers = new Headers()
  for (const [key, value] of source) {
    const lower = key.toLowerCase()
    if (MOUNTED_PROXY_STRIPPED_HEADERS.has(lower) || lower.startsWith('x-forwarded-'))
      continue
    headers.set(key, value)
  }
  return headers
}

function appOwnedApiRoutePrefix(app: HostedSoulApp): string {
  return app.api.routePrefix ?? `/api/apps/${app.appId}`
}

async function mountedSoulAppServiceOrResponse(c: Context, state: LocalDaemonState, app: HostedSoulApp): Promise<MountedSoulAppService | Response> {
  const service = await resolveMountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service
  if (service)
    return service
  return mountedServiceError(c, app, 'SOUL_APP_SERVICE_NOT_CONFIGURED', `Soul App does not declare a mounted local service: ${app.appId}`, 424)
}

async function resolveMountedSoulAppServiceOrResponse(c: Context, state: LocalDaemonState, app: HostedSoulApp): Promise<MountedSoulAppService | Response | null> {
  try {
    const service = await resolveMountedSoulAppService(state, app)
    if (service)
      return service
    return null
  }
  catch (error) {
    return mountedServiceError(c, app, 'SOUL_APP_SERVICE_UNREACHABLE', error instanceof Error ? error.message : String(error), 502)
  }
}

function mountedServiceError(c: Context, app: HostedSoulApp, code: string, message: string, status: number): Response {
  const responseStatus = status === 424 ? 424 : status === 504 ? 504 : 502
  return c.json({
    error: { code, message },
    routePrefix: appOwnedApiRoutePrefix(app),
  }, responseStatus)
}

function applyMountedProxyContextHeaders(
  headers: Headers,
  c: Context,
  state: LocalDaemonState,
  app: HostedSoulApp,
  service: MountedSoulAppService,
  contribution?: MountedSurfaceContribution,
): void {
  const sourceUrl = new URL(c.req.url)
  const origin = `${sourceUrl.protocol}//${sourceUrl.host}`
  const identity = requestIdentity(c)
  const operatorId = identity?.operatorId ?? 'operator-local'
  const payload = Buffer.from(JSON.stringify({
    appId: app.appId,
    artifactId: c.req.query('artifactId') ?? null,
    expiresAt: mountContextExpiry(state),
    identity: identity ? publicHostIdentity(identity) : null,
    operatorId,
    permissions: app.permissions,
    reviewId: c.req.query('reviewId') ?? null,
    routePrefix: appOwnedApiRoutePrefix(app),
    sessionId: c.req.query('sessionId') ?? null,
    surface: contribution ? publicMountedSurfaceContribution(contribution) : null,
    workerId: c.req.query('workerId') ?? null,
    workspaceId: c.req.query('workspaceId') ?? null,
  })).toString('base64url')
  const signature = createHmac('sha256', service.mountToken).update(payload).digest('hex')

  headers.set('x-aiworker-app-id', app.appId)
  headers.set('x-aiworker-host-url', origin)
  headers.set('x-aiworker-mount-context', payload)
  headers.set('x-aiworker-mount-signature', signature)
  headers.set('x-aiworker-mount-token', service.mountToken)
  headers.set('x-aiworker-route-prefix', appOwnedApiRoutePrefix(app))
}

function requestIdentity(c: Context): HostIdentity | null {
  return REQUEST_IDENTITIES.get(c) ?? null
}

function publicHostIdentity(identity: HostIdentity): HostIdentity {
  return {
    authMethod: identity.authMethod,
    grants: identity.grants,
    operatorId: identity.operatorId,
    providerId: identity.providerId,
    subject: identity.subject,
  }
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
  service: MountedSoulAppService | null,
  contribution: MountedSurfaceContribution,
): MountedMicroAppHostData {
  return {
    appId: app.appId,
    artifactId: c.req.query('artifactId') ?? null,
    expiresAt: mountContextExpiry(state),
    mountTokenPresent: Boolean(service?.mountToken),
    reviewId: c.req.query('reviewId') ?? null,
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
  if (!contribution || relativeRequestPath !== contribution.surface.entry.replace(/^\//, ''))
    return null

  const workbenchEntry = app.descriptor?.workbench?.entry
  if (typeof workbenchEntry !== 'string' || workbenchEntry.length === 0)
    return null

  const descriptorRoot = path.dirname(app.sourceRef)
  const descriptorAssetPath = workbenchEntry.replace(/^dist\//, '')
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

async function resolveMountedSoulAppService(state: LocalDaemonState, app: HostedSoulApp): Promise<MountedSoulAppService | null> {
  const existing = state.mountedAppServices.get(app.appId)
  if (existing)
    return existing
  const pending = state.mountingAppServices.get(app.appId)
  if (pending)
    return pending

  const started = startMountedSoulAppService(state, app)
  state.mountingAppServices.set(app.appId, started)
  try {
    return await started
  }
  finally {
    state.mountingAppServices.delete(app.appId)
  }
}

export function mountedServiceSpawnEnv(mountToken: string): NodeJS.ProcessEnv {
  return { ...soulAppServiceEnv(), AIWORKER_MOUNT_TOKEN: mountToken, PORT: '0' }
}

async function startMountedSoulAppService(state: LocalDaemonState, app: HostedSoulApp): Promise<MountedSoulAppService | null> {
  const service = app.api.localService
  if (!service)
    return null
  if (!service.command?.length)
    return null

  const cwd = mountedSoulAppCwd(app)
  const mountToken = randomUUID()
  const child = spawn(service.command[0]!, service.command.slice(1), {
    cwd,
    env: mountedServiceSpawnEnv(mountToken),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const baseUrl = await waitForMountedSoulAppUrl(child, service.healthPath)
  const mounted = { baseUrl, mountToken, process: child }
  state.mountedAppServices.set(app.appId, mounted)
  return mounted
}

function stopMountedSoulAppService(state: LocalDaemonState, appId: string): void {
  const mounted = state.mountedAppServices.get(appId)
  if (!mounted)
    return
  state.mountedAppServices.delete(appId)
  if (mounted.process && !mounted.process.killed)
    mounted.process.kill('SIGTERM')
}

function mountedSoulAppCwd(app: HostedSoulApp): string {
  if (app.sourceKind === 'descriptor-path')
    return path.dirname(app.sourceRef)
  return process.cwd()
}

async function healthcheckMountedSoulAppUrl(baseUrl: string, healthPath: string): Promise<void> {
  const healthUrl = new URL(healthPath, baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MOUNTED_PROXY_TIMEOUT_MS)
  try {
    const health = await fetch(healthUrl, { signal: controller.signal })
    if (!health.ok)
      throw new Error(`Mounted Soul App healthcheck failed ${health.status}: ${healthUrl}`)
  }
  finally {
    clearTimeout(timeout)
  }
}

async function waitForMountedSoulAppUrl(child: ChildProcessByStdio<null, Readable, Readable>, healthPath: string): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Timed out waiting for mounted Soul App service URL.'))
    }, 5000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      const line = output.split(/\r?\n/).find(item => item.trim().startsWith('{'))
      if (!line)
        return
      try {
        const parsed = JSON.parse(line) as { url?: unknown }
        if (typeof parsed.url === 'string' && parsed.url.length > 0) {
          if (!isLoopbackMountedServiceUrl(parsed.url)) {
            child.kill()
            clearTimeout(timer)
            reject(new Error(`Mounted Soul App service URL must be loopback HTTP: ${parsed.url}`))
            return
          }
          clearTimeout(timer)
          resolve(parsed.url)
        }
      }
      catch {
        // Keep waiting for a JSON status line.
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Mounted Soul App service exited before readiness: ${code ?? 'signal'}. ${output.trim()}`))
    })
  })
  try {
    await healthcheckMountedSoulAppUrl(url, healthPath)
  }
  catch (error) {
    child.kill()
    throw error
  }
  return url
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

async function createWorkspaceSessionResponse(c: Context, state: LocalDaemonState, workspace: WorkspaceRow, stream: boolean): Promise<Response> {
  const result = await parseJsonBody(c, createSessionBodySchema, 'CREATE_SESSION_INVALID')
  if (!result.ok)
    return result.response
  return createWorkspaceSessionFromBody(c, state, workspace, result.data, stream)
}

async function createWorkspaceSessionFromBody(
  c: Context,
  state: LocalDaemonState,
  workspace: WorkspaceRow,
  body: {
    capabilityTemplateId?: string
    context?: string
    engineId?: null | string
    input?: string
    metadata?: Record<string, unknown>
    title: string
  },
  stream: boolean,
): Promise<Response> {
  const runtime = requireRuntime(state, workspace.workerId)
  const template = requireTemplateForWorker(state, workspace.workerId, body.capabilityTemplateId)
  const settings = loadLocalSettings()
  const execution = resolvedExecutionMetadata(settings, body.engineId)
  const metadata = enrichTemplateMetadata(state, workspace.workerId, template.id, {
    ...(body.metadata ?? {}),
    ...execution,
  })
  const session = await runtime.createSession({
    workspaceId: workspace.id,
    capabilityTemplateId: template.id,
    title: body.title,
    context: body.context ?? '',
    metadata,
  })
  if (!body.input || body.input.trim().length === 0)
    return c.json({ session }, 201)
  const turnInput = {
    engineCommand: typeof execution.engineCommand === 'string' ? execution.engineCommand : null,
    engineId: String(execution.engineId),
    input: body.input,
    metadata,
  }
  if (stream)
    return streamSessionTurn(runtime, session, turnInput, [{ event: 'session', data: session, id: session.id }])
  return c.json(await runtime.startTurn({ ...turnInput, sessionId: session.id }), 201)
}

async function createSessionMessageResponse(c: Context, state: LocalDaemonState, session: SessionRow, stream: boolean): Promise<Response> {
  const runtime = requireRuntime(state, session.workerId)
  const result = await parseJsonBody(c, createSessionMessageBodySchema, 'CREATE_SESSION_MESSAGE_INVALID')
  if (!result.ok)
    return result.response
  const settings = loadLocalSettings()
  const execution = sessionExecutionMetadata(session, settings)
  const currentSession = session.metadataJson?.executionMode === 'local-cli'
    && typeof session.metadataJson?.engineCommand !== 'string'
    && typeof execution.engineCommand === 'string'
    ? updateSession({
        id: session.id,
        metadataJson: {
          ...(session.metadataJson ?? {}),
          ...execution,
        },
      })
    : session
  const turnInput = {
    engineCommand: typeof execution.engineCommand === 'string' ? execution.engineCommand : null,
    engineId: String(execution.engineId),
    input: result.data.input,
    metadata: {
      ...enrichTemplateMetadata(state, currentSession.workerId, currentSession.capabilityTemplateId, currentSession.metadataJson ?? {}),
      ...(result.data.metadata ?? {}),
      ...execution,
    },
  }
  if (stream)
    return streamSessionTurn(runtime, currentSession, turnInput)
  return c.json(await runtime.startTurn({ ...turnInput, sessionId: currentSession.id }), 201)
}

async function createSessionInvocationResponse(c: Context, state: LocalDaemonState, session: SessionRow): Promise<Response> {
  const result = await parseJsonBody(c, createSessionMessageBodySchema, 'CREATE_SESSION_INVOCATION_INVALID')
  if (!result.ok)
    return result.response
  return createSessionInvocationFromBody(c, state, session, result.data)
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
): Promise<Response> {
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
  const currentSession = session.metadataJson?.executionMode === 'local-cli'
    && typeof session.metadataJson?.engineCommand !== 'string'
    && typeof execution.engineCommand === 'string'
    ? updateSession({
        id: session.id,
        metadataJson: {
          ...(session.metadataJson ?? {}),
          ...execution,
        },
      })
    : session
  const turnInput = {
    engineCommand: typeof execution.engineCommand === 'string' ? execution.engineCommand : null,
    engineId: String(execution.engineId),
    input: body.input,
    metadata: {
      ...enrichTemplateMetadata(state, currentSession.workerId, currentSession.capabilityTemplateId, currentSession.metadataJson ?? {}),
      ...(body.metadata ?? {}),
      ...execution,
    },
  }
  const invocationResult = await runtime.startInvocation({ ...turnInput, sessionId: currentSession.id })
  return c.json({
    events: invocationResult.events,
    files: invocationResult.files,
    invocation: invocationResult.invocation,
    session: invocationResult.session,
  }, 201)
}

function streamSessionTurn(
  runtime: LocalWorkerRuntime,
  session: SessionRow,
  input: {
    engineCommand?: string | null
    engineId: string
    input: string
    metadata: Record<string, unknown>
  },
  initialFrames: Array<{ data: unknown, event: string, id?: string | number }> = [],
): Response {
  const encoder = new TextEncoder()
  let closed = false
  let heartbeat: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const heartbeatFrame = () => {
        if (!closed)
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }
      const send = (event: string, data: unknown, id?: string | number) => {
        if (closed)
          return
        const lines = [
          id !== undefined ? `id: ${id}` : null,
          `event: ${event}`,
          `data: ${JSON.stringify(data)}`,
          '',
        ].filter(line => line !== null).join('\n')
        controller.enqueue(encoder.encode(`${lines}\n`))
      }
      const unsubscribe = runtime.bus.subscribe((event) => {
        if (event.sessionId !== session.id)
          return
        if (event.kind === 'event') {
          const row = event.payload.event
          if (isRecord(row))
            send('session_event', row, typeof row.id === 'number' ? row.id : undefined)
          return
        }
        if (event.kind === 'turn' && isRecord(event.payload.turn))
          send('turn', event.payload.turn, event.turnId)
      })
      for (const frame of initialFrames)
        send(frame.event, frame.data, frame.id)
      send('status', { sessionId: session.id, status: 'started' })
      heartbeat = setInterval(heartbeatFrame, 5_000)
      void runtime.startTurn({
        engineCommand: input.engineCommand ?? null,
        engineId: input.engineId,
        input: input.input,
        metadata: input.metadata,
        sessionId: session.id,
      }).then((result) => {
        send('result', result)
      }).catch((error) => {
        send('error', { message: error instanceof Error ? error.message : String(error) })
      }).finally(() => {
        unsubscribe()
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
        if (!closed) {
          closed = true
          controller.close()
        }
      })
    },
    cancel() {
      closed = true
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    },
  })
  return new Response(stream, {
    headers: {
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
