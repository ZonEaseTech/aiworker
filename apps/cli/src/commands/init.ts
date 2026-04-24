import consola from 'consola'

import { loadWorkerContext } from '../context'

/**
 * `aiw init` — materialise worker.db, run migrations, mint identity + token
 * on first boot, seed default config, then print the bootstrap line (once)
 * and exit. Running it again on an already-initialised vault is idempotent:
 * the identity stays the same, no token is reprinted.
 */
export async function runInit(): Promise<void> {
  const ctx = await loadWorkerContext()
  consola.success(`[aiw init] worker ${ctx.workerId} ready (config v${ctx.configVersion})`)
}
