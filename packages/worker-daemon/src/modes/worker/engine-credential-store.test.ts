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

  it('injects openai credentials for the codex engine', () => {
    const store = new EngineCredentialStore()
    store.set('openai', { gatewayUrl: 'https://gw.example/openai', token: 'org-key-openai', expiresAt: '2099-01-01T00:00:00.000Z' })

    expect(store.envFor('codex')).toEqual({
      OPENAI_BASE_URL: 'https://gw.example/openai',
      OPENAI_API_KEY: 'org-key-openai',
    })
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
    expect(EngineCredentialStore.providerForEngine('codex')).toBe('openai')
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
