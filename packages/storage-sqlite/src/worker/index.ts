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
  repairWorkerOverlayAssets()
  repairWorkerIndexes()
}

function repairWorkerOverlayAssets() {
  getWorkerDb().run(sql.raw(`
    CREATE TABLE IF NOT EXISTS worker_overlay_assets (
      worker_id text NOT NULL,
      id text NOT NULL,
      kind text NOT NULL,
      target text NOT NULL,
      enabled integer DEFAULT true NOT NULL,
      content text NOT NULL,
      metadata_json text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE cascade
    )
  `))
  getWorkerDb().run(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS worker_overlay_assets_worker_kind_target_id_idx
    ON worker_overlay_assets (worker_id, kind, target, id)
  `))
  getWorkerDb().run(sql.raw(`
    CREATE INDEX IF NOT EXISTS worker_overlay_assets_worker_kind_idx
    ON worker_overlay_assets (worker_id, kind)
  `))
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
export type WorkerOverlayAssetRow = typeof schema.workerOverlayAssets.$inferSelect
export type WorkspaceRow = typeof schema.workspaces.$inferSelect
export type SessionRow = typeof schema.sessions.$inferSelect
export type TurnRow = typeof schema.turns.$inferSelect
export type EngineInvocationRow = typeof schema.engineInvocations.$inferSelect
export type WorkerEngineInvocationRow = typeof schema.workerEngineInvocations.$inferSelect
export type SessionEventRow = typeof schema.sessionEvents.$inferSelect
export type FileRow = typeof schema.files.$inferSelect
export type SoulAppRow = typeof schema.soulApps.$inferSelect
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

export interface WorkerOverlayAssetInput {
  content: string
  enabled: boolean
  id: string
  kind: 'entry-file' | 'mcp-client' | 'skill'
  metadataJson?: Record<string, unknown>
  target: string
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

export interface CreateWorkerEngineInvocationInput {
  id: string
  workerId: string
  seq: number
  engineId: string
  engineCommand?: string | null
  status?: WorkerEngineInvocationRow['status']
  cwd: string
  inputRef?: string | null
  stdoutRef?: string | null
  stderrRef?: string | null
  exitCode?: number | null
  signal?: string | null
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  at?: string
}

export interface UpdateWorkerEngineInvocationInput {
  id: string
  status?: WorkerEngineInvocationRow['status']
  inputRef?: string | null
  stdoutRef?: string | null
  stderrRef?: string | null
  exitCode?: number | null
  signal?: string | null
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

export interface DiscardLegacySoulMetadataInput {
  soulIds: readonly string[]
  at?: string
}

export interface DiscardLegacySoulMetadataResult {
  legacySoulIds: string[]
  workersDeleted: number
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

export function listWorkerOverlayAssets(workerId: string): (WorkerOverlayAssetRow & { source: 'overlay' })[] {
  return getWorkerDb()
    .select()
    .from(schema.workerOverlayAssets)
    .where(eq(schema.workerOverlayAssets.workerId, workerId))
    .all()
    .map(row => ({ ...row, source: 'overlay' as const }))
}

export function upsertWorkerOverlayAssets(workerId: string, assets: WorkerOverlayAssetInput[], at = new Date().toISOString()): void {
  const db = getWorkerDb()
  db.delete(schema.workerOverlayAssets)
    .where(eq(schema.workerOverlayAssets.workerId, workerId))
    .run()
  for (const asset of assets) {
    db.insert(schema.workerOverlayAssets)
      .values({
        content: asset.content,
        createdAt: at,
        enabled: asset.enabled,
        id: asset.id,
        kind: asset.kind,
        metadataJson: asset.metadataJson ?? {},
        target: asset.target,
        updatedAt: at,
        workerId,
      })
      .run()
  }
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

export function discardLegacySoulMetadata(input: DiscardLegacySoulMetadataInput): DiscardLegacySoulMetadataResult {
  const legacySoulIds = [...new Set(input.soulIds)].sort()
  let workersDeleted = 0

  for (const soulId of legacySoulIds) {
    const legacyWorkers = getWorkerDb()
      .select({ id: schema.workers.id })
      .from(schema.workers)
      .where(eq(schema.workers.soulId, soulId))
      .all()
    if (legacyWorkers.length === 0)
      continue

    getWorkerDb()
      .delete(schema.workers)
      .where(eq(schema.workers.soulId, soulId))
      .run()
    workersDeleted += legacyWorkers.length
  }

  return {
    legacySoulIds,
    workersDeleted,
  }
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

export function createWorkerEngineInvocation(input: CreateWorkerEngineInvocationInput): WorkerEngineInvocationRow {
  const now = input.at ?? new Date().toISOString()
  getWorkerDb().insert(schema.workerEngineInvocations).values({
    id: input.id,
    workerId: input.workerId,
    seq: input.seq,
    engineId: input.engineId,
    engineCommand: input.engineCommand ?? null,
    status: input.status ?? 'queued',
    cwd: input.cwd,
    inputRef: input.inputRef ?? null,
    stdoutRef: input.stdoutRef ?? null,
    stderrRef: input.stderrRef ?? null,
    exitCode: input.exitCode ?? null,
    signal: input.signal ?? null,
    metadataJson: input.metadataJson ?? {},
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }).run()
  return getWorkerEngineInvocation(input.id)!
}

export function getWorkerEngineInvocation(id: string): WorkerEngineInvocationRow | null {
  return getWorkerDb().select().from(schema.workerEngineInvocations).where(eq(schema.workerEngineInvocations.id, id)).get() ?? null
}

export function updateWorkerEngineInvocation(input: UpdateWorkerEngineInvocationInput): WorkerEngineInvocationRow {
  const existing = getWorkerEngineInvocation(input.id)
  if (!existing)
    throw new Error(`Worker engine invocation not found: ${input.id}`)
  const has = (key: keyof UpdateWorkerEngineInvocationInput) => Object.hasOwn(input, key)
  getWorkerDb().update(schema.workerEngineInvocations).set({
    exitCode: has('exitCode') ? input.exitCode ?? null : existing.exitCode,
    finishedAt: has('finishedAt') ? input.finishedAt ?? null : existing.finishedAt,
    inputRef: has('inputRef') ? input.inputRef ?? null : existing.inputRef,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    signal: has('signal') ? input.signal ?? null : existing.signal,
    startedAt: has('startedAt') ? input.startedAt ?? null : existing.startedAt,
    status: input.status ?? existing.status,
    stderrRef: has('stderrRef') ? input.stderrRef ?? null : existing.stderrRef,
    stdoutRef: has('stdoutRef') ? input.stdoutRef ?? null : existing.stdoutRef,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.workerEngineInvocations.id, input.id)).run()
  return getWorkerEngineInvocation(input.id)!
}

export function listWorkerEngineInvocations(workerId?: string, limit = 200): WorkerEngineInvocationRow[] {
  const query = getWorkerDb().select().from(schema.workerEngineInvocations)
  if (workerId) {
    return query
      .where(eq(schema.workerEngineInvocations.workerId, workerId))
      .orderBy(desc(schema.workerEngineInvocations.updatedAt))
      .limit(limit)
      .all()
  }
  return query.orderBy(desc(schema.workerEngineInvocations.updatedAt)).limit(limit).all()
}

export function nextWorkerEngineInvocationSeq(workerId: string): number {
  const latest = getWorkerDb()
    .select({ seq: schema.workerEngineInvocations.seq })
    .from(schema.workerEngineInvocations)
    .where(eq(schema.workerEngineInvocations.workerId, workerId))
    .orderBy(desc(schema.workerEngineInvocations.seq))
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
