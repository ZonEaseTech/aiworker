import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Database } from 'bun:sqlite'
import { and, desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from './schema'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

function resolveMigrationsFolder(rel: string): string {
  const dev = path.resolve(moduleDir, '../../drizzle', rel)
  if (existsSync(dev))
    return dev
  const bundled = path.resolve(moduleDir, 'drizzle', rel)
  if (existsSync(bundled))
    return bundled
  return dev
}

export const defaultWorkerMigrationsFolder: string = resolveMigrationsFolder('worker')

let db: ReturnType<typeof createDb> | null = null

function createDb(dbPath: string) {
  const sqlite = new Database(dbPath, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function initWorkerDb(dbPath: string) {
  db = createDb(dbPath)
  return db
}

export function getWorkerDb() {
  if (!db)
    throw new Error('Worker database not initialized. Call initWorkerDb() first.')
  return db
}

export function closeWorkerDb() {
  db = null
}

export function runWorkerMigrations(migrationsFolder: string = defaultWorkerMigrationsFolder) {
  migrate(getWorkerDb(), { migrationsFolder })
  repairWorkerIndexes()
}

function repairWorkerIndexes() {
  const rows = getWorkerDb().all<{ name: string, unique: number }>(sql.raw('PRAGMA index_list("workers")'))
  const soulIndex = rows.find(row => row.name === 'workers_soul_idx')
  if (soulIndex?.unique === 1)
    getWorkerDb().run(sql.raw('DROP INDEX IF EXISTS workers_soul_idx'))
  if (!soulIndex || soulIndex.unique === 1)
    getWorkerDb().run(sql.raw('CREATE INDEX IF NOT EXISTS workers_soul_idx ON workers (soul_id)'))
}

export type WorkerDatabase = ReturnType<typeof createDb>
export type WorkerRow = typeof schema.workers.$inferSelect
export type WorkspaceRow = typeof schema.workspaces.$inferSelect
export type SessionRow = typeof schema.sessions.$inferSelect
export type TurnRow = typeof schema.turns.$inferSelect
export type EngineInvocationRow = typeof schema.engineInvocations.$inferSelect
export type SessionEventRow = typeof schema.sessionEvents.$inferSelect
export type FileRow = typeof schema.files.$inferSelect
export type ArtifactRow = typeof schema.artifacts.$inferSelect
export type ReviewRow = typeof schema.reviews.$inferSelect
export type LessonRow = typeof schema.lessons.$inferSelect
export type SettingRow = typeof schema.settings.$inferSelect

export interface UpsertWorkerInput {
  id: string
  soulId: string
  name: string
  status?: WorkerRow['status']
  defaultEngineId?: string | null
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface CreateWorkspaceInput {
  id: string
  workerId: string
  name: string
  rootPath: string
  type?: string
  status?: WorkspaceRow['status']
  sourcePointersJson?: Record<string, unknown>[]
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface UpdateWorkspaceInput {
  id: string
  name?: string
  status?: WorkspaceRow['status']
  sourcePointersJson?: Record<string, unknown>[]
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface CreateSessionInput {
  id: string
  workerId: string
  workspaceId: string
  capabilityTemplateId: string
  title: string
  context?: string
  status?: SessionRow['status']
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  endedAt?: string | null
  at?: string
}

export interface UpdateSessionInput {
  id: string
  context?: string
  status?: SessionRow['status']
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  endedAt?: string | null
  title?: string
  at?: string
}

export interface CreateTurnInput {
  id: string
  sessionId: string
  seq: number
  input: string
  response?: string | null
  status?: TurnRow['status']
  error?: string | null
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface UpdateTurnInput {
  id: string
  response?: string | null
  status?: TurnRow['status']
  error?: string | null
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface CreateEngineInvocationInput {
  id: string
  sessionId: string
  turnId: string
  seq: number
  engineId: string
  engineCommand?: string | null
  status?: EngineInvocationRow['status']
  prompt: string
  summary?: string | null
  error?: string | null
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  at?: string
}

export interface UpdateEngineInvocationInput {
  id: string
  status?: EngineInvocationRow['status']
  summary?: string | null
  error?: string | null
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  at?: string
}

export interface AppendSessionEventInput {
  sessionId: string
  turnId?: string | null
  invocationId?: string | null
  seq: number
  type: SessionEventRow['type']
  payloadJson?: Record<string, unknown>
  at?: string
}

export interface UpsertFileInput {
  id: string
  workspaceId: string
  path: string
  kind?: FileRow['kind']
  size?: number | null
  mtime?: number | null
  hash?: string | null
  source?: FileRow['source']
  at?: string
}

export interface RegisterArtifactInput {
  id: string
  workspaceId: string
  sessionId?: string | null
  turnId?: string | null
  invocationId?: string | null
  path: string
  kind?: string
  title: string
  status?: ArtifactRow['status']
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface CreateReviewInput {
  id: string
  workspaceId: string
  sessionId?: string | null
  turnId?: string | null
  artifactId?: string | null
  verdict?: ReviewRow['verdict']
  findingsJson?: Record<string, unknown>[]
  risksJson?: Record<string, unknown>[]
  at?: string
}

export interface CreateLessonInput {
  id: string
  workspaceId: string
  sourceReviewId?: string | null
  statement: string
  evidenceJson?: Record<string, unknown>[]
  status?: LessonRow['status']
  at?: string
}

export function upsertWorker(input: UpsertWorkerInput): WorkerRow {
  const now = input.at ?? new Date().toISOString()
  const existing = getWorker(input.id)
  if (!existing) {
    getWorkerDb().insert(schema.workers).values({
      id: input.id,
      soulId: input.soulId,
      name: input.name,
      status: input.status ?? 'active',
      defaultEngineId: input.defaultEngineId ?? null,
      metadataJson: input.metadataJson ?? {},
      createdAt: now,
      updatedAt: now,
    }).run()
  }
  else {
    getWorkerDb().update(schema.workers).set({
      defaultEngineId: input.defaultEngineId ?? existing.defaultEngineId,
      metadataJson: input.metadataJson ?? existing.metadataJson,
      name: input.name,
      soulId: input.soulId,
      status: input.status ?? existing.status,
      updatedAt: now,
    }).where(eq(schema.workers.id, input.id)).run()
  }
  return getWorker(input.id)!
}

export function getWorker(id: string): WorkerRow | null {
  return getWorkerDb().select().from(schema.workers).where(eq(schema.workers.id, id)).get() ?? null
}

export function listWorkers(limit = 100): WorkerRow[] {
  return getWorkerDb().select().from(schema.workers).orderBy(schema.workers.id).limit(limit).all()
}

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.workspaces).values({
    id: input.id,
    workerId: input.workerId,
    name: input.name,
    rootPath: input.rootPath,
    type: input.type ?? 'workspace',
    status: input.status ?? 'active',
    sourcePointersJson: input.sourcePointersJson ?? [],
    metadataJson: input.metadataJson ?? {},
    createdAt: now,
    updatedAt: now,
  }).run()
  return getWorkspace(input.id)!
}

export function getWorkspace(id: string): WorkspaceRow | null {
  return getWorkerDb().select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).get() ?? null
}

export function updateWorkspace(input: UpdateWorkspaceInput): WorkspaceRow {
  const existing = getWorkspace(input.id)
  if (!existing)
    throw new Error(`Workspace not found: ${input.id}`)
  getWorkerDb().update(schema.workspaces).set({
    metadataJson: input.metadataJson ?? existing.metadataJson,
    name: input.name ?? existing.name,
    sourcePointersJson: input.sourcePointersJson ?? existing.sourcePointersJson,
    status: input.status ?? existing.status,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.workspaces.id, input.id)).run()
  return getWorkspace(input.id)!
}

export function listWorkspaces(workerId?: string, limit = 200): WorkspaceRow[] {
  const query = getWorkerDb().select().from(schema.workspaces)
  if (workerId) {
    return query
      .where(eq(schema.workspaces.workerId, workerId))
      .orderBy(desc(schema.workspaces.updatedAt))
      .limit(limit)
      .all()
  }
  return query.orderBy(desc(schema.workspaces.updatedAt)).limit(limit).all()
}

export function createSession(input: CreateSessionInput): SessionRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.sessions).values({
    id: input.id,
    workerId: input.workerId,
    workspaceId: input.workspaceId,
    capabilityTemplateId: input.capabilityTemplateId,
    title: input.title,
    context: input.context ?? '',
    status: input.status ?? 'active',
    metadataJson: input.metadataJson ?? {},
    startedAt: input.startedAt ?? now,
    endedAt: input.endedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }).run()
  return getSession(input.id)!
}

export function getSession(id: string): SessionRow | null {
  return getWorkerDb().select().from(schema.sessions).where(eq(schema.sessions.id, id)).get() ?? null
}

export function updateSession(input: UpdateSessionInput): SessionRow {
  const existing = getSession(input.id)
  if (!existing)
    throw new Error(`Session not found: ${input.id}`)
  const has = (key: keyof UpdateSessionInput) => Object.hasOwn(input, key)
  getWorkerDb().update(schema.sessions).set({
    context: input.context ?? existing.context,
    endedAt: has('endedAt') ? input.endedAt ?? null : existing.endedAt,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    startedAt: has('startedAt') ? input.startedAt ?? null : existing.startedAt,
    status: input.status ?? existing.status,
    title: input.title ?? existing.title,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.sessions.id, input.id)).run()
  return getSession(input.id)!
}

export function listSessions(workspaceId?: string, limit = 200): SessionRow[] {
  const query = getWorkerDb().select().from(schema.sessions)
  if (workspaceId) {
    return query
      .where(eq(schema.sessions.workspaceId, workspaceId))
      .orderBy(desc(schema.sessions.updatedAt))
      .limit(limit)
      .all()
  }
  return query.orderBy(desc(schema.sessions.updatedAt)).limit(limit).all()
}

export function createTurn(input: CreateTurnInput): TurnRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.turns).values({
    id: input.id,
    sessionId: input.sessionId,
    seq: input.seq,
    input: input.input,
    response: input.response ?? null,
    status: input.status ?? 'queued',
    error: input.error ?? null,
    metadataJson: input.metadataJson ?? {},
    createdAt: now,
    updatedAt: now,
  }).run()
  return getTurn(input.id)!
}

export function getTurn(id: string): TurnRow | null {
  return getWorkerDb().select().from(schema.turns).where(eq(schema.turns.id, id)).get() ?? null
}

export function updateTurn(input: UpdateTurnInput): TurnRow {
  const existing = getTurn(input.id)
  if (!existing)
    throw new Error(`Turn not found: ${input.id}`)
  const has = (key: keyof UpdateTurnInput) => Object.hasOwn(input, key)
  getWorkerDb().update(schema.turns).set({
    error: has('error') ? input.error ?? null : existing.error,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    response: has('response') ? input.response ?? null : existing.response,
    status: input.status ?? existing.status,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.turns.id, input.id)).run()
  return getTurn(input.id)!
}

export function listTurns(sessionId?: string, limit = 200): TurnRow[] {
  const query = getWorkerDb().select().from(schema.turns)
  if (sessionId) {
    return query
      .where(eq(schema.turns.sessionId, sessionId))
      .orderBy(schema.turns.seq)
      .limit(limit)
      .all()
  }
  return query.orderBy(desc(schema.turns.updatedAt)).limit(limit).all()
}

export function nextTurnSeq(sessionId: string): number {
  const latest = getWorkerDb()
    .select({ seq: schema.turns.seq })
    .from(schema.turns)
    .where(eq(schema.turns.sessionId, sessionId))
    .orderBy(desc(schema.turns.seq))
    .limit(1)
    .get()
  return (latest?.seq ?? 0) + 1
}

export function createEngineInvocation(input: CreateEngineInvocationInput): EngineInvocationRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.engineInvocations).values({
    id: input.id,
    sessionId: input.sessionId,
    turnId: input.turnId,
    seq: input.seq,
    engineId: input.engineId,
    engineCommand: input.engineCommand ?? null,
    status: input.status ?? 'queued',
    prompt: input.prompt,
    summary: input.summary ?? null,
    error: input.error ?? null,
    metadataJson: input.metadataJson ?? {},
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }).run()
  return getEngineInvocation(input.id)!
}

export function getEngineInvocation(id: string): EngineInvocationRow | null {
  return getWorkerDb().select().from(schema.engineInvocations).where(eq(schema.engineInvocations.id, id)).get() ?? null
}

export function updateEngineInvocation(input: UpdateEngineInvocationInput): EngineInvocationRow {
  const existing = getEngineInvocation(input.id)
  if (!existing)
    throw new Error(`Engine invocation not found: ${input.id}`)
  const has = (key: keyof UpdateEngineInvocationInput) => Object.hasOwn(input, key)
  getWorkerDb().update(schema.engineInvocations).set({
    error: has('error') ? input.error ?? null : existing.error,
    finishedAt: has('finishedAt') ? input.finishedAt ?? null : existing.finishedAt,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    startedAt: has('startedAt') ? input.startedAt ?? null : existing.startedAt,
    status: input.status ?? existing.status,
    summary: has('summary') ? input.summary ?? null : existing.summary,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.engineInvocations.id, input.id)).run()
  return getEngineInvocation(input.id)!
}

export function listEngineInvocations(sessionId?: string, limit = 200): EngineInvocationRow[] {
  const query = getWorkerDb().select().from(schema.engineInvocations)
  if (sessionId) {
    return query
      .where(eq(schema.engineInvocations.sessionId, sessionId))
      .orderBy(desc(schema.engineInvocations.updatedAt))
      .limit(limit)
      .all()
  }
  return query.orderBy(desc(schema.engineInvocations.updatedAt)).limit(limit).all()
}

export function nextEngineInvocationSeq(sessionId: string): number {
  const latest = getWorkerDb()
    .select({ seq: schema.engineInvocations.seq })
    .from(schema.engineInvocations)
    .where(eq(schema.engineInvocations.sessionId, sessionId))
    .orderBy(desc(schema.engineInvocations.seq))
    .limit(1)
    .get()
  return (latest?.seq ?? 0) + 1
}

export function appendSessionEvent(input: AppendSessionEventInput): SessionEventRow {
  getWorkerDb().insert(schema.sessionEvents).values({
    sessionId: input.sessionId,
    turnId: input.turnId ?? null,
    invocationId: input.invocationId ?? null,
    seq: input.seq,
    type: input.type,
    payloadJson: input.payloadJson ?? {},
    createdAt: input.at ?? new Date().toISOString(),
  }).run()
  return getWorkerDb()
    .select()
    .from(schema.sessionEvents)
    .where(and(eq(schema.sessionEvents.sessionId, input.sessionId), eq(schema.sessionEvents.seq, input.seq)))
    .get()!
}

export function nextSessionEventSeq(sessionId: string): number {
  const latest = getWorkerDb()
    .select({ seq: schema.sessionEvents.seq })
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.sessionId, sessionId))
    .orderBy(desc(schema.sessionEvents.seq))
    .limit(1)
    .get()
  return (latest?.seq ?? 0) + 1
}

export function listSessionEvents(sessionId?: string, limit = 500): SessionEventRow[] {
  const query = getWorkerDb().select().from(schema.sessionEvents)
  if (sessionId)
    return query.where(eq(schema.sessionEvents.sessionId, sessionId)).orderBy(schema.sessionEvents.seq).limit(limit).all()
  return query.orderBy(desc(schema.sessionEvents.createdAt)).limit(limit).all()
}

export function upsertFile(input: UpsertFileInput): FileRow {
  const now = input.at ?? new Date().toISOString()
  const existing = getWorkerDb()
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.workspaceId, input.workspaceId), eq(schema.files.path, input.path)))
    .get()
  if (!existing) {
    getWorkerDb().insert(schema.files).values({
      id: input.id,
      workspaceId: input.workspaceId,
      path: input.path,
      kind: input.kind ?? 'file',
      size: input.size ?? null,
      mtime: input.mtime ?? null,
      hash: input.hash ?? null,
      source: input.source ?? 'user',
      createdAt: now,
      updatedAt: now,
    }).run()
  }
  else {
    getWorkerDb().update(schema.files).set({
      kind: input.kind ?? existing.kind,
      size: input.size ?? existing.size,
      mtime: input.mtime ?? existing.mtime,
      hash: input.hash ?? existing.hash,
      source: input.source ?? existing.source,
      updatedAt: now,
    }).where(eq(schema.files.id, existing.id)).run()
  }
  return getWorkerDb().select().from(schema.files).where(eq(schema.files.id, existing?.id ?? input.id)).get()!
}

export function listFiles(workspaceId?: string, limit = 500): FileRow[] {
  const query = getWorkerDb().select().from(schema.files)
  if (workspaceId)
    return query.where(eq(schema.files.workspaceId, workspaceId)).orderBy(desc(schema.files.updatedAt)).limit(limit).all()
  return query.orderBy(desc(schema.files.updatedAt)).limit(limit).all()
}

export function registerArtifact(input: RegisterArtifactInput): ArtifactRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.artifacts).values({
    id: input.id,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId ?? null,
    turnId: input.turnId ?? null,
    invocationId: input.invocationId ?? null,
    path: input.path,
    kind: input.kind ?? 'file',
    title: input.title,
    status: input.status ?? 'available',
    metadataJson: input.metadataJson ?? {},
    createdAt: now,
    updatedAt: now,
  }).run()
  return getArtifact(input.id)!
}

export function getArtifact(id: string): ArtifactRow | null {
  return getWorkerDb().select().from(schema.artifacts).where(eq(schema.artifacts.id, id)).get() ?? null
}

export function listArtifacts(workspaceId?: string, limit = 200): ArtifactRow[] {
  const query = getWorkerDb().select().from(schema.artifacts)
  if (workspaceId)
    return query.where(eq(schema.artifacts.workspaceId, workspaceId)).orderBy(desc(schema.artifacts.updatedAt)).limit(limit).all()
  return query.orderBy(desc(schema.artifacts.updatedAt)).limit(limit).all()
}

export function createReview(input: CreateReviewInput): ReviewRow {
  getWorkerDb().insert(schema.reviews).values({
    id: input.id,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId ?? null,
    turnId: input.turnId ?? null,
    artifactId: input.artifactId ?? null,
    verdict: input.verdict ?? 'needs_review',
    findingsJson: input.findingsJson ?? [],
    risksJson: input.risksJson ?? [],
    createdAt: input.at ?? new Date().toISOString(),
  }).run()
  return getReview(input.id)!
}

export function getReview(id: string): ReviewRow | null {
  return getWorkerDb().select().from(schema.reviews).where(eq(schema.reviews.id, id)).get() ?? null
}

export function listReviews(workspaceId?: string, limit = 200): ReviewRow[] {
  const query = getWorkerDb().select().from(schema.reviews)
  if (workspaceId)
    return query.where(eq(schema.reviews.workspaceId, workspaceId)).orderBy(desc(schema.reviews.createdAt)).limit(limit).all()
  return query.orderBy(desc(schema.reviews.createdAt)).limit(limit).all()
}

export function createLesson(input: CreateLessonInput): LessonRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.lessons).values({
    id: input.id,
    workspaceId: input.workspaceId,
    sourceReviewId: input.sourceReviewId ?? null,
    statement: input.statement,
    evidenceJson: input.evidenceJson ?? [],
    status: input.status ?? 'proposed',
    createdAt: now,
    updatedAt: now,
  }).run()
  return getLesson(input.id)!
}

export function getLesson(id: string): LessonRow | null {
  return getWorkerDb().select().from(schema.lessons).where(eq(schema.lessons.id, id)).get() ?? null
}

export function updateLesson(id: string, status: LessonRow['status'], at = new Date().toISOString()): LessonRow {
  const existing = getLesson(id)
  if (!existing)
    throw new Error(`Lesson not found: ${id}`)
  getWorkerDb().update(schema.lessons).set({ status, updatedAt: at }).where(eq(schema.lessons.id, id)).run()
  return getLesson(id)!
}

export function listLessons(workspaceId?: string, limit = 200): LessonRow[] {
  const query = getWorkerDb().select().from(schema.lessons)
  if (workspaceId)
    return query.where(eq(schema.lessons.workspaceId, workspaceId)).orderBy(desc(schema.lessons.updatedAt)).limit(limit).all()
  return query.orderBy(desc(schema.lessons.updatedAt)).limit(limit).all()
}

export function getSetting(key: string): SettingRow | null {
  return getWorkerDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get() ?? null
}

export function listSettings(): SettingRow[] {
  return getWorkerDb().select().from(schema.settings).orderBy(schema.settings.key).all()
}

export function setSetting(key: string, valueJson: Record<string, unknown>, at = new Date().toISOString()): SettingRow {
  const existing = getSetting(key)
  if (!existing) {
    getWorkerDb().insert(schema.settings).values({ key, valueJson, updatedAt: at }).run()
  }
  else {
    getWorkerDb().update(schema.settings).set({ valueJson, updatedAt: at }).where(eq(schema.settings.key, key)).run()
  }
  return getSetting(key)!
}

export { schema as workerSchema }
export * from './schema'
