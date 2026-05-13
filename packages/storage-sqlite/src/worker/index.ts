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
export type SoulAppRow = typeof schema.soulApps.$inferSelect
export type SoulAppStorageRecordRow = typeof schema.soulAppStorageRecords.$inferSelect
export type SoulAppAuditEventRow = typeof schema.soulAppAuditEvents.$inferSelect
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

export interface UpsertSoulAppInput {
  id: string
  name: string
  version: string
  protocol: string
  soulId: string
  status?: SoulAppRow['status']
  sourceKind: SoulAppRow['sourceKind']
  sourceRef: string
  manifestDigest: string
  manifestJson: SoulAppRow['manifestJson']
  validationIssuesJson?: SoulAppRow['validationIssuesJson']
  healthStatus?: SoulAppRow['healthStatus']
  healthMessage?: string | null
  installedAt?: string | null
  enabledAt?: string | null
  disabledAt?: string | null
  lastHealthcheckAt?: string | null
  at?: string
}

export interface UpdateSoulAppLifecycleInput {
  id: string
  status: SoulAppRow['status']
  validationIssuesJson?: SoulAppRow['validationIssuesJson']
  healthStatus?: SoulAppRow['healthStatus']
  healthMessage?: string | null
  lastHealthcheckAt?: string | null
  at?: string
}

export interface UpsertSoulAppStorageRecordInput {
  appId: string
  namespace: string
  key: string
  valueJson: Record<string, unknown>
  workerId?: string | null
  workspaceId?: string | null
  sessionId?: string | null
  operatorId?: string | null
  at?: string
}

export interface AppendSoulAppAuditEventInput {
  appId: string
  action: string
  targetKind: string
  target: string
  decision: SoulAppAuditEventRow['decision']
  reason: string
  workerId?: string | null
  workspaceId?: string | null
  sessionId?: string | null
  operatorId?: string | null
  requestJson?: Record<string, unknown>
  at?: string
}

export interface LegacySoulMetadataMapping {
  fromSoulId: string
  toSoulId: string
  soulName?: string
  capabilityTemplateIds: Record<string, string>
}

export interface RepairLegacySoulMetadataInput {
  mappings: LegacySoulMetadataMapping[]
  at?: string
}

export interface RepairLegacySoulMetadataResult {
  skippedSessions: string[]
  sessionsUpdated: number
  workersUpdated: number
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

export function repairLegacySoulMetadata(input: RepairLegacySoulMetadataInput): RepairLegacySoulMetadataResult {
  const now = input.at ?? new Date().toISOString()
  const mappings = new Map(input.mappings.map(mapping => [mapping.fromSoulId, mapping]))
  const targetMappings = new Map(input.mappings.map(mapping => [mapping.toSoulId, mapping]))
  const skippedSessions = new Set<string>()
  let sessionsUpdated = 0
  let workersUpdated = 0

  const allWorkers = getWorkerDb().select().from(schema.workers).all()
  for (const worker of allWorkers) {
    const mapping = mappings.get(worker.soulId) ?? targetMappings.get(worker.soulId)
    if (!mapping)
      continue

    if (worker.soulId === mapping.fromSoulId) {
      getWorkerDb().update(schema.workers).set({
        metadataJson: rewriteLegacyMetadata(worker.metadataJson, mapping),
        soulId: mapping.toSoulId,
        updatedAt: now,
      }).where(eq(schema.workers.id, worker.id)).run()
      workersUpdated += 1
    }

    const workerSessions = getWorkerDb().select().from(schema.sessions).where(eq(schema.sessions.workerId, worker.id)).all()
    for (const session of workerSessions) {
      const nextTemplateId = mapping.capabilityTemplateIds[session.capabilityTemplateId]
      if (!nextTemplateId) {
        if (worker.soulId === mapping.fromSoulId)
          skippedSessions.add(session.id)
        continue
      }
      getWorkerDb().update(schema.sessions).set({
        capabilityTemplateId: nextTemplateId,
        metadataJson: rewriteLegacyMetadata(session.metadataJson, mapping, nextTemplateId),
        updatedAt: now,
      }).where(eq(schema.sessions.id, session.id)).run()
      sessionsUpdated += 1
    }
  }

  return {
    skippedSessions: [...skippedSessions].sort(),
    sessionsUpdated,
    workersUpdated,
  }
}

function rewriteLegacyMetadata(
  metadata: Record<string, unknown> | null,
  mapping: LegacySoulMetadataMapping,
  capabilityTemplateId?: string,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  if (next.soulId === mapping.fromSoulId)
    next.soulId = mapping.toSoulId
  next.soulAppId = mapping.toSoulId
  if (mapping.soulName)
    next.soulName = mapping.soulName
  if (capabilityTemplateId)
    next.capabilityTemplateId = capabilityTemplateId
  return next
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

export function upsertSoulApp(input: UpsertSoulAppInput): SoulAppRow {
  const now = input.at ?? new Date().toISOString()
  const existing = getSoulApp(input.id)
  const status = input.status ?? existing?.status ?? 'installed'
  const enabledAt = input.enabledAt ?? (status === 'enabled' ? existing?.enabledAt ?? now : existing?.enabledAt ?? null)
  const disabledAt = input.disabledAt ?? (status === 'disabled' ? now : existing?.disabledAt ?? null)
  if (!existing) {
    getWorkerDb().insert(schema.soulApps).values({
      id: input.id,
      name: input.name,
      version: input.version,
      protocol: input.protocol,
      soulId: input.soulId,
      status,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      manifestDigest: input.manifestDigest,
      manifestJson: input.manifestJson,
      validationIssuesJson: input.validationIssuesJson ?? [],
      healthStatus: input.healthStatus ?? 'unknown',
      healthMessage: input.healthMessage ?? null,
      installedAt: input.installedAt ?? now,
      enabledAt,
      disabledAt,
      lastHealthcheckAt: input.lastHealthcheckAt ?? null,
      createdAt: now,
      updatedAt: now,
    }).run()
  }
  else {
    getWorkerDb().update(schema.soulApps).set({
      name: input.name,
      version: input.version,
      protocol: input.protocol,
      soulId: input.soulId,
      status,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      manifestDigest: input.manifestDigest,
      manifestJson: input.manifestJson,
      validationIssuesJson: input.validationIssuesJson ?? existing.validationIssuesJson,
      healthStatus: input.healthStatus ?? existing.healthStatus,
      healthMessage: Object.hasOwn(input, 'healthMessage') ? input.healthMessage ?? null : existing.healthMessage,
      installedAt: input.installedAt ?? existing.installedAt,
      enabledAt,
      disabledAt,
      lastHealthcheckAt: input.lastHealthcheckAt ?? existing.lastHealthcheckAt,
      updatedAt: now,
    }).where(eq(schema.soulApps.id, input.id)).run()
  }
  return getSoulApp(input.id)!
}

export function getSoulApp(id: string): SoulAppRow | null {
  return getWorkerDb().select().from(schema.soulApps).where(eq(schema.soulApps.id, id)).get() ?? null
}

export function listSoulApps(limit = 200): SoulAppRow[] {
  return getWorkerDb().select().from(schema.soulApps).orderBy(schema.soulApps.id).limit(limit).all()
}

export function updateSoulAppLifecycle(input: UpdateSoulAppLifecycleInput): SoulAppRow {
  const existing = getSoulApp(input.id)
  if (!existing)
    throw new Error(`Soul App not found: ${input.id}`)
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().update(schema.soulApps).set({
    disabledAt: input.status === 'disabled' ? now : existing.disabledAt,
    enabledAt: input.status === 'enabled' ? now : existing.enabledAt,
    healthMessage: Object.hasOwn(input, 'healthMessage') ? input.healthMessage ?? null : existing.healthMessage,
    healthStatus: input.healthStatus ?? existing.healthStatus,
    lastHealthcheckAt: input.lastHealthcheckAt ?? existing.lastHealthcheckAt,
    status: input.status,
    updatedAt: now,
    validationIssuesJson: input.validationIssuesJson ?? existing.validationIssuesJson,
  }).where(eq(schema.soulApps.id, input.id)).run()
  return getSoulApp(input.id)!
}

export function upsertSoulAppStorageRecord(input: UpsertSoulAppStorageRecordInput): SoulAppStorageRecordRow {
  const now = input.at ?? new Date().toISOString()
  const existing = getSoulAppStorageRecord(input.appId, input.key)
  if (!existing) {
    getWorkerDb().insert(schema.soulAppStorageRecords).values({
      appId: input.appId,
      createdAt: now,
      id: soulAppStorageRecordId(input.appId, input.key),
      key: input.key,
      namespace: input.namespace,
      operatorId: input.operatorId ?? null,
      sessionId: input.sessionId ?? null,
      updatedAt: now,
      valueJson: input.valueJson,
      workerId: input.workerId ?? null,
      workspaceId: input.workspaceId ?? null,
    }).run()
  }
  else {
    getWorkerDb().update(schema.soulAppStorageRecords).set({
      namespace: input.namespace,
      operatorId: input.operatorId ?? existing.operatorId,
      sessionId: input.sessionId ?? existing.sessionId,
      updatedAt: now,
      valueJson: input.valueJson,
      workerId: input.workerId ?? existing.workerId,
      workspaceId: input.workspaceId ?? existing.workspaceId,
    }).where(eq(schema.soulAppStorageRecords.id, existing.id)).run()
  }
  return getSoulAppStorageRecord(input.appId, input.key)!
}

export function getSoulAppStorageRecord(appId: string, key: string): SoulAppStorageRecordRow | null {
  return getWorkerDb()
    .select()
    .from(schema.soulAppStorageRecords)
    .where(and(eq(schema.soulAppStorageRecords.appId, appId), eq(schema.soulAppStorageRecords.key, key)))
    .get() ?? null
}

export function listSoulAppStorageRecords(appId: string, limit = 200): SoulAppStorageRecordRow[] {
  return getWorkerDb()
    .select()
    .from(schema.soulAppStorageRecords)
    .where(eq(schema.soulAppStorageRecords.appId, appId))
    .orderBy(desc(schema.soulAppStorageRecords.updatedAt))
    .limit(limit)
    .all()
}

export function appendSoulAppAuditEvent(input: AppendSoulAppAuditEventInput): SoulAppAuditEventRow {
  getWorkerDb().insert(schema.soulAppAuditEvents).values({
    action: input.action,
    appId: input.appId,
    createdAt: input.at ?? new Date().toISOString(),
    decision: input.decision,
    operatorId: input.operatorId ?? null,
    reason: input.reason,
    requestJson: input.requestJson ?? {},
    sessionId: input.sessionId ?? null,
    target: input.target,
    targetKind: input.targetKind,
    workerId: input.workerId ?? null,
    workspaceId: input.workspaceId ?? null,
  }).run()
  return getWorkerDb()
    .select()
    .from(schema.soulAppAuditEvents)
    .where(eq(schema.soulAppAuditEvents.appId, input.appId))
    .orderBy(desc(schema.soulAppAuditEvents.id))
    .limit(1)
    .get()!
}

export function listSoulAppAuditEvents(appId?: string, limit = 500): SoulAppAuditEventRow[] {
  const query = getWorkerDb().select().from(schema.soulAppAuditEvents)
  if (appId) {
    return query
      .where(eq(schema.soulAppAuditEvents.appId, appId))
      .orderBy(schema.soulAppAuditEvents.id)
      .limit(limit)
      .all()
  }
  return query.orderBy(schema.soulAppAuditEvents.id).limit(limit).all()
}

function soulAppStorageRecordId(appId: string, key: string): string {
  return `${appId}:${key}`
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
