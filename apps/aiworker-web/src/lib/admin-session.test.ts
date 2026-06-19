import type { AdminSessionStatus } from '@/lib/admin-session'
import { describe, expect, it } from 'bun:test'
import { AdminApiError } from '@/lib/admin-api-client'
import { adminRemediation } from '@/lib/admin-remediation'
import { appendReturnTo, isAuthRequiredError, resolveAuthGateState } from '@/lib/admin-session'

function fakeLocation(pathname: string, search = ''): Location {
  return { origin: 'https://admin.example.com', pathname, search } as Location
}

function sessionStatus(overrides: Partial<AdminSessionStatus['auth']> & { authorized: boolean }): AdminSessionStatus {
  const { authorized, ...auth } = overrides
  return {
    authorized,
    auth: {
      authenticated: authorized,
      loginRequired: false,
      loginUrl: '/login',
      logoutUrl: '/logout',
      mode: 'local',
      ...auth,
    },
  }
}

describe('resolveAuthGateState', () => {
  it('allows local mode without login', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: true, mode: 'local', loginRequired: false }))
    expect(state.kind).toBe('authorized')
  })

  it('allows an authorized session even when login is required', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: true, mode: 'logto', loginRequired: true }))
    expect(state.kind).toBe('authorized')
  })

  it('blocks an unauthenticated logto session with a login wall', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: false, mode: 'logto', loginRequired: true, loginUrl: '/login' }))
    expect(state).toEqual({ kind: 'login-required', loginUrl: '/login' })
  })

  it('blocks an unauthenticated locked (require-auth) session', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: false, mode: 'locked', loginRequired: true }))
    expect(state.kind).toBe('login-required')
  })

  it('surfaces a misconfigured login service', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: false, mode: 'misconfigured', loginRequired: true }))
    expect(state.kind).toBe('misconfigured')
  })

  it('fails open when login is not required despite an unauthorized flag', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: false, mode: 'local', loginRequired: false }))
    expect(state.kind).toBe('authorized')
  })

  it('carries the user email through the login wall when present', () => {
    const state = resolveAuthGateState(sessionStatus({ authorized: false, mode: 'logto', loginRequired: true, userEmail: 'ops@example.com' }))
    expect(state).toEqual({ kind: 'login-required', loginUrl: '/login', userEmail: 'ops@example.com' })
  })
})

describe('isAuthRequiredError', () => {
  it('treats a 401 admin_auth_required as needing login', () => {
    const error = new AdminApiError(401, adminRemediation('admin_auth_required'))
    expect(isAuthRequiredError(error)).toBe(true)
  })

  it('does not treat control-plane outages as needing login', () => {
    const error = new AdminApiError(500, adminRemediation('control_plane_unavailable'))
    expect(isAuthRequiredError(error)).toBe(false)
  })

  it('ignores non-AdminApiError failures', () => {
    expect(isAuthRequiredError(new Error('network'))).toBe(false)
  })
})

describe('appendReturnTo', () => {
  it('appends the current path as returnTo', () => {
    expect(appendReturnTo('/login', fakeLocation('/assignments', '?q=1'))).toBe('/login?returnTo=%2Fassignments%3Fq%3D1')
  })

  it('omits returnTo for the root path', () => {
    expect(appendReturnTo('/login', fakeLocation('/'))).toBe('/login')
  })

  it('returns the login url unchanged without a location', () => {
    expect(appendReturnTo('/login', undefined)).toBe('/login')
  })
})
