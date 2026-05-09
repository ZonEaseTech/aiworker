import type { LocalExecutor, LocalWorkerRuntime } from '@zonease/aiworker-core'
import type { BriefRow, LessonRow, ReviewRow, RunEventRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { Context } from 'hono'

import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { OpenAPIHono, z } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { createLocalWorkerRuntime, workerEnv } from '@zonease/aiworker-core'
import {
  appendRunEvent,
  closeWorkerDb,
  createLesson,
  createReview,
  getArtifact,
  getBrief,
  getLesson,
  getReview,
  getRun,
  initWorkerDb,
  listArtifacts,
  listBriefs,
  listFiles,
  listLessons,
  listReviews,
  listRunEvents,
  listRuns,
  listSettings,
  nextRunEventSeq,
  runWorkerMigrations,
  setSetting,
  updateBrief,
  updateLesson,
  updateRun,
  upsertFile,
  upsertWorkspace,
} from '@zonease/aiworker-storage-sqlite/worker'

import { errorHandler } from '../shared/middleware/error-handler'
import { requestLogger } from '../shared/middleware/logger'

const DEFAULT_RUNTIME_VERSION = 'dev'

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
    id: 'local',
    name: 'Local Workspace',
    rootPath: workerEnv.WORKER_WORKSPACE_ROOT,
  }
  const runtime = createLocalWorkerRuntime({
    workerId: options.workerId ?? 'local-worker',
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
    mode: 'local',
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

  app.get('/api/local/briefs', c => c.json({ briefs: listBriefs(workspace.id) }))
  app.post('/api/local/briefs', async (c) => {
    const body = await readJson<{ title?: string, body?: string }>(c.req)
    const brief = state.runtime.createBrief({
      title: requireString(body.title, 'title'),
      body: requireString(body.body, 'body'),
    })
    return c.json({ brief }, 201)
  })
  app.get('/api/local/briefs/:id', (c) => {
    const brief = getBrief(c.req.param('id'))
    if (!brief)
      return notFound(c, 'brief')
    return c.json({ brief })
  })
  app.patch('/api/local/briefs/:id', async (c) => {
    const body = await readJson<Partial<Pick<BriefRow, 'body' | 'status' | 'title'>>>(c.req)
    return c.json({ brief: updateBrief({ id: c.req.param('id'), ...body }) })
  })

  app.get('/api/local/runs', c => c.json({ runs: listRuns(workspace.id) }))
  app.post('/api/local/runs', async (c) => {
    const body = await readJson<{ briefId?: string, prompt?: string, executor?: string, metadata?: Record<string, unknown> }>(c.req)
    const result = await state.runtime.startRun({
      briefId: body.briefId,
      prompt: body.prompt,
      executor: body.executor,
      metadata: body.metadata,
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

  app.get('/api/local/settings', c => c.json({ settings: listSettings() }))
  app.patch('/api/local/settings', async (c) => {
    const body = await readJson<Record<string, Record<string, unknown>>>(c.req)
    const settings = Object.entries(body).map(([key, value]) => setSetting(key, value))
    return c.json({ settings })
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
      description: 'Local workspace API for briefs, runs, files, artifacts, reviews, and lessons.',
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
    { method: 'get', path: '/api/local/info', summary: 'Local daemon info', tags: ['info'] },
    { method: 'get', path: '/api/local/workspace', summary: 'Show local workspace', tags: ['workspace'] },
    { method: 'patch', path: '/api/local/workspace', summary: 'Update local workspace metadata', tags: ['workspace'] },
    { method: 'get', path: '/api/local/briefs', summary: 'List briefs', tags: ['briefs'] },
    { method: 'post', path: '/api/local/briefs', summary: 'Create brief', tags: ['briefs'], created: true },
    { method: 'get', path: '/api/local/briefs/{id}', summary: 'Show brief', tags: ['briefs'] },
    { method: 'patch', path: '/api/local/briefs/{id}', summary: 'Update brief', tags: ['briefs'] },
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
    { method: 'get', path: '/api/local/settings', summary: 'List settings', tags: ['settings'] },
    { method: 'patch', path: '/api/local/settings', summary: 'Update settings', tags: ['settings'] },
    { method: 'get', path: '/api/local/events', summary: 'List local run events', tags: ['events'] },
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
