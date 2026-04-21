import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'bun:test'

import { closeFleetDb, getFleetDb, initFleetDb, runFleetMigrations } from '../../db/fleet'
import { SecretsVault } from './vault'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

// PLAN-004 2.1: the DB-backed vault moves to worker-side. Subtask 1.3 removed
// the `workers` / `worker_secrets` tables from fleet.db, so tests that round-
// trip values through those tables are skipped here and will be re-added
// against worker.db in 2.1. The surviving tests only exercise master-key
// validation and the in-memory encrypt/decrypt primitives.

describe('SecretsVault (1.3 partial — DB-backed tests skipped until PLAN-004 2.1)', () => {
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-vault-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  it('refuses a malformed master key', () => {
    expect(() => new SecretsVault('not-hex', getFleetDb())).toThrow()
    expect(() => new SecretsVault('abcdef', getFleetDb())).toThrow()
  })

  it('roundtrips through encrypt/decrypt primitives', () => {
    const vault = new SecretsVault(MASTER_KEY, getFleetDb())
    const { ciphertext, nonce, authTag } = vault.encrypt('sk-live-1234567890abcdef')
    expect(vault.decrypt(ciphertext, nonce, authTag)).toBe('sk-live-1234567890abcdef')
  })

  it('fails to decrypt with a different master key', () => {
    const vault = new SecretsVault(MASTER_KEY, getFleetDb())
    const { ciphertext, nonce, authTag } = vault.encrypt('hello')
    const otherKey = MASTER_KEY.replace(/0/g, '1').slice(0, 64).padStart(64, '0')
    const otherVault = new SecretsVault(otherKey, getFleetDb())
    expect(() => otherVault.decrypt(ciphertext, nonce, authTag)).toThrow()
  })

  // PLAN-004 2.1: restore put/get/list/remove round-trip tests against worker.db.
  it.skip('roundtrips a secret through put/get (pending 2.1)', async () => {})
  it.skip('returns null for missing keys (pending 2.1)', async () => {})
  it.skip('overwrites on repeated put (pending 2.1)', async () => {})
})
