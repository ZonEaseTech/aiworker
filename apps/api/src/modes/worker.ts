import type { HostAuthProvider, HostIdentity, HostRuntime, LocalExecutor, LocalWorkerRuntime } from '@zonease/aiworker-core'
import type { HostedSoulApp, LocalSettingsConfig, SoulAppMountedSurface, SoulAppPermission } from '@zonease/aiworker-shared'
import type { ReviewRow, SessionRow, WorkerRow, WorkspaceRow } from '@zonease/aiworker-storage-sqlite/worker'

import type { Context } from 'hono'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import {
  createHostRuntime,
  createLocalBearerAuthProvider,
  createSoulAppBroker,
  workerEnv,
} from '@zonease/aiworker-core'
import {
  isLoopbackMountedServiceUrl,
  localSettingsConfigSchema,
} from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createLesson,
  createReview,
  getArtifact,
  getReview,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listArtifacts,
  listFiles,
  listLessons,
  listReviews,
  listSessionEvents,
  listSessions,
  listSettings,
  listTurns,
  listWorkers,
  listWorkspaces,
  runWorkerMigrations,
  setSetting,
  updateLesson,
  updateWorkspace,
  upsertFile,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'

const DEFAULT_RUNTIME_VERSION = 'dev'
const LOCAL_SETTINGS_KEY = 'local-settings'
const REQUEST_IDENTITIES = new WeakMap<Context, HostIdentity>()
const ENGINE_COMMANDS = [
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
] as const

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

interface ShellActionDescriptor {
  id: string
  protocolAction: string
  requiredPermissions?: readonly string[]
}

interface BrokerRequestScope {
  operatorId?: string
  sessionId?: string
  workerId?: string
  workspaceId?: string
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
  app.get('/api/local/apps/:appId/security-review', (c) => {
    const appId = c.req.param('appId')
    if (!state.host.getApp(appId))
      return notFound(c, 'Soul App')
    return c.json({ review: state.host.reviewAppSecurity(appId) })
  })
  app.post('/api/local/apps/:appId/enable', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.enableApp(appId)
    return c.json({ app, catalog: state.host.listCatalog(), review: state.host.reviewAppSecurity(appId) })
  })
  app.post('/api/local/apps/:appId/disable', (c) => {
    const appId = c.req.param('appId')
    const app = state.host.disableApp(appId)
    stopMountedSoulAppService(state, appId)
    return c.json({ app, catalog: state.host.listCatalog(), review: state.host.reviewAppSecurity(appId) })
  })
  app.post('/api/local/apps/:appId/healthcheck', c => c.json({ app: state.host.healthcheckApp(c.req.param('appId')) }))
  app.get('/api/local/apps/:appId/broker/permissions', (c) => {
    const broker = createSoulAppBroker(brokerContext(c, state))
    return c.json({ permissions: broker.permissions.list() })
  })
  app.get('/api/local/apps/:appId/broker/providers', (c) => {
    const broker = createSoulAppBroker(brokerContext(c, state))
    return c.json({ registry: broker.providers.list() })
  })
  app.get('/api/local/apps/:appId/broker/search', (c) => {
    const result = createSoulAppBroker(brokerContext(c, state)).search.query(c.req.query('query') ?? '')
    return brokerResponse(c, 'result', result)
  })
  app.put('/api/local/apps/:appId/broker/search/:itemId{.+}', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const result = createSoulAppBroker(brokerContext(c, state)).search.upsert(c.req.param('itemId'), searchIndexInputFromRecord(body))
    return brokerResponse(c, 'item', result)
  })
  app.get('/api/local/apps/:appId/broker/storage', (c) => {
    const result = createSoulAppBroker(brokerContext(c, state)).storage.list()
    return brokerResponse(c, 'records', result)
  })
  app.get('/api/local/apps/:appId/broker/storage/:key{.+}', (c) => {
    const result = createSoulAppBroker(brokerContext(c, state)).storage.get(c.req.param('key'))
    return brokerResponse(c, 'record', result)
  })
  app.put('/api/local/apps/:appId/broker/storage/:key{.+}', async (c) => {
    const body = await readJson<{ namespace?: string, valueJson?: Record<string, unknown> }>(c.req)
    const result = createSoulAppBroker(brokerContext(c, state)).storage.put(c.req.param('key'), isRecord(body.valueJson) ? body.valueJson : {}, {
      namespace: body.namespace,
    })
    return brokerResponse(c, 'record', result)
  })
  app.post('/api/local/apps/:appId/broker/connectors/:connectorId/evidence', async (c) => {
    const body = await readJson<{ query?: Record<string, unknown> }>(c.req)
    const result = createSoulAppBroker(brokerContext(c, state)).connectors.readEvidence(c.req.param('connectorId'), isRecord(body.query) ? body.query : {})
    return brokerResponse(c, 'evidence', result)
  })
  app.get('/api/local/apps/:appId/broker/audit', (c) => {
    const broker = createSoulAppBroker(brokerContext(c, state))
    return c.json({ events: broker.audit.list() })
  })
  app.post('/api/local/apps/:appId/broker/engine/invocations', async (c) => {
    const body = await readJson<{ prompt?: string }>(c.req)
    const result = createSoulAppBroker(brokerContext(c, state)).engine.createInvocation({ prompt: body.prompt ?? '' })
    return brokerResponse(c, 'invocation', result)
  })
  app.post('/api/local/apps/:appId/actions/:actionId', async (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return c.json({ error: { code: 'SOUL_APP_NOT_FOUND', message: `Soul App was not found: ${c.req.param('appId')}` } }, 404)
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    const action = resolveShellAction(app, c.req.param('actionId'))
    if (!action)
      return c.json({ error: { code: 'SOUL_APP_ACTION_NOT_DECLARED', message: `Soul App action is not declared: ${c.req.param('actionId')}` } }, 404)
    const body = await readJson<{ input?: Record<string, unknown>, scope?: Record<string, unknown> }>(c.req)
    const scope = brokerScopeFromRecord(body.scope)
    const decision = decideDescriptorRequiredPermissions(c, state, action.requiredPermissions, `action ${action.id}`, scope)
    if (decision)
      return permissionDecisionResponse(c, decision)
    return mountedActionResponse(c, state, app, action, isRecord(body.input) ? body.input : {}, scope)
  })
  app.get('/api/local/apps/:appId/search', async (c) => {
    const app = state.host.getApp(c.req.param('appId'))
    if (!app)
      return c.json({ error: { code: 'SOUL_APP_NOT_FOUND', message: `Soul App was not found: ${c.req.param('appId')}` } }, 404)
    if (app.status !== 'enabled')
      return c.json({ error: { code: 'SOUL_APP_DISABLED', message: `Soul App is not enabled: ${app.appId}` } }, 409)
    const providerId = c.req.query('providerId') ?? ''
    const search = app.manifest.ui.shell?.search
    if (!search || search.protocolProvider !== providerId)
      return c.json({ error: { code: 'SOUL_APP_SEARCH_NOT_DECLARED', message: `Soul App search provider is not declared: ${providerId}` } }, 404)
    const decision = decideDescriptorRequiredPermissions(c, state, search.requiredPermissions, `search ${search.id}`)
    if (decision)
      return permissionDecisionResponse(c, decision)
    return mountedSearchResponse(c, state, app, search)
  })
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

  app.get('/api/local/souls', c => c.json({ souls: state.host.listSouls() }))
  app.get('/api/local/souls/:id', (c) => {
    const soul = state.host.findSoul(c.req.param('id'))
    if (!soul)
      return notFound(c, 'soul')
    return c.json({ soul })
  })
  app.get('/api/local/templates', (c) => {
    const soulId = c.req.query('soulId')
    const templates = state.host.listCapabilityTemplates(soulId)
    return c.json({ templates })
  })
  app.get('/api/local/templates/:id', (c) => {
    const template = state.host.listCatalog().templates.find(template => template.id === c.req.param('id'))
    if (!template)
      return notFound(c, 'template')
    return c.json({ template })
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
    const events = listSessionEvents(session.id).filter(event => !Number.isFinite(after) || event.id > after)
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
    const events = listSessionEvents(session.id).filter(event => !Number.isFinite(after) || event.id > after)
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

  app.get('/api/local/files', c => c.json({ files: listFiles() }))
  app.get('/api/local/workers/:workerId/files', (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    const workspaceIds = new Set(listWorkspaces(worker.id).map(workspace => workspace.id))
    return c.json({ files: listFiles().filter(file => workspaceIds.has(file.workspaceId)) })
  })
  app.get('/api/local/workers/:workerId/workspaces/:workspaceId/files', (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return c.json({ files: listFiles(workspace.id) })
  })
  app.get('/api/local/workers/:workerId/workspaces/:workspaceId/files/search', (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    const query = c.req.query('q')?.toLowerCase() ?? ''
    const files = listFiles(workspace.id).filter(file => file.path.toLowerCase().includes(query))
    return c.json({ files })
  })
  app.get('/api/local/workers/:workerId/workspaces/:workspaceId/files/raw/:path{.+}', async (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    return c.text(await requireRuntime(state, workspace.workerId).files(workspace.id).read(c.req.param('path')))
  })
  app.put('/api/local/workers/:workerId/workspaces/:workspaceId/files/raw/:path{.+}', async (c) => {
    const workspace = requireWorkerWorkspace(c.req.param('workerId'), c.req.param('workspaceId'))
    const filePath = c.req.param('path')
    const entry = await requireRuntime(state, workspace.workerId).files(workspace.id).write({ path: filePath, content: await c.req.text() })
    const file = upsertFile({
      id: randomUUID(),
      workspaceId: workspace.id,
      path: filePath,
      kind: entry.kind,
      size: entry.size,
      mtime: entry.mtime,
      hash: entry.hash,
      source: 'user',
    })
    return c.json({ file })
  })
  app.get('/api/local/workspaces/:workspaceId/files', (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return c.json({ files: listFiles(workspace.id) })
  })
  app.get('/api/local/workspaces/:workspaceId/files/search', (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    const query = c.req.query('q')?.toLowerCase() ?? ''
    const files = listFiles(workspace.id).filter(file => file.path.toLowerCase().includes(query))
    return c.json({ files })
  })
  app.get('/api/local/workspaces/:workspaceId/files/raw/:path{.+}', async (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return c.text(await requireRuntime(state, workspace.workerId).files(workspace.id).read(c.req.param('path')))
  })
  app.put('/api/local/workspaces/:workspaceId/files/raw/:path{.+}', async (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    const filePath = c.req.param('path')
    const entry = await requireRuntime(state, workspace.workerId).files(workspace.id).write({ path: filePath, content: await c.req.text() })
    const file = upsertFile({
      id: randomUUID(),
      workspaceId: workspace.id,
      path: filePath,
      kind: entry.kind,
      size: entry.size,
      mtime: entry.mtime,
      hash: entry.hash,
      source: 'user',
    })
    return c.json({ file })
  })

  app.get('/api/local/artifacts', c => c.json({ artifacts: listArtifacts() }))
  app.get('/api/local/workers/:workerId/artifacts', (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    const workspaceIds = new Set(listWorkspaces(worker.id).map(workspace => workspace.id))
    return c.json({ artifacts: listArtifacts().filter(artifact => workspaceIds.has(artifact.workspaceId)) })
  })
  app.get('/api/local/workspaces/:workspaceId/artifacts', (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return c.json({ artifacts: listArtifacts(workspace.id) })
  })
  app.get('/api/local/artifacts/:id', (c) => {
    const artifact = getArtifact(c.req.param('id'))
    if (!artifact)
      return notFound(c, 'artifact')
    return c.json({ artifact })
  })

  app.get('/api/local/reviews', c => c.json({ reviews: listReviews() }))
  app.post('/api/local/reviews', async (c) => {
    const body = await readJson<Partial<ReviewRow> & { findingsJson?: Record<string, unknown>[], risksJson?: Record<string, unknown>[] }>(c.req)
    const workspaceId = requireString(body.workspaceId, 'workspaceId')
    const review = createReview({
      id: randomUUID(),
      workspaceId,
      sessionId: body.sessionId ?? null,
      turnId: body.turnId ?? null,
      artifactId: body.artifactId ?? null,
      verdict: body.verdict ?? 'needs_review',
      findingsJson: body.findingsJson ?? [],
      risksJson: body.risksJson ?? [],
    })
    return c.json({ review }, 201)
  })
  app.get('/api/local/reviews/:id', (c) => {
    const review = getReview(c.req.param('id'))
    if (!review)
      return notFound(c, 'review')
    return c.json({ review })
  })

  app.get('/api/local/lessons', c => c.json({ lessons: listLessons() }))
  app.post('/api/local/lessons', async (c) => {
    const body = await readJson<{ evidenceJson?: Record<string, unknown>[], sourceReviewId?: string | null, statement?: string, workspaceId?: string }>(c.req)
    const lesson = createLesson({
      id: randomUUID(),
      workspaceId: requireString(body.workspaceId, 'workspaceId'),
      sourceReviewId: body.sourceReviewId ?? null,
      statement: requireString(body.statement, 'statement'),
      evidenceJson: Array.isArray(body.evidenceJson) ? body.evidenceJson : [],
    })
    return c.json({ lesson }, 201)
  })
  app.patch('/api/local/lessons/:id', async (c) => {
    const body = await readJson<{ status: 'accepted' | 'proposed' | 'rejected' }>(c.req)
    return c.json({ lesson: updateLesson(c.req.param('id'), body.status) })
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

  app.get('/api/local/events', c => c.json({ events: listSessionEvents() }))
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
      description: 'Vertical Soul workspace API for Soul workers, workspaces, sessions, turns, artifacts, reviews, memory candidates, and settings.',
    },
  })
  app.get('/docs', apiReference({ spec: { url: '/openapi.json' } }))
  app.get('/', async c => serveWorkerWeb(c, options.webStaticDir))
  app.get('/workers/:path{.+}', async c => serveWorkerWeb(c, options.webStaticDir))
  app.get('/workspaces/:path{.+}', async c => serveWorkerWeb(c, options.webStaticDir))
  app.get('/favicon.svg', async c => serveWorkerWebAsset(c, options.webStaticDir, 'favicon.svg'))
  app.get('/logo.svg', async c => serveWorkerWebAsset(c, options.webStaticDir, 'logo.svg'))
  app.get('/assets/:path{.+}', async c => serveWorkerWebAsset(c, options.webStaticDir, `assets/${c.req.param('path')}`))
  app.get('/fonts/:path{.+}', async c => serveWorkerWebAsset(c, options.webStaticDir, `fonts/${c.req.param('path')}`))
  app.get('/engine-icons/:path{.+}', async c => serveWorkerWebAsset(c, options.webStaticDir, `engine-icons/${c.req.param('path')}`))

  return { app, port: workerEnv.PORT, state }
}

export async function createWorkerApp(): Promise<{ app: OpenAPIHono, port: number }> {
  const { app, port } = await bootstrapWorkerApp()
  return { app, port }
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
    throw new Error(`Missing required field: ${field}`)
  return value.trim()
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
    throw new Error(`Worker not found: ${workerId}`)
  const runtime = state.host.createRuntimeForWorker(worker)
  state.runtimes.set(workerId, runtime)
  return runtime
}

function requireWorker(workerId: string): WorkerRow {
  const worker = getWorker(workerId)
  if (!worker)
    throw new Error(`Worker not found: ${workerId}`)
  return worker
}

function requireWorkspace(workspaceId: string): WorkspaceRow {
  const workspace = getWorkspace(workspaceId)
  if (!workspace)
    throw new Error(`Workspace not found: ${workspaceId}`)
  return workspace
}

function requireWorkerWorkspace(workerId: string, workspaceId: string): WorkspaceRow {
  requireWorker(workerId)
  const workspace = requireWorkspace(workspaceId)
  if (workspace.workerId !== workerId)
    throw new Error(`Workspace ${workspaceId} does not belong to worker ${workerId}`)
  return workspace
}

function requireSession(sessionId: string): SessionRow {
  const session = getSession(sessionId)
  if (!session)
    throw new Error(`Session not found: ${sessionId}`)
  return session
}

function requireWorkerSession(workerId: string, sessionId: string): SessionRow {
  requireWorker(workerId)
  const session = requireSession(sessionId)
  if (session.workerId !== workerId)
    throw new Error(`Session ${sessionId} does not belong to worker ${workerId}`)
  return session
}

function requireTemplateForWorker(state: LocalDaemonState, workerId: string, templateId: unknown) {
  return state.host.requireCapabilityTemplateForWorker(workerId, templateId)
}

function enrichTemplateMetadata(state: LocalDaemonState, workerId: string, templateId: string, metadata: Record<string, unknown>): Record<string, unknown> {
  return state.host.enrichTemplateMetadata(workerId, templateId, metadata)
}

function brokerContext(c: Context, state: LocalDaemonState, scope?: BrokerRequestScope) {
  const settings = loadLocalSettings()
  return {
    appId: requireString(c.req.param('appId'), 'appId'),
    connectorProviders: settings.connectors,
    enabledConnectorIds: settings.connectors.filter(connector => connector.enabled).map(connector => connector.id),
    now: state.now,
    operatorId: requestIdentity(c)?.operatorId ?? scope?.operatorId ?? c.req.query('operatorId'),
    sessionId: scope?.sessionId ?? c.req.query('sessionId'),
    workerId: scope?.workerId ?? c.req.query('workerId'),
    workspaceId: scope?.workspaceId ?? c.req.query('workspaceId'),
  }
}

function brokerResponse(c: Context, key: string, result: unknown): Response {
  if (isBrokerDenied(result)) {
    const status = result.decision.code === 'app_not_found'
      ? 404
      : result.decision.code === 'app_disabled'
        ? 409
        : 403
    return c.json({
      decision: result.decision,
      error: {
        code: result.decision.code.toUpperCase(),
        message: result.decision.reason,
      },
    }, status)
  }
  return c.json({ [key]: result })
}

function searchIndexInputFromRecord(value: unknown) {
  const record = isRecord(value) ? value : {}
  return {
    artifactId: optionalNonEmptyString(record.artifactId),
    kind: optionalNonEmptyString(record.kind) ?? 'item',
    reference: searchIndexReferenceFromRecord(record.reference),
    reviewId: optionalNonEmptyString(record.reviewId),
    sessionId: optionalNonEmptyString(record.sessionId),
    summary: optionalNonEmptyString(record.summary),
    title: optionalNonEmptyString(record.title) ?? 'Untitled',
    workspaceId: optionalNonEmptyString(record.workspaceId),
  }
}

function searchIndexReferenceFromRecord(value: unknown) {
  if (!isRecord(value))
    return undefined
  const id = optionalNonEmptyString(value.id)
  const type = optionalNonEmptyString(value.type)
  if (!id || !type)
    return undefined
  const url = optionalNonEmptyString(value.url)
  return {
    id,
    type,
    ...(url ? { url } : {}),
  }
}

function resolveShellAction(app: HostedSoulApp, actionId: string): ShellActionDescriptor | null {
  const shell = app.manifest.ui.shell
  const actions: ShellActionDescriptor[] = [
    ...(shell?.primaryAction ? [shell.primaryAction] : []),
    ...(shell?.actions ?? []),
    ...(shell?.settings ? [shell.settings] : []),
  ]
  return actions.find(action => action.id === actionId) ?? null
}

function decideDescriptorRequiredPermissions(
  c: Context,
  state: LocalDaemonState,
  requiredPermissions: readonly string[] | undefined,
  descriptor: string,
  scope?: BrokerRequestScope,
): { allowed: boolean, code: string, reason: string } | null {
  if (!requiredPermissions?.length)
    return null

  const broker = createSoulAppBroker(brokerContext(c, state, scope))
  for (const permissionRef of requiredPermissions) {
    const parsed = parseRequiredPermission(permissionRef)
    if (!parsed) {
      return {
        allowed: false,
        code: 'permission_denied',
        reason: `Invalid required permission for ${descriptor}: ${permissionRef}. Expected kind:action:target.`,
      }
    }
    const decision = broker.permissions.decide(parsed.kind, parsed.action, parsed.target)
    if (!decision.allowed)
      return decision
  }

  return null
}

function brokerScopeFromRecord(value: unknown): BrokerRequestScope | undefined {
  if (!isRecord(value))
    return undefined
  const scope: BrokerRequestScope = {}
  const operatorId = optionalNonEmptyString(value.operatorId)
  const sessionId = optionalNonEmptyString(value.sessionId)
  const workerId = optionalNonEmptyString(value.workerId)
  const workspaceId = optionalNonEmptyString(value.workspaceId)
  if (operatorId)
    scope.operatorId = operatorId
  if (sessionId)
    scope.sessionId = sessionId
  if (workerId)
    scope.workerId = workerId
  if (workspaceId)
    scope.workspaceId = workspaceId
  return Object.keys(scope).length > 0 ? scope : undefined
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseRequiredPermission(value: string): Pick<SoulAppPermission, 'action' | 'kind' | 'target'> | null {
  const first = value.indexOf(':')
  const second = first >= 0 ? value.indexOf(':', first + 1) : -1
  if (first <= 0 || second <= first + 1 || second >= value.length - 1)
    return null

  const kind = value.slice(0, first)
  const action = value.slice(first + 1, second)
  const target = value.slice(second + 1)
  if (!isSoulAppPermissionKind(kind) || !isSoulAppPermissionAction(action))
    return null

  return { action, kind, target }
}

function isSoulAppPermissionKind(value: string): value is SoulAppPermission['kind'] {
  return ['api', 'artifact', 'connector', 'memory', 'review', 'search', 'storage', 'ui'].includes(value)
}

function isSoulAppPermissionAction(value: string): value is SoulAppPermission['action'] {
  return ['create', 'mount', 'propose', 'read', 'serve', 'write'].includes(value)
}

async function mountedActionResponse(
  c: Context,
  state: LocalDaemonState,
  app: HostedSoulApp,
  action: ShellActionDescriptor,
  input: Record<string, unknown>,
  scope?: BrokerRequestScope,
): Promise<Response> {
  const service = await mountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service

  const headers = mountedProxyHeaders(c.req.raw.headers)
  applyMountedProxyContextHeaders(headers, c, state, app, service, undefined, scope)
  headers.set('content-type', 'application/json')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MOUNTED_PROXY_TIMEOUT_MS)
  try {
    const res = await fetch(new URL('/protocol/actions', service.baseUrl), {
      body: JSON.stringify({
        actionId: action.id,
        input,
        protocolAction: action.protocolAction,
      }),
      headers,
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!res.ok)
      return c.json({ error: { code: 'SOUL_APP_PROTOCOL_ERROR', message: await res.text() } }, 502)
    return c.json({
      action: {
        id: action.id,
        protocolAction: action.protocolAction,
      },
      result: await res.json(),
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

async function mountedSearchResponse(
  c: Context,
  state: LocalDaemonState,
  app: HostedSoulApp,
  search: NonNullable<NonNullable<HostedSoulApp['manifest']['ui']['shell']>['search']>,
): Promise<Response> {
  const service = await mountedSoulAppServiceOrResponse(c, state, app)
  if (service instanceof Response)
    return service

  const sourceUrl = new URL(c.req.url)
  const targetUrl = new URL('/protocol/search', service.baseUrl)
  targetUrl.searchParams.set('providerId', search.protocolProvider)
  targetUrl.searchParams.set('query', sourceUrl.searchParams.get('query') ?? sourceUrl.searchParams.get('q') ?? '')
  targetUrl.searchParams.set('limit', sourceUrl.searchParams.get('limit') ?? '8')
  const headers = mountedProxyHeaders(c.req.raw.headers)
  applyMountedProxyContextHeaders(headers, c, state, app, service)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MOUNTED_PROXY_TIMEOUT_MS)
  try {
    const res = await fetch(targetUrl, {
      headers,
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!res.ok)
      return c.json({ error: { code: 'SOUL_APP_PROTOCOL_ERROR', message: await res.text() } }, 502)
    return c.json(await res.json())
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

async function mountedSurfaceResponse(c: Context, state: LocalDaemonState, app: HostedSoulApp, surfaceId: string): Promise<Response> {
  const contribution = findMountedSurfaceContribution(app, surfaceId)
  if (!contribution)
    return c.json({ error: { code: 'SOUL_APP_SURFACE_NOT_FOUND', message: `Mounted surface is not declared: ${surfaceId}` } }, 404)

  if (contribution.surface.renderer === 'trusted-module') {
    return c.json({
      error: {
        code: 'SOUL_APP_SURFACE_RENDERER_DISABLED',
        message: 'trusted-module surfaces require a future signed first-party module loader.',
      },
    }, 422)
  }

  const mountDecision = decideMountedSurface(c, state, app, contribution)
  if (!mountDecision.allowed)
    return permissionDecisionResponse(c, mountDecision)

  if (contribution.surface.renderer === 'sandboxed-frame') {
    const sourceUrl = new URL(c.req.url)
    return c.json({
      frame: {
        sandbox: 'allow-scripts allow-forms',
        title: contribution.label,
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
  scope?: BrokerRequestScope,
): void {
  const sourceUrl = new URL(c.req.url)
  const origin = `${sourceUrl.protocol}//${sourceUrl.host}`
  const identity = requestIdentity(c)
  const operatorId = identity?.operatorId ?? scope?.operatorId ?? c.req.query('operatorId') ?? null
  const payload = Buffer.from(JSON.stringify({
    appId: app.appId,
    artifactId: c.req.query('artifactId') ?? null,
    brokerGrants: app.manifest.permissions,
    brokerUrl: `${origin}/api/local/apps/${app.appId}/broker`,
    expiresAt: mountContextExpiry(state),
    identity: identity ? publicHostIdentity(identity) : null,
    operatorId,
    permissions: app.manifest.permissions,
    reviewId: c.req.query('reviewId') ?? null,
    routePrefix: app.mountedContribution.apiRoutePrefix,
    sessionId: scope?.sessionId ?? c.req.query('sessionId') ?? null,
    surface: contribution ? publicMountedSurfaceContribution(contribution) : null,
    workerId: scope?.workerId ?? c.req.query('workerId') ?? null,
    workspaceId: scope?.workspaceId ?? c.req.query('workspaceId') ?? null,
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

function decideMountedSurface(c: Context, state: LocalDaemonState, app: HostedSoulApp, contribution: MountedSurfaceContribution) {
  const target = contribution.surface.requiredPermissions
    ?.find(permission => permission.startsWith('ui:mount:'))
    ?.slice('ui:mount:'.length)
    ?? app.manifest.permissions.find(permission => permission.kind === 'ui' && permission.action === 'mount')?.target
    ?? contribution.id
  return createSoulAppBroker(brokerContext(c, state)).permissions.decide('ui', 'mount', target)
}

function permissionDecisionResponse(c: Context, decision: { allowed: boolean, code: string, reason: string }): Response {
  const status = decision.code === 'app_not_found'
    ? 404
    : decision.code === 'app_disabled'
      ? 409
      : 403
  return c.json({
    decision,
    error: {
      code: decision.code.toUpperCase(),
      message: decision.reason,
    },
  }, status)
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
    ...app.manifest.ui.reviewPanels.filter(slot => slot.surface).map(slot => ({
      id: slot.id,
      kind: 'review-panel' as const,
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
    env: { ...process.env, AIWORKER_MOUNT_TOKEN: mountToken, PORT: '0' },
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

function isBrokerDenied(value: unknown): value is { decision: { allowed: false, code: string, reason: string } } {
  if (!isRecord(value) || !isRecord(value.decision))
    return false
  return value.decision.allowed === false
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

function loadLocalSettings(): LocalSettingsConfig {
  const row = listSettings().find(setting => setting.key === LOCAL_SETTINGS_KEY)
  const parsed = row ? localSettingsConfigSchema.safeParse(row.valueJson) : null
  if (parsed?.success)
    return parsed.data
  return saveLocalSettings(defaultLocalSettings())
}

function saveLocalSettings(settings: LocalSettingsConfig): LocalSettingsConfig {
  const parsed = localSettingsConfigSchema.parse(settings)
  setSetting(LOCAL_SETTINGS_KEY, parsed)
  return parsed
}

function defaultLocalSettings(): LocalSettingsConfig {
  const engines = scanLocalEngines()
  const firstInstalled = engines.find(engine => engine.installed)
  return {
    appearance: 'system',
    byok: {
      apiKeyRef: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      provider: 'openai-compatible',
    },
    connectors: [
      { enabled: false, id: 'ats', name: 'ATS / HRIS', status: 'not_configured' },
      { enabled: false, id: 'docs', name: 'Docs workspace', status: 'not_configured' },
      { enabled: false, id: 'issue-tracker', name: 'Issue tracker', status: 'not_configured' },
      { enabled: false, id: 'ci', name: 'CI / release evidence', status: 'not_configured' },
      { enabled: false, id: 'cloud', name: 'Cloud account', status: 'not_configured' },
      { enabled: false, id: 'crm', name: 'CRM', status: 'not_configured' },
    ],
    engineId: firstInstalled?.id ?? 'codex',
    engines,
    executionMode: firstInstalled ? 'local-cli' : 'byok',
    externalMcpServers: [
      { command: '', enabled: false, id: 'team-context', name: 'Team context MCP' },
      { command: '', enabled: false, id: 'evidence-search', name: 'Evidence search MCP' },
    ],
    language: 'en',
    localMcpServer: {
      enabled: true,
      url: 'http://127.0.0.1:4319/mcp',
    },
    updatedAt: new Date().toISOString(),
  }
}

function scanLocalEngines(): LocalSettingsConfig['engines'] {
  return ENGINE_COMMANDS.map((engine) => {
    const found = commandOutput('bash', ['-lc', `command -v ${engine.command}`]).trim()
    if (!found) {
      return {
        command: engine.command,
        id: engine.id,
        installed: false,
        name: engine.name,
        path: null,
        version: null,
      }
    }
    const version = commandOutput(found, ['--version']).split('\n')[0]?.trim() || 'installed'
    return {
      command: engine.command,
      id: engine.id,
      installed: true,
      name: engine.name,
      path: found,
      version,
    }
  })
}

function commandOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500 })
  if (result.status !== 0)
    return ''
  return result.stdout.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function serveWorkerWeb(c: Context, webStaticDir?: string): Promise<Response> {
  const indexPath = safeStaticPath(resolveWorkerWebStaticDir(webStaticDir), 'index.html')
  try {
    return new Response(await readFile(indexPath), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  catch {
    return c.text('Worker Web build not found. Run `bun run --filter \'@zonease/aiworker-web\' build` first.', 404)
  }
}

async function serveWorkerWebAsset(c: Context, webStaticDir: string | undefined, relativePath: string): Promise<Response> {
  const root = resolveWorkerWebStaticDir(webStaticDir)
  const filePath = safeStaticPath(root, relativePath)
  try {
    const info = await stat(filePath)
    if (!info.isFile())
      return c.text('Not found', 404)
    return new Response(await readFile(filePath), {
      headers: { 'content-type': contentTypeFor(filePath) },
    })
  }
  catch {
    return c.text('Not found', 404)
  }
}

function resolveWorkerWebStaticDir(explicitDir?: string): string {
  if (explicitDir)
    return path.resolve(explicitDir)

  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDir, '../../../web/dist/worker')
}

function safeStaticPath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relativePath)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`Static path escapes Worker Web root: ${relativePath}`)
  return target
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath)
  if (ext === '.css')
    return 'text/css; charset=utf-8'
  if (ext === '.js')
    return 'text/javascript; charset=utf-8'
  if (ext === '.json' || ext === '.map')
    return 'application/json; charset=utf-8'
  if (ext === '.svg')
    return 'image/svg+xml'
  if (ext === '.png')
    return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg')
    return 'image/jpeg'
  if (ext === '.webp')
    return 'image/webp'
  if (ext === '.woff2')
    return 'font/woff2'
  return 'application/octet-stream'
}

function registerLocalOpenApiPaths(app: OpenAPIHono): void {
  const responseSchema = z.object({}).passthrough().openapi('LocalResponse')
  const okJson = {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: responseSchema } },
    },
  } as const
  const createdJson = {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: responseSchema } },
    },
  } as const

  const paths: Array<{
    method: 'get' | 'post' | 'patch' | 'put'
    path: string
    summary: string
    tags: string[]
    created?: boolean
  }> = [
    { method: 'get', path: '/api/local/info', summary: 'Local daemon info', tags: ['info'] },
    { method: 'get', path: '/api/local/apps', summary: 'List Host Soul Apps', tags: ['apps'] },
    { method: 'post', path: '/api/local/apps/install', summary: 'Install Host Soul App manifest', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/apps/{appId}', summary: 'Show Host Soul App', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/security-review', summary: 'Review Soul App permissions before enablement', tags: ['apps'] },
    { method: 'post', path: '/api/local/apps/{appId}/enable', summary: 'Enable Host Soul App', tags: ['apps'], created: true },
    { method: 'post', path: '/api/local/apps/{appId}/disable', summary: 'Disable Host Soul App', tags: ['apps'], created: true },
    { method: 'post', path: '/api/local/apps/{appId}/healthcheck', summary: 'Run Host Soul App static healthcheck', tags: ['apps'], created: true },
    { method: 'post', path: '/api/local/apps/{appId}/actions/{actionId}', summary: 'Invoke a declared Soul App shell action', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/apps/{appId}/search', summary: 'Search through a declared Soul App provider', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/broker/permissions', summary: 'List Soul App broker permissions', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/broker/providers', summary: 'List Host broker providers visible to a Soul App', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/broker/search', summary: 'Query Soul App broker search index descriptors', tags: ['apps'] },
    { method: 'put', path: '/api/local/apps/{appId}/broker/search/{itemId}', summary: 'Upsert a Soul App broker search index descriptor', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/broker/storage', summary: 'List Soul App scoped storage records', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/broker/storage/{key}', summary: 'Read Soul App scoped storage record', tags: ['apps'] },
    { method: 'put', path: '/api/local/apps/{appId}/broker/storage/{key}', summary: 'Write Soul App scoped storage record', tags: ['apps'] },
    { method: 'post', path: '/api/local/apps/{appId}/broker/connectors/{connectorId}/evidence', summary: 'Read brokered connector evidence', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/apps/{appId}/broker/audit', summary: 'List Soul App broker audit events', tags: ['apps'] },
    { method: 'post', path: '/api/local/apps/{appId}/broker/engine/invocations', summary: 'Deny raw Soul App engine invocation attempts', tags: ['apps'], created: true },
    { method: 'get', path: '/api/local/apps/{appId}/surfaces/{surfaceId}', summary: 'Resolve a declared mounted Soul App UI surface', tags: ['apps'] },
    { method: 'get', path: '/api/local/apps/{appId}/{path}', summary: 'Reserved mounted Soul App API namespace', tags: ['apps'] },
    { method: 'get', path: '/api/local/workers', summary: 'List Soul workers', tags: ['workers'] },
    { method: 'post', path: '/api/local/workers', summary: 'Create Soul worker', tags: ['workers'], created: true },
    { method: 'get', path: '/api/local/workers/{workerId}', summary: 'Show Soul worker', tags: ['workers'] },
    { method: 'patch', path: '/api/local/workers/{workerId}', summary: 'Update Soul worker', tags: ['workers'] },
    { method: 'get', path: '/api/local/souls', summary: 'List vertical Souls', tags: ['souls'] },
    { method: 'get', path: '/api/local/souls/{id}', summary: 'Show vertical Soul', tags: ['souls'] },
    { method: 'get', path: '/api/local/templates', summary: 'List capability templates', tags: ['templates'] },
    { method: 'get', path: '/api/local/templates/{id}', summary: 'Show capability template', tags: ['templates'] },
    { method: 'get', path: '/api/local/workers/{workerId}/templates', summary: 'List worker capability templates', tags: ['templates'] },
    { method: 'get', path: '/api/local/workers/{workerId}/templates/{templateId}', summary: 'Show worker capability template', tags: ['templates'] },
    { method: 'get', path: '/api/local/workspaces', summary: 'List workspaces', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces', summary: 'List worker workspaces', tags: ['workspaces'] },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces', summary: 'Create worker workspace', tags: ['workspaces'], created: true },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}', summary: 'Show worker workspace', tags: ['workspaces'] },
    { method: 'patch', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}', summary: 'Update worker workspace', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}', summary: 'Show workspace', tags: ['workspaces'] },
    { method: 'patch', path: '/api/local/workspaces/{workspaceId}', summary: 'Update workspace', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/sessions', summary: 'List sessions', tags: ['sessions'] },
    { method: 'get', path: '/api/local/turns', summary: 'List turns', tags: ['turns'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions', summary: 'List worker workspace sessions', tags: ['sessions'] },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions', summary: 'Create worker workspace session', tags: ['sessions'], created: true },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions/stream', summary: 'Create worker workspace session with event stream', tags: ['sessions'], created: true },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/sessions', summary: 'List workspace sessions', tags: ['sessions'] },
    { method: 'post', path: '/api/local/workspaces/{workspaceId}/sessions', summary: 'Create workspace session', tags: ['sessions'], created: true },
    { method: 'post', path: '/api/local/workspaces/{workspaceId}/sessions/stream', summary: 'Create workspace session with event stream', tags: ['sessions'], created: true },
    { method: 'get', path: '/api/local/sessions/{sessionId}', summary: 'Show session', tags: ['sessions'] },
    { method: 'get', path: '/api/local/workers/{workerId}/sessions/{sessionId}', summary: 'Show worker session', tags: ['sessions'] },
    { method: 'get', path: '/api/local/workers/{workerId}/sessions/{sessionId}/events', summary: 'Replay worker session events', tags: ['events'] },
    { method: 'get', path: '/api/local/workers/{workerId}/sessions/{sessionId}/turns', summary: 'List worker session turns', tags: ['turns'] },
    { method: 'post', path: '/api/local/workers/{workerId}/sessions/{sessionId}/messages', summary: 'Create worker session message', tags: ['turns'], created: true },
    { method: 'post', path: '/api/local/workers/{workerId}/sessions/{sessionId}/messages/stream', summary: 'Create worker session message with event stream', tags: ['turns'], created: true },
    { method: 'get', path: '/api/local/sessions/{sessionId}/events', summary: 'Replay session events', tags: ['events'] },
    { method: 'get', path: '/api/local/sessions/{sessionId}/turns', summary: 'List session turns', tags: ['turns'] },
    { method: 'post', path: '/api/local/sessions/{sessionId}/turns', summary: 'Create session turn', tags: ['turns'], created: true },
    { method: 'get', path: '/api/local/files', summary: 'List files', tags: ['files'] },
    { method: 'get', path: '/api/local/workers/{workerId}/files', summary: 'List worker files', tags: ['files'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/files', summary: 'List worker workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/files/raw/{path}', summary: 'Read worker workspace file', tags: ['files'] },
    { method: 'put', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/files/raw/{path}', summary: 'Write worker workspace file', tags: ['files'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces/{workspaceId}/files/search', summary: 'Search worker workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/files', summary: 'List workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/files/raw/{path}', summary: 'Read workspace file', tags: ['files'] },
    { method: 'put', path: '/api/local/workspaces/{workspaceId}/files/raw/{path}', summary: 'Write workspace file', tags: ['files'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/files/search', summary: 'Search workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/artifacts', summary: 'List artifacts', tags: ['artifacts'] },
    { method: 'get', path: '/api/local/workers/{workerId}/artifacts', summary: 'List worker artifacts', tags: ['artifacts'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/artifacts', summary: 'List workspace artifacts', tags: ['artifacts'] },
    { method: 'get', path: '/api/local/artifacts/{id}', summary: 'Show artifact', tags: ['artifacts'] },
    { method: 'get', path: '/api/local/reviews', summary: 'List reviews', tags: ['reviews'] },
    { method: 'post', path: '/api/local/reviews', summary: 'Create review', tags: ['reviews'], created: true },
    { method: 'get', path: '/api/local/reviews/{id}', summary: 'Show review', tags: ['reviews'] },
    { method: 'get', path: '/api/local/lessons', summary: 'List lessons', tags: ['lessons'] },
    { method: 'post', path: '/api/local/lessons', summary: 'Create lesson', tags: ['lessons'], created: true },
    { method: 'patch', path: '/api/local/lessons/{id}', summary: 'Update lesson', tags: ['lessons'] },
    { method: 'get', path: '/api/local/settings', summary: 'Show settings', tags: ['settings'] },
    { method: 'patch', path: '/api/local/settings', summary: 'Update settings', tags: ['settings'] },
    { method: 'post', path: '/api/local/settings/engines/rescan', summary: 'Rescan engines', tags: ['settings'], created: true },
    { method: 'post', path: '/api/local/settings/engines/test', summary: 'Test engine', tags: ['settings'], created: true },
    { method: 'get', path: '/api/local/events', summary: 'List session events', tags: ['events'] },
  ]

  for (const path of paths) {
    app.openAPIRegistry.registerPath({
      method: path.method,
      path: path.path,
      summary: path.summary,
      tags: path.tags,
      responses: path.created ? createdJson : okJson,
    })
  }
}
