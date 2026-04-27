import { getSecretsVault, handleTokenRotate } from '@zonease/aiworker-core'
import { getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import consola from 'consola'

import { loadWorkerContext } from '../context'

/**
 * `aiw token rotate` — mint a new bearer token, persist the encrypted copy
 * to `worker_identity`, and print the plaintext token once. Since the CLI
 * operates out-of-band of the worker HTTP surface, there is no in-memory
 * token ref to mutate; the new token is simply printed and the next
 * `aiw serve` (or manager-side register) will pick it up via `loadOrMintIdentity`.
 */
export async function runTokenRotate(): Promise<number> {
  const ctx = await loadWorkerContext({ silent: true })
  const vault = getSecretsVault()
  const db = getWorkerDb()

  const currentState = { tokenPlaintext: ctx.token }
  const { newToken } = await handleTokenRotate(db, vault, currentState)

  consola.success(`[aiw token rotate] worker ${ctx.workerId} token rotated`)
  console.log(newToken)
  return 0
}
