import { describe, expect, it } from 'bun:test'

import { EngineCredentialStore } from './engine-credential-store'

describe('EngineCredentialStore', () => {
  it('injects anthropic credentials for the claude-code engine', () => {
    const store = new EngineCredentialStore()
    store.set('anthropic', { gatewayUrl: 'https://gw.example/anthropic', token: 'org-key-anthropic', expiresAt: '2099-01-01T00:00:00.000Z' })

    expect(store.envFor('claude-code')).toEqual({
      ANTHROPIC_BASE_URL: 'https://gw.example/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'org-key-anthropic',
    })
  })

  it('does NOT inject for the codex engine even when an openai credential is present (documented-unsupported)', () => {
    // org-key v1 deliberately does not inject codex: codex resolves auth between a
    // stored ChatGPT OAuth login and an injected OPENAI_API_KEY in a way that is not
    // reliably controllable headlessly (codex doctor itself flags the combination as
    // ambiguous). Rather than risk silently bypassing the gateway / billing the wrong
    // account, codex injection is unsupported (see docs/runtime.md). The deliberate
    // no-op must hold even when an openai credential IS stored — proving it is an
    // intentional exclusion, not an accidental missing credential.
    const store = new EngineCredentialStore()
    store.set('openai', { gatewayUrl: 'https://gw.example/openai', token: 'org-key-openai', expiresAt: '2099-01-01T00:00:00.000Z' })

    expect(store.envFor('codex')).toEqual({})
  })

  it('never injects for cursor even when an anthropic credential is present', () => {
    const store = new EngineCredentialStore()
    store.set('anthropic', { gatewayUrl: 'https://gw.example/anthropic', token: 'org-key-anthropic', expiresAt: '2099-01-01T00:00:00.000Z' })
    store.set('openai', { gatewayUrl: 'https://gw.example/openai', token: 'org-key-openai', expiresAt: '2099-01-01T00:00:00.000Z' })

    expect(store.envFor('cursor')).toEqual({})
  })

  it('returns an empty env for engines outside the org-key v1 injection list', () => {
    const store = new EngineCredentialStore()
    store.set('anthropic', { gatewayUrl: 'https://gw.example/anthropic', token: 'org-key-anthropic', expiresAt: '2099-01-01T00:00:00.000Z' })

    expect(store.envFor('gemini')).toEqual({})
    expect(store.envFor('opencode')).toEqual({})
    expect(store.envFor('qwen')).toEqual({})
  })

  it('returns an empty env (graceful fallback) when the provider credential is absent', () => {
    const store = new EngineCredentialStore()

    expect(store.envFor('claude-code')).toEqual({})
    expect(store.envFor('codex')).toEqual({})
  })

  it('clear() drops all credentials so envFor falls back to empty', () => {
    const store = new EngineCredentialStore()
    store.set('anthropic', { gatewayUrl: 'https://gw.example/anthropic', token: 'org-key-anthropic', expiresAt: '2099-01-01T00:00:00.000Z' })
    store.set('openai', { gatewayUrl: 'https://gw.example/openai', token: 'org-key-openai', expiresAt: '2099-01-01T00:00:00.000Z' })

    store.clear()

    expect(store.envFor('claude-code')).toEqual({})
    expect(store.envFor('codex')).toEqual({})
  })

  it('maps known engineIds to providers and unknown engineIds to none', () => {
    expect(EngineCredentialStore.providerForEngine('claude-code')).toBe('anthropic')
    // codex is deliberately unmapped in org-key v1 (documented-unsupported); see the
    // "does NOT inject for the codex engine" case above.
    expect(EngineCredentialStore.providerForEngine('codex')).toBeNull()
    expect(EngineCredentialStore.providerForEngine('cursor')).toBeNull()
    expect(EngineCredentialStore.providerForEngine('gemini')).toBeNull()
    expect(EngineCredentialStore.providerForEngine('unknown-engine')).toBeNull()
  })

  it('refreshing a provider credential atomically replaces the previous value', () => {
    const store = new EngineCredentialStore()
    store.set('anthropic', { gatewayUrl: 'https://gw.example/v1', token: 'token-v1', expiresAt: '2099-01-01T00:00:00.000Z' })
    store.set('anthropic', { gatewayUrl: 'https://gw.example/v2', token: 'token-v2', expiresAt: '2099-01-01T00:00:00.000Z' })

    expect(store.envFor('claude-code')).toEqual({
      ANTHROPIC_BASE_URL: 'https://gw.example/v2',
      ANTHROPIC_AUTH_TOKEN: 'token-v2',
    })
  })
})
