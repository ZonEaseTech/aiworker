import type { WorkerApiToken } from '@aiworker/shared'
import type { Buffer } from 'node:buffer'
import type { WorkerDatabase } from '../../db/worker'
import type { SecretsVault } from '../secrets/vault'
import { randomBytes } from 'node:crypto'
import { isWorkerApiToken, WORKER_API_TOKEN_PREFIX, WORKER_ID_PATTERN } from '@aiworker/shared'
import { eq } from 'drizzle-orm'

import { workerIdentity } from '../../db/worker/schema'
import { mintWorkerId as sharedMintWorkerId } from '../../shared/lib/ids'

export interface BootstrapOptions {
  forceId?: string
  forceToken?: string
}

export interface IdentityLoadResult {
  workerId: string
  token: WorkerApiToken
  justMinted: boolean
}

/** Re-export from `shared/lib/ids` — kept here so the bootstrap module is the single source of truth for identity minting. */
export const mintWorkerId = sharedMintWorkerId

/**
 * Mint a fresh worker API token: 32 random bytes base64url-encoded with the
 * `wtk_` prefix so it satisfies `isWorkerApiToken` (see PLAN-004 §Auth model).
 */
export function mintApiToken(): WorkerApiToken {
  const raw = randomBytes(32)
  const token = `${WORKER_API_TOKEN_PREFIX}${toBase64Url(raw)}`
  if (!isWorkerApiToken(token))
    throw new Error('mintApiToken: generated token failed isWorkerApiToken check')
  return token
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Read the singleton `worker_identity` row; if absent, mint (or accept the
 * force-* overrides), encrypt the token under the master key, insert, and
 * return `{ justMinted: true }`. On existing, decrypt and return
 * `{ justMinted: false }`.
 */
export async function loadOrMintIdentity(
  db: WorkerDatabase,
  vault: SecretsVault,
  options: BootstrapOptions = {},
): Promise<IdentityLoadResult> {
  const existing = await db.select().from(workerIdentity).where(eq(workerIdentity.pk, 'default')).get()
  if (existing) {
    const plaintext = vault.decryptString(existing.apiTokenEnc, existing.nonce, existing.authTag)
    if (!isWorkerApiToken(plaintext))
      throw new Error('loadOrMintIdentity: decrypted API token failed isWorkerApiToken check')
    return { workerId: existing.workerId, token: plaintext, justMinted: false }
  }

  const workerId = options.forceId ?? mintWorkerId()
  if (!WORKER_ID_PATTERN.test(workerId))
    throw new Error(`loadOrMintIdentity: forceId ${workerId} does not match WORKER_ID_PATTERN`)

  const rawToken = options.forceToken ?? mintApiToken()
  if (!isWorkerApiToken(rawToken))
    throw new Error('loadOrMintIdentity: forceToken does not match WORKER_API_TOKEN_PATTERN')
  const token = rawToken as WorkerApiToken

  const { ciphertext, nonce, authTag } = vault.encryptString(token)
  const now = new Date().toISOString()

  await db.insert(workerIdentity).values({
    pk: 'default',
    workerId,
    apiTokenEnc: ciphertext,
    nonce,
    authTag,
    bootstrapShownAt: now,
    createdAt: now,
  }).run()

  return { workerId, token, justMinted: true }
}
