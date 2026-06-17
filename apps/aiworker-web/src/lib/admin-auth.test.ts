import { describe, expect, test } from 'bun:test'
import { emailAllowed, logtoRuntimeState, safeReturnTo } from '@/lib/admin-auth'

describe('admin auth runtime config', () => {
  test('ignores generic session secret when Logto is otherwise absent', () => {
    expect(logtoRuntimeState({ AIWORKER_SESSION_SECRET: 'local-session-secret' }).kind).toBe('disabled')
  })

  test('fails closed for a partial Logto tuple', () => {
    const state = logtoRuntimeState({
      LOGTO_CLIENT_ID: 'app-id',
      LOGTO_ENDPOINT: 'https://auth.example.com/',
    })

    expect(state.kind).toBe('misconfigured')
    if (state.kind === 'misconfigured') {
      expect(state.missing).toContain('clientSecret')
      expect(state.missing).toContain('cookieSecret')
      expect(state.missing).toContain('baseUrl')
    }
  })

  test('accepts canonical names and sibling-compatible app aliases', () => {
    const state = logtoRuntimeState({
      AIWORKER_SESSION_SECRET: 'cookie-secret',
      LOGTO_ALLOWED_EMAIL_DOMAINS: 'zonease.org,jbcnet.co.jp',
      LOGTO_APP_ID: 'sibling-app-id',
      LOGTO_APP_SECRET: 'sibling-app-secret',
      LOGTO_BASE_URL: 'http://127.0.0.1:20831/',
      LOGTO_ENDPOINT: 'https://auth.example.com/',
    })

    expect(state.kind).toBe('configured')
    if (state.kind === 'configured') {
      expect(state.config.clientId).toBe('sibling-app-id')
      expect(state.config.clientSecret).toBe('sibling-app-secret')
      expect(state.config.issuer).toBe('https://auth.example.com/oidc')
      expect(state.config.redirectUri).toBe('http://127.0.0.1:20831/callback')
      expect(state.config.allowedEmailDomains).toEqual(['zonease.org', 'jbcnet.co.jp'])
    }
  })
})

describe('admin auth safety helpers', () => {
  test('only keeps same-site relative return targets', () => {
    expect(safeReturnTo('/provisioning?assignment=1')).toBe('/provisioning?assignment=1')
    expect(safeReturnTo('https://evil.example')).toBeNull()
    expect(safeReturnTo('//evil.example')).toBeNull()
    expect(safeReturnTo('/\\evil')).toBeNull()
    expect(safeReturnTo('/login')).toBeNull()
    expect(safeReturnTo('/callback?code=1')).toBeNull()
    expect(safeReturnTo('/bad\npath')).toBeNull()
  })

  test('requires an allowed verified email domain unless explicitly relaxed', () => {
    expect(emailAllowed('admin@zonease.org', { allowAnyEmail: false, allowedEmailDomains: ['zonease.org'] })).toBe(true)
    expect(emailAllowed('admin@example.com', { allowAnyEmail: false, allowedEmailDomains: ['zonease.org'] })).toBe(false)
    expect(emailAllowed('admin@example.com', { allowAnyEmail: true, allowedEmailDomains: [] })).toBe(true)
  })
})
