import type { WorkerConfig } from '@aiworker/shared'
import type { WorkerDatabase } from '@aiworker/storage-sqlite/worker'
import { workerConfig as workerConfigTable } from '@aiworker/storage-sqlite/worker'

import { eq } from 'drizzle-orm'
import { migrateLegacyExecutor } from '../executor/default-profiles'
import { DEFAULT_EMPTY_CONFIG } from './default-config'

export interface StoredConfig {
  config: WorkerConfig
  version: number
}

/**
 * Read the singleton `worker_config` row. If absent, seed with
 * DEFAULT_EMPTY_CONFIG so the worker can boot without a dashboard-pushed
 * config — the point is a no-op that won't crash at boot. Secrets in the
 * stored form are always redacted (empty strings); hydration is the caller's
 * responsibility via `enumerateSecretPaths` + `hydrateSecrets`.
 *
 * Reader-side migration (FEAT-014): if `executor` is still in the legacy
 * flat `{ type, ...flat }` shape, materialise it into the three-tier
 * `{ engine, variant, overrides }` form before handing back. We do NOT
 * write the migrated form back here — the next `PUT /config` from the
 * dashboard naturally persists the new shape, which avoids racing the
 * worker_config version cursor with a boot-time write.
 */
export async function loadOrSeedConfig(db: WorkerDatabase): Promise<StoredConfig> {
  const existing = await db.select().from(workerConfigTable).where(eq(workerConfigTable.pk, 'default')).get()
  if (existing) {
    const config = applyExecutorMigration(existing.configJson)
    return { config, version: existing.version }
  }

  const now = new Date().toISOString()
  await db.insert(workerConfigTable).values({
    pk: 'default',
    configJson: DEFAULT_EMPTY_CONFIG,
    version: 1,
    updatedAt: now,
    updatedBy: 'bootstrap',
  }).run()

  return { config: DEFAULT_EMPTY_CONFIG, version: 1 }
}

function applyExecutorMigration(stored: WorkerConfig): WorkerConfig {
  const executor = stored.executor as unknown
  if (executor && typeof executor === 'object' && 'engine' in executor)
    return stored
  return { ...stored, executor: migrateLegacyExecutor(executor) }
}
