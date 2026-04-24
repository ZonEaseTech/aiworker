import type { WorkerConfig } from '@aiworker/shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations, workerConfig as workerConfigTable } from '@aiworker/storage-sqlite/worker'

import { beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { loadOrSeedConfig } from './config'

describe('loadOrSeedConfig executor migration (FEAT-014)', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-bootstrap-cfg-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  function seedRawExecutor(executor: unknown): void {
    const stored: unknown = {
      brains: [],
      brainWriteTarget: '',
      brainRetrieval: 'first-match',
      executor,
      channels: [],
      evolution: { enabled: false, observationRetentionDays: 7 },
    }
    getWorkerDb().insert(workerConfigTable).values({
      pk: 'default',
      configJson: stored as WorkerConfig,
      version: 5,
      updatedAt: new Date().toISOString(),
      updatedBy: 'bootstrap',
    }).run()
  }

  it('upgrades a stored legacy http executor on read', async () => {
    seedRawExecutor({
      type: 'http',
      baseUrl: 'http://x',
      apiKey: '',
      model: 'gpt-stub',
      timeoutMs: 30_000,
    })

    const stored = await loadOrSeedConfig(getWorkerDb())
    expect(stored.config.executor.engine).toBe('http')
    expect(stored.config.executor.variant).toBe('default')
    expect(stored.config.executor.overrides).toMatchObject({
      baseUrl: 'http://x',
      model: 'gpt-stub',
      timeoutMs: 30_000,
    })
  })

  it('upgrades a stored legacy acp executor by mapping agent → variant key', async () => {
    seedRawExecutor({
      type: 'acp',
      agent: 'qwen',
      model: 'qwen3-coder',
    })

    const stored = await loadOrSeedConfig(getWorkerDb())
    expect(stored.config.executor.engine).toBe('acp')
    expect(stored.config.executor.variant).toBe('qwen')
    expect(stored.config.executor.overrides).toEqual({ model: 'qwen3-coder' })
  })

  it('does not write the migrated form back to disk on read', async () => {
    seedRawExecutor({
      type: 'http',
      baseUrl: 'http://x',
      apiKey: '',
      model: 'gpt-stub',
      timeoutMs: 30_000,
    })

    await loadOrSeedConfig(getWorkerDb())
    const row = await getWorkerDb()
      .select()
      .from(workerConfigTable)
      .where(eq(workerConfigTable.pk, 'default'))
      .get()
    // The on-disk form is intentionally still the legacy shape — the migration
    // is reader-only so PUT /config remains the single writer of new shapes.
    const onDisk = row!.configJson as unknown as { executor: Record<string, unknown> }
    expect(onDisk.executor.type).toBe('http')
    expect(onDisk.executor.engine).toBeUndefined()
  })

  it('passes through new-shape executors unchanged', async () => {
    seedRawExecutor({
      engine: 'http',
      variant: 'deepseek',
      overrides: { apiKey: 'sk-x' },
    })

    const stored = await loadOrSeedConfig(getWorkerDb())
    expect(stored.config.executor.engine).toBe('http')
    expect(stored.config.executor.variant).toBe('deepseek')
    expect(stored.config.executor.overrides).toEqual({ apiKey: 'sk-x' })
  })
})
