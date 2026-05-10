import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Database } from 'bun:sqlite'
import { and, desc, eq } from 'drizzle-orm'
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
}

export type WorkerDatabase = ReturnType<typeof createDb>
export type WorkspaceRow = typeof schema.workspaces.$inferSelect
export type CaseRow = typeof schema.cases.$inferSelect
export type RunRow = typeof schema.runs.$inferSelect
export type RunEventRow = typeof schema.runEvents.$inferSelect
export type FileRow = typeof schema.files.$inferSelect
export type ArtifactRow = typeof schema.artifacts.$inferSelect
export type ReviewRow = typeof schema.reviews.$inferSelect
export type LessonRow = typeof schema.lessons.$inferSelect
export type SettingRow = typeof schema.settings.$inferSelect

export interface UpsertWorkspaceInput {
  id: string
  name: string
  rootPath: string
  at?: string
}

export interface CreateCaseInput {
  id: string
  workspaceId: string
  title: string
  body: string
  selectedSoulId: string
  selectedSkillId: string
  status?: CaseRow['status']
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface UpdateCaseInput {
  id: string
  status?: CaseRow['status']
  title?: string
  body?: string
  selectedSoulId?: string
  selectedSkillId?: string
  metadataJson?: Record<string, unknown>
  at?: string
}

export interface CreateRunInput {
  id: string
  workspaceId: string
  caseId?: string | null
  executor: string
  prompt: string
  status?: RunRow['status']
  summary?: string | null
  error?: string | null
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  at?: string
}

export interface UpdateRunInput {
  id: string
  status?: RunRow['status']
  summary?: string | null
  error?: string | null
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  at?: string
}

export interface AppendRunEventInput {
  runId: string
  seq: number
  type: RunEventRow['type']
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
  runId?: string | null
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
  runId?: string | null
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

export function listWorkspaces(limit = 200): WorkspaceRow[] {
  return getWorkerDb().select().from(schema.workspaces).orderBy(desc(schema.workspaces.updatedAt)).limit(limit).all()
}

export function getWorkspace(id: string): WorkspaceRow | null {
  return getWorkerDb().select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).get() ?? null
}

export function upsertWorkspace(input: UpsertWorkspaceInput): WorkspaceRow {
  const now = input.at ?? new Date().toISOString()
  const existing = getWorkspace(input.id)
  if (!existing) {
    getWorkerDb().insert(schema.workspaces).values({
      id: input.id,
      name: input.name,
      rootPath: input.rootPath,
      createdAt: now,
      updatedAt: now,
    }).run()
  }
  else {
    getWorkerDb().update(schema.workspaces).set({
      name: input.name,
      rootPath: input.rootPath,
      updatedAt: now,
    }).where(eq(schema.workspaces.id, input.id)).run()
  }
  return getWorkspace(input.id)!
}

export function createCase(input: CreateCaseInput): CaseRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.cases).values({
    id: input.id,
    workspaceId: input.workspaceId,
    title: input.title,
    body: input.body,
    selectedSoulId: input.selectedSoulId,
    selectedSkillId: input.selectedSkillId,
    status: input.status ?? 'draft',
    metadataJson: input.metadataJson ?? {},
    createdAt: now,
    updatedAt: now,
  }).run()
  return getWorkerDb().select().from(schema.cases).where(eq(schema.cases.id, input.id)).get()!
}

export function getCase(id: string): CaseRow | null {
  return getWorkerDb().select().from(schema.cases).where(eq(schema.cases.id, id)).get() ?? null
}

export function updateCase(input: UpdateCaseInput): CaseRow {
  const existing = getCase(input.id)
  if (!existing)
    throw new Error(`Case not found: ${input.id}`)
  getWorkerDb().update(schema.cases).set({
    body: input.body ?? existing.body,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    selectedSkillId: input.selectedSkillId ?? existing.selectedSkillId,
    selectedSoulId: input.selectedSoulId ?? existing.selectedSoulId,
    status: input.status ?? existing.status,
    title: input.title ?? existing.title,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.cases.id, input.id)).run()
  return getCase(input.id)!
}

export function listCases(workspaceId: string, limit = 200): CaseRow[] {
  return getWorkerDb()
    .select()
    .from(schema.cases)
    .where(eq(schema.cases.workspaceId, workspaceId))
    .orderBy(desc(schema.cases.updatedAt))
    .limit(limit)
    .all()
}

export function createRun(input: CreateRunInput): RunRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.runs).values({
    id: input.id,
    workspaceId: input.workspaceId,
    caseId: input.caseId ?? null,
    status: input.status ?? 'queued',
    executor: input.executor,
    prompt: input.prompt,
    summary: input.summary ?? null,
    error: input.error ?? null,
    metadataJson: input.metadataJson ?? {},
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }).run()
  return getWorkerDb().select().from(schema.runs).where(eq(schema.runs.id, input.id)).get()!
}

export function getRun(id: string): RunRow | null {
  return getWorkerDb().select().from(schema.runs).where(eq(schema.runs.id, id)).get() ?? null
}

export function updateRun(input: UpdateRunInput): RunRow {
  const existing = getRun(input.id)
  if (!existing)
    throw new Error(`Run not found: ${input.id}`)
  const has = (key: keyof UpdateRunInput) => Object.hasOwn(input, key)
  getWorkerDb().update(schema.runs).set({
    error: has('error') ? input.error ?? null : existing.error,
    finishedAt: has('finishedAt') ? input.finishedAt ?? null : existing.finishedAt,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    startedAt: has('startedAt') ? input.startedAt ?? null : existing.startedAt,
    status: input.status ?? existing.status,
    summary: has('summary') ? input.summary ?? null : existing.summary,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.runs.id, input.id)).run()
  return getRun(input.id)!
}

export function listRuns(workspaceId: string, limit = 200): RunRow[] {
  return getWorkerDb()
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.workspaceId, workspaceId))
    .orderBy(desc(schema.runs.updatedAt))
    .limit(limit)
    .all()
}

export function appendRunEvent(input: AppendRunEventInput): RunEventRow {
  getWorkerDb().insert(schema.runEvents).values({
    runId: input.runId,
    seq: input.seq,
    type: input.type,
    payloadJson: input.payloadJson ?? {},
    createdAt: input.at ?? new Date().toISOString(),
  }).run()
  return getWorkerDb()
    .select()
    .from(schema.runEvents)
    .where(and(eq(schema.runEvents.runId, input.runId), eq(schema.runEvents.seq, input.seq)))
    .get()!
}

export function nextRunEventSeq(runId: string): number {
  const latest = getWorkerDb()
    .select({ seq: schema.runEvents.seq })
    .from(schema.runEvents)
    .where(eq(schema.runEvents.runId, runId))
    .orderBy(desc(schema.runEvents.seq))
    .limit(1)
    .get()
  return (latest?.seq ?? 0) + 1
}

export function listRunEvents(runId: string): RunEventRow[] {
  return getWorkerDb().select().from(schema.runEvents).where(eq(schema.runEvents.runId, runId)).orderBy(schema.runEvents.seq).all()
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

export function listFiles(workspaceId: string, limit = 500): FileRow[] {
  return getWorkerDb()
    .select()
    .from(schema.files)
    .where(eq(schema.files.workspaceId, workspaceId))
    .orderBy(desc(schema.files.updatedAt))
    .limit(limit)
    .all()
}

export function registerArtifact(input: RegisterArtifactInput): ArtifactRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.artifacts).values({
    id: input.id,
    workspaceId: input.workspaceId,
    runId: input.runId ?? null,
    path: input.path,
    kind: input.kind ?? 'file',
    title: input.title,
    status: input.status ?? 'available',
    metadataJson: input.metadataJson ?? {},
    createdAt: now,
    updatedAt: now,
  }).run()
  return getWorkerDb().select().from(schema.artifacts).where(eq(schema.artifacts.id, input.id)).get()!
}

export function getArtifact(id: string): ArtifactRow | null {
  return getWorkerDb().select().from(schema.artifacts).where(eq(schema.artifacts.id, id)).get() ?? null
}

export function listArtifacts(workspaceId: string, limit = 200): ArtifactRow[] {
  return getWorkerDb()
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.workspaceId, workspaceId))
    .orderBy(desc(schema.artifacts.updatedAt))
    .limit(limit)
    .all()
}

export function createReview(input: CreateReviewInput): ReviewRow {
  getWorkerDb().insert(schema.reviews).values({
    id: input.id,
    workspaceId: input.workspaceId,
    runId: input.runId ?? null,
    artifactId: input.artifactId ?? null,
    verdict: input.verdict ?? 'needs_review',
    findingsJson: input.findingsJson ?? [],
    risksJson: input.risksJson ?? [],
    createdAt: input.at ?? new Date().toISOString(),
  }).run()
  return getWorkerDb().select().from(schema.reviews).where(eq(schema.reviews.id, input.id)).get()!
}

export function getReview(id: string): ReviewRow | null {
  return getWorkerDb().select().from(schema.reviews).where(eq(schema.reviews.id, id)).get() ?? null
}

export function listReviews(workspaceId: string, limit = 200): ReviewRow[] {
  return getWorkerDb()
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.workspaceId, workspaceId))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(limit)
    .all()
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
  return getWorkerDb().select().from(schema.lessons).where(eq(schema.lessons.id, input.id)).get()!
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

export function listLessons(workspaceId: string, limit = 200): LessonRow[] {
  return getWorkerDb()
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.workspaceId, workspaceId))
    .orderBy(desc(schema.lessons.updatedAt))
    .limit(limit)
    .all()
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
