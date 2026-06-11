import type { CredentialProviderKind } from '@zonease/aiworker-worker-control-protocol'

/**
 * A credential delivered by the Host over the Worker Access tunnel (Phase 3).
 * `token` is a secret (in the org-key mode it is the org key as-is). It lives only
 * in this in-memory store and is NEVER persisted (descriptor / DB / access-token
 * file) or logged.
 */
export interface EngineCredential {
  gatewayUrl: string
  token: string
  expiresAt: string
}

/**
 * engineId → LLM provider mapping (org-key v1):
 * - claude-code → anthropic
 * - codex       → openai
 * - cursor      → none (deliberately excluded; its CLI does not route an externally supplied key)
 * - everything else (gemini/opencode/qwen/…) → none (not in the org-key v1 injection list)
 */
const ENGINE_ID_TO_PROVIDER: Record<string, CredentialProviderKind> = {
  'claude-code': 'anthropic',
  'codex': 'openai',
}

/**
 * Process-level in-memory credential store. The daemon constructs exactly one and
 * shares the same instance with both the executor (read path, `envFor`) and the
 * Worker Access tunnel (write path, `set`/`clear`). Credentials are kept only in
 * memory: revocation (4401) and process exit drop them via `clear()`; they are
 * never persisted or logged.
 */
export class EngineCredentialStore {
  readonly #credentials = new Map<CredentialProviderKind, EngineCredential>()

  /** Map an engineId to its provider, or null when no org-key v1 provider applies. */
  static providerForEngine(engineId: string): CredentialProviderKind | null {
    return ENGINE_ID_TO_PROVIDER[engineId] ?? null
  }

  /** Store/replace the credential for a provider (atomic replace on refresh). */
  set(providerKind: CredentialProviderKind, credential: EngineCredential): void {
    this.#credentials.set(providerKind, credential)
  }

  /**
   * Build the engine env injection for the given engineId. Returns the provider's
   * env carrier variables when a credential is present, or an empty object (graceful
   * fallback) when the engine has no mapped provider or no stored credential.
   *
   * Carrier variable names intentionally use the ANTHROPIC_ / OPENAI_ prefixes,
   * which `sanitizeEngineEnv` does NOT strip, so they survive as the executor's
   * third env merge layer.
   */
  envFor(engineId: string): Record<string, string> {
    const provider = EngineCredentialStore.providerForEngine(engineId)
    if (!provider)
      return {}
    const credential = this.#credentials.get(provider)
    if (!credential)
      return {}
    if (provider === 'anthropic') {
      return {
        ANTHROPIC_BASE_URL: credential.gatewayUrl,
        ANTHROPIC_AUTH_TOKEN: credential.token,
      }
    }
    return {
      OPENAI_BASE_URL: credential.gatewayUrl,
      OPENAI_API_KEY: credential.token,
    }
  }

  /** Drop all credentials (revocation / shutdown). */
  clear(): void {
    this.#credentials.clear()
  }
}
