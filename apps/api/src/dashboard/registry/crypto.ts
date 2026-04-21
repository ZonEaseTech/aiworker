import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Manager-side AES-256-GCM helpers for sealing registered workers' bearer
 * tokens at rest (fleet.db.registered_workers). See PLAN-004 §Auth model.
 *
 * This intentionally duplicates the AES-GCM shape of the worker-side
 * SecretsVault (apps/api/src/dashboard/secrets/vault.ts, being moved to
 * apps/api/src/worker/secrets/vault.ts by subtask 2.1). A few dozen LOC of
 * duplication is the correct trade against coupling the manager's pointer
 * store to worker-side code, per PLAN-004 3.1 scope notes.
 */

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12
const KEY_BYTES = 32
const MASTER_KEY_PATTERN = /^[0-9a-f]{64}$/

export interface SealedToken {
  ciphertext: string
  nonce: string
  authTag: string
}

function decodeMasterKey(masterKeyHex: string): Buffer {
  if (!MASTER_KEY_PATTERN.test(masterKeyHex))
    throw new Error('Manager AIWORKER_MASTER_KEY must be 32-byte hex')
  const key = Buffer.from(masterKeyHex, 'hex')
  if (key.length !== KEY_BYTES)
    throw new Error('Manager AIWORKER_MASTER_KEY must be 32-byte hex')
  return key
}

export function encryptToken(token: string, masterKeyHex: string): SealedToken {
  const key = decodeMasterKey(masterKeyHex)
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce)
  const buf = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: buf.toString('base64'),
    nonce: nonce.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decryptToken(
  ciphertext: string,
  nonce: string,
  authTag: string,
  masterKeyHex: string,
): string {
  const key = decodeMasterKey(masterKeyHex)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(nonce, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const buf = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])
  return buf.toString('utf8')
}

/**
 * Constant-time string comparison wrapper over `node:crypto.timingSafeEqual`.
 * Returns false immediately on length mismatch (no length oracle beyond the
 * bound already leaked by both strings being observable at rest).
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}
