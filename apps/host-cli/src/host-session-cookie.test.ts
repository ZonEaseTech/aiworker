import { describe, expect, it } from 'bun:test'

import {
  clearCookieHeader,
  createSignedCookie,
  parseCookieHeader,
  readSignedCookie,
  sessionCookieAttributes,
  type HostSessionPayload,
} from './host-session-cookie'

const secret = 'test-secret-with-enough-entropy'

describe('host session signed cookies', () => {
  const payload: HostSessionPayload = {
    email: 'alice@zonease.org',
    expiresAt: '2026-06-06T12:00:00.000Z',
    roles: ['host:admin'],
    sub: 'usr_alice',
  }

  it('round-trips a signed session without exposing Logto tokens', () => {
    const cookie = createSignedCookie('aiworker_session', payload, {
      maxAgeSeconds: 28800,
      now: () => new Date('2026-06-06T04:00:00.000Z'),
      path: '/',
      requestUrl: 'http://localhost:54145/host',
      sameSite: 'Lax',
      secret,
    })

    expect(cookie).toContain('aiworker_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=28800')
    expect(cookie).not.toContain('Secure')
    expect(cookie).not.toContain('access_token')
    expect(cookie).not.toContain('refresh_token')
    expect(cookie).not.toContain('id_token')

    const value = parseCookieHeader(cookie).get('aiworker_session')!
    expect(readSignedCookie<HostSessionPayload>(value, {
      now: () => new Date('2026-06-06T04:01:00.000Z'),
      secret,
    })).toEqual(payload)
  })

  it('rejects tampered and expired cookie values', () => {
    const cookie = createSignedCookie('aiworker_session', payload, {
      maxAgeSeconds: 28800,
      now: () => new Date('2026-06-06T04:00:00.000Z'),
      path: '/',
      requestUrl: 'https://aiworker.zonease.org/host',
      sameSite: 'Lax',
      secret,
    })
    const value = parseCookieHeader(cookie).get('aiworker_session')!
    const tampered = `${value.slice(0, -1)}${value.endsWith('a') ? 'b' : 'a'}`

    expect(readSignedCookie(tampered, {
      now: () => new Date('2026-06-06T04:01:00.000Z'),
      secret,
    })).toBeNull()
    expect(readSignedCookie(value, {
      now: () => new Date('2026-06-06T13:00:00.000Z'),
      secret,
    })).toBeNull()
  })

  it('refuses to sign payloads containing Logto tokens', () => {
    expect(() => createSignedCookie('aiworker_session', {
      ...payload,
      access_token: 'access.secret',
    }, {
      maxAgeSeconds: 28800,
      now: () => new Date('2026-06-06T04:00:00.000Z'),
      path: '/',
      requestUrl: 'https://aiworker.zonease.org/host',
      sameSite: 'Lax',
      secret,
    })).toThrow('Logto token')
  })

  it('sets Secure only for https and clears cookies explicitly', () => {
    expect(sessionCookieAttributes({
      maxAgeSeconds: 600,
      path: '/auth',
      requestUrl: 'https://aiworker.zonease.org/auth/login',
      sameSite: 'Lax',
    })).toContain('Secure')
    expect(sessionCookieAttributes({
      maxAgeSeconds: 600,
      path: '/auth',
      requestUrl: 'http://localhost:54145/auth/login',
      sameSite: 'Lax',
    })).not.toContain('Secure')
    expect(clearCookieHeader('aiworker_session', '/', 'https://aiworker.zonease.org/host'))
      .toContain('aiworker_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure')
  })
})
