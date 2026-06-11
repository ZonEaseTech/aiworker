import type { CredentialProviderKind } from '@zonease/aiworker-worker-control-protocol'
import process from 'node:process'

// Phase 3 LLM credential injection — Host broker (org-key adapter only).
//
// The broker mints the credential the Host hands a Worker for a given LLM
// provider. In the org-key mode (Phase 3 v1, the ONLY mode shipped here) the
// credential is the org key AS-IS — NOT a derived, per-worker, revocable,
// short-TTL key. The org key therefore leaves the Host and reaches every
// employee machine; blast radius = any compromised worker compromises the whole
// org key, with no per-worker revocation (revocation requires rotating the org
// key for everyone). `revoke()` is honestly not-supported. True per-worker
// derivation/revocation is slice 3 (a self-issuing gateway adapter), which
// plugs into the SAME `HostCredentialBroker` interface below as a drop-in swap.

/** A minted credential the Host returns to a Worker for one provider kind. */
export interface HostCredentialGrant {
  providerKind: CredentialProviderKind
  // Semantic (transport-agnostic) name mirroring the credential_grant frame
  // field — never `baseUrl`/`endpoint` (G10 inversion guard).
  gatewayUrl: string
  // Secret. In org-key mode this is the org key verbatim (non-derived).
  token: string
  // Far-future placeholder in org-key mode (org keys have no TTL); slice-3
  // gateway-minted keys carry a real short TTL.
  expiresAt: string
}

/** Opaque handle identifying what to revoke. */
export interface HostCredentialHandle {
  providerKind: CredentialProviderKind
  profile: string
}

export interface HostCredentialRevokeResult {
  supported: boolean
  reason?: string
}

/**
 * Host-side broker that mints provider credentials. The org-key adapter ships
 * in Phase 3 v1; the slice-3 external-gateway adapter (LiteLLM `/key/generate`,
 * real per-worker virtual keys + real revocation + quotas) implements THIS SAME
 * interface — a drop-in swap with zero protocol change. That is the only seam
 * required here; no throwing stub is added (untested dead code).
 */
export interface HostCredentialBroker {
  // `profile` is optional: an undefined/absent profile resolves to the broker's
  // own configured default profile (the Host derives the per-assignment profile
  // from metadata, which is usually absent in v1).
  mint: (profile: string | undefined, providerKind: CredentialProviderKind) => HostCredentialGrant
  revoke: (handle: HostCredentialHandle) => HostCredentialRevokeResult
}

interface OrgKeyProviderEntry {
  gatewayUrl: string
  keyRef: string
}

export type OrgKeyProviderProfile = Partial<Record<CredentialProviderKind, OrgKeyProviderEntry>>

export interface OrgKeyBrokerConfig {
  defaultProfile: string
  profiles: Record<string, OrgKeyProviderProfile>
}

interface OrgKeyBrokerDeps {
  env?: Record<string, string | undefined>
}

// org keys have no provider-side TTL; we use a far-future placeholder so the
// store-side liveness/refresh logic never tries to refresh an org key. Revocation
// rides the 4401 Phase 2 channel, NOT TTL expiry.
const ORG_KEY_FAR_FUTURE_EXPIRES_AT = '2999-01-01T00:00:00.000Z'

/**
 * Resolve a Host org-key ref to its value. Mirrors the Worker `resolveApiKey`
 * prefix set ($NAME / env:NAME / bare NAME → env), kept independent because
 * the Worker resolver lives in worker-runtime (a worker-plane package the Host
 * must not import). Non-env ref kinds throw honestly (no secret manager in v1).
 */
export function resolveOrgKeyRef(ref: string, env: Record<string, string | undefined> = process.env): string {
  const normalized = ref.trim()
  if (!normalized)
    throw new Error('org-key reference is required, e.g. env:ANTHROPIC_ORG_KEY.')
  if (!normalized.startsWith('env:') && !normalized.startsWith('$') && !/^[A-Z_]\w*$/i.test(normalized))
    throw new Error('org-key reference must be env:NAME, $NAME, or NAME (bare identifier).')
  const envName = normalized.startsWith('env:')
    ? normalized.slice(4)
    : normalized.startsWith('$') ? normalized.slice(1) : normalized
  if (!/^[A-Z_]\w*$/i.test(envName))
    throw new Error('org-key reference must be env:NAME, $NAME, or NAME.')
  const value = env[envName]
  if (!value)
    throw new Error(`org-key environment variable is not set: ${envName}.`)
  return value
}

export function createOrgKeyCredentialBroker(config: OrgKeyBrokerConfig, deps: OrgKeyBrokerDeps = {}): HostCredentialBroker {
  const env = deps.env ?? process.env
  return {
    mint(profile, providerKind) {
      const profileName = profile && profile.trim().length > 0 ? profile : config.defaultProfile
      const profileConfig = config.profiles[profileName]
      if (!profileConfig)
        throw new Error(`unknown gateway profile: ${profileName}`)
      const entry = profileConfig[providerKind]
      if (!entry)
        throw new Error(`gateway profile ${profileName} has no ${providerKind} credential configured`)
      // org-key honesty: the org key is returned verbatim — never derived/minted.
      const token = resolveOrgKeyRef(entry.keyRef, env)
      return {
        providerKind,
        gatewayUrl: entry.gatewayUrl,
        token,
        expiresAt: ORG_KEY_FAR_FUTURE_EXPIRES_AT,
      }
    },
    revoke() {
      // org-key mode cannot revoke a single worker's credential: the same org key
      // is handed to every worker. Returning a fake success would give false
      // safety; the only real revocation is rotating the org key (affects everyone)
      // or moving to the slice-3 gateway adapter.
      return {
        supported: false,
        reason: 'org-key mode has no per-worker revocation; rotate the org key (affects everyone) or use the slice-3 gateway adapter.',
      }
    },
  }
}

const GATEWAY_ENV_PREFIX = 'AIWORKER_GATEWAY_'
const DEFAULT_PROFILE_SUFFIX = '_DEFAULT_PROFILE'
const PROVIDER_TOKENS: Record<string, CredentialProviderKind> = { ANTHROPIC: 'anthropic', OPENAI: 'openai' }

/**
 * Build an org-key broker config from Host env vars, mirroring how
 * `buildSessionAuthFromEnv` reads session config. Recognized shape:
 *
 *   AIWORKER_GATEWAY_<PROFILE>_<PROVIDER>_GATEWAY_URL
 *   AIWORKER_GATEWAY_<PROFILE>_<PROVIDER>_KEY_REF      (env:/$/bare ref)
 *   AIWORKER_GATEWAY_DEFAULT_PROFILE                   (optional; default 'default')
 *
 * <PROVIDER> ∈ {ANTHROPIC, OPENAI}. A provider entry is kept only when BOTH
 * the gateway URL and the key-ref are present (half-configured entries are
 * dropped). Returns null when no gateway profile env is configured at all.
 */
export function loadOrgKeyBrokerConfigFromEnv(env: Record<string, string | undefined>): OrgKeyBrokerConfig | null {
  // profile name → provider kind → partial entry
  const draft = new Map<string, Map<CredentialProviderKind, Partial<OrgKeyProviderEntry>>>()
  let defaultProfile = 'default'

  for (const [rawKey, rawValue] of Object.entries(env)) {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0)
      continue
    if (!rawKey.startsWith(GATEWAY_ENV_PREFIX))
      continue
    if (rawKey === `${GATEWAY_ENV_PREFIX.slice(0, -1)}${DEFAULT_PROFILE_SUFFIX}`) {
      // AIWORKER_GATEWAY_DEFAULT_PROFILE
      defaultProfile = rawValue.trim()
      continue
    }

    const rest = rawKey.slice(GATEWAY_ENV_PREFIX.length)
    const field = rest.endsWith('_GATEWAY_URL')
      ? 'gatewayUrl' as const
      : rest.endsWith('_KEY_REF') ? 'keyRef' as const : null
    if (!field)
      continue
    const head = field === 'gatewayUrl' ? rest.slice(0, -'_GATEWAY_URL'.length) : rest.slice(0, -'_KEY_REF'.length)
    // head = <PROFILE>_<PROVIDER>; provider is the last underscore-delimited token.
    const lastUnderscore = head.lastIndexOf('_')
    if (lastUnderscore <= 0)
      continue
    const providerToken = head.slice(lastUnderscore + 1)
    const providerKind = PROVIDER_TOKENS[providerToken]
    if (!providerKind)
      continue
    const profileToken = head.slice(0, lastUnderscore)
    if (!profileToken)
      continue
    const profileName = profileToken.toLowerCase()

    let providerMap = draft.get(profileName)
    if (!providerMap) {
      providerMap = new Map()
      draft.set(profileName, providerMap)
    }
    const entry = providerMap.get(providerKind) ?? {}
    entry[field] = rawValue.trim()
    providerMap.set(providerKind, entry)
  }

  const profiles: Record<string, OrgKeyProviderProfile> = {}
  for (const [profileName, providerMap] of draft) {
    const profile: OrgKeyProviderProfile = {}
    for (const [providerKind, entry] of providerMap) {
      if (entry.gatewayUrl && entry.keyRef)
        profile[providerKind] = { gatewayUrl: entry.gatewayUrl, keyRef: entry.keyRef }
    }
    if (Object.keys(profile).length > 0)
      profiles[profileName] = profile
  }

  if (Object.keys(profiles).length === 0)
    return null

  return { defaultProfile, profiles }
}
