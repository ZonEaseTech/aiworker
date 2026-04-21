import type { RegisteredWorker } from '@aiworker/shared'

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

export interface RegisterWorkerInput {
  baseUrl: string
  apiToken: string
  displayName: string
}

export interface RegistryServiceOptions {
  masterKeyHex: string
  /**
   * Factory used only by tests to swap in an in-memory WorkerClient. When
   * omitted, `registerWorker` constructs a real fetch-backed client.
   */
  buildClient?: (baseUrl: string, apiToken: string) => Pick<WorkerClient, 'info'>
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
    addedBy: 'manual',
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

/**
 * Decrypt the at-rest bearer token for a registered worker. Lives here (not
 * in `crypto.ts`) so callers never need to touch ciphertext/nonce/authTag
 * directly. 3.2's poller and 3.3's proxy both consume this.
 */
export function decryptTokenFor(row: RegisteredWorker, masterKeyHex: string): string {
  return decryptToken(row.apiTokenEnc, row.nonce, row.authTag, masterKeyHex)
}
