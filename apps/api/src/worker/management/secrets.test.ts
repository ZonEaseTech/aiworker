import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'bun:test'

import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '../../db/worker'
import { AppError } from '../../shared'
import { SecretsVault } from '../secrets/vault'
import { deleteSecret, listSecrets, putSecret } from './secrets'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

describe('worker management secrets', () => {
  let vault: SecretsVault

  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-mgmt-secrets-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations('./drizzle/worker')
    vault = new SecretsVault(MASTER_KEY, getWorkerDb())
  })

  it('listSecrets returns the vault keys', async () => {
    await vault.put('a', '1')
    await vault.put('b', '2')
    expect((await listSecrets(vault)).sort()).toEqual(['a', 'b'])
  })

  it('putSecret writes and overwrites', async () => {
    await putSecret(vault, 'k', 'first')
    await putSecret(vault, 'k', 'second')
    expect(await vault.get('k')).toBe('second')
  })

  it('putSecret rejects empty values', async () => {
    await expect(putSecret(vault, 'k', '')).rejects.toBeInstanceOf(AppError)
  })

  it('putSecret rejects empty keys', async () => {
    await expect(putSecret(vault, '', 'v')).rejects.toBeInstanceOf(AppError)
  })

  it('deleteSecret removes an existing key', async () => {
    await vault.put('k', 'v')
    await deleteSecret(vault, 'k')
    expect(await vault.get('k')).toBeNull()
  })

  it('deleteSecret throws AppError.notFound for unknown key', async () => {
    await expect(deleteSecret(vault, 'absent')).rejects.toMatchObject({
      status: 404,
    })
  })
})
