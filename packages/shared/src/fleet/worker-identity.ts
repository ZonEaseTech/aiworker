/**
 * Literal prefix every worker bootstrap API token carries. See PLAN-004
 * §Auth model.
 */
export const WORKER_API_TOKEN_PREFIX = 'wtk_' as const

/**
 * Pattern a candidate worker API token must match to pass `isWorkerApiToken`:
 * `wtk_` followed by at least 32 base64url-safe characters. Per PLAN-004,
 * tokens are 32 random bytes encoded as base64url, which yields ~43 chars;
 * the lower bound is intentionally loose so future expansions remain valid.
 */
export const WORKER_API_TOKEN_PATTERN = /^wtk_[\w-]{32,}$/

/**
 * Branded plaintext form of the worker API token. The brand prevents
 * accidentally passing arbitrary strings (including the encrypted form) to
 * functions that demand a real, validated token. Use `isWorkerApiToken` to
 * narrow an `unknown` value before assigning. See PLAN-004 §Auth model.
 */
export type WorkerApiToken = string & { readonly __brand: 'WorkerApiToken' }

/**
 * Type guard that validates a value as a `WorkerApiToken` — checks both the
 * `wtk_` prefix and the base64url alphabet.
 */
export function isWorkerApiToken(value: unknown): value is WorkerApiToken {
  return typeof value === 'string' && WORKER_API_TOKEN_PATTERN.test(value)
}

/**
 * Worker-side singleton row that owns the worker's stable identity.
 * Persisted in `worker.db.worker_identity` (pk fixed to `'default'`); see
 * PLAN-004 §Data model. The `pk` column is intentionally omitted from the
 * TS type because it is a storage detail with no domain meaning.
 */
export interface WorkerIdentity {
  /** Self-minted, immutable worker id (`w_` + 12 Crockford base32). */
  workerId: string
  /** Base64 ciphertext of the active API token under the worker's master key. */
  apiTokenEnc: string
  /** Base64 AES-GCM nonce paired with `apiTokenEnc`. */
  nonce: string
  /** Base64 AES-GCM auth tag paired with `apiTokenEnc`. */
  authTag: string
  /** ISO-8601 timestamp the bootstrap token was first printed to stdout. */
  bootstrapShownAt: string
  /** ISO-8601 timestamp the identity row was created. */
  createdAt: string
  /** ISO-8601 timestamp of the most recent `/api/worker/token/rotate`. */
  rotatedAt?: string
}
