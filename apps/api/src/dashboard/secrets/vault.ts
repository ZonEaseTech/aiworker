import type { FleetDatabase } from '../../db/fleet'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// PLAN-004 2.1: `SecretsVault` moves from the dashboard-owned fleet.db over to
// the worker-owned worker.db. Subtask 1.3 removed the `worker_secrets` table
// from fleet.db, so the DB-backed methods below are stubs that throw at
// runtime until 2.1 relocates the implementation. The constructor + AES-GCM
// primitives remain to keep downstream imports (`getSecretsVault`) and
// (currently skipped) vault tests compiling without a schema dependency.

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12
const KEY_BYTES = 32

export class SecretsVault {
  private readonly key: Buffer

  constructor(masterKeyHex: string, private readonly _db: FleetDatabase) {
    if (!/^[0-9a-f]{64}$/.test(masterKeyHex))
      throw new Error('SecretsVault: AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)')
    this.key = Buffer.from(masterKeyHex, 'hex')
    if (this.key.length !== KEY_BYTES)
      throw new Error('SecretsVault: decoded master key length is not 32 bytes')
  }

  async put(_workerId: string, _key: string, _value: string): Promise<void> {
    throw new Error('SecretsVault.put: pending PLAN-004 2.1 move to worker.db')
  }

  async get(_workerId: string, _key: string): Promise<string | null> {
    throw new Error('SecretsVault.get: pending PLAN-004 2.1 move to worker.db')
  }

  async list(_workerId: string): Promise<string[]> {
    throw new Error('SecretsVault.list: pending PLAN-004 2.1 move to worker.db')
  }

  async remove(_workerId: string, _key: string): Promise<void> {
    throw new Error('SecretsVault.remove: pending PLAN-004 2.1 move to worker.db')
  }

  async removeAllForWorker(_workerId: string): Promise<void> {
    throw new Error('SecretsVault.removeAllForWorker: pending PLAN-004 2.1 move to worker.db')
  }

  // Retained so 2.1 can lift the class wholesale without re-deriving the primitives.
  encrypt(plaintext: string): { ciphertext: string, nonce: string, authTag: string } {
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv(ALGO, this.key, nonce)
    const buf = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return {
      ciphertext: buf.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: authTag.toString('base64'),
    }
  }

  decrypt(ciphertext: string, nonce: string, authTag: string): string {
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(nonce, 'base64'))
    decipher.setAuthTag(Buffer.from(authTag, 'base64'))
    const buf = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ])
    return buf.toString('utf8')
  }
}
