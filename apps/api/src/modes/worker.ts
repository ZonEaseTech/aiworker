import type { LocalExecutor, LocalWorkerRuntime } from '@zonease/aiworker-core'
import type { LocalEngineStatus, LocalSettingsConfig } from '@zonease/aiworker-shared'
import type { LessonRow, ProjectRow, ReviewRow, RunEventRow } from '@zonease/aiworker-storage-sqlite/worker'

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
  appendRunEvent,
  closeWorkerDb,
  createLesson,
  createReview,
  getArtifact,
  getProject,
  getReview,
  getRun,
  initWorkerDb,
  listArtifacts,
  listFiles,
  listLessons,
  listProjects,
  listReviews,
  listRunEvents,
  listRuns,
  listSettings,
  nextRunEventSeq,
  runWorkerMigrations,
  setSetting,
  updateLesson,
  updateProject,
  updateRun,
  upsertFile,
  upsertWorkspace,
} from '@zonease/aiworker-storage-sqlite/worker'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'

const DEFAULT_RUNTIME_VERSION = 'dev'
const LOCAL_SETTINGS_KEY = 'local-settings'
const ENGINE_COMMANDS = [
  { id: 'workspace-template', name: 'AIWorker Template Runner', command: 'internal' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
  { id: 'hermes', name: 'Hermes', command: 'hermes' },
] as const

export interface BootstrapWorkerAppOptions {
  dbPath?: string
  migrationsFolder?: string
  workspace?: {
    id: string
    name: string
    rootPath: string
  }
  workerId?: string
  token?: string
  runtimeVersion?: string
  executor?: LocalExecutor
  now?: () => string
}

export interface LocalDaemonState {
  workerId: string
  runtime: LocalWorkerRuntime
  startedAt: string
  token?: string
  runtimeVersion: string
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
  const workspace = options.workspace ?? {
    id: 'soul-workspace',
    name: 'Soul Workspace',
    rootPath: workerEnv.WORKER_WORKSPACE_ROOT,
  }
  const runtime = createLocalWorkerRuntime({
    workerId: options.workerId ?? 'soul-worker',
    workspace,
    executor: options.executor,
    now: options.now,
  })
  await runtime.init()

  const state: LocalDaemonState = {
    workerId: runtime.workerId,
    runtime,
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
    workerId: state.workerId,
    runtimeVersion: state.runtimeVersion,
    startedAt: state.startedAt,
    checkedAt: new Date().toISOString(),
  }))

  app.get('/api/local/info', c => c.json({
    workerId: state.workerId,
    runtimeVersion: state.runtimeVersion,
    startedAt: state.startedAt,
    workspace: state.runtime.snapshot().workspace,
  }))

  app.get('/api/local/workspace', c => c.json({ workspace: state.runtime.snapshot().workspace }))
  app.patch('/api/local/workspace', async (c) => {
    const body = await readJson<{ name?: string }>(c.req)
    const current = state.runtime.snapshot().workspace
    const workspace = upsertWorkspace({
      id: current.id,
      name: typeof body.name === 'string' && body.name.trim().length > 0 ? body.name : current.name,
      rootPath: current.rootPath,
    })
    return c.json({ workspace })
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

  app.get('/api/local/projects', c => c.json({ projects: listProjects(workspace.id) }))
  app.post('/api/local/projects', async (c) => {
    const body = await readJson<{
      body?: string
      metadata?: Record<string, unknown>
      selectedSkillId?: string
      selectedSoulId?: string
      title?: string
    }>(c.req)
    const selectedSoulId = requireString(body.selectedSoulId, 'selectedSoulId')
    const selectedSkillId = requireString(body.selectedSkillId, 'selectedSkillId')
    const soul = findVerticalSoul(selectedSoulId)
    const template = findCapabilityTemplate(selectedSkillId)
    if (!soul || soul.status !== 'available')
      throw new Error(`Unknown or unavailable Soul: ${selectedSoulId}`)
    if (!template || template.soulId !== soul.id)
      throw new Error(`Template ${selectedSkillId} does not belong to Soul ${selectedSoulId}.`)
    const projectRecord = state.runtime.createProject({
      title: requireString(body.title, 'title'),
      body: requireString(body.body, 'body'),
      selectedSoulId,
      selectedSkillId,
      metadata: {
        ...(body.metadata ?? {}),
        outputKind: template.outputKind,
        reviewRubric: template.reviewRubric,
        soulName: soul.name,
        skillName: template.name,
      },
    })
    return c.json({ project: projectRecord }, 201)
  })
  app.get('/api/local/projects/:id', (c) => {
    const projectRecord = getProject(c.req.param('id'))
    if (!projectRecord)
      return notFound(c, 'project')
    return c.json({ project: projectRecord })
  })
  app.patch('/api/local/projects/:id', async (c) => {
    const body = await readJson<Partial<Pick<ProjectRow, 'body' | 'metadataJson' | 'selectedSkillId' | 'selectedSoulId' | 'status' | 'title'>>>(c.req)
    return c.json({ project: updateProject({ id: c.req.param('id'), ...body }) })
  })

  app.get('/api/local/runs', c => c.json({ runs: listRuns(workspace.id) }))
  app.post('/api/local/runs', async (c) => {
    const body = await readJson<{ projectId?: string, prompt?: string, executor?: string, metadata?: Record<string, unknown> }>(c.req)
    const settings = loadLocalSettings()
    const selectedEngine = settings.engines.find(engine => engine.id === settings.engineId)
    const result = await state.runtime.startRun({
      projectId: body.projectId,
      prompt: body.prompt,
      executor: body.executor ?? (settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider),
      metadata: {
        ...(body.metadata ?? {}),
        byok: settings.byok,
        engineCommand: selectedEngine?.command ?? null,
        engineId: settings.engineId,
        engineName: selectedEngine?.name ?? null,
        executionMode: settings.executionMode,
      },
    })
    return c.json(result, 201)
  })
  app.get('/api/local/runs/:id', (c) => {
    const run = getRun(c.req.param('id'))
    if (!run)
      return notFound(c, 'run')
    return c.json({ run, events: listRunEvents(run.id) })
  })
  app.post('/api/local/runs/:id/cancel', (c) => {
    const id = c.req.param('id')
    const run = getRun(id)
    if (!run)
      return notFound(c, 'run')
    const cancelled = updateRun({ id, status: 'cancelled', finishedAt: new Date().toISOString() })
    appendEvent(id, 'status', { status: 'cancelled' })
    return c.json({ run: cancelled })
  })
  app.get('/api/local/runs/:id/events', (c) => {
    const run = getRun(c.req.param('id'))
    if (!run)
      return notFound(c, 'run')
    return c.json({ events: listRunEvents(run.id) })
  })

  app.get('/api/local/files', c => c.json({ files: listFiles(workspace.id) }))
  app.get('/api/local/files/search', (c) => {
    const query = c.req.query('q')?.toLowerCase() ?? ''
    const files = listFiles(workspace.id).filter(file => file.path.toLowerCase().includes(query))
    return c.json({ files })
  })
  app.get('/api/local/files/raw/:path{.+}', async (c) => {
    const filePath = c.req.param('path')
    return c.text(await state.runtime.files.read(filePath))
  })
  app.put('/api/local/files/raw/:path{.+}', async (c) => {
    const filePath = c.req.param('path')
    const content = await c.req.text()
    const entry = await state.runtime.files.write({ path: filePath, content })
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
  app.delete('/api/local/files/raw/:path{.+}', async (c) => {
    await state.runtime.files.delete(c.req.param('path'))
    return c.json({ ok: true })
  })

  app.get('/api/local/artifacts', c => c.json({ artifacts: listArtifacts(workspace.id) }))
  app.get('/api/local/artifacts/:id', (c) => {
    const artifact = getArtifact(c.req.param('id'))
    if (!artifact)
      return notFound(c, 'artifact')
    return c.json({ artifact })
  })

  app.get('/api/local/reviews', c => c.json({ reviews: listReviews(workspace.id) }))
  app.post('/api/local/reviews', async (c) => {
    const body = await readJson<Partial<ReviewRow> & { findingsJson?: Record<string, unknown>[], risksJson?: Record<string, unknown>[] }>(c.req)
    const review = createReview({
      id: randomUUID(),
      workspaceId: workspace.id,
      runId: body.runId ?? null,
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

  app.get('/api/local/lessons', c => c.json({ lessons: listLessons(workspace.id) }))
  app.post('/api/local/lessons', async (c) => {
    const body = await readJson<Partial<LessonRow>>(c.req)
    const lesson = createLesson({
      id: randomUUID(),
      workspaceId: workspace.id,
      sourceReviewId: body.sourceReviewId ?? null,
      statement: requireString(body.statement, 'statement'),
      evidenceJson: Array.isArray(body.evidenceJson) ? body.evidenceJson : [],
    })
    return c.json({ lesson }, 201)
  })
  app.patch('/api/local/lessons/:id', async (c) => {
    const body = await readJson<Pick<LessonRow, 'status'>>(c.req)
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
    if (engine.command === 'internal')
      return c.json({ result: { engineId, message: `${engine.name} is available as a built-in local runner.`, status: 'pass' } })
    if (!engine.installed)
      return c.json({ result: { engineId, message: `${engine.name} is not installed on PATH.`, status: 'fail' } })
    return c.json({ result: { engineId, message: `${engine.name} responded as ${engine.version ?? engine.path}.`, status: 'pass' } })
  })

  app.get('/api/local/events', (c) => {
    const events = listRuns(workspace.id).flatMap(run => listRunEvents(run.id))
    return c.json({ events })
  })

  registerLocalOpenApiPaths(app)
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'AIWorker Local Daemon API',
      version: runtimeVersion,
      description: 'Vertical Soul workspace API for Souls, templates, projects, runs, artifacts, reviews, memory candidates, and settings.',
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
  return value
}

function notFound(c: Context, resource: string) {
  return c.json({ error: { code: 'NOT_FOUND', message: `${resource} not found.` } }, 404)
}

function appendEvent(runId: string, type: RunEventRow['type'], payloadJson: Record<string, unknown>): RunEventRow {
  return appendRunEvent({
    runId,
    seq: nextRunEventSeq(runId),
    type,
    payloadJson,
    at: new Date().toISOString(),
  })
}

function timingSafeEqualText(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
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

function scanLocalEngines(): LocalEngineStatus[] {
  return ENGINE_COMMANDS.map((engine) => {
    if (engine.command === 'internal') {
      return {
        command: engine.command,
        id: engine.id,
        installed: true,
        name: engine.name,
        path: 'internal',
        version: 'built-in structured artifact renderer',
      }
    }
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
    method: 'get' | 'post' | 'patch' | 'put' | 'delete'
    path: string
    summary: string
    tags: string[]
    created?: boolean
  }> = [
    { method: 'get', path: '/api/local/info', summary: 'Workspace daemon info', tags: ['info'] },
    { method: 'get', path: '/api/local/workspace', summary: 'Show Soul workspace', tags: ['workspace'] },
    { method: 'patch', path: '/api/local/workspace', summary: 'Update Soul workspace metadata', tags: ['workspace'] },
    { method: 'get', path: '/api/local/souls', summary: 'List vertical Souls', tags: ['souls'] },
    { method: 'get', path: '/api/local/souls/{id}', summary: 'Show vertical Soul', tags: ['souls'] },
    { method: 'get', path: '/api/local/templates', summary: 'List capability templates', tags: ['templates'] },
    { method: 'get', path: '/api/local/templates/{id}', summary: 'Show capability template', tags: ['templates'] },
    { method: 'get', path: '/api/local/projects', summary: 'List projects', tags: ['projects'] },
    { method: 'post', path: '/api/local/projects', summary: 'Create project', tags: ['projects'], created: true },
    { method: 'get', path: '/api/local/projects/{id}', summary: 'Show project', tags: ['projects'] },
    { method: 'patch', path: '/api/local/projects/{id}', summary: 'Update project', tags: ['projects'] },
    { method: 'get', path: '/api/local/runs', summary: 'List runs', tags: ['runs'] },
    { method: 'post', path: '/api/local/runs', summary: 'Start run', tags: ['runs'], created: true },
    { method: 'get', path: '/api/local/runs/{id}', summary: 'Show run', tags: ['runs'] },
    { method: 'post', path: '/api/local/runs/{id}/cancel', summary: 'Cancel run', tags: ['runs'] },
    { method: 'get', path: '/api/local/runs/{id}/events', summary: 'List run events', tags: ['runs'] },
    { method: 'get', path: '/api/local/files', summary: 'List workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/files/raw/{path}', summary: 'Read workspace file', tags: ['files'] },
    { method: 'put', path: '/api/local/files/raw/{path}', summary: 'Write workspace file', tags: ['files'] },
    { method: 'delete', path: '/api/local/files/raw/{path}', summary: 'Delete workspace file', tags: ['files'] },
    { method: 'get', path: '/api/local/files/search', summary: 'Search workspace files', tags: ['files'] },
    { method: 'get', path: '/api/local/artifacts', summary: 'List artifacts', tags: ['artifacts'] },
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
    { method: 'get', path: '/api/local/events', summary: 'List run events', tags: ['events'] },
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
