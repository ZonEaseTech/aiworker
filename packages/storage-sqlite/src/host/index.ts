import { Buffer } from 'node:buffer'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { SECRET_FORMAT_ALTERNATION } from '@zonease/aiworker-engine-bridge'
import { Database } from 'bun:sqlite'
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import * as schema from './schema'
import { hostAssignmentStorageTestHooks } from './test-hooks'

const TOKEN_PREFIX = 'awp_'
const TOKEN_BYTES = 32
const ACCESS_TOKEN_PREFIX = 'awt_'
const ACCESS_TOKEN_BYTES = 32
const SCRYPT_KEY_LENGTH = 64
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

// Value-format alternation (PEM/JWT/ghp_/gho_/github_pat_/AKIA/AIza) sourced from
// the shared engine-bridge constant so all detection sites share one true source and
// cannot drift apart. Local branches (Bearer/sk-/token=/assignment) are appended.
const LITERAL_SECRET_RE = new RegExp(`${SECRET_FORMAT_ALTERNATION}|Bearer\\s+[\\w.~+/-]{12,}|sk-[\\w-]{8,}|token=[^\\s"']+|["']?(?:api[_-]?key|authorization|password|secret|token)["']?\\s*[:=]\\s*["'][^"'\\n]+["']`, 'gi')
const REDACTED_LITERAL_SECRET_RE = /Bearer\s+\[REDACTED\]|sk-\[REDACTED\]|token=\[REDACTED\]|["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["']\[REDACTED\]["']/i
const SECRET_REFERENCE_PREFIXES = ['$', 'env:', 'secretref:'] as const

let db: ReturnType<typeof createDb> | null = null
let sqliteHandle: Database | null = null

function createDb(dbPath: string) {
  const sqlite = new Database(dbPath, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqliteHandle = sqlite
  return drizzle(sqlite, { schema })
}

export function initHostDb(dbPath: string) {
  closeHostDb()
  db = createDb(dbPath)
  return db
}

export function getHostDb() {
  if (!db)
    throw new Error('Host database not initialized. Call initHostDb() first.')
  return db
}

export function closeHostDb() {
  if (sqliteHandle) {
    sqliteHandle.close(false)
    sqliteHandle = null
  }
  db = null
}

export function runHostMigrations() {
  getHostDb().run(sql.raw(`
    CREATE TABLE IF NOT EXISTS host_assignments (
      assignment_id TEXT PRIMARY KEY NOT NULL,
      assigned_email TEXT NOT NULL,
      server_ref TEXT NOT NULL,
      soul_release_ref TEXT NOT NULL,
      worker_id TEXT,
      worker_version TEXT,
      workbench_url TEXT,
      status TEXT DEFAULT 'provisioning' NOT NULL,
      provision_token_hash TEXT NOT NULL,
      provision_token_expires_at TEXT NOT NULL,
      provision_token_consumed_at TEXT,
      access_token_hash TEXT,
      access_token_issued_at TEXT,
      access_token_expires_at TEXT,
      metadata_json TEXT DEFAULT '{}' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      checked_in_at TEXT,
      access_ready_at TEXT,
      revoked_at TEXT,
      revoked_by TEXT
    )
  `))
  addColumnIfMissing('host_assignments', 'access_token_hash', 'TEXT')
  addColumnIfMissing('host_assignments', 'access_token_issued_at', 'TEXT')
  addColumnIfMissing('host_assignments', 'access_token_expires_at', 'TEXT')
  getHostDb().run(sql.raw('CREATE INDEX IF NOT EXISTS host_assignments_assigned_email_idx ON host_assignments (assigned_email)'))
  getHostDb().run(sql.raw('CREATE INDEX IF NOT EXISTS host_assignments_status_updated_at_idx ON host_assignments (status, updated_at)'))
  getHostDb().run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS host_assignments_worker_id_unique_idx ON host_assignments (worker_id)'))
  getHostDb().run(sql.raw(`
    CREATE TABLE IF NOT EXISTS host_user_authorizations (
      email TEXT NOT NULL,
      permission TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `))
  getHostDb().run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS host_user_authorizations_email_permission_unique_idx ON host_user_authorizations (email, permission)'))
  getHostDb().run(sql.raw('CREATE INDEX IF NOT EXISTS host_user_authorizations_permission_email_idx ON host_user_authorizations (permission, email)'))
  getHostDb().run(sql.raw(`
    CREATE TABLE IF NOT EXISTS host_soul_releases (
      release_ref TEXT PRIMARY KEY NOT NULL,
      soul_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      descriptor_json TEXT NOT NULL,
      source TEXT DEFAULT 'custom' NOT NULL,
      published_by TEXT NOT NULL,
      published_at TEXT NOT NULL
    )
  `))
  getHostDb().run(sql.raw('CREATE INDEX IF NOT EXISTS host_soul_releases_soul_id_idx ON host_soul_releases (soul_id)'))
  getHostDb().run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS host_soul_releases_soul_id_version_unique_idx ON host_soul_releases (soul_id, version)'))
}

export type HostAssignmentStatus = typeof schema.hostAssignments.$inferSelect['status']
export type HostAssignmentRow = typeof schema.hostAssignments.$inferSelect
export type HostUserAuthorizationRow = typeof schema.hostUserAuthorizations.$inferSelect
export type HostUserPermission = HostUserAuthorizationRow['permission']
export type HostUserAuthorizationSource = HostUserAuthorizationRow['source']
export type HostSoulReleaseRow = typeof schema.hostSoulReleases.$inferSelect
export type HostSoulReleaseSource = HostSoulReleaseRow['source']

export interface PublishSoulReleaseInput {
  soulId: string
  name: string
  descriptor: unknown
  version?: number
  source?: HostSoulReleaseSource
  publishedBy?: string
  now?: () => string
}

export interface CreateAssignmentInput {
  assignedEmail: string
  provisioningTarget?: {
    adapterType: 'aissh' | 'docker' | 'local'
    maturity: 'production' | 'preview' | 'dev'
    ref: string
  }
  serverRef?: string
  soulReleaseRef: string
  metadataJson?: Record<string, unknown>
  expiresAt?: string
  now?: () => string
}

interface VerifyProvisionTokenOptions {
  now?: () => string
}

interface MarkAssignmentCheckedInInput {
  workerId: string
  workerVersion: string
  checkInAt?: string
}

interface MarkAssignmentAccessReadyInput {
  accessReadyAt?: string
}

interface MarkAssignmentReadyInput {
  workbenchUrl: string
}

interface BootstrapHostAdminEmailsOptions {
  now?: () => string
}

interface UpsertHostUserAuthorizationInput {
  email: string
  permission: HostUserPermission
  source: HostUserAuthorizationSource
  now?: () => string
}

export function bootstrapHostAdminEmails(emails: string[], options: BootstrapHostAdminEmailsOptions = {}): HostUserAuthorizationRow[] {
  const seen = new Set<string>()
  for (const email of emails) {
    const normalized = normalizeEmail(email)
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    upsertHostUserAuthorization({
      email: normalized,
      permission: 'host:admin',
      source: 'bootstrap',
      ...(options.now ? { now: options.now } : {}),
    })
  }
  return listHostUserAuthorizations()
}

export function upsertHostUserAuthorization(input: UpsertHostUserAuthorizationInput): HostUserAuthorizationRow {
  const at = readNow(input.now)
  const email = normalizeEmail(input.email)
  if (!email)
    throw new Error('Host authorization requires an email')
  assertNoLiteralSecrets(email, 'host_user_authorizations.email')
  assertNoLiteralSecrets(input.permission, 'host_user_authorizations.permission')
  assertNoLiteralSecrets(input.source, 'host_user_authorizations.source')

  const existing = getHostDb()
    .select()
    .from(schema.hostUserAuthorizations)
    .where(and(
      eq(schema.hostUserAuthorizations.email, email),
      eq(schema.hostUserAuthorizations.permission, input.permission),
    ))
    .get()

  if (existing) {
    getHostDb()
      .update(schema.hostUserAuthorizations)
      .set({ source: input.source, updatedAt: at })
      .where(and(
        eq(schema.hostUserAuthorizations.email, email),
        eq(schema.hostUserAuthorizations.permission, input.permission),
      ))
      .run()
  }
  else {
    getHostDb().insert(schema.hostUserAuthorizations).values({
      createdAt: at,
      email,
      permission: input.permission,
      source: input.source,
      updatedAt: at,
    }).run()
  }

  return getHostUserAuthorization(email, input.permission)!
}

export function getHostUserAuthorization(email: string, permission: HostUserPermission): HostUserAuthorizationRow | null {
  return getHostDb()
    .select()
    .from(schema.hostUserAuthorizations)
    .where(and(
      eq(schema.hostUserAuthorizations.email, normalizeEmail(email)),
      eq(schema.hostUserAuthorizations.permission, permission),
    ))
    .get() ?? null
}

export function userHasHostPermission(email: string, permission: HostUserPermission): boolean {
  return getHostUserAuthorization(email, permission) !== null
}

export function listHostUserAuthorizations(limit = 200): HostUserAuthorizationRow[] {
  return getHostDb()
    .select()
    .from(schema.hostUserAuthorizations)
    .orderBy(schema.hostUserAuthorizations.email, schema.hostUserAuthorizations.permission)
    .limit(limit)
    .all()
}

export function createAssignment(input: CreateAssignmentInput): { assignment: HostAssignmentRow, provisionToken: string } {
  const at = readNow(input.now)
  const targetRef = input.provisioningTarget?.ref ?? input.serverRef
  if (!targetRef)
    throw new Error('createAssignment requires provisioningTarget.ref')
  const metadataJson = {
    ...(input.metadataJson ?? {}),
    ...(input.provisioningTarget
      ? {
          provisioningAdapterType: input.provisioningTarget.adapterType,
          provisioningTargetMaturity: input.provisioningTarget.maturity,
          provisioningTargetRef: input.provisioningTarget.ref,
        }
      : {}),
  }
  assertNoLiteralSecrets(input.assignedEmail, 'host_assignments.assignedEmail')
  assertNoLiteralSecrets(targetRef, 'host_assignments.serverRef')
  assertNoLiteralSecrets(input.soulReleaseRef, 'host_assignments.soulReleaseRef')
  assertNoLiteralSecrets(metadataJson, 'host_assignments.metadataJson')

  const provisionToken = createProvisionToken()
  const assignmentId = createAssignmentId()
  getHostDb().insert(schema.hostAssignments).values({
    assignmentId,
    assignedEmail: normalizeEmail(input.assignedEmail),
    serverRef: targetRef,
    soulReleaseRef: input.soulReleaseRef,
    status: 'provisioning',
    provisionTokenHash: hashProvisionToken(provisionToken),
    provisionTokenExpiresAt: input.expiresAt ?? new Date(Date.parse(at) + DEFAULT_TOKEN_TTL_MS).toISOString(),
    metadataJson,
    createdAt: at,
    updatedAt: at,
  }).run()

  return { assignment: getAssignment(assignmentId)!, provisionToken }
}

export function getAssignment(assignmentId: string): HostAssignmentRow | null {
  return getHostDb().select().from(schema.hostAssignments).where(eq(schema.hostAssignments.assignmentId, assignmentId)).get() ?? null
}

export function getAssignmentByWorkerId(workerId: string): HostAssignmentRow | null {
  return getHostDb().select().from(schema.hostAssignments).where(eq(schema.hostAssignments.workerId, workerId)).get() ?? null
}

export function listAssignments(limit = 200): HostAssignmentRow[] {
  return getHostDb().select().from(schema.hostAssignments).orderBy(desc(schema.hostAssignments.updatedAt)).limit(limit).all()
}

export function verifyAndConsumeProvisionToken(token: string, options: VerifyProvisionTokenOptions = {}): HostAssignmentRow | null {
  const at = readNow(options.now)
  const candidates = getHostDb()
    .select()
    .from(schema.hostAssignments)
    .where(and(
      eq(schema.hostAssignments.status, 'provisioning'),
      isNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNull(schema.hostAssignments.revokedAt),
    ))
    .all()

  const assignment = candidates.find(row =>
    row.provisionTokenExpiresAt > at && verifyProvisionTokenHash(token, row.provisionTokenHash),
  )
  if (!assignment)
    return null

  hostAssignmentStorageTestHooks.current?.beforeConsumeUpdate?.(assignment, at)

  const consumeResult = getHostDb()
    .update(schema.hostAssignments)
    .set({ provisionTokenConsumedAt: at, updatedAt: at })
    .where(and(
      eq(schema.hostAssignments.assignmentId, assignment.assignmentId),
      eq(schema.hostAssignments.status, 'provisioning'),
      isNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNull(schema.hostAssignments.revokedAt),
    ))
    .run()

  if (runChanges(consumeResult) !== 1)
    return null
  return getAssignment(assignment.assignmentId)
}

export function markAssignmentCheckedIn(assignmentId: string, input: MarkAssignmentCheckedInInput): HostAssignmentRow | null {
  const at = input.checkInAt ?? new Date().toISOString()
  assertNoLiteralSecrets(input.workerId, 'host_assignments.workerId')
  assertNoLiteralSecrets(input.workerVersion, 'host_assignments.workerVersion')
  if (input.checkInAt)
    assertNoLiteralSecrets(input.checkInAt, 'host_assignments.checkedInAt')
  const result = getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'checked_in',
      workerId: input.workerId,
      workerVersion: input.workerVersion,
      checkedInAt: at,
      updatedAt: at,
    })
    .where(and(
      eq(schema.hostAssignments.assignmentId, assignmentId),
      eq(schema.hostAssignments.status, 'provisioning'),
      isNull(schema.hostAssignments.revokedAt),
      isNotNull(schema.hostAssignments.provisionTokenConsumedAt),
    ))
    .run()
  if (runChanges(result) !== 1)
    return null
  return getAssignment(assignmentId)
}

export function issueAssignmentAccessToken(assignmentId: string, now: () => string = () => new Date().toISOString()): { assignment: HostAssignmentRow, accessToken: string } | null {
  const at = now()
  const accessToken = createAccessToken()
  const result = getHostDb()
    .update(schema.hostAssignments)
    .set({
      accessTokenHash: hashProvisionToken(accessToken),
      accessTokenIssuedAt: at,
      accessTokenExpiresAt: new Date(Date.parse(at) + DEFAULT_ACCESS_TOKEN_TTL_MS).toISOString(),
      updatedAt: at,
    })
    .where(and(
      eq(schema.hostAssignments.assignmentId, assignmentId),
      eq(schema.hostAssignments.status, 'checked_in'),
      isNull(schema.hostAssignments.revokedAt),
      isNotNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNotNull(schema.hostAssignments.workerId),
      isNotNull(schema.hostAssignments.checkedInAt),
    ))
    .run()
  if (runChanges(result) !== 1)
    return null
  return { assignment: getAssignment(assignmentId)!, accessToken }
}

export function verifyAssignmentAccessToken(input: { assignmentId: string, token: string, workerId: string }, now: () => string = () => new Date().toISOString()): HostAssignmentRow | null {
  const at = now()
  const assignment = getHostDb()
    .select()
    .from(schema.hostAssignments)
    .where(and(
      eq(schema.hostAssignments.assignmentId, input.assignmentId),
      eq(schema.hostAssignments.workerId, input.workerId),
      isNull(schema.hostAssignments.revokedAt),
      isNotNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNotNull(schema.hostAssignments.checkedInAt),
    ))
    .get()
  if (!assignment?.accessTokenHash || !assignment.accessTokenExpiresAt)
    return null
  if (assignment.accessTokenExpiresAt <= at)
    return null
  if (!verifyProvisionTokenHash(input.token, assignment.accessTokenHash))
    return null
  return assignment
}

export function markAssignmentAccessReady(assignmentId: string, input: MarkAssignmentAccessReadyInput = {}): HostAssignmentRow | null {
  const at = input.accessReadyAt ?? new Date().toISOString()
  if (input.accessReadyAt)
    assertNoLiteralSecrets(input.accessReadyAt, 'host_assignments.accessReadyAt')
  const result = getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'access_ready',
      accessReadyAt: at,
      updatedAt: at,
    })
    .where(and(
      eq(schema.hostAssignments.assignmentId, assignmentId),
      eq(schema.hostAssignments.status, 'checked_in'),
      isNull(schema.hostAssignments.revokedAt),
      isNotNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNotNull(schema.hostAssignments.workerId),
      isNotNull(schema.hostAssignments.checkedInAt),
    ))
    .run()
  if (runChanges(result) !== 1)
    return null
  return getAssignment(assignmentId)
}

export function markAssignmentReady(assignmentId: string, input: MarkAssignmentReadyInput): HostAssignmentRow | null {
  const at = new Date().toISOString()
  assertNoLiteralSecrets(input.workbenchUrl, 'host_assignments.workbenchUrl')
  const result = getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'ready',
      workbenchUrl: input.workbenchUrl,
      updatedAt: at,
    })
    .where(and(
      eq(schema.hostAssignments.assignmentId, assignmentId),
      eq(schema.hostAssignments.status, 'access_ready'),
      isNull(schema.hostAssignments.revokedAt),
      isNotNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNotNull(schema.hostAssignments.workerId),
      isNotNull(schema.hostAssignments.checkedInAt),
      isNotNull(schema.hostAssignments.accessReadyAt),
    ))
    .run()
  if (runChanges(result) !== 1)
    return null
  return getAssignment(assignmentId)
}

export function revokeAssignment(assignmentId: string, revokedBy: string): HostAssignmentRow | null {
  const at = new Date().toISOString()
  assertNoLiteralSecrets(revokedBy, 'host_assignments.revokedBy')
  getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'revoked',
      // 清空 worker_id 释放 UNIQUE 槽(SQLite UNIQUE 视 NULL 互异),使同机 re-provision 可恢复:
      // 否则撤销行留着 worker_id=X,下次 check-in 的 worker_id 守卫 getAssignmentByWorkerId(X)
      // 命中这条死行 → 永久 409 WORKER_ID_ALREADY_BOUND,4401 撤销后「需重新 provision」的恢复承诺
      // 同机无法兑现(把 rc.11 的 worker_id 痛点从 500 挪成永久 409)。撤销行各处已被 status/revokedAt
      // 过滤,getAssignmentByWorkerId 是唯一无过滤 reader,正需它对撤销行返 null。
      workerId: null,
      revokedAt: at,
      revokedBy,
      updatedAt: at,
    })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)
}

export function publishSoulRelease(input: PublishSoulReleaseInput): HostSoulReleaseRow {
  const at = readNow(input.now)
  const soulId = input.soulId.trim()
  const name = input.name.trim()
  if (!soulId)
    throw new Error('publishSoulRelease requires a soulId')
  if (!name)
    throw new Error('publishSoulRelease requires a name')

  const version = input.version ?? nextSoulReleaseVersion(soulId)
  if (!Number.isInteger(version) || version < 1)
    throw new Error('publishSoulRelease requires a positive integer version')
  const releaseRef = `${soulId}@${version}`

  assertNoLiteralSecrets(soulId, 'host_soul_releases.soulId')
  assertNoLiteralSecrets(name, 'host_soul_releases.name')
  assertNoLiteralSecrets(input.descriptor, 'host_soul_releases.descriptor')

  if (getSoulRelease(releaseRef))
    throw new Error(`Soul release already exists: ${releaseRef}`)

  getHostDb().insert(schema.hostSoulReleases).values({
    releaseRef,
    soulId,
    name,
    version,
    descriptorJson: JSON.stringify(input.descriptor),
    source: input.source ?? 'custom',
    publishedBy: input.publishedBy ?? 'cli',
    publishedAt: at,
  }).run()

  return getSoulRelease(releaseRef)!
}

export function getSoulRelease(releaseRef: string): HostSoulReleaseRow | null {
  return getHostDb().select().from(schema.hostSoulReleases).where(eq(schema.hostSoulReleases.releaseRef, releaseRef)).get() ?? null
}

export function listSoulReleases(limit = 200): HostSoulReleaseRow[] {
  return getHostDb()
    .select()
    .from(schema.hostSoulReleases)
    .orderBy(schema.hostSoulReleases.soulId, desc(schema.hostSoulReleases.version))
    .limit(limit)
    .all()
}

function nextSoulReleaseVersion(soulId: string): number {
  const latest = getHostDb()
    .select({ version: schema.hostSoulReleases.version })
    .from(schema.hostSoulReleases)
    .where(eq(schema.hostSoulReleases.soulId, soulId))
    .orderBy(desc(schema.hostSoulReleases.version))
    .limit(1)
    .get()
  return (latest?.version ?? 0) + 1
}

function createAssignmentId(): string {
  return `asn_${randomBytes(16).toString('base64url')}`
}

function createProvisionToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`
}

function createAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomBytes(ACCESS_TOKEN_BYTES).toString('base64url')}`
}

function hashProvisionToken(token: string): string {
  const salt = randomBytes(16).toString('base64url')
  const hash = scryptSync(token, salt, SCRYPT_KEY_LENGTH).toString('base64url')
  return `scrypt$1$${salt}$${hash}`
}

function verifyProvisionTokenHash(token: string, storedHash: string): boolean {
  const [, version, salt, hash] = storedHash.split('$')
  if (version !== '1' || !salt || !hash)
    return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = scryptSync(token, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function readNow(now: (() => string) | undefined): string {
  return now?.() ?? new Date().toISOString()
}

function runChanges(result: unknown): number {
  if (result && typeof result === 'object' && 'changes' in result) {
    const changes = (result as { changes: unknown }).changes
    return typeof changes === 'number' ? changes : 0
  }
  return 0
}

function addColumnIfMissing(tableName: string, columnName: string, ddl: string): void {
  if (!sqliteHandle)
    throw new Error('host sqlite handle is not initialized')
  const columns = sqliteHandle.query<{ name: string }, []>(`PRAGMA table_info(${tableName})`).all()
  if (!columns.some(column => column.name === columnName))
    getHostDb().run(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`))
}

function assertNoLiteralSecrets(value: unknown, context: string): void {
  if (typeof value === 'string') {
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
  if (trimmed.length === 0 || trimmed === '[REDACTED]')
    return true
  const prefix = SECRET_REFERENCE_PREFIXES.find(candidate => trimmed.startsWith(candidate))
  if (!prefix)
    return false
  const body = trimmed.slice(prefix.length)
  if (body.includes('='))
    return false
  return !containsLiteralSecret(body)
}

export const hostSchema = schema
export * from './schema'
