import type { WorkerConfig } from '@aiworker/shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'bun:test'

import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '../../db/worker'
import { loadOrSeedConfig } from '../bootstrap/config'
import { SecretsVault } from '../secrets/vault'
import { ConfigVersionConflictError, InvalidConfigError, putConfig, readConfig } from './config'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

function baseConfig(): WorkerConfig {
  return {
    brains: [
      {
        id: 'cloud',
        type: 'cloud-gateway',
        priority: 5,
        readOnly: false,
        config: { url: 'https://cloud.example.com', token: 'sk-live-first' },
      },
    ],
    brainWriteTarget: 'cloud',
    brainRetrieval: 'first-match',
    executor: {
      type: 'http',
      baseUrl: 'http://localhost:4000',
      apiKey: 'key-one',
      model: 'gpt-4o-mini',
      timeoutMs: 30_000,
    },
    channels: [
      {
        channel: 'telegram',
        enabled: true,
        credentials: { channel: 'telegram', botToken: 'tele-bot-1' },
      },
    ],
    evolution: { enabled: false, observationRetentionDays: 7 },
  }
}

describe('worker management config', () => {
  beforeEach(async () => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-mgmt-config-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations('./drizzle/worker')
    await loadOrSeedConfig(getWorkerDb())
  })

  it('readConfig returns the seeded default at version 1', async () => {
    const stored = await readConfig(getWorkerDb())
    expect(stored.version).toBe(1)
    expect(stored.config.brains).toEqual([])
  })

  it('putConfig bumps version, redacts secrets, and persists them to the vault', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    const next = baseConfig()
    const result = await putConfig(getWorkerDb(), vault, next)

    expect(result.version).toBe(2)
    // Redacted in returned + stored form
    expect(result.config.executor.type).toBe('http')
    if (result.config.executor.type === 'http')
      expect(result.config.executor.apiKey).toBe('')
    expect(result.config.brains[0]?.type).toBe('cloud-gateway')
    if (result.config.brains[0]?.type === 'cloud-gateway')
      expect(result.config.brains[0].config.token).toBe('')

    // Vault holds the real values
    expect(await vault.get('executor.apiKey')).toBe('key-one')
    expect(await vault.get('brains.0.config.token')).toBe('sk-live-first')
    expect(await vault.get('channels.telegram.credentials.botToken')).toBe('tele-bot-1')

    // Next readConfig sees the bumped version + redacted config
    const rereadStored = await readConfig(getWorkerDb())
    expect(rereadStored.version).toBe(2)
  })

  it('throws ConfigVersionConflictError on If-Match mismatch', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    await expect(
      putConfig(getWorkerDb(), vault, baseConfig(), { ifMatchVersion: 999 }),
    ).rejects.toBeInstanceOf(ConfigVersionConflictError)
  })

  it('throws InvalidConfigError on malformed body', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    await expect(
      putConfig(getWorkerDb(), vault, { brains: 'nope' }),
    ).rejects.toBeInstanceOf(InvalidConfigError)
  })

  it('treats empty secret strings as unchanged and removes dropped secret paths', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())

    const first = baseConfig()
    await putConfig(getWorkerDb(), vault, first)
    expect(await vault.get('executor.apiKey')).toBe('key-one')

    // Second PUT: round-trips the redacted form (apiKey='') — must keep the stored secret.
    const second = baseConfig()
    second.executor = {
      type: 'http',
      baseUrl: 'http://localhost:4000',
      apiKey: '',
      model: 'gpt-4o-mini',
      timeoutMs: 30_000,
    }
    const result = await putConfig(getWorkerDb(), vault, second)
    expect(result.version).toBe(3)
    expect(await vault.get('executor.apiKey')).toBe('key-one')

    // Third PUT: drop the channel entirely — its vault entry must be removed.
    const third = baseConfig()
    third.channels = []
    await putConfig(getWorkerDb(), vault, third)
    expect(await vault.get('channels.telegram.credentials.botToken')).toBeNull()
  })

  it('validates channel credentials/channel field match', async () => {
    const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
    const bad = baseConfig() as WorkerConfig
    bad.channels = [{
      channel: 'line',
      enabled: true,
      credentials: { channel: 'telegram', botToken: 'x' },
    }] as unknown as WorkerConfig['channels']
    await expect(putConfig(getWorkerDb(), vault, bad)).rejects.toBeInstanceOf(InvalidConfigError)
  })
})
