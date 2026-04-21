import type { WorkerConfig } from '@aiworker/shared'
import type { WorkerDatabase } from '../../db/worker'
import { eq } from 'drizzle-orm'

import { workerConfig as workerConfigTable } from '../../db/worker/schema'
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
 */
export async function loadOrSeedConfig(db: WorkerDatabase): Promise<StoredConfig> {
  const existing = await db.select().from(workerConfigTable).where(eq(workerConfigTable.pk, 'default')).get()
  if (existing)
    return { config: existing.configJson, version: existing.version }

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
