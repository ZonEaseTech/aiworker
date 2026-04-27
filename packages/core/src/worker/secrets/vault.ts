import type { WorkerDatabase } from '@zonease/aiworker-storage-sqlite/worker'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { workerSecrets } from '@zonease/aiworker-storage-sqlite/worker'

import { eq } from 'drizzle-orm'

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12
const KEY_BYTES = 32

/**
 * Worker-scoped secrets vault backed by `worker.db.worker_secrets`. The whole
 * database is scoped to one worker, so no `workerId` column / argument is
 * needed (see PLAN-004 §Migration notes).
 */
export class SecretsVault {
  private readonly key: Buffer

  constructor(masterKeyHex: string, private readonly db: WorkerDatabase) {
    if (!/^[0-9a-f]{64}$/.test(masterKeyHex))
      throw new Error('SecretsVault: AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)')
    this.key = Buffer.from(masterKeyHex, 'hex')
    if (this.key.length !== KEY_BYTES)
      throw new Error('SecretsVault: decoded master key length is not 32 bytes')
  }

  async put(key: string, value: string): Promise<void> {
    const { ciphertext, nonce, authTag } = this.encrypt(value)
    const existing = await this.db.select({ id: workerSecrets.id })
      .from(workerSecrets)
      .where(eq(workerSecrets.key, key))
      .get()

    const now = new Date().toISOString()
    if (existing) {
      await this.db.update(workerSecrets)
        .set({ valueEnc: ciphertext, nonce, authTag, updatedAt: now })
        .where(eq(workerSecrets.id, existing.id))
        .run()
    }
    else {
      await this.db.insert(workerSecrets).values({
        key,
        valueEnc: ciphertext,
        nonce,
        authTag,
        createdAt: now,
        updatedAt: now,
      }).run()
    }
  }

  async get(key: string): Promise<string | null> {
    const row = await this.db.select()
      .from(workerSecrets)
      .where(eq(workerSecrets.key, key))
      .get()
    if (!row)
      return null
    return this.decrypt(row.valueEnc, row.nonce, row.authTag)
  }

  async list(): Promise<string[]> {
    const rows = await this.db.select({ key: workerSecrets.key })
      .from(workerSecrets)
      .all()
    return rows.map(r => r.key)
  }

  async remove(key: string): Promise<void> {
    await this.db.delete(workerSecrets)
      .where(eq(workerSecrets.key, key))
      .run()
  }

  async removeAll(): Promise<void> {
    await this.db.delete(workerSecrets).run()
  }

  /**
   * Encrypt an arbitrary string with the master key. Used by the bootstrap
   * flow to persist the API token into `worker_identity` using the same AES
   * parameters as the secrets table.
   */
  encryptString(plaintext: string): { ciphertext: string, nonce: string, authTag: string } {
    return this.encrypt(plaintext)
  }

  /** Counterpart to `encryptString` — used by the bootstrap flow on restart. */
  decryptString(ciphertext: string, nonce: string, authTag: string): string {
    return this.decrypt(ciphertext, nonce, authTag)
  }

  private encrypt(plaintext: string): { ciphertext: string, nonce: string, authTag: string } {
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

  private decrypt(ciphertext: string, nonce: string, authTag: string): string {
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(nonce, 'base64'))
    decipher.setAuthTag(Buffer.from(authTag, 'base64'))
    const buf = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ])
    return buf.toString('utf8')
  }
}
