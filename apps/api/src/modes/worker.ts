import type { HostAuthProvider, HostIdentity, HostRuntime, LocalExecutor, LocalWorkerRuntime, NativeEngineBridgeResult } from '@zonease/aiworker-core'
import type { HostedSoulApp, LocalSettingsConfig, LocalWorkerOverlayAsset, MountedMicroAppHostData, SoulAppMountedSurface } from '@zonease/aiworker-shared'
import type { SessionRow, WorkerEngineInvocationRow, WorkerRow, WorkspaceRow } from '@zonease/aiworker-storage-sqlite/worker'

import type { Context } from 'hono'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import {
  createHostRuntime,
  createLocalBearerAuthProvider,
  invokeNativeEngine,
  listBaselineAssets,
  soulAppServiceEnv,
  workerEnv,
} from '@zonease/aiworker-core'
import {
  AppError,
  isLoopbackMountedServiceUrl,
  localWorkerOverlaySaveSchema,
} from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createWorkerEngineInvocation,
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
  nextWorkerEngineInvocationSeq,
  runWorkerMigrations,
  updateWorkspace,
  upsertWorker,
  upsertWorkerOverlayAssets,
} from '@zonease/aiworker-storage-sqlite/worker'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'
import { registerLocalOpenApiPaths } from './worker/openapi'
import { loadLocalSettings, saveLocalSettings, scanLocalEngines } from './worker/settings'
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
  surface: SoulAppMountedSurface
  target?: string
}

interface NativeEngineInvocationRequest {
  args?: unknown
  cwd?: string
  engineCommand?: string | null
  engineId?: string | null
  input?: string | null
}

interface PreparedNativeEngineInvocation {
  args: string[]
  command: string
  cwd: string
  engineId: string
  input: string
  invocationId: string
  worker: WorkerRow
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
      const settings = loadLocalSettings()
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
  app.use('/api/local/*', async (c, next) => {
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
    const body = await readJson<{ manifest?: unknown, manifestPath?: string }>(c.req)
    const app = typeof body.manifestPath === 'string' && body.manifestPath.trim()
      ? await state.host.installAppFromPath(body.manifestPath)
      : state.host.installAppManifest({
          manifest: body.manifest,
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
  app.get('/api/local/apps/:appId/surfaces/:surfaceId', async (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return notFound(c, 'Soul App')
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    return mountedSurfaceResponse(c, state, app, c.req.param('surfaceId'))
  })

  app.get('/api/local/workers', c => c.json({ workers: listWorkers() }))
  app.post('/api/local/workers', async (c) => {
    const body = await readJson<{
      defaultEngineId?: string | null
      id?: string
      metadata?: Record<string, unknown>
      name?: string
      soulId?: string
    }>(c.req)
    const created = await state.host.createSoulWorker({
      defaultEngineId: body.defaultEngineId,
      id: body.id,
      metadata: body.metadata,
      name: requireString(body.name, 'name'),
      soulId: requireString(body.soulId, 'soulId'),
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
    const body = await readJson<{
      defaultEngineId?: string | null
      metadata?: Record<string, unknown>
      name?: string
      status?: WorkerRow['status']
    }>(c.req)
    const worker = upsertWorker({
      id: existing.id,
      soulId: existing.soulId,
      name: body.name ?? existing.name,
      status: body.status ?? existing.status,
      defaultEngineId: body.defaultEngineId ?? existing.defaultEngineId,
      metadataJson: body.metadata ?? existing.metadataJson,
    })
    const runtime = state.host.createRuntimeForWorker(worker)
    await runtime.init()
    state.runtimes.set(worker.id, runtime)
    return c.json({ worker, snapshot: runtime.snapshot() })
  })
  app.get('/api/local/workers/:workerId/overlay', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    return c.json({ overlay: await workerOverlayResponse(state, worker.id) })
  })
  app.put('/api/local/workers/:workerId/overlay', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    const parsed = localWorkerOverlaySaveSchema.safeParse(await readJson(c.req))
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'WORKER_OVERLAY_INVALID',
          message: 'Invalid worker overlay payload.',
          issues: parsed.error.issues,
        },
      }, 400)
    }
    if (parsed.data.assets.some(asset => asset.kind === 'mcp-client' && containsLiteralSecret(asset.content))) {
      return c.json({
        error: {
          code: 'WORKER_OVERLAY_SECRET',
          message: 'literal MCP secrets are not allowed in worker overlay assets',
        },
      }, 422)
    }
    upsertWorkerOverlayAssets(worker.id, parsed.data.assets.map(asset => ({
      content: asset.content,
      enabled: asset.enabled,
      id: asset.id,
      kind: asset.kind,
      metadataJson: asset.metadataJson,
      target: asset.target,
    })))
    return c.json({ overlay: await workerOverlayResponse(state, worker.id) })
  })
  app.post('/api/local/workers/:workerId/engine/invocations', async (c) => {
    const prepared = await prepareNativeEngineInvocation(c, c.req.param('workerId'))
    const result = await invokeNativeEngine({
      args: prepared.args,
      command: prepared.command,
      cwd: prepared.cwd,
      input: prepared.input,
      invocationId: prepared.invocationId,
      workerId: prepared.worker.id,
    })
    const invocation = persistNativeEngineInvocation(prepared, result)
    return c.json({ invocation, result }, 201)
  })
  app.post('/api/local/workers/:workerId/engine/invocations/stream', async (c) => {
    const prepared = await prepareNativeEngineInvocation(c, c.req.param('workerId'))
    return streamNativeEngineInvocation(prepared)
  })

  app.get('/api/local/workers/:workerId/templates', (c) => {
    return c.json({ templates: state.host.listCapabilityTemplatesForWorker(c.req.param('workerId')) })
  })
  app.get('/api/local/workers/:workerId/templates/:templateId', (c) => {
    const template = requireTemplateForWorker(state, c.req.param('workerId'), c.req.param('templateId'))
    return c.json({ template })
  })

  app.get('/api/local/workspaces', c => c.json({ workspaces: listWorkspaces() }))
  app.get('/api/local/workers/:workerId/workspaces', (c) => {
    const workerId = c.req.param('workerId')
    requireRuntime(state, workerId)
    return c.json({ workspaces: listWorkspaces(workerId) })
  })
  app.post('/api/local/workers/:workerId/workspaces', async (c) => {
    const runtime = requireRuntime(state, c.req.param('workerId'))
    const body = await readJson<{ metadata?: Record<string, unknown>, name?: string, sourcePointers?: Record<string, unknown>[], type?: string }>(c.req)
    const workspace = await runtime.createWorkspace({
      name: requireString(body.name, 'name'),
      type: body.type ?? 'workspace',
      sourcePointers: body.sourcePointers ?? [],
      metadata: body.metadata ?? {},
    })
    return c.json({ workspace }, 201)
  })
  app.get('/api/local/workers/:workerId/workspaces/:workspaceId', (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return c.json({ workspace })
  })
  app.patch('/api/local/workers/:workerId/workspaces/:workspaceId', async (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    const body = await readJson<Partial<Pick<WorkspaceRow, 'metadataJson' | 'name' | 'sourcePointersJson' | 'status'>>>(c.req)
    return c.json({ workspace: updateWorkspace({ id: workspace.id, ...body }) })
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
    const body = await readJson<Partial<Pick<WorkspaceRow, 'metadataJson' | 'name' | 'sourcePointersJson' | 'status'>>>(c.req)
    return c.json({ workspace: updateWorkspace({ id: c.req.param('workspaceId'), ...body }) })
  })
  app.get('/api/local/sessions', c => c.json({ sessions: listSessions() }))
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
  app.get('/api/local/sessions/:sessionId', (c) => {
    const session = getSession(c.req.param('sessionId'))
    if (!session)
      return notFound(c, 'session')
    return c.json({ session, turns: listTurns(session.id), events: listSessionEvents(session.id) })
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

  app.get('/api/local/settings', (c) => {
    const settings = loadLocalSettings()
    return c.json({ settings })
  })
  app.patch('/api/local/settings', async (c) => {
    const patch = await readJson<Partial<LocalSettingsConfig>>(c.req)
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
    const body = await readJson<{ engineId?: string }>(c.req)
    const settings = loadLocalSettings()
    const engineId = body.engineId ?? settings.engineId
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
    return `[aiworker-daemon] 未配置 AIWORKER_LOCAL_TOKEN:/api/local/* 以本机匿名身份开放,请确保仅绑定 loopback。`
  return `[aiworker-daemon] AIWORKER_LOCAL_TOKEN 未配置且绑定到非 loopback 地址 ${host}:/api/local/* 将以匿名身份暴露,请配置 token 或改绑 127.0.0.1。`
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
  const match = /^\/api\/local\/apps\/([^/]+)\/broker(?:\/|$)/.exec(pathname)
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

async function readJson<T>(request: { json: () => Promise<unknown> }): Promise<T> {
  return await request.json().catch(() => ({})) as T
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw AppError.badRequest(`Missing required field: ${field}`)
  return value.trim()
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readStringArray(value: unknown, field: string): string[] {
  if (value === undefined)
    return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'))
    throw AppError.badRequest(`Invalid field: ${field}`)
  return value
}

async function workerOverlayResponse(state: LocalDaemonState, workerId: string) {
  const overlayAssets = listWorkerOverlayAssets(workerId).map(({ content, enabled, id, kind, metadataJson, source, target, updatedAt }) => ({
    content,
    enabled,
    id,
    kind,
    metadataJson: metadataJson as Record<string, unknown>,
    source,
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
  return value.startsWith('$') || value.startsWith('env:')
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

async function mountedSurfaceResponse(c: Context, state: LocalDaemonState, app: HostedSoulApp, surfaceId: string): Promise<Response> {
  const contribution = findMountedSurfaceContribution(app, surfaceId)
  if (!contribution)
    return c.json({ error: { code: 'SOUL_APP_SURFACE_NOT_FOUND', message: `Mounted surface is not declared: ${surfaceId}` } }, 404)

  if (contribution.surface.renderer === 'micro-app') {
    const service = await mountedSoulAppServiceOrResponse(c, state, app)
    if (service instanceof Response)
      return service

    const sourceUrl = new URL(c.req.url)
    return c.json({
      microApp: {
        data: mountedMicroAppData(c, state, app, service, contribution),
        name: `${app.appId}--${contribution.id}`,
        url: `/api/local/apps/${app.appId}${contribution.surface.entry}${sourceUrl.search}`,
      },
      surface: publicMountedSurfaceContribution(contribution),
    })
  }

  const service = await mountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service

  const sourceUrl = new URL(c.req.url)
  const targetUrl = new URL(contribution.surface.entry, service.baseUrl)
  targetUrl.search = sourceUrl.search
  const headers = mountedProxyHeaders(c.req.raw.headers)
  applyMountedProxyContextHeaders(headers, c, state, app, service, contribution)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MOUNTED_PROXY_TIMEOUT_MS)
  try {
    const res = await fetch(targetUrl, {
      headers,
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    })
    const responseHeaders = new Headers(res.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('transfer-encoding')
    if (contribution.surface.renderer === 'host-descriptor' && responseHeaders.get('content-type')?.includes('application/json')) {
      const descriptor = await res.json() as Record<string, unknown>
      responseHeaders.set('content-type', 'application/json')
      return new Response(JSON.stringify({
        ...descriptor,
        appId: app.appId,
        authority: 'soul-app',
        cache: {
          cachedAt: (state.now ? new Date(state.now()) : new Date()).toISOString(),
          freshness: 'non-authoritative',
        },
      }), {
        headers: responseHeaders,
        status: res.status,
        statusText: res.statusText,
      })
    }
    return new Response(res.body, {
      headers: responseHeaders,
      status: res.status,
      statusText: res.statusText,
    })
  }
  catch (error) {
    const aborted = controller.signal.aborted
    return mountedServiceError(c, app, aborted ? 'SOUL_APP_SERVICE_TIMEOUT' : 'SOUL_APP_SERVICE_UNREACHABLE', aborted
      ? `Mounted Soul App service timed out after ${MOUNTED_PROXY_TIMEOUT_MS}ms.`
      : error instanceof Error ? error.message : String(error), aborted ? 504 : 502)
  }
  finally {
    clearTimeout(timeout)
  }
}

async function proxyMountedSoulAppApi(c: Context, state: LocalDaemonState, app: HostedSoulApp): Promise<Response> {
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
      routePrefix: app.mountedContribution.apiRoutePrefix,
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

async function mountedSoulAppServiceOrResponse(c: Context, state: LocalDaemonState, app: HostedSoulApp): Promise<MountedSoulAppService | Response> {
  try {
    const service = await resolveMountedSoulAppService(state, app)
    if (service)
      return service
    return mountedServiceError(c, app, 'SOUL_APP_SERVICE_NOT_CONFIGURED', `Soul App does not declare a mounted local service: ${app.appId}`, 424)
  }
  catch (error) {
    return mountedServiceError(c, app, 'SOUL_APP_SERVICE_UNREACHABLE', error instanceof Error ? error.message : String(error), 502)
  }
}

function mountedServiceError(c: Context, app: HostedSoulApp, code: string, message: string, status: number): Response {
  const responseStatus = status === 424 ? 424 : status === 504 ? 504 : 502
  return c.json({
    error: { code, message },
    routePrefix: app.mountedContribution.apiRoutePrefix,
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
    permissions: app.manifest.permissions,
    reviewId: c.req.query('reviewId') ?? null,
    routePrefix: app.mountedContribution.apiRoutePrefix,
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
  headers.set('x-aiworker-route-prefix', app.mountedContribution.apiRoutePrefix ?? '')
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
  service: MountedSoulAppService,
  contribution: MountedSurfaceContribution,
): MountedMicroAppHostData {
  return {
    appId: app.appId,
    artifactId: c.req.query('artifactId') ?? null,
    expiresAt: mountContextExpiry(state),
    mountTokenPresent: Boolean(service.mountToken),
    reviewId: c.req.query('reviewId') ?? null,
    routePrefix: app.mountedContribution.apiRoutePrefix,
    sessionId: c.req.query('sessionId') ?? null,
    surfaceId: contribution.id,
    surfaceKind: contribution.kind,
    surfaceScope: contribution.surface.scope,
    theme: c.req.query('theme') ?? null,
    workerId: c.req.query('workerId') ?? null,
    workspaceId: c.req.query('workspaceId') ?? null,
  }
}

function findMountedSurfaceContribution(app: HostedSoulApp, surfaceId: string): MountedSurfaceContribution | null {
  const contributions: MountedSurfaceContribution[] = [
    ...app.manifest.ui.routes.filter(route => route.surface).map(route => ({
      id: route.id,
      kind: 'route' as const,
      label: route.label,
      path: route.path,
      surface: route.surface!,
    })),
    ...app.manifest.ui.panels.filter(slot => slot.surface).map(slot => ({
      id: slot.id,
      kind: 'panel' as const,
      label: slot.label,
      surface: slot.surface!,
      target: slot.target,
    })),
    ...app.manifest.ui.artifactPreviews.filter(slot => slot.surface).map(slot => ({
      id: slot.id,
      kind: 'artifact-preview' as const,
      label: slot.label,
      surface: slot.surface!,
      target: slot.target,
    })),
    ...(app.manifest.ui.workspaceWidgets ?? []).filter(slot => slot.surface).map(slot => ({
      id: slot.id,
      kind: 'workspace-widget' as const,
      label: slot.label,
      surface: slot.surface!,
      target: slot.target,
    })),
  ]
  return contributions.find(contribution => contribution.id === surfaceId) ?? null
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
  const service = app.manifest.api.localService
  if (!service)
    return null
  if (service.baseUrl) {
    if (!isLoopbackMountedServiceUrl(service.baseUrl))
      throw new Error(`Mounted Soul App service URL must be loopback HTTP: ${service.baseUrl}`)
    await healthcheckMountedSoulAppUrl(service.baseUrl, service.healthPath)
    const mounted = { baseUrl: service.baseUrl, mountToken: randomUUID() }
    state.mountedAppServices.set(app.appId, mounted)
    return mounted
  }
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
  if (app.sourceKind === 'manifest-path')
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

function selectedEngine(settings: LocalSettingsConfig) {
  return settings.engines.find(engine => engine.id === settings.engineId)
}

function selectedEngineCommand(settings: LocalSettingsConfig, engine: LocalSettingsConfig['engines'][number] | undefined): string | null {
  if (settings.executionMode !== 'local-cli')
    return null
  return engine?.path ?? engine?.command ?? settings.engineId
}

function executionMetadata(settings: LocalSettingsConfig, engine: LocalSettingsConfig['engines'][number] | undefined): Record<string, unknown> {
  return {
    byok: settings.byok,
    engineCommand: engine?.command ?? null,
    engineId: settings.engineId,
    engineName: engine?.name ?? null,
    executionMode: settings.executionMode,
  }
}

async function prepareNativeEngineInvocation(c: Context, workerId: string): Promise<PreparedNativeEngineInvocation> {
  const worker = requireWorker(workerId)
  const body = await readJson<NativeEngineInvocationRequest>(c.req)
  const settings = loadLocalSettings()
  const engineId = readOptionalString(body.engineId) ?? (settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider)
  const engine = settings.engines.find(engine => engine.id === engineId)
  const command = readOptionalString(body.engineCommand) ?? selectedEngineCommand(settings, engine)
  if (!command)
    throw new Error('Missing required field: engineCommand')
  return {
    args: readStringArray(body.args, 'args'),
    command,
    cwd: requireString(body.cwd, 'cwd'),
    engineId,
    input: typeof body.input === 'string' ? body.input : '',
    invocationId: randomUUID(),
    worker,
  }
}

function persistNativeEngineInvocation(
  prepared: PreparedNativeEngineInvocation,
  result: NativeEngineBridgeResult,
): WorkerEngineInvocationRow {
  return createWorkerEngineInvocation({
    id: result.invocationId,
    workerId: prepared.worker.id,
    seq: nextWorkerEngineInvocationSeq(prepared.worker.id),
    engineId: prepared.engineId,
    engineCommand: prepared.command,
    status: result.status,
    cwd: result.cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    metadataJson: {
      bridge: 'native',
      durationMs: result.durationMs,
      stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
      stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
    },
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    at: result.finishedAt,
  })
}

function streamNativeEngineInvocation(prepared: PreparedNativeEngineInvocation): Response {
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
      send('status', {
        invocationId: prepared.invocationId,
        status: 'started',
        workerId: prepared.worker.id,
      }, prepared.invocationId)
      heartbeat = setInterval(heartbeatFrame, 5_000)
      void invokeNativeEngine({
        args: prepared.args,
        command: prepared.command,
        cwd: prepared.cwd,
        input: prepared.input,
        invocationId: prepared.invocationId,
        onEvent: event => send('engine_event', { invocationId: prepared.invocationId, ...event }, prepared.invocationId),
        workerId: prepared.worker.id,
      }).then((result) => {
        const invocation = persistNativeEngineInvocation(prepared, result)
        send('result', { invocation, result }, invocation.id)
      }).catch((error) => {
        send('error', { invocationId: prepared.invocationId, message: error instanceof Error ? error.message : String(error) }, prepared.invocationId)
      }).finally(() => {
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

async function createWorkspaceSessionResponse(c: Context, state: LocalDaemonState, workspace: WorkspaceRow, stream: boolean): Promise<Response> {
  const runtime = requireRuntime(state, workspace.workerId)
  const body = await readJson<{
    capabilityTemplateId?: string
    context?: string
    input?: string
    metadata?: Record<string, unknown>
    title?: string
  }>(c.req)
  const template = requireTemplateForWorker(state, workspace.workerId, body.capabilityTemplateId)
  const metadata = enrichTemplateMetadata(state, workspace.workerId, template.id, body.metadata ?? {})
  const session = await runtime.createSession({
    workspaceId: workspace.id,
    capabilityTemplateId: template.id,
    title: requireString(body.title, 'title'),
    context: body.context ?? '',
    metadata,
  })
  if (typeof body.input !== 'string' || body.input.trim().length === 0)
    return c.json({ session }, 201)
  const settings = loadLocalSettings()
  const engine = selectedEngine(settings)
  const turnInput = {
    engineCommand: selectedEngineCommand(settings, engine),
    engineId: settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider,
    input: body.input,
    metadata: {
      ...metadata,
      ...executionMetadata(settings, engine),
    },
  }
  if (stream)
    return streamSessionTurn(runtime, session, turnInput, [{ event: 'session', data: session, id: session.id }])
  return c.json(await runtime.startTurn({ ...turnInput, sessionId: session.id }), 201)
}

async function createSessionMessageResponse(c: Context, state: LocalDaemonState, session: SessionRow, stream: boolean): Promise<Response> {
  const runtime = requireRuntime(state, session.workerId)
  const body = await readJson<{ input?: string, metadata?: Record<string, unknown> }>(c.req)
  const input = requireString(body.input, 'input')
  const settings = loadLocalSettings()
  const engine = selectedEngine(settings)
  const turnInput = {
    engineCommand: selectedEngineCommand(settings, engine),
    engineId: settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider,
    input,
    metadata: {
      ...enrichTemplateMetadata(state, session.workerId, session.capabilityTemplateId, session.metadataJson ?? {}),
      ...(body.metadata ?? {}),
      ...executionMetadata(settings, engine),
    },
  }
  if (stream)
    return streamSessionTurn(runtime, session, turnInput)
  return c.json(await runtime.startTurn({ ...turnInput, sessionId: session.id }), 201)
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
