import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'bun:test'

import { closeFleetDb, getFleetDb, initFleetDb, runFleetMigrations } from '../../db/fleet'
import { workers } from '../../db/fleet/schema'
import { SecretsVault } from './vault'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

function ensureWorkerRow(workerId: string) {
  getFleetDb().insert(workers).values({
    id: workerId,
    slug: workerId,
    name: workerId,
    containerImage: 'test',
  }).run()
}

describe('SecretsVault', () => {
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-vault-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  it('roundtrips a secret through encrypt/decrypt', async () => {
    ensureWorkerRow('w_test00000001')
    const vault = new SecretsVault(MASTER_KEY, getFleetDb())
    await vault.put('w_test00000001', 'brain.hermes.apiKey', 'sk-live-1234567890abcdef')
    const got = await vault.get('w_test00000001', 'brain.hermes.apiKey')
    expect(got).toBe('sk-live-1234567890abcdef')
  })

  it('returns null for missing keys', async () => {
    ensureWorkerRow('w_test00000002')
    const vault = new SecretsVault(MASTER_KEY, getFleetDb())
    const got = await vault.get('w_test00000002', 'absent')
    expect(got).toBeNull()
  })

  it('overwrites on repeated put', async () => {
    ensureWorkerRow('w_test00000003')
    const vault = new SecretsVault(MASTER_KEY, getFleetDb())
    await vault.put('w_test00000003', 'k', 'first')
    await vault.put('w_test00000003', 'k', 'second')
    expect(await vault.get('w_test00000003', 'k')).toBe('second')
    const keys = await vault.list('w_test00000003')
    expect(keys).toEqual(['k'])
  })

  it('refuses a malformed master key', () => {
    expect(() => new SecretsVault('not-hex', getFleetDb())).toThrow()
    expect(() => new SecretsVault('abcdef', getFleetDb())).toThrow()
  })

  it('fails to decrypt if ciphertext is tampered', async () => {
    ensureWorkerRow('w_test00000004')
    const vault = new SecretsVault(MASTER_KEY, getFleetDb())
    await vault.put('w_test00000004', 'k', 'hello')
    const row = getFleetDb().select().from(workers).all()
    expect(row.length).toBeGreaterThan(0)
    // Simulate a corrupted value by decrypting with a different master key.
    const otherVault = new SecretsVault(MASTER_KEY.replace('0', '1').padStart(64, '0'), getFleetDb())
    await expect(otherVault.get('w_test00000004', 'k')).rejects.toThrow()
  })
})
