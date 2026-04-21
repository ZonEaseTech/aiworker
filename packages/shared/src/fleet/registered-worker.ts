/**
 * Liveness states the manager assigns to a registered worker after polling
 * its `/api/worker/info` endpoint. See PLAN-004 §Manager registry API.
 */
export type RegisteredWorkerLivenessState
  = | 'online'
    | 'offline'
    | 'auth-failed'
    | 'config-version-mismatch'

/**
 * How a worker entered the manager's registry. `manual` covers a curl/UI
 * `POST /api/workers/register`; `launch-local` is the optional supervisor
 * convenience gated behind `MANAGER_CAN_LAUNCH`; `import` is reserved for
 * future bulk-import flows. See PLAN-004 §Manager registry API.
 */
export type RegisteredWorkerOrigin = 'manual' | 'launch-local' | 'import'

/**
 * Manager-side record of one worker the dashboard tracks. Mirrors the
 * `fleet.db.registered_workers` row described in PLAN-004 §Data model.
 *
 * Encrypted-at-rest fields (`apiTokenEnc` / `nonce` / `authTag`) are kept on
 * the type so registry CRUD stays a single shape; decryption happens at the
 * service layer when the manager needs to call the worker. The plaintext
 * token is never persisted, never returned by the API, and is only held
 * transiently inside the manager process — see `WorkerApiToken`.
 */
export interface RegisteredWorker {
  /** Mirrors the worker's self-declared id (`w_` + 12 Crockford base32). */
  id: string
  /** Externally reachable base URL of the worker (no trailing slash). */
  baseUrl: string
  /** Human label shown in the manager UI; defaults to a derivative of `baseUrl`. */
  displayName: string
  /** Base64 ciphertext of the bootstrap API token under the manager's master key. */
  apiTokenEnc: string
  /** Base64 AES-GCM nonce paired with `apiTokenEnc`. */
  nonce: string
  /** Base64 AES-GCM auth tag paired with `apiTokenEnc`. */
  authTag: string
  /** ISO-8601 timestamp the registry row was created. */
  addedAt: string
  /** Provenance of the registration; see `RegisteredWorkerOrigin`. */
  addedBy: RegisteredWorkerOrigin
  /** ISO-8601 timestamp of the last successful `/info` poll. */
  lastSeenAt?: string
  /** Result of the last poll cycle. */
  lastSeenState?: RegisteredWorkerLivenessState
  /** `configVersion` reported by the worker on the last `/info` poll. */
  lastConfigVersion?: number
}
