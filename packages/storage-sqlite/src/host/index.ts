import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { Database } from 'bun:sqlite'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import * as schema from './schema'
import { hostAssignmentStorageTestHooks } from './test-hooks'

const TOKEN_PREFIX = 'awp_'
const TOKEN_BYTES = 32
const SCRYPT_KEY_LENGTH = 64
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const LITERAL_SECRET_RE = /Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}|ghp_\w{20,}|gho_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35,}|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN[A-Z ]*PRIVATE KEY-----|token=[^\s"']+|["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["'][^"'\n]+["']/gi
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
      metadata_json TEXT DEFAULT '{}' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      checked_in_at TEXT,
      access_ready_at TEXT,
      revoked_at TEXT,
      revoked_by TEXT
    )
  `))
  getHostDb().run(sql.raw('CREATE INDEX IF NOT EXISTS host_assignments_assigned_email_idx ON host_assignments (assigned_email)'))
  getHostDb().run(sql.raw('CREATE INDEX IF NOT EXISTS host_assignments_status_updated_at_idx ON host_assignments (status, updated_at)'))
  getHostDb().run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS host_assignments_worker_id_unique_idx ON host_assignments (worker_id)'))
}

export type HostAssignmentStatus = typeof schema.hostAssignments.$inferSelect['status']
export type HostAssignmentRow = typeof schema.hostAssignments.$inferSelect

export interface CreateAssignmentInput {
  assignedEmail: string
  serverRef: string
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

export function createAssignment(input: CreateAssignmentInput): { assignment: HostAssignmentRow, provisionToken: string } {
  const at = readNow(input.now)
  const metadataJson = input.metadataJson ?? {}
  assertNoLiteralSecrets(input.assignedEmail, 'host_assignments.assignedEmail')
  assertNoLiteralSecrets(input.serverRef, 'host_assignments.serverRef')
  assertNoLiteralSecrets(input.soulReleaseRef, 'host_assignments.soulReleaseRef')
  assertNoLiteralSecrets(metadataJson, 'host_assignments.metadataJson')

  const provisionToken = createProvisionToken()
  const assignmentId = createAssignmentId()
  getHostDb().insert(schema.hostAssignments).values({
    assignmentId,
    assignedEmail: normalizeEmail(input.assignedEmail),
    serverRef: input.serverRef,
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
    .where(isNull(schema.hostAssignments.provisionTokenConsumedAt))
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
      isNull(schema.hostAssignments.provisionTokenConsumedAt),
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
  getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'checked_in',
      workerId: input.workerId,
      workerVersion: input.workerVersion,
      checkedInAt: at,
      updatedAt: at,
    })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)
}

export function markAssignmentAccessReady(assignmentId: string, input: MarkAssignmentAccessReadyInput = {}): HostAssignmentRow | null {
  const at = input.accessReadyAt ?? new Date().toISOString()
  if (input.accessReadyAt)
    assertNoLiteralSecrets(input.accessReadyAt, 'host_assignments.accessReadyAt')
  getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'access_ready',
      accessReadyAt: at,
      updatedAt: at,
    })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)
}

export function markAssignmentReady(assignmentId: string, input: MarkAssignmentReadyInput): HostAssignmentRow | null {
  const at = new Date().toISOString()
  assertNoLiteralSecrets(input.workbenchUrl, 'host_assignments.workbenchUrl')
  getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'ready',
      workbenchUrl: input.workbenchUrl,
      updatedAt: at,
    })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)
}

export function revokeAssignment(assignmentId: string, revokedBy: string): HostAssignmentRow | null {
  const at = new Date().toISOString()
  assertNoLiteralSecrets(revokedBy, 'host_assignments.revokedBy')
  getHostDb()
    .update(schema.hostAssignments)
    .set({
      status: 'revoked',
      revokedAt: at,
      revokedBy,
      updatedAt: at,
    })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)
}

function createAssignmentId(): string {
  return `asn_${randomBytes(16).toString('base64url')}`
}

function createProvisionToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`
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
