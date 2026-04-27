import type { WorkerConfig } from '@zonease/aiworker-shared'
import type { WorkerDatabase } from '@zonease/aiworker-storage-sqlite/worker'
import type { z } from 'zod'
import type { SecretsVault } from '../secrets/vault'
import { writeFile } from 'node:fs/promises'
import { resolveConfigYamlPath } from '@zonease/aiworker-fs-layout'
import { workerConfig as workerConfigTable } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'
import { eq } from 'drizzle-orm'
import { stringify as stringifyYaml } from 'yaml'
import { enumerateSecretPaths, redactSecrets } from '../config/secret-paths'
import { workerConfigSchema } from './config-schema'

/** Current stored config alongside its monotonic version. */
export interface StoredWorkerConfig {
  config: WorkerConfig
  version: number
}

/** Raised when the inbound config fails zod validation. */
export class InvalidConfigError extends Error {
  constructor(
    readonly issues: z.ZodIssue[],
    message = 'invalid worker config',
  ) {
    super(message)
    this.name = 'InvalidConfigError'
  }
}

/** Raised when `If-Match: <version>` no longer matches the stored version. */
export class ConfigVersionConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`config version ${expected} does not match current version ${actual}`)
    this.name = 'ConfigVersionConflictError'
  }
}

/** Read the redacted singleton stored in `worker_config`. */
export async function readConfig(db: WorkerDatabase): Promise<StoredWorkerConfig> {
  const row = await db
    .select()
    .from(workerConfigTable)
    .where(eq(workerConfigTable.pk, 'default'))
    .get()
  if (!row)
    throw new Error('worker_config row missing — bootstrap did not run')
  return { config: row.configJson, version: row.version }
}

export interface PutConfigOptions {
  /** Optional optimistic-concurrency guard. */
  ifMatchVersion?: number
}

/**
 * Validate, split secrets, persist a new config. Steps:
 *
 *   1. Zod-validate → `InvalidConfigError` on mismatch.
 *   2. Compare `ifMatchVersion` (if provided) → `ConfigVersionConflictError`.
 *   3. Move every non-empty secret in `nextConfig` to the vault; remove any
 *      vault entries whose path is no longer present in the new config.
 *   4. Persist the redacted form, bump the version.
 *
 * Returns the redacted config + new version. Secrets from the previous config
 * that are re-submitted as empty strings are preserved in the vault (the
 * redacted view that round-trips through the dashboard must not wipe secrets).
 */
export async function putConfig(
  db: WorkerDatabase,
  vault: SecretsVault,
  nextConfig: unknown,
  options: PutConfigOptions = {},
): Promise<StoredWorkerConfig> {
  const parsed = workerConfigSchema.safeParse(nextConfig)
  if (!parsed.success)
    throw new InvalidConfigError(parsed.error.issues)

  const current = await readConfig(db)
  if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== current.version)
    throw new ConfigVersionConflictError(options.ifMatchVersion, current.version)

  const nextConfigTyped = parsed.data as WorkerConfig
  const prevPaths = new Set(enumerateSecretPaths(current.config).map(p => p.path))
  const nextPaths = enumerateSecretPaths(nextConfigTyped)
  const nextPathSet = new Set(nextPaths.map(p => p.path))

  // An empty string means "placeholder, do not rewrite" — the redacted form
  // round-trips through the dashboard and must not wipe stored secrets.
  for (const { path, value } of nextPaths) {
    if (value.length > 0)
      await vault.put(path, value)
  }

  for (const path of prevPaths) {
    if (!nextPathSet.has(path))
      await vault.remove(path)
  }

  const redacted = redactSecrets(nextConfigTyped)
  const newVersion = current.version + 1
  const now = new Date().toISOString()
  await db
    .update(workerConfigTable)
    .set({ configJson: redacted, version: newVersion, updatedAt: now, updatedBy: 'api' })
    .where(eq(workerConfigTable.pk, 'default'))
    .run()

  return { config: redacted, version: newVersion }
}

/**
 * Write the redacted worker config as YAML to `<workerHome>/config.yaml`.
 * Advisory mirror — DB stays authoritative; this file is for operator
 * convenience (`cat config.yaml`, `aim config edit`). Best-effort: failures
 * are logged but do not bubble up.
 */
export async function mirrorConfigToYaml(workerId: string, redacted: WorkerConfig, version: number): Promise<void> {
  const path = resolveConfigYamlPath(workerId)
  const body = stringifyYaml({ version, config: redacted })
  try {
    await writeFile(path, body, { encoding: 'utf8' })
  }
  catch (err) {
    consola.warn(`[mirror-config] failed to write ${path}: ${String(err)}`)
  }
}

export interface ApplyConfigUpdateArgs {
  db: WorkerDatabase
  vault: SecretsVault
  /** Raw payload from the operator (HTTP body / gateway request param). */
  raw: unknown
  /** Optimistic-lock guard. Omit to skip the check. */
  ifMatchVersion?: number
  /** Used to derive the on-disk YAML mirror path. */
  workerId: string
  /**
   * Hot-reload callback. Errors here downgrade `runtimeReload` to `'failed'`
   * but do NOT roll back the persisted config — callers report the field so
   * the operator can retry via `POST /reload`.
   */
  reloadRuntime: (next: WorkerConfig, version: number) => Promise<void>
}

export interface ApplyConfigUpdateResult extends StoredWorkerConfig {
  runtimeReload: 'ok' | 'failed'
}

/**
 * Single source of truth for "operator updated worker config". Drives both
 * `PUT /api/worker/config` and gateway `config.put`: validate + persist via
 * `putConfig`, mirror to YAML, then attempt hot-reload.
 *
 * Validation / version errors (`InvalidConfigError`, `ConfigVersionConflictError`)
 * propagate so the caller can map them to the right HTTP status / wire code.
 */
export async function applyConfigUpdate(args: ApplyConfigUpdateArgs): Promise<ApplyConfigUpdateResult> {
  const stored = await putConfig(
    args.db,
    args.vault,
    args.raw,
    args.ifMatchVersion === undefined ? {} : { ifMatchVersion: args.ifMatchVersion },
  )
  await mirrorConfigToYaml(args.workerId, stored.config, stored.version)
  let runtimeReload: 'ok' | 'failed' = 'ok'
  try {
    await args.reloadRuntime(stored.config, stored.version)
  }
  catch (err) {
    runtimeReload = 'failed'
    consola.error('[applyConfigUpdate] runtime reload failed', err)
  }
  return { ...stored, runtimeReload }
}
