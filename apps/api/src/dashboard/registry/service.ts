import type { RegisteredWorker, RegisteredWorkerOrigin, SafeRegisteredWorker } from '@aiworker/shared'

import { eq } from 'drizzle-orm'

import { getFleetDb } from '../../db/fleet'
import { auditEvents, registeredWorkers } from '../../db/fleet/schema'
import { WorkerClient } from './client'
import { decryptToken, encryptToken } from './crypto'

/**
 * Thrown when `POST /api/workers/register` is called with an id already
 * present in the registry. Maps to HTTP 409 at the route layer.
 */
export class RegistryConflictError extends Error {
  constructor(readonly workerId: string) {
    super(`worker ${workerId} is already registered`)
    this.name = 'RegistryConflictError'
  }
}

/**
 * Thrown by `getWorkerById`, `updateWorker`, `deleteWorker` and the proxy
 * route when the target id is not in `registered_workers`. Maps to HTTP 404.
 */
export class RegistryNotFoundError extends Error {
  constructor(readonly workerId: string) {
    super(`worker ${workerId} is not registered`)
    this.name = 'RegistryNotFoundError'
  }
}

export interface RegisterWorkerInput {
  baseUrl: string
  apiToken: string
  displayName: string
}

export interface UpdateRegisteredWorkerInput {
  displayName?: string
  baseUrl?: string
}

export interface RegistryServiceOptions {
  masterKeyHex: string
  /**
   * Factory used only by tests to swap in an in-memory WorkerClient. When
   * omitted, `registerWorker` constructs a real fetch-backed client.
   */
  buildClient?: (baseUrl: string, apiToken: string) => Pick<WorkerClient, 'info'>
  /**
   * Provenance column written to the `added_by` field. Defaults to `manual`
   * (the classic `POST /register` path); the launch-local route passes
   * `launch-local` so audit logs / UI filters can distinguish the two.
   */
  addedBy?: RegisteredWorkerOrigin
}

/**
 * Validate a candidate worker by calling its `/info` endpoint, then persist
 * a registry row + audit event. Bubbles `WorkerClientAuthError`,
 * `WorkerClientNetworkError`, and `WorkerClientInvalidResponseError` from
 * the client through untouched so routes.ts can map them 1:1.
 */
export async function registerWorker(
  input: RegisterWorkerInput,
  options: RegistryServiceOptions,
): Promise<RegisteredWorker> {
  const baseUrl = input.baseUrl.replace(/\/+$/, '')
  const client = options.buildClient
    ? options.buildClient(baseUrl, input.apiToken)
    : new WorkerClient({ baseUrl, apiToken: input.apiToken })

  const info = await client.info()

  const db = getFleetDb()
  const existing = db
    .select({ id: registeredWorkers.id })
    .from(registeredWorkers)
    .where(eq(registeredWorkers.id, info.workerId))
    .get()
  if (existing)
    throw new RegistryConflictError(info.workerId)

  const sealed = encryptToken(input.apiToken, options.masterKeyHex)
  const now = new Date().toISOString()

  const row: RegisteredWorker = {
    id: info.workerId,
    baseUrl,
    displayName: input.displayName,
    apiTokenEnc: sealed.ciphertext,
    nonce: sealed.nonce,
    authTag: sealed.authTag,
    addedAt: now,
    addedBy: options.addedBy ?? 'manual',
    lastSeenAt: now,
    lastSeenState: 'online',
    lastConfigVersion: info.configVersion,
  }

  db.insert(registeredWorkers).values(row).run()

  db.insert(auditEvents).values({
    actor: 'dashboard',
    action: 'worker.registered',
    workerId: info.workerId,
    detail: { baseUrl, displayName: input.displayName },
  }).run()

  return row
}

/**
 * Internal lookup that returns the full row including the encrypted bearer
 * token. Used by the proxy + token-rotate paths where the manager has to
 * reach the worker. HTTP routes should call `getWorkerById` instead so the
 * ciphertext columns never leak off the backend.
 */
export function getById(id: string): RegisteredWorker | null {
  const row = getFleetDb()
    .select()
    .from(registeredWorkers)
    .where(eq(registeredWorkers.id, id))
    .get()
  if (!row)
    return null
  return {
    ...row,
    lastSeenAt: row.lastSeenAt ?? undefined,
    lastSeenState: row.lastSeenState ?? undefined,
    lastConfigVersion: row.lastConfigVersion ?? undefined,
  }
}

function toSafe(row: RegisteredWorker): SafeRegisteredWorker {
  const { apiTokenEnc: _t, nonce: _n, authTag: _a, ...safe } = row
  return safe
}

/**
 * Return every registry row with the at-rest ciphertext columns stripped.
 * Sorted by `addedAt` descending so the dashboard shows the most recent
 * registrations first.
 */
export function listWorkers(): SafeRegisteredWorker[] {
  const rows = getFleetDb()
    .select()
    .from(registeredWorkers)
    .all()
  return rows
    .map(row => toSafe({
      ...row,
      lastSeenAt: row.lastSeenAt ?? undefined,
      lastSeenState: row.lastSeenState ?? undefined,
      lastConfigVersion: row.lastConfigVersion ?? undefined,
    }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

export function getWorkerById(id: string): SafeRegisteredWorker | null {
  const row = getById(id)
  return row ? toSafe(row) : null
}

/**
 * Count of rows in `registered_workers`. Used by the PLAN-010 quota check
 * ahead of `/register` and `/launch-local`. SQLite returns `.length` on
 * `all()` at negligible cost at fleet scales.
 */
export function countWorkers(): number {
  return getFleetDb()
    .select({ id: registeredWorkers.id })
    .from(registeredWorkers)
    .all()
    .length
}

/**
 * Patch `displayName` and/or `baseUrl`. The encrypted token is intentionally
 * out of scope — rotation goes through the dedicated `/rotate-token` route.
 * A changed `baseUrl` is NOT re-verified via `/info` here; PLAN-004 3.3's
 * poller will flip `lastSeenState` to `offline` / `auth-failed` if the new
 * URL is wrong, which matches the "registry is a pointer store" invariant.
 */
export function updateWorker(
  id: string,
  patch: UpdateRegisteredWorkerInput,
): SafeRegisteredWorker {
  const db = getFleetDb()
  const existing = getById(id)
  if (!existing)
    throw new RegistryNotFoundError(id)

  const next: Partial<Pick<RegisteredWorker, 'displayName' | 'baseUrl'>> = {}
  if (patch.displayName !== undefined)
    next.displayName = patch.displayName
  if (patch.baseUrl !== undefined)
    next.baseUrl = patch.baseUrl.replace(/\/+$/, '')
  if (Object.keys(next).length === 0)
    return toSafe(existing)

  db.update(registeredWorkers)
    .set(next)
    .where(eq(registeredWorkers.id, id))
    .run()

  db.insert(auditEvents).values({
    actor: 'dashboard',
    action: 'worker.updated',
    workerId: id,
    detail: next,
  }).run()

  return toSafe({ ...existing, ...next })
}

/**
 * Remove the registry row + emit an audit event. The worker container itself
 * is untouched — unregister is purely a manager-side pointer delete, per
 * PLAN-004 §Manager registry API.
 */
export function deleteWorker(id: string): void {
  const db = getFleetDb()
  const existing = getById(id)
  if (!existing)
    throw new RegistryNotFoundError(id)

  db.delete(registeredWorkers)
    .where(eq(registeredWorkers.id, id))
    .run()

  db.insert(auditEvents).values({
    actor: 'dashboard',
    action: 'worker.unregistered',
    workerId: id,
    detail: { baseUrl: existing.baseUrl, displayName: existing.displayName },
  }).run()
}

/**
 * Append an audit row. Used by the proxy route to log non-GET proxied calls
 * without flooding the audit log on polling GETs.
 */
export function recordAuditEvent(entry: {
  actor: string
  action: string
  workerId?: string | null
  detail?: Record<string, unknown>
}): void {
  getFleetDb().insert(auditEvents).values({
    actor: entry.actor,
    action: entry.action,
    workerId: entry.workerId ?? null,
    detail: entry.detail,
  }).run()
}

/**
 * Decrypt the at-rest bearer token for a registered worker. Lives here (not
 * in `crypto.ts`) so callers never need to touch ciphertext/nonce/authTag
 * directly. 3.2's proxy and 3.3's poller both consume this.
 */
export function decryptTokenFor(row: RegisteredWorker, masterKeyHex: string): string {
  return decryptToken(row.apiTokenEnc, row.nonce, row.authTag, masterKeyHex)
}

export interface RotateRegisteredTokenOptions {
  masterKeyHex: string
  /**
   * Test seam matching `RegistryServiceOptions.buildClient` — produces a
   * `WorkerClient` (or any object with a `rotateToken()` method) bound to the
   * registered worker's `baseUrl` + current bearer.
   */
  buildClient?: (baseUrl: string, apiToken: string) => Pick<WorkerClient, 'rotateToken'>
}

export interface RotateRegisteredTokenResult {
  /** ISO-8601 timestamp the rotation completed (server clock). */
  rotatedAt: string
  /** Last four characters of the new token — UI hint, NEVER the full plaintext. */
  lastFourOfNewToken: string
}

/**
 * Manager-side rotate-token wrapper: instructs the worker to mint a new
 * bearer, immediately re-encrypts the returned plaintext under the manager
 * master key, and updates `registered_workers.{apiTokenEnc,nonce,authTag}`
 * + emits an audit row. The plaintext token is intentionally NOT returned to
 * the caller — UI-triggered rotation is for keeping the registry's stored
 * token in sync with the worker's. Operators who want the plaintext (e.g.
 * for scripted re-provisioning) call the worker directly via the proxy
 * route, which still returns it.
 *
 * Throws `RegistryNotFoundError` for unknown ids and bubbles
 * `WorkerClientAuthError` / `WorkerClientNetworkError` /
 * `WorkerClientInvalidResponseError` from the underlying HTTP call so the
 * route layer can map them 1:1 to status codes.
 */
export async function rotateRegisteredWorkerToken(
  id: string,
  options: RotateRegisteredTokenOptions,
): Promise<RotateRegisteredTokenResult> {
  const row = getById(id)
  if (!row)
    throw new RegistryNotFoundError(id)

  const currentToken = decryptTokenFor(row, options.masterKeyHex)
  const client = options.buildClient
    ? options.buildClient(row.baseUrl, currentToken)
    : new WorkerClient({ baseUrl: row.baseUrl, apiToken: currentToken })

  const { newToken } = await client.rotateToken()
  const sealed = encryptToken(newToken, options.masterKeyHex)
  const rotatedAt = new Date().toISOString()
  const lastFourOfNewToken = newToken.slice(-4)

  const db = getFleetDb()
  db.update(registeredWorkers)
    .set({
      apiTokenEnc: sealed.ciphertext,
      nonce: sealed.nonce,
      authTag: sealed.authTag,
    })
    .where(eq(registeredWorkers.id, id))
    .run()

  db.insert(auditEvents).values({
    actor: 'dashboard',
    action: 'worker.token-rotated',
    workerId: id,
    detail: { rotatedAt, lastFourOfNewToken },
  }).run()

  return { rotatedAt, lastFourOfNewToken }
}
