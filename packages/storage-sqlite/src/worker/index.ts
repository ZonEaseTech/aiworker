import type { LocalWorkerConfigUpdatedBy } from '@zonease/aiworker-soul-protocol'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { fileURLToPath } from 'node:url'
import {

  localWorkerConfigValueInputSchema,
  localWorkerConfigValueSchema,
} from '@zonease/aiworker-soul-protocol'
import { Database } from 'bun:sqlite'
import { and, desc, eq, gt, sql } from 'drizzle-orm'
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
const LITERAL_SECRET_RE = /Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}|token=[^\s"']+|["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["'][^"'\n]+["']/gi
const REDACTED_LITERAL_SECRET_RE = /Bearer\s+\[REDACTED\]|sk-\[REDACTED\]|token=\[REDACTED\]|["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["']\[REDACTED\]["']/i
const NATIVE_MCP_FILE_RE = /(?:^|\n)\s*\[mcp_servers(?:\.|\])|["']mcpServers["']\s*:/i
const SOUL_OWNED_CONFIG_PAYLOAD_KEY_RE = /^(?:artifactBody|artifactContent|artifactJson|artifactPayload|businessActionState|candidate|candidateId|confirmationState|entryFileBody|entryFileContent|profile|profileRecord|review|reviewId|reviewRecord|skillBody|skillMarkdown)$/i

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
  discardLegacyWorkerOverlayAssets()
  repairWorkerIndexes()
}

function discardLegacyWorkerOverlayAssets() {
  getWorkerDb().run(sql.raw('DROP TABLE IF EXISTS worker_overlay_assets'))
}

function repairWorkerIndexes() {
  const rows = getWorkerDb().all<{ name: string, unique: number }>(sql.raw('PRAGMA index_list("workers")'))
  const soulIndex = rows.find(row => row.name === 'workers_soul_idx')
  if (soulIndex?.unique === 1)
    getWorkerDb().run(sql.raw('DROP INDEX IF EXISTS workers_soul_idx'))
  if (!soulIndex || soulIndex.unique === 1)
    getWorkerDb().run(sql.raw('CREATE INDEX IF NOT EXISTS workers_soul_idx ON workers (soul_id)'))
}

function assertNoLiteralSecrets(value: unknown, context: string): void {
  if (typeof value === 'string') {
    if (NATIVE_MCP_FILE_RE.test(value))
      throw new Error(`Full native MCP files are not allowed in Host metadata: ${context}`)
    if (containsLiteralSecret(value))
      throw new Error(`Literal secrets are not allowed in Host metadata: ${context}`)
    return
  }
  if (!value || typeof value !== 'object')
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLiteralSecrets(item, `${context}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === 'string' && isSecretKey(key) && !isSecretReference(nested))
      throw new Error(`Literal secrets are not allowed in Host metadata: ${context}.${key}`)
    assertNoLiteralSecrets(nested, `${context}.${key}`)
  }
}

function assertNoFullNativeMcpFiles(value: unknown, context: string): void {
  if (typeof value === 'string') {
    if (NATIVE_MCP_FILE_RE.test(value))
      throw new Error(`Full native MCP files are not allowed in Host metadata: ${context}`)
    return
  }
  if (!value || typeof value !== 'object')
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoFullNativeMcpFiles(item, `${context}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>))
    assertNoFullNativeMcpFiles(nested, `${context}.${key}`)
}

function assertNoSoulOwnedConfigPayloads(value: unknown, context: string): void {
  if (!value || typeof value !== 'object')
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSoulOwnedConfigPayloads(item, `${context}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SOUL_OWNED_CONFIG_PAYLOAD_KEY_RE.test(key))
      throw new Error(`Soul-owned config payloads are not allowed in Host metadata: ${context}.${key}`)
    assertNoSoulOwnedConfigPayloads(nested, `${context}.${key}`)
  }
}

function containsLiteralSecret(value: string): boolean {
  for (const match of value.matchAll(LITERAL_SECRET_RE)) {
    if (!isRedactedPlaceholder(match[0]))
      return true
  }
  return false
}

function isRedactedPlaceholder(value: string): boolean {
  return REDACTED_LITERAL_SECRET_RE.test(value.trim())
}

function isSecretKey(key: string): boolean {
  return /api[_-]?key|authorization|password|secret|token/i.test(key)
}

function isSecretReference(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed === '[REDACTED]' || trimmed.startsWith('$') || trimmed.startsWith('env:') || trimmed.startsWith('secretref:')
}

function normalizeWorkerConfigEnvelope(
  value: Record<string, unknown>,
  context: string,
  defaults: { updatedAt: string, updatedBy: LocalWorkerConfigUpdatedBy },
): Record<string, unknown> {
  assertNoLiteralSecrets(value, context)
  assertNoFullNativeMcpFiles(value, context)
  const parsed = localWorkerConfigValueInputSchema.safeParse(value)
  if (!parsed.success)
    throw workerConfigEnvelopeError(parsed.error, context)
  assertNoSoulOwnedConfigPayloads(parsed.data.options, `${context}.options`)

  const normalized = {
    ...parsed.data,
    updatedAt: readString(parsed.data.updatedAt, defaults.updatedAt),
    updatedBy: parsed.data.updatedBy ?? defaults.updatedBy,
  }
  const full = localWorkerConfigValueSchema.safeParse(normalized)
  if (!full.success)
    throw workerConfigEnvelopeError(full.error, context)
  return full.data
}

function workerConfigEnvelopeError(error: { issues: Array<{ code: string, path: Array<number | string> }> }, context: string): Error {
  const field = String(error.issues[0]?.path[0] ?? '')
  if (field === 'kind')
    return new Error(`Invalid Host worker config envelope kind: ${context}.kind`)
  if (field === 'target')
    return new Error(`Invalid Host worker config envelope target: ${context}.target`)
  if (field === 'enabled')
    return new Error(`Invalid Host worker config envelope enabled flag: ${context}.enabled`)
  if (field === 'options')
    return new Error(`Invalid Host worker config envelope options: ${context}.options`)
  if (field === 'updatedBy')
    return new Error(`Invalid Host worker config envelope updatedBy: ${context}.updatedBy`)
  return new Error(`Invalid Host worker config envelope field: ${context}`)
}

function defaultWorkerConfigUpdatedBy(source: WorkerConfigRow['source'] | undefined): LocalWorkerConfigUpdatedBy {
  if (source === 'web' || source === 'app-owned-api')
    return source
  return 'cli'
}

function workerConfigOverlayKind(kind: WorkerOverlayAssetInput['kind']): 'entry-file-overlay' | 'mcp-overlay' | 'skill-overlay' {
  if (kind === 'entry-file')
    return 'entry-file-overlay'
  if (kind === 'mcp-client')
    return 'mcp-overlay'
  return 'skill-overlay'
}

function workerConfigTargetForOverlay(asset: Pick<WorkerOverlayAssetInput, 'kind' | 'target'>): 'all' | 'claude-code' | 'codex' | 'none' {
  if (asset.kind === 'entry-file')
    return 'all'
  if (asset.target === 'codex' || asset.target === 'claude-code')
    return asset.target
  return 'none'
}

function workerOverlayConfigKey(asset: Pick<WorkerOverlayAssetInput, 'id' | 'kind' | 'target'>): string {
  return `overlay:${encodeURIComponent(asset.kind)}:${encodeURIComponent(asset.target)}:${encodeURIComponent(asset.id)}`
}

function isWorkerOverlayKind(value: unknown): value is WorkerOverlayAssetRow['kind'] {
  return value === 'entry-file' || value === 'mcp-client' || value === 'skill'
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export type WorkerDatabase = ReturnType<typeof createDb>
export type WorkerRow = typeof schema.workers.$inferSelect
export type WorkspaceRow = typeof schema.workspaces.$inferSelect
export type SessionRow = typeof schema.sessions.$inferSelect
export type EngineInvocationRow = typeof schema.engineInvocations.$inferSelect
export type BridgeEventRow = typeof schema.bridgeEvents.$inferSelect
export type FileRow = typeof schema.files.$inferSelect
export type SoulAppRow = typeof schema.soulApps.$inferSelect
export type SettingRow = typeof schema.settings.$inferSelect
export type WorkerConfigRow = typeof schema.workerConfig.$inferSelect

export interface WorkerOverlayAssetRow {
  checksum: string | null
  enabled: boolean
  id: string
  kind: 'entry-file' | 'mcp-client' | 'skill'
  metadataJson: Record<string, unknown>
  optionsJson: Record<string, unknown>
  sourceRef: string
  target: string
  updatedAt: string
  workerId: string
}

export interface SessionEventRow {
  createdAt: string
  id: number
  invocationId: string
  payloadJson: Record<string, unknown>
  seq: number
  sessionId: string
  type: 'status' | 'assistant_delta' | 'tool' | 'file_change' | 'artifact' | 'error' | 'log'
}

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
  checksum?: string | null
  enabled: boolean
  id: string
  kind: 'entry-file' | 'mcp-client' | 'skill'
  metadataJson?: Record<string, unknown>
  optionsJson?: Record<string, unknown>
  sourceRef: string
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
  capabilityId: string
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

export interface CreateEngineInvocationInput {
  id: string
  sessionId: string
  seq: number
  engineId: string
  engineCommand?: string | null
  status?: EngineInvocationRow['status']
  processState?: EngineInvocationRow['processState']
  projectionReceiptId?: string | null
  externalSessionRef?: string | null
  rawLogRef?: string | null
  eventLogRef?: string | null
  failureCode?: string | null
  inputRef: string
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
  processState?: EngineInvocationRow['processState']
  projectionReceiptId?: string | null
  externalSessionRef?: string | null
  rawLogRef?: string | null
  eventLogRef?: string | null
  failureCode?: string | null
  summary?: string | null
  error?: string | null
  metadataJson?: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  at?: string
}

export interface AppendSessionEventInput {
  sessionId: string
  invocationId: string
  seq: number
  type: SessionEventRow['type']
  payloadJson?: Record<string, unknown>
  at?: string
}

export interface UpsertWorkerConfigInput {
  workerId: string
  configKey: string
  configValueJson: Record<string, unknown>
  source?: WorkerConfigRow['source']
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
  descriptorDigest: string
  descriptorJson: SoulAppRow['descriptorJson']
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
  if (input.metadataJson)
    assertNoLiteralSecrets(input.metadataJson, 'workers.metadataJson')
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

export function deleteWorker(id: string): WorkerRow | null {
  const existing = getWorker(id)
  if (!existing)
    return null
  getWorkerDb()
    .delete(schema.workers)
    .where(eq(schema.workers.id, id))
    .run()
  return existing
}

export function listWorkers(limit = 100): WorkerRow[] {
  return getWorkerDb().select().from(schema.workers).orderBy(schema.workers.id).limit(limit).all()
}

export function listWorkerOverlayAssets(workerId: string): (WorkerOverlayAssetRow & { source: 'overlay' })[] {
  return listWorkerConfigValues(workerId)
    .filter(row => row.configKey.startsWith('overlay:'))
    .flatMap((row) => {
      const options = row.configValueJson.options
      if (!options || typeof options !== 'object' || Array.isArray(options))
        return []
      const record = options as Record<string, unknown>
      const kind = record.overlayKind
      const id = record.overlayId
      const target = record.overlayTarget
      if (!isWorkerOverlayKind(kind) || typeof id !== 'string' || typeof target !== 'string')
        return []
      return [{
        checksum: readNullableString(row.configValueJson.checksum),
        enabled: row.configValueJson.enabled === true,
        id,
        kind,
        metadataJson: readJsonObject(record.metadataJson),
        optionsJson: readJsonObject(record.optionsJson),
        source: 'overlay' as const,
        sourceRef: readString(row.configValueJson.sourceRef, ''),
        target,
        updatedAt: row.updatedAt,
        workerId: row.workerId,
      }]
    })
}

export function upsertWorkerOverlayAssets(workerId: string, assets: WorkerOverlayAssetInput[], at = new Date().toISOString()): void {
  for (const asset of assets) {
    if (!asset.sourceRef.trim())
      throw new Error(`Worker overlay sourceRef is required: ${asset.id}`)
    if (asset.metadataJson)
      assertNoLiteralSecrets(asset.metadataJson, `worker_config.${asset.id}.metadataJson`)
    if (asset.optionsJson)
      assertNoLiteralSecrets(asset.optionsJson, `worker_config.${asset.id}.optionsJson`)
  }
  getWorkerDb().run(sql`DELETE FROM worker_config WHERE worker_id = ${workerId} AND config_key LIKE ${'overlay:%'}`)
  for (const asset of assets) {
    upsertWorkerConfigValue({
      workerId,
      configKey: workerOverlayConfigKey(asset),
      configValueJson: {
        checksum: asset.checksum ?? null,
        enabled: asset.enabled,
        kind: workerConfigOverlayKind(asset.kind),
        options: {
          metadataJson: asset.metadataJson ?? {},
          optionsJson: asset.optionsJson ?? {},
          overlayId: asset.id,
          overlayKind: asset.kind,
          overlayTarget: asset.target,
        },
        sourceRef: asset.sourceRef,
        target: workerConfigTargetForOverlay(asset),
        updatedAt: at,
        updatedBy: 'cli',
      },
      source: 'cli',
      at,
    })
  }
}

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
  const now = input.at ?? new Date().toISOString()
  assertNoLiteralSecrets(input.sourcePointersJson ?? [], 'workspaces.sourcePointersJson')
  assertNoLiteralSecrets(input.metadataJson ?? {}, 'workspaces.metadataJson')
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
  if (input.sourcePointersJson)
    assertNoLiteralSecrets(input.sourcePointersJson, 'workspaces.sourcePointersJson')
  if (input.metadataJson)
    assertNoLiteralSecrets(input.metadataJson, 'workspaces.metadataJson')
  getWorkerDb().update(schema.workspaces).set({
    metadataJson: input.metadataJson ?? existing.metadataJson,
    name: input.name ?? existing.name,
    sourcePointersJson: input.sourcePointersJson ?? existing.sourcePointersJson,
    status: input.status ?? existing.status,
    updatedAt: input.at ?? new Date().toISOString(),
  }).where(eq(schema.workspaces.id, input.id)).run()
  return getWorkspace(input.id)!
}

export function deleteWorkspace(id: string): WorkspaceRow | null {
  const existing = getWorkspace(id)
  if (!existing)
    return null
  getWorkerDb()
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, id))
    .run()
  return existing
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
  assertNoLiteralSecrets(input.metadataJson ?? {}, 'sessions.metadataJson')
  getWorkerDb().insert(schema.sessions).values({
    id: input.id,
    workerId: input.workerId,
    workspaceId: input.workspaceId,
    capabilityId: input.capabilityId,
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
  if (input.metadataJson)
    assertNoLiteralSecrets(input.metadataJson, 'sessions.metadataJson')
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

export function deleteSession(id: string): SessionRow | null {
  const existing = getSession(id)
  if (!existing)
    return null
  getWorkerDb()
    .delete(schema.sessions)
    .where(eq(schema.sessions.id, id))
    .run()
  return existing
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

export function createEngineInvocation(input: CreateEngineInvocationInput): EngineInvocationRow {
  const now = input.at ?? new Date().toISOString()
  assertNoLiteralSecrets({
    engineCommand: input.engineCommand,
    error: input.error,
    eventLogRef: input.eventLogRef,
    externalSessionRef: input.externalSessionRef,
    failureCode: input.failureCode,
    inputRef: input.inputRef,
    projectionReceiptId: input.projectionReceiptId,
    rawLogRef: input.rawLogRef,
    summary: input.summary,
  }, 'engine_invocations')
  assertNoLiteralSecrets(input.metadataJson ?? {}, 'engine_invocations.metadataJson')
  getWorkerDb().insert(schema.engineInvocations).values({
    id: input.id,
    sessionId: input.sessionId,
    seq: input.seq,
    engineId: input.engineId,
    engineCommand: input.engineCommand ?? null,
    status: input.status ?? 'queued',
    processState: input.processState ?? 'not_spawned',
    projectionReceiptId: input.projectionReceiptId ?? null,
    externalSessionRef: input.externalSessionRef ?? null,
    rawLogRef: input.rawLogRef ?? null,
    eventLogRef: input.eventLogRef ?? null,
    failureCode: input.failureCode ?? null,
    inputRef: input.inputRef,
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
  assertNoLiteralSecrets({
    error: has('error') ? input.error : null,
    eventLogRef: has('eventLogRef') ? input.eventLogRef : null,
    externalSessionRef: has('externalSessionRef') ? input.externalSessionRef : null,
    failureCode: has('failureCode') ? input.failureCode : null,
    projectionReceiptId: has('projectionReceiptId') ? input.projectionReceiptId : null,
    rawLogRef: has('rawLogRef') ? input.rawLogRef : null,
    summary: has('summary') ? input.summary : null,
  }, 'engine_invocations')
  if (input.metadataJson)
    assertNoLiteralSecrets(input.metadataJson, 'engine_invocations.metadataJson')
  getWorkerDb().update(schema.engineInvocations).set({
    eventLogRef: has('eventLogRef') ? input.eventLogRef ?? null : existing.eventLogRef,
    error: has('error') ? input.error ?? null : existing.error,
    externalSessionRef: has('externalSessionRef') ? input.externalSessionRef ?? null : existing.externalSessionRef,
    failureCode: has('failureCode') ? input.failureCode ?? null : existing.failureCode,
    finishedAt: has('finishedAt') ? input.finishedAt ?? null : existing.finishedAt,
    metadataJson: input.metadataJson ?? existing.metadataJson,
    processState: input.processState ?? existing.processState,
    projectionReceiptId: has('projectionReceiptId') ? input.projectionReceiptId ?? null : existing.projectionReceiptId,
    rawLogRef: has('rawLogRef') ? input.rawLogRef ?? null : existing.rawLogRef,
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
  const invocation = getEngineInvocation(input.invocationId)
  if (!invocation || invocation.sessionId !== input.sessionId)
    throw new Error(`Engine invocation not found for session event: ${input.invocationId}`)
  const eventJson = {
    payload: input.payloadJson ?? {},
    sessionEventType: input.type,
    seq: input.seq,
    version: 1,
  }
  assertNoLiteralSecrets(eventJson, 'bridge_events.eventJson')
  getWorkerDb().insert(schema.bridgeEvents).values({
    createdAt: input.at ?? new Date().toISOString(),
    eventJson,
    eventType: bridgeEventTypeFromSessionEventType(input.type),
    invocationId: input.invocationId,
  }).run()
  const id = getWorkerDb().all<{ id: number }>(sql.raw('SELECT last_insert_rowid() AS id'))[0]?.id
  const row = id
    ? listSessionEvents(input.sessionId, { after: id - 1, limit: 1 })[0]
    : listSessionEvents(input.sessionId, { limit: 1 }).at(-1)
  if (!row)
    throw new Error(`Bridge event write failed: ${input.invocationId}`)
  return row
}

export function nextSessionEventSeq(sessionId: string): number {
  return listSessionEvents(sessionId).reduce((max, event) => Math.max(max, event.seq), 0) + 1
}

export function listSessionEvents(sessionId?: string, options: { after?: number, limit?: number } = {}): SessionEventRow[] {
  const limit = options.limit ?? 500
  const query = getWorkerDb()
    .select({
      createdAt: schema.bridgeEvents.createdAt,
      eventJson: schema.bridgeEvents.eventJson,
      eventType: schema.bridgeEvents.eventType,
      id: schema.bridgeEvents.id,
      invocationId: schema.bridgeEvents.invocationId,
      sessionId: schema.engineInvocations.sessionId,
    })
    .from(schema.bridgeEvents)
    .innerJoin(schema.engineInvocations, eq(schema.bridgeEvents.invocationId, schema.engineInvocations.id))

  if (sessionId) {
    const filters = [eq(schema.engineInvocations.sessionId, sessionId)]
    if (options.after !== undefined && Number.isFinite(options.after) && options.after > 0)
      filters.push(gt(schema.bridgeEvents.id, options.after))
    return query
      .where(and(...filters))
      .orderBy(schema.bridgeEvents.id)
      .limit(limit)
      .all()
      .map(mapBridgeEventToSessionEvent)
  }

  return query
    .orderBy(desc(schema.bridgeEvents.createdAt))
    .limit(limit)
    .all()
    .map(mapBridgeEventToSessionEvent)
}

export function listInvocationEvents(invocationId: string, options: { after?: number, limit?: number } = {}): SessionEventRow[] {
  const limit = options.limit ?? 500
  const filters = [eq(schema.bridgeEvents.invocationId, invocationId)]
  if (options.after !== undefined && Number.isFinite(options.after) && options.after > 0)
    filters.push(gt(schema.bridgeEvents.id, options.after))
  return getWorkerDb()
    .select({
      createdAt: schema.bridgeEvents.createdAt,
      eventJson: schema.bridgeEvents.eventJson,
      eventType: schema.bridgeEvents.eventType,
      id: schema.bridgeEvents.id,
      invocationId: schema.bridgeEvents.invocationId,
      sessionId: schema.engineInvocations.sessionId,
    })
    .from(schema.bridgeEvents)
    .innerJoin(schema.engineInvocations, eq(schema.bridgeEvents.invocationId, schema.engineInvocations.id))
    .where(and(...filters))
    .orderBy(schema.bridgeEvents.id)
    .limit(limit)
    .all()
    .map(mapBridgeEventToSessionEvent)
}

function bridgeEventTypeFromSessionEventType(type: SessionEventRow['type']): BridgeEventRow['eventType'] {
  if (type === 'status')
    return 'invocation.status'
  if (type === 'assistant_delta')
    return 'engine.output'
  if (type === 'tool')
    return 'engine.tool'
  if (type === 'error')
    return 'error'
  if (type === 'log')
    return 'diagnostic'
  return 'process.event'
}

function sessionEventTypeFromBridgeEventType(type: BridgeEventRow['eventType']): SessionEventRow['type'] {
  if (type === 'invocation.status')
    return 'status'
  if (type === 'engine.output')
    return 'assistant_delta'
  if (type === 'engine.tool')
    return 'tool'
  if (type === 'error')
    return 'error'
  return 'log'
}

function mapBridgeEventToSessionEvent(row: {
  createdAt: string
  eventJson: Record<string, unknown>
  eventType: BridgeEventRow['eventType']
  id: number
  invocationId: string
  sessionId: string
}): SessionEventRow {
  const eventJson = row.eventJson ?? {}
  const payload = readJsonObject(eventJson.payload)
  const type = isSessionEventType(eventJson.sessionEventType)
    ? eventJson.sessionEventType
    : sessionEventTypeFromBridgeEventType(row.eventType)
  return {
    createdAt: row.createdAt,
    id: row.id,
    invocationId: row.invocationId,
    payloadJson: payload,
    seq: typeof eventJson.seq === 'number' ? eventJson.seq : row.id,
    sessionId: row.sessionId,
    type,
  }
}

function isSessionEventType(value: unknown): value is SessionEventRow['type'] {
  return value === 'status'
    || value === 'assistant_delta'
    || value === 'tool'
    || value === 'file_change'
    || value === 'artifact'
    || value === 'error'
    || value === 'log'
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
  assertNoLiteralSecrets(input.descriptorJson, 'soul_apps.descriptorJson')
  assertNoLiteralSecrets(input.validationIssuesJson ?? [], 'soul_apps.validationIssuesJson')
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
      descriptorDigest: input.descriptorDigest,
      descriptorJson: input.descriptorJson,
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
      descriptorDigest: input.descriptorDigest,
      descriptorJson: input.descriptorJson,
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

export function deleteSoulApp(id: string): SoulAppRow | null {
  const existing = getSoulApp(id)
  if (!existing)
    return null
  getWorkerDb()
    .delete(schema.soulApps)
    .where(eq(schema.soulApps.id, id))
    .run()
  return existing
}

export function listSoulApps(limit = 200): SoulAppRow[] {
  return getWorkerDb().select().from(schema.soulApps).orderBy(schema.soulApps.id).limit(limit).all()
}

export function updateSoulAppLifecycle(input: UpdateSoulAppLifecycleInput): SoulAppRow {
  const existing = getSoulApp(input.id)
  if (!existing)
    throw new Error(`Soul App not found: ${input.id}`)
  const now = input.at ?? new Date().toISOString()
  if (input.validationIssuesJson)
    assertNoLiteralSecrets(input.validationIssuesJson, 'soul_apps.validationIssuesJson')
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

export function upsertWorkerConfigValue(input: UpsertWorkerConfigInput): WorkerConfigRow {
  const now = input.at ?? new Date().toISOString()
  const existing = getWorkerDb()
    .select()
    .from(schema.workerConfig)
    .where(and(eq(schema.workerConfig.workerId, input.workerId), eq(schema.workerConfig.configKey, input.configKey)))
    .get()
  const source = input.source ?? existing?.source ?? 'cli'
  const configValueJson = normalizeWorkerConfigEnvelope(input.configValueJson, `worker_config.${input.configKey}.configValueJson`, {
    updatedAt: now,
    updatedBy: defaultWorkerConfigUpdatedBy(source),
  })
  if (!existing) {
    getWorkerDb().insert(schema.workerConfig).values({
      configKey: input.configKey,
      configValueJson,
      createdAt: now,
      source,
      updatedAt: now,
      workerId: input.workerId,
    }).run()
  }
  else {
    getWorkerDb().update(schema.workerConfig).set({
      configValueJson,
      source,
      updatedAt: now,
    }).where(and(eq(schema.workerConfig.workerId, input.workerId), eq(schema.workerConfig.configKey, input.configKey))).run()
  }
  return getWorkerConfigValue(input.workerId, input.configKey)!
}

export function deleteWorkerConfigValue(workerId: string, configKey: string): void {
  getWorkerDb()
    .delete(schema.workerConfig)
    .where(and(eq(schema.workerConfig.workerId, workerId), eq(schema.workerConfig.configKey, configKey)))
    .run()
}

export function getWorkerConfigValue(workerId: string, configKey: string): WorkerConfigRow | null {
  return getWorkerDb()
    .select()
    .from(schema.workerConfig)
    .where(and(eq(schema.workerConfig.workerId, workerId), eq(schema.workerConfig.configKey, configKey)))
    .get() ?? null
}

export function listWorkerConfigValues(workerId?: string, limit = 500): WorkerConfigRow[] {
  const query = getWorkerDb().select().from(schema.workerConfig)
  if (workerId) {
    return query
      .where(eq(schema.workerConfig.workerId, workerId))
      .orderBy(schema.workerConfig.configKey)
      .limit(limit)
      .all()
  }
  return query.orderBy(desc(schema.workerConfig.updatedAt)).limit(limit).all()
}

export function getSetting(key: string): SettingRow | null {
  return getWorkerDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get() ?? null
}

export function listSettings(): SettingRow[] {
  return getWorkerDb().select().from(schema.settings).orderBy(schema.settings.key).all()
}

export function setSetting(key: string, valueJson: Record<string, unknown>, at = new Date().toISOString()): SettingRow {
  assertNoLiteralSecrets(valueJson, `settings.${key}`)
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
