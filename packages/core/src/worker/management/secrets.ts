import type { SecretsVault } from '../secrets/vault'
import { AppError } from '@zonease/aiworker-shared'

/**
 * Out-of-band secrets CRUD. These routes bypass `worker_config.version` — the
 * management UI is expected to use `PUT /config` for structured edits; the
 * `/secrets/*` surface is for ops-level poking (e.g. rotating a single API
 * key without touching the config shape). As a result, writes here do not
 * bump the config version.
 */

/** Enumerate vault keys without exposing plaintext values. */
export async function listSecrets(vault: SecretsVault): Promise<string[]> {
  return vault.list()
}

/** Store (or overwrite) a secret under the given key. */
export async function putSecret(
  vault: SecretsVault,
  key: string,
  value: string,
): Promise<void> {
  if (!key || !key.trim())
    throw AppError.badRequest('secret key is required')
  if (value.length === 0)
    throw AppError.badRequest('secret value must be a non-empty string')
  await vault.put(key, value)
}

/** Remove a secret. Throws `AppError.notFound` if the key does not exist. */
export async function deleteSecret(vault: SecretsVault, key: string): Promise<void> {
  if (!key || !key.trim())
    throw AppError.badRequest('secret key is required')
  const existing = await vault.get(key)
  if (existing === null)
    throw AppError.notFound(`secret '${key}' not found`)
  await vault.remove(key)
}
