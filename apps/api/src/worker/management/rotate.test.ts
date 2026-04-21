import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWorkerApiToken } from '@aiworker/shared'
import { beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '../../db/worker'
import { workerIdentity } from '../../db/worker/schema'
import { loadOrMintIdentity } from '../bootstrap/identity'
import { resetSecretsVaultForTests } from '../secrets'
import { SecretsVault } from '../secrets/vault'
import { handleTokenRotate } from './rotate'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

async function bootstrap() {
  closeWorkerDb()
  resetSecretsVaultForTests()
  const dir = mkdtempSync(join(tmpdir(), 'aiworker-mgmt-rotate-'))
  initWorkerDb(join(dir, 'worker.db'))
  runWorkerMigrations('./drizzle/worker')
  process.env.AIWORKER_MASTER_KEY = MASTER_KEY
  const db = getWorkerDb()
  const vault = new SecretsVault(MASTER_KEY, db)
  const identity = await loadOrMintIdentity(db, vault)
  return { db, vault, identity, state: { tokenPlaintext: identity.token } }
}

describe('handleTokenRotate', () => {
  beforeEach(() => {
    // bootstrap() above owns per-test DB + vault
  })

  it('mints a new worker API token and updates in-memory state', async () => {
    const { db, vault, state, identity } = await bootstrap()
    const before = identity.token
    const { newToken } = await handleTokenRotate(db, vault, state)
    expect(isWorkerApiToken(newToken)).toBe(true)
    expect(newToken).not.toBe(before)
    expect(state.tokenPlaintext).toBe(newToken)
  })

  it('persists the new token encrypted in worker_identity and stamps rotatedAt', async () => {
    const { db, vault, state } = await bootstrap()
    const { newToken } = await handleTokenRotate(db, vault, state)

    const row = await db.select().from(workerIdentity).where(eq(workerIdentity.pk, 'default')).get()
    expect(row).toBeDefined()
    expect(row?.rotatedAt).toBeTruthy()
    const decrypted = vault.decryptString(row!.apiTokenEnc, row!.nonce, row!.authTag)
    expect(decrypted).toBe(newToken)
  })

  it('produces a distinct token on each call', async () => {
    const { db, vault, state } = await bootstrap()
    const first = await handleTokenRotate(db, vault, state)
    const second = await handleTokenRotate(db, vault, state)
    expect(first.newToken).not.toBe(second.newToken)
    expect(state.tokenPlaintext).toBe(second.newToken)
  })
})
