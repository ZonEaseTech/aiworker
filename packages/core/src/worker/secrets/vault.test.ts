import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'

import { beforeEach, describe, expect, it } from 'bun:test'
import { SecretsVault } from './vault'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

describe('SecretsVault', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-vault-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  it('roundtrips a secret through encrypt/decrypt', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    await vault.put('brain.hermes.apiKey', 'sk-live-1234567890abcdef')
    const got = await vault.get('brain.hermes.apiKey')
    expect(got).toBe('sk-live-1234567890abcdef')
  })

  it('returns null for missing keys', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    const got = await vault.get('absent')
    expect(got).toBeNull()
  })

  it('overwrites on repeated put and lists keys', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    await vault.put('k', 'first')
    await vault.put('k', 'second')
    await vault.put('other', 'value')
    expect(await vault.get('k')).toBe('second')
    const keys = (await vault.list()).sort()
    expect(keys).toEqual(['k', 'other'])
  })

  it('removes individual and all entries', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    await vault.put('a', '1')
    await vault.put('b', '2')
    await vault.remove('a')
    expect(await vault.get('a')).toBeNull()
    expect(await vault.get('b')).toBe('2')
    await vault.removeAll()
    expect(await vault.list()).toEqual([])
  })

  it('refuses a malformed master key', () => {
    expect(() => new SecretsVault('not-hex', getWorkerDb())).toThrow()
    expect(() => new SecretsVault('abcdef', getWorkerDb())).toThrow()
  })

  it('fails to decrypt under a different master key (tamper detection)', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    await vault.put('k', 'hello')
    const otherKey = MASTER_KEY.replace('0', '1').padStart(64, '0')
    const otherVault = new SecretsVault(otherKey, getWorkerDb())
    await expect(otherVault.get('k')).rejects.toThrow()
  })

  it('exposes encryptString/decryptString for bootstrap use', () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    const { ciphertext, nonce, authTag } = vault.encryptString('wtk_testtoken')
    expect(vault.decryptString(ciphertext, nonce, authTag)).toBe('wtk_testtoken')
  })
})
