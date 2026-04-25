import {
  ConfigVersionConflictError,
  getSecretsVault,
  InvalidConfigError,
  mirrorConfigToYaml,
  putConfig,
  readConfig,
} from '@aiworker/core'
import consola from 'consola'

import { loadWorkerContext } from '../context'

/**
 * `aiw config show` — print the stored (redacted) worker config as JSON.
 */
export async function runConfigShow(): Promise<number> {
  await loadWorkerContext({ silent: true })
  const { getWorkerDb } = await import('@aiworker/storage-sqlite/worker')
  const stored = await readConfig(getWorkerDb())
  console.log(JSON.stringify({ version: stored.version, config: stored.config }, null, 2))
  return 0
}

export interface ConfigSetOptions {
  /** JSON string representing the next config. */
  json: string
  /** Optional `If-Match: <version>` for optimistic concurrency. */
  ifMatch?: number
}

/**
 * `aiw config set` — replace the stored config with the supplied JSON. The
 * payload shape is the same the dashboard PUT /api/worker/config accepts.
 * Returns 0 on success, 2 on validation failure, 3 on version conflict.
 */
export async function runConfigSet(options: ConfigSetOptions): Promise<number> {
  const ctx = await loadWorkerContext({ silent: true })
  let parsed: unknown
  try {
    parsed = JSON.parse(options.json)
  }
  catch (err) {
    consola.error(`[aiw config set] invalid JSON: ${String(err)}`)
    return 2
  }

  const { getWorkerDb } = await import('@aiworker/storage-sqlite/worker')
  const db = getWorkerDb()
  const vault = getSecretsVault()

  try {
    const result = await putConfig(db, vault, parsed, options.ifMatch === undefined ? {} : { ifMatchVersion: options.ifMatch })
    await mirrorConfigToYaml(ctx.workerId, result.config, result.version)
    consola.success(`[aiw config set] stored config v${result.version}`)
    return 0
  }
  catch (err) {
    if (err instanceof InvalidConfigError) {
      consola.error(`[aiw config set] invalid config: ${JSON.stringify(err.issues, null, 2)}`)
      return 2
    }
    if (err instanceof ConfigVersionConflictError) {
      consola.error(`[aiw config set] version conflict: expected ${err.expected}, stored is ${err.actual}`)
      return 3
    }
    throw err
  }
}
