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
 * - codex       → none (documented-unsupported; see below)
 * - cursor      → none (deliberately excluded; its CLI does not route an externally supplied key)
 * - everything else (gemini/opencode/qwen/…) → none (not in the org-key v1 injection list)
 *
 * codex is deliberately UNMAPPED in org-key v1. The codex CLI resolves auth between
 * a stored ChatGPT OAuth login (auth.json in CODEX_HOME) and an injected
 * OPENAI_API_KEY in a way that is not reliably controllable headlessly — codex's own
 * `doctor` flags the "ChatGPT tokens stored AND OPENAI_API_KEY present" combination as
 * ambiguous, and there is no non-interactive way to force the env key (it requires an
 * explicit `codex logout`). Injecting an org key we cannot guarantee codex honors risks
 * silently bypassing the gateway and billing the wrong account — the plan's top secret
 * risk. Under that asymmetric downside the conservative choice is to NOT inject codex:
 * a worker running codex falls back to the user's own codex auth (degraded, honest),
 * never to a silent wrong-account gateway bypass. The existing codex auth-failure
 * guidance (executor.ts) already points an un-authed codex at `codex login` /
 * `aiworker config`. See docs/runtime.md. Re-enabling codex injection is gated on a
 * reliable headless force-API-key path (or the slice-3 gateway adapter).
 */
const ENGINE_ID_TO_PROVIDER: Record<string, CredentialProviderKind> = {
  'claude-code': 'anthropic',
}

/**
 * provider → env carrier variable names. Both providers' carriers are declared as
 * data (the protocol/broker mint both kinds, and the slice-3 / codex-future path
 * would use the openai carriers), but in org-key v1 only `anthropic` is reachable
 * via `ENGINE_ID_TO_PROVIDER`, so the openai carriers are inert today. The
 * ANTHROPIC_ / OPENAI_ prefixes are intentionally NOT stripped by `sanitizeEngineEnv`.
 */
const PROVIDER_ENV_CARRIERS: Record<CredentialProviderKind, { baseUrl: string, token: string }> = {
  anthropic: { baseUrl: 'ANTHROPIC_BASE_URL', token: 'ANTHROPIC_AUTH_TOKEN' },
  openai: { baseUrl: 'OPENAI_BASE_URL', token: 'OPENAI_API_KEY' },
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
    const carriers = PROVIDER_ENV_CARRIERS[provider]
    return {
      [carriers.baseUrl]: credential.gatewayUrl,
      [carriers.token]: credential.token,
    }
  }

  /** Drop all credentials (revocation / shutdown). */
  clear(): void {
    this.#credentials.clear()
  }
}
