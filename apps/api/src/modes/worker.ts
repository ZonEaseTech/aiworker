import type { LocalExecutor, LocalWorkerRuntime } from '@zonease/aiworker-core'
import type { LocalSettingsConfig } from '@zonease/aiworker-shared'
import type { ReviewRow, SessionRow, WorkspaceRow } from '@zonease/aiworker-storage-sqlite/worker'

import type { Context } from 'hono'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { createLocalWorkerRuntime, workerEnv } from '@zonease/aiworker-core'
import {
  BUILTIN_CAPABILITY_TEMPLATES,
  BUILTIN_VERTICAL_SOULS,
  findCapabilityTemplate,
  findVerticalSoul,
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
} from '@zonease/aiworker-storage-sqlite/worker'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'

const DEFAULT_RUNTIME_VERSION = 'dev'
const LOCAL_SETTINGS_KEY = 'local-settings'
const ENGINE_COMMANDS = [
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
  { id: 'hermes', name: 'Hermes', command: 'hermes' },
] as const

export interface BootstrapWorkerAppOptions {
  dbPath?: string
  migrationsFolder?: string
  workersRoot?: string
  token?: string
  runtimeVersion?: string
  executor?: LocalExecutor
  now?: () => string
}

export interface LocalDaemonState {
  startedAt: string
  token?: string
  runtimeVersion: string
  runtimes: Map<string, LocalWorkerRuntime>
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
  for (const soul of BUILTIN_VERTICAL_SOULS.filter(soul => soul.status === 'available')) {
    const workerId = `${soul.id}-worker`
    const runtime = createLocalWorkerRuntime({
      worker: {
        id: workerId,
        soulId: soul.id,
        name: soul.name,
        defaultEngineId: 'codex',
        metadata: {
          defaultTemplates: [...soul.defaultTemplates],
          description: soul.description,
          domain: soul.domain,
        },
      },
      workspacesRoot: path.join(workersRoot, workerId, 'workspaces'),
      executor: options.executor,
      now: options.now,
    })
    await runtime.init()
    runtimes.set(workerId, runtime)
  }

  const state: LocalDaemonState = {
    runtimes,
    startedAt: new Date().toISOString(),
    token: options.token ?? workerEnv.AIWORKER_LOCAL_TOKEN,
    runtimeVersion,
  }

  const app = new OpenAPIHono()
  app.use(requestLogger)
  app.onError(errorHandler)
  app.use('/api/local/*', async (c, next) => {
    if (!state.token)
      return next()
    const header = c.req.header('authorization') ?? ''
    const expected = `Bearer ${state.token}`
    if (!timingSafeEqualText(header, expected))
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid local bearer token.' } }, 401)
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

  app.get('/api/local/workers', c => c.json({ workers: listWorkers() }))
  app.get('/api/local/workers/:workerId', (c) => {
    const worker = getWorker(c.req.param('workerId'))
    if (!worker)
      return notFound(c, 'worker')
    return c.json({ worker, snapshot: requireRuntime(state, worker.id).snapshot() })
  })

  app.get('/api/local/souls', c => c.json({ souls: BUILTIN_VERTICAL_SOULS }))
  app.get('/api/local/souls/:id', (c) => {
    const soul = findVerticalSoul(c.req.param('id'))
    if (!soul)
      return notFound(c, 'soul')
    return c.json({ soul })
  })
  app.get('/api/local/templates', (c) => {
    const soulId = c.req.query('soulId')
    const templates = soulId
      ? BUILTIN_CAPABILITY_TEMPLATES.filter(template => template.soulId === soulId)
      : BUILTIN_CAPABILITY_TEMPLATES
    return c.json({ templates })
  })
  app.get('/api/local/templates/:id', (c) => {
    const template = findCapabilityTemplate(c.req.param('id'))
    if (!template)
      return notFound(c, 'template')
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
  app.get('/api/local/workspaces/:workspaceId/sessions', (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    return c.json({ sessions: listSessions(workspace.id) })
  })
  app.post('/api/local/workspaces/:workspaceId/sessions', async (c) => {
    const workspace = requireWorkspace(c.req.param('workspaceId'))
    const runtime = requireRuntime(state, workspace.workerId)
    const body = await readJson<{
      capabilityTemplateId?: string
      context?: string
      input?: string
      metadata?: Record<string, unknown>
      title?: string
    }>(c.req)
    const template = requireTemplateForWorker(workspace.workerId, body.capabilityTemplateId)
    const metadata = enrichTemplateMetadata(workspace.workerId, template.id, body.metadata ?? {})
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
    const result = await runtime.startTurn({
      sessionId: session.id,
      input: body.input,
      engineId: settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider,
      engineCommand: settings.executionMode === 'local-cli' ? engine?.command ?? settings.engineId : null,
      metadata: {
        ...metadata,
        ...executionMetadata(settings, engine),
      },
    })
    return c.json(result, 201)
  })
  app.get('/api/local/sessions/:sessionId', (c) => {
    const session = getSession(c.req.param('sessionId'))
    if (!session)
      return notFound(c, 'session')
    return c.json({ session, turns: listTurns(session.id), events: listSessionEvents(session.id) })
  })
  app.get('/api/local/sessions/:sessionId/turns', (c) => {
    const session = requireSession(c.req.param('sessionId'))
    return c.json({ turns: listTurns(session.id) })
  })
  app.post('/api/local/sessions/:sessionId/turns', async (c) => {
    const session = requireSession(c.req.param('sessionId'))
    const runtime = requireRuntime(state, session.workerId)
    const body = await readJson<{ input?: string, metadata?: Record<string, unknown> }>(c.req)
    const settings = loadLocalSettings()
    const engine = selectedEngine(settings)
    const result = await runtime.startTurn({
      sessionId: session.id,
      input: requireString(body.input, 'input'),
      engineId: settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider,
      engineCommand: settings.executionMode === 'local-cli' ? engine?.command ?? settings.engineId : null,
      metadata: {
        ...enrichTemplateMetadata(session.workerId, session.capabilityTemplateId, session.metadataJson ?? {}),
        ...(body.metadata ?? {}),
        ...executionMetadata(settings, engine),
      },
    })
    return c.json(result, 201)
  })

  app.get('/api/local/files', c => c.json({ files: listFiles() }))
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

  return { app, port: workerEnv.PORT, state }
}

export async function createWorkerApp(): Promise<{ app: OpenAPIHono, port: number }> {
  const { app, port } = await bootstrapWorkerApp()
  return { app, port }
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

function timingSafeEqualText(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function requireRuntime(state: LocalDaemonState, workerId: string): LocalWorkerRuntime {
  const runtime = state.runtimes.get(workerId)
  if (!runtime)
    throw new Error(`Worker not found: ${workerId}`)
  return runtime
}

function requireWorkspace(workspaceId: string): WorkspaceRow {
  const workspace = getWorkspace(workspaceId)
  if (!workspace)
    throw new Error(`Workspace not found: ${workspaceId}`)
  return workspace
}

function requireSession(sessionId: string): SessionRow {
  const session = getSession(sessionId)
  if (!session)
    throw new Error(`Session not found: ${sessionId}`)
  return session
}

function requireTemplateForWorker(workerId: string, templateId: unknown) {
  const worker = getWorker(workerId)
  if (!worker)
    throw new Error(`Worker not found: ${workerId}`)
  const id = requireString(templateId, 'capabilityTemplateId')
  const template = findCapabilityTemplate(id)
  if (!template || template.soulId !== worker.soulId)
    throw new Error(`Template ${id} does not belong to worker ${workerId}.`)
  return template
}

function enrichTemplateMetadata(workerId: string, templateId: string, metadata: Record<string, unknown>): Record<string, unknown> {
  const worker = getWorker(workerId)
  const soul = worker ? findVerticalSoul(worker.soulId) : null
  const template = findCapabilityTemplate(templateId)
  if (!worker || !soul || !template)
    return metadata
  return {
    ...metadata,
    capabilityTemplateId: template.id,
    inputHints: template.inputHints,
    outputKind: template.outputKind,
    reviewRubric: template.reviewRubric,
    skillName: template.name,
    soulName: soul.name,
    workerId: worker.id,
  }
}

function selectedEngine(settings: LocalSettingsConfig) {
  return settings.engines.find(engine => engine.id === settings.engineId)
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
    const version = commandOutput(engine.command, ['--version']).split('\n')[0]?.trim() || 'installed'
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
    { method: 'get', path: '/api/local/workers', summary: 'List Soul workers', tags: ['workers'] },
    { method: 'get', path: '/api/local/workers/{workerId}', summary: 'Show Soul worker', tags: ['workers'] },
    { method: 'get', path: '/api/local/souls', summary: 'List vertical Souls', tags: ['souls'] },
    { method: 'get', path: '/api/local/souls/{id}', summary: 'Show vertical Soul', tags: ['souls'] },
    { method: 'get', path: '/api/local/templates', summary: 'List capability templates', tags: ['templates'] },
    { method: 'get', path: '/api/local/templates/{id}', summary: 'Show capability template', tags: ['templates'] },
    { method: 'get', path: '/api/local/workspaces', summary: 'List workspaces', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/workers/{workerId}/workspaces', summary: 'List worker workspaces', tags: ['workspaces'] },
    { method: 'post', path: '/api/local/workers/{workerId}/workspaces', summary: 'Create worker workspace', tags: ['workspaces'], created: true },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}', summary: 'Show workspace', tags: ['workspaces'] },
    { method: 'patch', path: '/api/local/workspaces/{workspaceId}', summary: 'Update workspace', tags: ['workspaces'] },
    { method: 'get', path: '/api/local/sessions', summary: 'List sessions', tags: ['sessions'] },
    { method: 'get', path: '/api/local/turns', summary: 'List turns', tags: ['turns'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/sessions', summary: 'List workspace sessions', tags: ['sessions'] },
    { method: 'post', path: '/api/local/workspaces/{workspaceId}/sessions', summary: 'Create workspace session', tags: ['sessions'], created: true },
    { method: 'get', path: '/api/local/sessions/{sessionId}', summary: 'Show session', tags: ['sessions'] },
    { method: 'get', path: '/api/local/sessions/{sessionId}/turns', summary: 'List session turns', tags: ['turns'] },
    { method: 'post', path: '/api/local/sessions/{sessionId}/turns', summary: 'Create session turn', tags: ['turns'], created: true },
    { method: 'get', path: '/api/local/files', summary: 'List files', tags: ['files'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/files', summary: 'List workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/files/raw/{path}', summary: 'Read workspace file', tags: ['files'] },
    { method: 'put', path: '/api/local/workspaces/{workspaceId}/files/raw/{path}', summary: 'Write workspace file', tags: ['files'] },
    { method: 'get', path: '/api/local/workspaces/{workspaceId}/files/search', summary: 'Search workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/artifacts', summary: 'List artifacts', tags: ['artifacts'] },
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
