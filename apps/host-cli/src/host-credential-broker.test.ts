import { describe, expect, it } from 'bun:test'
import {
  createOrgKeyCredentialBroker,
  loadOrgKeyBrokerConfigFromEnv,
  resolveOrgKeyRef,
} from './host-credential-broker'

describe('resolveOrgKeyRef', () => {
  it('resolves env:NAME / $NAME / bare NAME against the provided env (worker resolveApiKey prefix parity)', () => {
    const env = { ORG_KEY: 'sk-ant-org-secret-value' }
    expect(resolveOrgKeyRef('env:ORG_KEY', env)).toBe('sk-ant-org-secret-value')
    expect(resolveOrgKeyRef('$ORG_KEY', env)).toBe('sk-ant-org-secret-value')
    expect(resolveOrgKeyRef('ORG_KEY', env)).toBe('sk-ant-org-secret-value')
  })

  it('throws honestly for non-env: references (no secret manager in v1)', () => {
    expect(() => resolveOrgKeyRef('not a name', {})).toThrow()
    expect(() => resolveOrgKeyRef('some-ref-with-dashes', {})).toThrow()
  })

  it('throws when the referenced env value is missing', () => {
    expect(() => resolveOrgKeyRef('env:MISSING_ORG_KEY', {})).toThrow(/MISSING_ORG_KEY/)
  })

  it('rejects malformed references', () => {
    expect(() => resolveOrgKeyRef('  ', {})).toThrow()
    expect(() => resolveOrgKeyRef('env:not a name', {})).toThrow()
  })
})

describe('createOrgKeyCredentialBroker', () => {
  const config = {
    defaultProfile: 'default',
    profiles: {
      default: {
        anthropic: { gatewayUrl: 'https://gw.example.com/anthropic', keyRef: 'env:ANTHROPIC_ORG_KEY' },
        openai: { gatewayUrl: 'https://gw.example.com/openai', keyRef: 'env:OPENAI_ORG_KEY' },
      },
      acme: {
        anthropic: { gatewayUrl: 'https://acme.example.com/anthropic', keyRef: 'env:ACME_ANTHROPIC_KEY' },
      },
    },
  }
  const env = {
    ANTHROPIC_ORG_KEY: 'sk-ant-org-anthropic-secret',
    OPENAI_ORG_KEY: 'sk-org-openai-secret',
    ACME_ANTHROPIC_KEY: 'sk-ant-acme-secret',
  }

  it('mints the org key as-is (NOT derived) with the paired gatewayUrl and a far-future expiresAt placeholder', () => {
    const broker = createOrgKeyCredentialBroker(config, { env })
    const grant = broker.mint('default', 'anthropic')
    expect(grant.providerKind).toBe('anthropic')
    expect(grant.gatewayUrl).toBe('https://gw.example.com/anthropic')
    // org-key honesty: token is the org key verbatim, never derived/minted.
    expect(grant.token).toBe('sk-ant-org-anthropic-secret')
    // org keys have no TTL → far-future placeholder (revocation rides 4401, not expiry).
    expect(Date.parse(grant.expiresAt)).toBeGreaterThan(Date.now() + 365 * 24 * 60 * 60 * 1000)
  })

  it('selects the per-providerKind gatewayUrl + key within a profile', () => {
    const broker = createOrgKeyCredentialBroker(config, { env })
    const grant = broker.mint('default', 'openai')
    expect(grant.gatewayUrl).toBe('https://gw.example.com/openai')
    expect(grant.token).toBe('sk-org-openai-secret')
  })

  it('mints from a non-default named profile', () => {
    const broker = createOrgKeyCredentialBroker(config, { env })
    const grant = broker.mint('acme', 'anthropic')
    expect(grant.gatewayUrl).toBe('https://acme.example.com/anthropic')
    expect(grant.token).toBe('sk-ant-acme-secret')
  })

  it('resolves an undefined profile to the broker default profile (not the literal "default")', () => {
    const acmeDefaultConfig = {
      defaultProfile: 'acme',
      profiles: {
        acme: { anthropic: { gatewayUrl: 'https://acme.example.com/anthropic', keyRef: 'env:ACME_ANTHROPIC_KEY' } },
      },
    }
    const broker = createOrgKeyCredentialBroker(acmeDefaultConfig, { env })
    const grant = broker.mint(undefined, 'anthropic')
    expect(grant.gatewayUrl).toBe('https://acme.example.com/anthropic')
    expect(grant.token).toBe('sk-ant-acme-secret')
  })

  it('throws when the profile is unknown', () => {
    const broker = createOrgKeyCredentialBroker(config, { env })
    expect(() => broker.mint('nope', 'anthropic')).toThrow(/profile/)
  })

  it('throws when the profile has no config for the requested providerKind', () => {
    const broker = createOrgKeyCredentialBroker(config, { env })
    // acme profile has no openai entry
    expect(() => broker.mint('acme', 'openai')).toThrow(/openai/)
  })

  it('never leaks the org key in mint error messages', () => {
    const broker = createOrgKeyCredentialBroker({
      defaultProfile: 'default',
      profiles: { default: { anthropic: { gatewayUrl: 'https://gw.example.com', keyRef: 'env:UNSET_ORG_KEY' } } },
    }, { env: {} })
    try {
      broker.mint('default', 'anthropic')
      throw new Error('expected mint to throw')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The env value is unset so there is nothing to leak here, but assert the
      // contract: error names the env ref, not any secret value.
      expect(message).not.toContain('sk-')
      expect(message).toContain('UNSET_ORG_KEY')
    }
  })

  it('revoke() returns an explicit not-supported result (org key has no per-worker revocation)', () => {
    const broker = createOrgKeyCredentialBroker(config, { env })
    const result = broker.revoke({ providerKind: 'anthropic', profile: 'default' })
    expect(result.supported).toBe(false)
    expect(result.reason).toMatch(/per-worker revocation/i)
  })
})

describe('loadOrgKeyBrokerConfigFromEnv', () => {
  it('returns null when no gateway profile env is configured', () => {
    expect(loadOrgKeyBrokerConfigFromEnv({})).toBeNull()
  })

  it('parses AIWORKER_GATEWAY_<PROFILE>_<PROVIDER>_GATEWAY_URL + _KEY_REF into a profile table', () => {
    const config = loadOrgKeyBrokerConfigFromEnv({
      AIWORKER_GATEWAY_DEFAULT_ANTHROPIC_GATEWAY_URL: 'https://gw.example.com/anthropic',
      AIWORKER_GATEWAY_DEFAULT_ANTHROPIC_KEY_REF: 'env:ANTHROPIC_ORG_KEY',
      AIWORKER_GATEWAY_DEFAULT_OPENAI_GATEWAY_URL: 'https://gw.example.com/openai',
      AIWORKER_GATEWAY_DEFAULT_OPENAI_KEY_REF: 'env:OPENAI_ORG_KEY',
    })
    expect(config).not.toBeNull()
    expect(config!.defaultProfile).toBe('default')
    expect(config!.profiles.default?.anthropic).toEqual({
      gatewayUrl: 'https://gw.example.com/anthropic',
      keyRef: 'env:ANTHROPIC_ORG_KEY',
    })
    expect(config!.profiles.default?.openai).toEqual({
      gatewayUrl: 'https://gw.example.com/openai',
      keyRef: 'env:OPENAI_ORG_KEY',
    })
  })

  it('honors AIWORKER_GATEWAY_DEFAULT_PROFILE for the default profile name', () => {
    const config = loadOrgKeyBrokerConfigFromEnv({
      AIWORKER_GATEWAY_DEFAULT_PROFILE: 'acme',
      AIWORKER_GATEWAY_ACME_ANTHROPIC_GATEWAY_URL: 'https://acme.example.com/anthropic',
      AIWORKER_GATEWAY_ACME_ANTHROPIC_KEY_REF: 'env:ACME_KEY',
    })
    expect(config!.defaultProfile).toBe('acme')
    expect(config!.profiles.acme?.anthropic?.gatewayUrl).toBe('https://acme.example.com/anthropic')
  })

  it('ignores a half-configured provider entry (gatewayUrl without key-ref or vice versa)', () => {
    const config = loadOrgKeyBrokerConfigFromEnv({
      AIWORKER_GATEWAY_DEFAULT_ANTHROPIC_GATEWAY_URL: 'https://gw.example.com/anthropic',
      // no _KEY_REF for anthropic → incomplete, dropped
      AIWORKER_GATEWAY_DEFAULT_OPENAI_GATEWAY_URL: 'https://gw.example.com/openai',
      AIWORKER_GATEWAY_DEFAULT_OPENAI_KEY_REF: 'env:OPENAI_ORG_KEY',
    })
    expect(config!.profiles.default?.anthropic).toBeUndefined()
    expect(config!.profiles.default?.openai).toBeDefined()
  })
})
