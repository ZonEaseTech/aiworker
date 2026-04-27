import type { WorkerApiToken } from '@zonease/aiworker-shared'
import type { WorkerDatabase } from '@zonease/aiworker-storage-sqlite/worker'
import type { SecretsVault } from '../secrets/vault'
import { workerIdentity } from '@zonease/aiworker-storage-sqlite/worker'

import { eq } from 'drizzle-orm'
import { mintApiToken } from '../bootstrap/identity'

export interface RotateTokenCurrentState {
  /**
   * Mutable reference to the worker's current plaintext token. Updated in
   * place so the bearer-auth middleware sees the new value on the next
   * request.
   */
  tokenPlaintext: string
}

export interface RotateTokenResponse {
  newToken: WorkerApiToken
}

/**
 * Mint a new API token, encrypt it under the master key, persist it in
 * `worker_identity`, and swap the in-memory `tokenPlaintext` so subsequent
 * requests authenticate with the new token. The previous token is invalid
 * immediately — a manager must save the new token before issuing its next
 * call.
 */
export async function handleTokenRotate(
  db: WorkerDatabase,
  vault: SecretsVault,
  currentState: RotateTokenCurrentState,
): Promise<RotateTokenResponse> {
  const newToken = mintApiToken()
  const { ciphertext, nonce, authTag } = vault.encryptString(newToken)
  const now = new Date().toISOString()

  await db.update(workerIdentity)
    .set({ apiTokenEnc: ciphertext, nonce, authTag, rotatedAt: now })
    .where(eq(workerIdentity.pk, 'default'))
    .run()

  currentState.tokenPlaintext = newToken
  return { newToken }
}
