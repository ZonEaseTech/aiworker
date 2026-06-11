import type { OidcClientConfig } from './host-oidc-client'
import type { HostSessionPayload } from './host-session-cookie'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkerAccessRegistry } from '@zonease/aiworker-host-control'
import {
  createAssignment,
  markAssignmentAccessReady,
  markAssignmentCheckedIn,
  markAssignmentReady,
  publishSoulRelease,
  revokeAssignment,
  verifyAndConsumeProvisionToken,
} from '@zonease/aiworker-storage-sqlite/host'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createHostServer } from './host-server'
import {
  createSignedCookie,

  readSignedCookie,
} from './host-session-cookie'

const adminUser = { email: 'admin@example.com', roles: ['host:admin'], subject: 'usr_admin' }
const bobUser = { email: 'bob@example.com', roles: [], subject: 'usr_bob' }
const aliceUser = { email: 'alice@example.com', roles: [], subject: 'usr_alice' }
const sessionSecret = 'test-host-session-secret-with-enough-entropy'

describe('host server', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-server-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function dbPath() {
    return join(dir, 'host.db')
  }

  function hostUrls(hostControlBaseUrl = 'https://aiworker.zonease.org') {
    return {
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl,
    }
  }

  function localProvisioningTarget(ref = 'local://default') {
    return {
      adapterType: 'local' as const,
      maturity: 'dev' as const,
      ref,
    }
  }

  function createHostWebDist() {
    const webStaticDir = join(dir, 'host-web-dist')
    mkdirSync(join(webStaticDir, 'assets'), { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), [
      '<!DOCTYPE html>',
      '<html>',
      '<head><title>AIWorker Host Web</title><link rel="icon" href="/favicon.svg"></head>',
      '<body><div id="root">host web shell</div><script type="module" src="/assets/app.js"></script></body>',
      '</html>',
    ].join(''))
    writeFileSync(join(webStaticDir, 'assets', 'app.js'), 'window.__AIWORKER_HOST_WEB__ = true;')
    writeFileSync(join(webStaticDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    return webStaticDir
  }

  async function json(response: Response) {
    return await response.json() as Record<string, any>
  }

  function checkInBody(provisionToken: string, workerId = 'wkr_82') {
    return {
      provisionToken,
      worker: {
        health: { ready: true },
        id: 'aiworker-freeform',
        version: '1.0.0',
        workerId,
        workbenchUrl: `http://127.0.0.1:9217/workers/${workerId}`,
      },
    }
  }

  function publishTestRelease(soulId = 'aiworker-freeform') {
    return publishSoulRelease({
      soulId,
      name: 'AIWorker Freeform',
      descriptor: {
        protocol: 'soul/v1',
        identity: { id: soulId, name: 'AIWorker Freeform' },
        engine: {},
      },
      source: 'official',
    })
  }

  function sessionAuth(input: {
    bootstrapAdminEmails?: string[]
    fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    now?: () => Date
    oidc?: OidcClientConfig
  } = {}) {
    return {
      bootstrapAdminEmails: input.bootstrapAdminEmails ?? ['admin@zonease.org'],
      fetch: input.fetch ?? (async () => Response.json({
        authorization_endpoint: 'https://auth.zonease.org/oidc/auth',
        jwks_uri: 'https://auth.zonease.org/oidc/jwks',
        token_endpoint: 'https://auth.zonease.org/oidc/token',
      })),
      now: input.now,
      oidc: input.oidc ?? {
        allowedEmailDomains: ['zonease.org'],
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret,
    }
  }

  function sessionCookie(user: {
    email: string
    expiresAt?: string
    roles?: string[]
    sub: string
  }): string {
    return cookieValueFromSetCookie(createSignedCookie('aiworker_session', {
      email: user.email,
      expiresAt: user.expiresAt ?? '2099-01-01T00:00:00.000Z',
      roles: user.roles ?? [],
      sub: user.sub,
    }, {
      maxAgeSeconds: 28800,
      path: '/',
      requestUrl: 'http://localhost:54145/host',
      sameSite: 'Lax',
      secret: sessionSecret,
    }))
  }

  function malformedSessionCookie(payload: Record<string, unknown>): string {
    return cookieValueFromSetCookie(createSignedCookie('aiworker_session', {
      expiresAt: '2099-01-01T00:00:00.000Z',
      ...payload,
    }, {
      maxAgeSeconds: 28800,
      path: '/',
      requestUrl: 'http://localhost:54145/host',
      sameSite: 'Lax',
      secret: sessionSecret,
    }))
  }

  function transactionCookie(input: {
    codeVerifier?: string
    nonce?: string
    returnTo?: string
    state?: string
  } = {}): string {
    return cookieValueFromSetCookie(createSignedCookie('aiworker_auth_txn', {
      codeVerifier: input.codeVerifier ?? 'code-verifier',
      expiresAt: '2099-01-01T00:00:00.000Z',
      nonce: input.nonce ?? 'nonce-123',
      returnTo: input.returnTo ?? '/host',
      state: input.state ?? 'state-123',
    }, {
      maxAgeSeconds: 600,
      path: '/auth',
      requestUrl: 'http://localhost:54145/auth/login',
      sameSite: 'Lax',
      secret: sessionSecret,
    }), 'aiworker_auth_txn')
  }

  it('creates an auth transaction cookie and redirects /auth/login to Logto Hosted Login', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/auth/login?returnTo=/workers/wkr_82'))

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://auth.zonease.org/oidc/auth')
    expect(location.searchParams.get('client_id')).toBe('client-id')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:54145/auth/callback')
    expect(location.searchParams.get('state')).toBeTruthy()

    const authTxnSetCookie = setCookieHeaders(response).find(cookie => cookie.startsWith('aiworker_auth_txn='))
    expect(authTxnSetCookie).toBeTruthy()
    expect(authTxnSetCookie).toContain('HttpOnly')
    expect(authTxnSetCookie).toContain('Path=/auth')
    expect(readSignedCookie('aiworker_auth_txn', cookieValueFromSetCookie(authTxnSetCookie!, 'aiworker_auth_txn'), {
      secret: sessionSecret,
    })).toMatchObject({
      returnTo: '/workers/wkr_82',
      state: location.searchParams.get('state'),
    })
  })

  it('redirects mismatched auth login origins to the configured callback origin before creating a transaction', async () => {
    let discoveryRequests = 0
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://127.0.0.1:54145',
      hostControlBaseUrl: 'http://127.0.0.1:54145',
      sessionAuth: sessionAuth({
        fetch: async () => {
          discoveryRequests += 1
          return Response.json({
            authorization_endpoint: 'https://auth.zonease.org/oidc/auth',
            jwks_uri: 'https://auth.zonease.org/oidc/jwks',
            token_endpoint: 'https://auth.zonease.org/oidc/token',
          })
        },
        oidc: {
          allowedEmailDomains: ['zonease.org'],
          clientId: 'client-id',
          clientSecret: 'client-secret',
          endpoint: 'https://auth.zonease.org/',
          issuer: 'https://auth.zonease.org/oidc',
          redirectUri: 'http://127.0.0.1:54145/auth/callback',
        },
      }),
    })

    const response = await server.fetch(new Request('http://localhost:54145/auth/login?returnTo=/host'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://127.0.0.1:54145/auth/login?returnTo=%2Fhost')
    expect(setCookieHeaders(response).some(cookie => cookie.startsWith('aiworker_auth_txn='))).toBe(false)
    expect(discoveryRequests).toBe(0)
  })

  it('rejects unsafe login returnTo values before redirecting', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth({
        fetch: async () => {
          throw new Error('discovery should not run for unsafe returnTo')
        },
      }),
    })

    const response = await server.fetch(new Request('http://localhost:54145/auth/login?returnTo=https://evil.example'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_RETURN_TO' } })
  })

  it('exchanges a valid auth callback, writes a signed session cookie, clears transaction, and redirects to safe returnTo', async () => {
    const fixture = await createOidcFixture()
    try {
      const server = await createHostServer({
        dbPath: dbPath(),
        hostBrowserBaseUrl: 'http://localhost:54145',
        hostControlBaseUrl: 'http://localhost:54145',
        sessionAuth: sessionAuth({
          fetch: fixture.fetch,
          now: () => new Date('2026-06-06T04:00:00.000Z'),
          oidc: fixture.config,
        }),
      })

      const response = await server.fetch(new Request('http://localhost:54145/auth/callback?code=auth-code&state=state-123', {
        headers: {
          cookie: `aiworker_auth_txn=${transactionCookie({ returnTo: '/workers/wkr_82' })}`,
        },
      }))

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/workers/wkr_82')
      const cookies = setCookieHeaders(response)
      expect(cookies.some(cookie => cookie.startsWith('aiworker_auth_txn=;') && cookie.includes('Max-Age=0'))).toBe(true)
      const sessionSetCookie = cookies.find(cookie => cookie.startsWith('aiworker_session='))
      expect(sessionSetCookie).toBeTruthy()
      expect(sessionSetCookie).toContain('HttpOnly')
      expect(sessionSetCookie).not.toContain('id_token')
      expect(sessionSetCookie).not.toContain('access_token')
      expect(readSignedCookie<HostSessionPayload>('aiworker_session', cookieValueFromSetCookie(sessionSetCookie!, 'aiworker_session'), {
        now: () => new Date('2026-06-06T04:01:00.000Z'),
        secret: sessionSecret,
      })).toEqual({
        email: 'bob@zonease.org',
        expiresAt: '2026-06-06T12:00:00.000Z',
        roles: [],
        sub: 'usr_bob',
      })
    }
    finally {
      fixture.server.stop(true)
    }
  })

  it('logs a redacted reason when Logto callback code exchange fails', async () => {
    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (...values: unknown[]) => {
      warnings.push(values.map(value => String(value)).join(' '))
    }
    const fixture = await createOidcFixture({
      tokenBody: {
        error: 'invalid_grant',
        error_description: 'authorization code expired client_secret=client-secret code=auth-code-with-sensitive-context',
      },
      tokenStatus: 400,
    })
    try {
      const server = await createHostServer({
        dbPath: dbPath(),
        hostBrowserBaseUrl: 'http://localhost:54145',
        hostControlBaseUrl: 'http://localhost:54145',
        sessionAuth: sessionAuth({
          fetch: fixture.fetch,
          oidc: fixture.config,
        }),
      })

      const response = await server.fetch(new Request('http://localhost:54145/auth/callback?code=auth-code-with-sensitive-context&state=state-123', {
        headers: {
          cookie: `aiworker_auth_txn=${transactionCookie()}`,
        },
      }))

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: { code: 'AUTH_CALLBACK_FAILED' } })
      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('host_auth_callback_failed')
      expect(warnings[0]).toContain('invalid_grant')
      expect(warnings[0]).not.toContain('client-secret')
      expect(warnings[0]).not.toContain('auth-code-with-sensitive-context')
    }
    finally {
      console.warn = originalWarn
      fixture.server.stop(true)
    }
  })

  it('rejects auth callback state mismatch before exchanging the code', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth({
        fetch: async () => {
          throw new Error('exchange should not run for state mismatch')
        },
      }),
    })

    const response = await server.fetch(new Request('http://localhost:54145/auth/callback?code=auth-code&state=wrong-state', {
      headers: {
        cookie: `aiworker_auth_txn=${transactionCookie({ state: 'state-123' })}`,
      },
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_AUTH_TRANSACTION' } })
  })

  it('clears the session cookie and redirects logout to a safe Host path', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/auth/logout?returnTo=/workers/wkr_82', {
      method: 'POST',
    }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/workers/wkr_82')
    expect(response.headers.get('set-cookie')).toContain('aiworker_session=;')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('treats X-Forwarded-Proto: https as the external scheme so /auth/login reaches Logto behind a TLS-terminating proxy', async () => {
    let discoveryRequests = 0
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://127.0.0.1:9117',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
      sessionAuth: sessionAuth({
        fetch: async () => {
          discoveryRequests += 1
          return Response.json({
            authorization_endpoint: 'https://auth.zonease.org/oidc/auth',
            jwks_uri: 'https://auth.zonease.org/oidc/jwks',
            token_endpoint: 'https://auth.zonease.org/oidc/token',
          })
        },
        oidc: {
          allowedEmailDomains: ['zonease.org'],
          clientId: 'client-id',
          clientSecret: 'client-secret',
          endpoint: 'https://auth.zonease.org/',
          issuer: 'https://auth.zonease.org/oidc',
          redirectUri: 'https://aiworker.zonease.org/auth/callback',
        },
      }),
    })

    // Caddy reverse_proxy reaches the loopback Host over plaintext http, so request.url scheme is http;
    // X-Forwarded-Proto carries the real external https scheme.
    const response = await server.fetch(new Request('http://aiworker.zonease.org/auth/login?returnTo=/host', {
      headers: { 'x-forwarded-proto': 'https' },
    }))

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://auth.zonease.org/oidc/auth')
    expect(location.searchParams.get('client_id')).toBe('client-id')
    expect(location.searchParams.get('redirect_uri')).toBe('https://aiworker.zonease.org/auth/callback')
    expect(location.searchParams.get('state')).toBeTruthy()
    expect(discoveryRequests).toBe(1)

    const authTxnSetCookie = setCookieHeaders(response).find(cookie => cookie.startsWith('aiworker_auth_txn='))
    expect(authTxnSetCookie).toBeTruthy()
    expect(authTxnSetCookie).toContain('Secure')
  })

  it('still redirects a local http /auth/login with no forwarded headers to the canonical callback origin', async () => {
    let discoveryRequests = 0
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://127.0.0.1:54145',
      hostControlBaseUrl: 'http://127.0.0.1:54145',
      sessionAuth: sessionAuth({
        fetch: async () => {
          discoveryRequests += 1
          return Response.json({
            authorization_endpoint: 'https://auth.zonease.org/oidc/auth',
            jwks_uri: 'https://auth.zonease.org/oidc/jwks',
            token_endpoint: 'https://auth.zonease.org/oidc/token',
          })
        },
        oidc: {
          allowedEmailDomains: ['zonease.org'],
          clientId: 'client-id',
          clientSecret: 'client-secret',
          endpoint: 'https://auth.zonease.org/',
          issuer: 'https://auth.zonease.org/oidc',
          redirectUri: 'http://127.0.0.1:54145/auth/callback',
        },
      }),
    })

    const response = await server.fetch(new Request('http://localhost:54145/auth/login?returnTo=/host'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://127.0.0.1:54145/auth/login?returnTo=%2Fhost')
    expect(setCookieHeaders(response).some(cookie => cookie.startsWith('aiworker_auth_txn='))).toBe(false)
    expect(discoveryRequests).toBe(0)
  })

  it('marks the session cookie Secure when the auth callback arrives over forwarded https', async () => {
    const fixture = await createOidcFixture()
    try {
      const server = await createHostServer({
        dbPath: dbPath(),
        hostBrowserBaseUrl: 'http://127.0.0.1:9117',
        hostControlBaseUrl: 'http://127.0.0.1:9117',
        sessionAuth: sessionAuth({
          fetch: fixture.fetch,
          now: () => new Date('2026-06-06T04:00:00.000Z'),
          oidc: fixture.config,
        }),
      })

      const response = await server.fetch(new Request('http://aiworker.zonease.org/auth/callback?code=auth-code&state=state-123', {
        headers: {
          'cookie': `aiworker_auth_txn=${transactionCookie({ returnTo: '/workers/wkr_82' })}`,
          'x-forwarded-proto': 'https',
        },
      }))

      expect(response.status).toBe(302)
      const cookies = setCookieHeaders(response)
      const sessionSetCookie = cookies.find(cookie => cookie.startsWith('aiworker_session='))
      expect(sessionSetCookie).toBeTruthy()
      expect(sessionSetCookie).toContain('Secure')
      const txnClearCookie = cookies.find(cookie => cookie.startsWith('aiworker_auth_txn=;'))
      expect(txnClearCookie).toContain('Secure')
    }
    finally {
      fixture.server.stop(true)
    }
  })

  it('returns 401 from /api/auth/me without a session', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/api/auth/me'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('returns the current signed-cookie session user from /api/auth/me', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/api/auth/me', {
      headers: {
        cookie: `aiworker_session=${sessionCookie({
          email: 'bob@zonease.org',
          roles: ['host:admin'],
          sub: 'usr_bob',
        })}`,
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: {
        email: 'bob@zonease.org',
        roles: [],
        subject: 'usr_bob',
      },
    })
  })

  it('returns the static dev-admin operator from /api/auth/me when sessionAuth is not configured', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
    })

    const response = await server.fetch(new Request('http://localhost:54145/api/auth/me'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: adminUser })
  })

  it('returns 401 from /api/auth/me when neither sessionAuth nor a static operator is configured', async () => {
    const server = await createHostServer({
      authUser: null,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
    })

    const response = await server.fetch(new Request('http://localhost:54145/api/auth/me'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('does not trust signed-cookie roles for Host admin authorization', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${sessionCookie({
          email: 'eve@zonease.org',
          roles: ['host:admin'],
          sub: 'usr_eve',
        })}`,
      },
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('treats signed sessions with malformed roles as unauthenticated for browser Host routes', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${malformedSessionCookie({
          email: 'admin@zonease.org',
          roles: 'host:admin',
          sub: 'usr_admin',
        })}`,
      },
    }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fhost')
  })

  it('returns 401 from /api/auth/me for signed sessions with malformed shape', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/api/auth/me', {
      headers: {
        cookie: `aiworker_session=${malformedSessionCookie({
          email: 'admin@zonease.org',
          roles: 'host:admin',
          sub: 'usr_admin',
        })}`,
      },
    }))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('redirects browser /host requests to Logto login when session is missing', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: { accept: 'text/html' },
    }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fhost')
  })

  it('redirects encoded Host Web static shell paths to Logto login when session is missing', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
      webStaticDir: createHostWebDist(),
    })

    for (const path of ['/%68ost', '/ho%73t']) {
      const response = await server.fetch(new Request(`http://localhost:54145${path}`, {
        headers: { accept: 'text/html' },
      }))

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fhost')
      expect(await response.text()).not.toContain('host web shell')
    }
  })

  it('redirects HEAD /host to Logto login when session is missing and Host Web static assets are configured', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
      webStaticDir: createHostWebDist(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: { accept: 'text/html' },
      method: 'HEAD',
    }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fhost')
    expect(await response.text()).toBe('')
  })

  it('serves HEAD /host without a body for signed-cookie Host admins', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
      webStaticDir: createHostWebDist(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${sessionCookie({
          email: 'admin@zonease.org',
          roles: ['host:admin'],
          sub: 'usr_admin',
        })}`,
      },
      method: 'HEAD',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toBe('')
  })

  it('serves /host for signed-cookie Host admins', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${sessionCookie({
          email: 'admin@zonease.org',
          roles: ['host:admin'],
          sub: 'usr_admin',
        })}`,
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Host API is running')
  })

  it('returns 403 from /host for signed-cookie non-admin users', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/host', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${sessionCookie({
          email: 'bob@zonease.org',
          sub: 'usr_bob',
        })}`,
      },
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('redirects browser worker routes to Logto login when session is missing', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82', {
      headers: { accept: 'text/html' },
    }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fworkers%2Fwkr_82')
  })

  it('canonicalizes unauthenticated worker subpath login returnTo to the worker root', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82/assets/app.js', {
      headers: { accept: 'text/html' },
    }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fworkers%2Fwkr_82')
  })

  it('uses sessionAuth as authority when static authUser is also configured', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const hostResponse = await server.fetch(new Request('http://localhost:54145/host', {
      headers: { accept: 'text/html' },
    }))
    const apiResponse = await server.fetch(new Request('http://localhost:54145/api/host/assignments'))

    expect(hostResponse.status).toBe(302)
    expect(hostResponse.headers.get('location')).toBe('/auth/login?returnTo=%2Fhost')
    expect(apiResponse.status).toBe(403)
    expect(await apiResponse.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('returns JSON 403 for non-GET worker route requests when session is missing', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82/api/sessions', {
      body: JSON.stringify({ title: 'New session' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('routes a signed-cookie assigned user to their ready worker', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      sendRequest: async envelope => ({
        type: 'response',
        id: envelope.id,
        status: 200,
        headers: {
          'connection': 'upgrade',
          'content-length': '999',
          'content-type': 'text/plain',
          'set-cookie': 'sid=worker',
          'transfer-encoding': 'chunked',
          'upgrade': 'websocket',
        },
        bodyText: `worker:${envelope.path}:${envelope.headers.authorization ?? 'no-auth'}:${envelope.headers.connection ?? 'no-connection'}`,
      }),
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82/assets/app.js', {
      headers: {
        accept: 'text/html',
        authorization: 'Bearer employee',
        connection: 'upgrade',
        cookie: `sid=employee; aiworker_session=${sessionCookie({
          email: 'bob@zonease.org',
          sub: 'usr_bob',
        })}`,
        upgrade: 'websocket',
      },
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('connection')).toBeNull()
    expect(response.headers.get('content-length')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('transfer-encoding')).toBeNull()
    expect(response.headers.get('upgrade')).toBeNull()
    expect(await response.text()).toBe('worker:/assets/app.js:no-auth:no-connection')
  })

  it('rejects invalid signed-cookie worker access paths before forwarding', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      async sendRequest() {
        throw new Error('sendRequest should not be called for invalid worker paths')
      },
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82/%2F..%2Fadmin', {
      headers: {
        cookie: `aiworker_session=${sessionCookie({
          email: 'bob@zonease.org',
          sub: 'usr_bob',
        })}`,
      },
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_WORKER_ACCESS_PATH' } })
  })

  it('forwards signed-cookie worker POST routes with sanitized headers and body', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      sendRequest: async envelope => ({
        type: 'response',
        id: envelope.id,
        status: 201,
        headers: { 'content-type': 'application/json' },
        bodyText: JSON.stringify({
          bodyText: envelope.bodyText,
          cookie: envelope.headers.cookie ?? null,
          method: envelope.method,
          path: envelope.path,
        }),
      }),
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82/api/sessions?source=host', {
      body: JSON.stringify({ title: 'New session' }),
      headers: {
        'authorization': 'Bearer employee',
        'content-type': 'application/json',
        'cookie': `sid=employee; aiworker_session=${sessionCookie({
          email: 'bob@zonease.org',
          sub: 'usr_bob',
        })}`,
      },
      method: 'POST',
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      bodyText: JSON.stringify({ title: 'New session' }),
      cookie: null,
      method: 'POST',
      path: '/api/sessions?source=host',
    })
  })

  it('returns 403 when a signed-cookie user opens a worker assigned to someone else', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${sessionCookie({
          email: 'alice@zonease.org',
          sub: 'usr_alice',
        })}`,
      },
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('returns JSON 403 for API routes when session auth is configured and no session exists', async () => {
    const server = await createHostServer({
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://localhost:54145',
      hostControlBaseUrl: 'http://localhost:54145',
      sessionAuth: sessionAuth(),
    })

    const response = await server.fetch(new Request('http://localhost:54145/api/host/assignments', {
      headers: { accept: 'text/html' },
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('allows repeated server creation for the same dbPath', async () => {
    const path = dbPath()

    await createHostServer({
      authUser: adminUser,
      dbPath: path,
      ...hostUrls(),
    })

    await expect(createHostServer({
      authUser: bobUser,
      dbPath: path,
      ...hostUrls(),
    })).resolves.toBeDefined()
  })

  it('throws when creating servers for different active dbPaths in one process', async () => {
    await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    await expect(createHostServer({
      authUser: bobUser,
      dbPath: join(dir, 'other-host.db'),
      ...hostUrls(),
    })).rejects.toThrow('different Host dbPath')
  })

  it('allows an admin to create and list assignments without leaking stored token fields', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'Bob@Example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))

    expect(created.provisionToken).toStartWith('awp_')
    expect(created.provisionCommand).toBe('bun apps/worker-cli/src/aiworker.ts provision --host https://aiworker.zonease.org --token \'awp_[REDACTED]\'')
    expect(created.assignment.assignedEmail).toBe('bob@example.com')
    expect(created.assignment.provisioningTargetRef).toBe('local://default')
    expect(created.assignment.provisionTokenHash).toBeUndefined()

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(created.provisionToken)
    expect(JSON.stringify(listed)).not.toContain('provisionToken')
    expect(JSON.stringify(listed)).not.toContain('provisionTokenHash')
    expect(JSON.stringify(listed)).not.toContain('provisionCommand')
  })

  it('creates assignment through provisioning target and URL contract', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'local',
          maturity: 'dev',
          ref: 'local://default',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.assignment.provisioningTargetRef).toBe('local://default')
    expect(body.assignment.provisioningAdapterType).toBe('local')
    expect(body.assignment.provisioningTargetMaturity).toBe('dev')
    expect(body.provisionCommand).toContain('--host http://127.0.0.1:9117')
    expect(body.deliveryReceipt.command).not.toContain(body.provisionToken)
  })

  it('rejects remote aissh assignment when callback URL is loopback', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        adapterRuntimeControlBaseUrl: 'http://127.0.0.1:9117',
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'aissh',
          maturity: 'production',
          ref: 'srv-1',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'PROVISIONING_TARGET_UNREACHABLE' } })

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(0)
  })

  it('maps storage validation errors without leaking literal secrets', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'local',
          maturity: 'dev',
          ref: 'local://default?token=literal-secret',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const responseText = await response.text()

    expect(response.status).toBe(400)
    expect(JSON.parse(responseText)).toEqual({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } })
    expect(responseText).not.toContain('literal-secret')
    expect(responseText).not.toContain('token=')

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(0)
  })

  it('rejects invalid provisioning target shape before storage', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'kubernetes',
          maturity: 'dev',
          ref: 'k8s://default',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } })

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(0)
  })

  it('quotes unsafe host values in one-time provision commands', async () => {
    const hostControlBaseUrl = 'https://aiworker.zonease.org/~host'
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(hostControlBaseUrl),
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'Bob@Example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))

    expect(created.provisionToken).toStartWith('awp_')
    expect(created.provisionCommand).toBe(`bun apps/worker-cli/src/aiworker.ts provision --host '${hostControlBaseUrl}' --token 'awp_[REDACTED]'`)
  })

  it('blocks non-admin users from listing or creating assignments', async () => {
    const server = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const listResponse = await server.fetch(new Request('http://host/api/host/assignments'))
    const createResponse = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    }))

    expect(listResponse.status).toBe(403)
    expect(createResponse.status).toBe(403)
  })

  it('uses an injected auth provider for admin assignment access', async () => {
    const server = await createHostServer({
      authProvider: {
        async authenticateRequest({ headers }) {
          return headers.get('x-auth-test-user') === 'admin' ? adminUser : null
        },
      },
      authUser: null,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const forbidden = await server.fetch(new Request('http://host/api/host/assignments'))
    const allowed = await server.fetch(new Request('http://host/api/host/assignments', {
      headers: { 'x-auth-test-user': 'admin' },
    }))

    expect(forbidden.status).toBe(403)
    expect(allowed.status).toBe(200)
  })

  it('returns a dev landing that points developers to the Host Web URL', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
      webBaseUrl: 'http://127.0.0.1:5050',
    })

    const response = await server.fetch(new Request('http://host/'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Host API is running')
    expect(body).toContain('http://127.0.0.1:5050/host')
    expect(body).toContain('/api/host/options')
  })

  it('serves Host Web static assets from the Host API process when webStaticDir is configured', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      optionsProvider: async () => ({
        access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
        auth: { mode: 'dev-static', status: 'deferred-logto' },
        provisioningTargets: [{
          adapterType: 'aissh',
          capabilities: ['remote-delivery'],
          displayName: 'aiwork',
          health: 'ready',
          id: 'aissh:srv-1',
          maturity: 'production',
          ref: 'srv-1',
        }],
        soulReleases: [],
      }),
      ...hostUrls(),
      webStaticDir: createHostWebDist(),
    })

    const hostResponse = await server.fetch(new Request('http://host/host'))
    const hostBody = await hostResponse.text()
    expect(hostResponse.status).toBe(200)
    expect(hostResponse.headers.get('content-type')).toContain('text/html')
    expect(hostBody).toContain('host web shell')

    const assetResponse = await server.fetch(new Request('http://host/assets/app.js'))
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.headers.get('content-type')).toContain('application/javascript')
    expect(await assetResponse.text()).toContain('__AIWORKER_HOST_WEB__')

    const faviconResponse = await server.fetch(new Request('http://host/favicon.svg'))
    expect(faviconResponse.status).toBe(200)
    expect(faviconResponse.headers.get('content-type')).toContain('image/svg+xml')

    const optionsResponse = await server.fetch(new Request('http://host/api/host/options'))
    const optionsBody = await json(optionsResponse)
    expect(optionsResponse.status).toBe(200)
    expect(optionsBody.provisioningTargets[0].id).toBe('aissh:srv-1')
  })

  it('does not serve files outside the Host Web static directory', async () => {
    writeFileSync(join(dir, 'secret.txt'), 'do-not-leak')

    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
      webStaticDir: createHostWebDist(),
    })

    const response = await server.fetch(new Request('http://host/assets/%2e%2e/secret.txt'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(body).not.toContain('do-not-leak')
  })

  it('returns Host options for Web and CLI without credentials', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      optionsProvider: async () => ({
        access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
        auth: { mode: 'dev-static', status: 'deferred-logto' },
        provisioningTargets: [{
          adapterType: 'aissh',
          capabilities: ['remote-delivery'],
          displayName: 'aiwork',
          health: 'ready',
          id: 'aissh:srv-1',
          maturity: 'production',
          ref: 'srv-1',
        }],
        soulReleases: [{
          id: 'aiworker-freeform',
          name: 'AIWorker Freeform',
          publishedAt: '2026-06-09T00:00:00.000Z',
          releaseRef: 'aiworker-freeform@1',
          source: 'official',
          version: 1,
        }],
      }),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/options'))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.provisioningTargets[0].id).toBe('aissh:srv-1')
    expect(body.soulReleases[0].releaseRef).toBe('aiworker-freeform@1')
    expect(JSON.stringify(body)).not.toContain('token')
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  function freeformDescriptor() {
    return {
      engine: { skills: { source: 'dist/engine-assets/skills' } },
      identity: { id: 'aiworker-freeform', name: 'AIWorker Freeform' },
      protocol: 'soul/v1',
    }
  }

  it('lets an admin publish a Soul release into the Host registry and list it', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const published = await json(await server.fetch(new Request('http://host/api/host/soul-releases', {
      body: JSON.stringify({ descriptor: freeformDescriptor() }),
      method: 'POST',
    })))

    expect(published.release.releaseRef).toBe('aiworker-freeform@1')
    expect(published.release.soulId).toBe('aiworker-freeform')
    expect(published.release.version).toBe(1)
    expect(JSON.stringify(published)).not.toContain('descriptor_json')
    expect(JSON.stringify(published)).not.toContain('descriptorJson')

    const listed = await json(await server.fetch(new Request('http://host/api/host/soul-releases')))
    expect(listed.releases).toHaveLength(1)
    expect(listed.releases[0].releaseRef).toBe('aiworker-freeform@1')
  })

  it('surfaces a published Soul release through /api/host/options from the registry', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    await server.fetch(new Request('http://host/api/host/soul-releases', {
      body: JSON.stringify({ descriptor: freeformDescriptor() }),
      method: 'POST',
    }))

    const options = await json(await server.fetch(new Request('http://host/api/host/options')))
    const release = options.soulReleases.find((soul: { releaseRef: string }) => soul.releaseRef === 'aiworker-freeform@1')
    expect(release).toBeDefined()
    expect(release.name).toBe('AIWorker Freeform')
    expect(release.version).toBe(1)
  })

  it('rejects Soul release publishing for a non-admin user', async () => {
    const server = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/soul-releases', {
      body: JSON.stringify({ descriptor: freeformDescriptor() }),
      method: 'POST',
    }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: 'FORBIDDEN' } })
  })

  it('rejects an invalid Soul descriptor on publish', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/soul-releases', {
      body: JSON.stringify({ descriptor: { protocol: 'not-soul', identity: {}, engine: {} } }),
      method: 'POST',
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_SOUL_DESCRIPTOR' } })
  })

  it('rejects re-publishing the same Soul release version with 409', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const first = await server.fetch(new Request('http://host/api/host/soul-releases', {
      body: JSON.stringify({ descriptor: freeformDescriptor(), version: 3 }),
      method: 'POST',
    }))
    expect(first.status).toBe(201)

    const second = await server.fetch(new Request('http://host/api/host/soul-releases', {
      body: JSON.stringify({ descriptor: freeformDescriptor(), version: 3 }),
      method: 'POST',
    }))
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: { code: 'SOUL_RELEASE_CONFLICT' } })
  })

  it('rejects assignment creation before storage when assignedEmail is not an email', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'not-an-email',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    }))

    expect(response.status).toBe(400)
  })

  it('includes an aissh exec command in assignment creation', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls('https://aiworker.zonease.org'),
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        adapterRuntimeControlBaseUrl: 'https://aiworker.zonease.org',
        assignedEmail: 'bob@example.com',
        provisioningTarget: {
          adapterType: 'aissh',
          maturity: 'production',
          ref: 'srv-1',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      method: 'POST',
    })))

    expect(created.deliveryReceipt.command).toContain('aissh exec srv-1')
    expect(created.deliveryReceipt.command).not.toContain(created.provisionToken)
    expect(created.deliveryReceipt.command).toContain('--reason=')
  })

  it('consumes a provision token exactly once and returns a worker_access receipt with the resolved soul descriptor', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()
    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: release.releaseRef,
      }),
      method: 'POST',
    })))

    const first = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))
    const receipt = await json(first)

    expect(first.status).toBe(200)
    expect(receipt.access.mode).toBe('worker_access')
    expect(receipt.access.token).toStartWith('awt_')
    expect(receipt.access.url).toBeUndefined()
    expect(receipt.assignment).toEqual({
      assignedEmail: 'bob@example.com',
      assignmentId: created.assignment.assignmentId,
      soulReleaseRef: release.releaseRef,
      workerId: 'wkr_82',
      soulDescriptor: release.descriptorJson,
    })
    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(JSON.stringify(listed)).not.toContain(receipt.access.token)

    const second = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))
    expect(second.status).toBe(401)
  })

  it('fails check-in honestly with 404 when soulReleaseRef resolves to no published release', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    // No publishTestRelease(): the ref points at a release that does not exist.
    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'aiworker-freeform@404',
      }),
      method: 'POST',
    })))

    const response = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ error: { code: 'SOUL_RELEASE_NOT_FOUND' } })
  })

  it('rejects a second check-in that rebinds an already-bound worker_id to a different assignment with 409, never 500', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()

    // Assignment A: bind worker_id wkr_82 directly via storage (bypasses handleCheckIn so
    // no release lookup is needed to seed the worker_id collision).
    const first = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
    })
    verifyAndConsumeProvisionToken(first.provisionToken)
    markAssignmentCheckedIn(first.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })

    // Assignment B: a fresh assignment whose check-in tries to claim the same worker_id.
    const second = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'carol@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: release.releaseRef,
      }),
      method: 'POST',
    })))

    const response = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(second.provisionToken)),
      method: 'POST',
    }))

    expect(response.status).toBe(409)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ID_ALREADY_BOUND' } })
  })

  it('lets a same-box re-provision recover after revocation (revoke frees the worker_id slot, no permanent 409)', async () => {
    // 兑现 4401 撤销后「需重新 provision」的同机恢复承诺:撤销必须清 worker_id,否则死行的
    // worker_id 让新 check-in 永久撞 WORKER_ID_ALREADY_BOUND。
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()

    // Assignment A: 绑定 worker_id wkr_82 然后撤销。
    const first = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
    })
    verifyAndConsumeProvisionToken(first.provisionToken)
    markAssignmentCheckedIn(first.assignment.assignmentId, { workerId: 'wkr_82', workerVersion: '1.0.0' })
    revokeAssignment(first.assignment.assignmentId, 'admin@example.com')

    // Assignment B: 同机 re-provision,同 worker_id 重新 check-in —— 撤销已释放槽,应成功而非 409/500。
    const second = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: release.releaseRef,
      }),
      method: 'POST',
    })))

    const response = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(second.provisionToken)),
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    const receipt = await json(response)
    expect(receipt.assignment.workerId).toBe('wkr_82')
  })

  it('leaves an assignment not ready after check-in until worker access is ready', async () => {
    const adminServer = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()
    const created = await json(await adminServer.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: release.releaseRef,
      }),
      method: 'POST',
    })))
    await adminServer.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))

    const employeeServer = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const response = await employeeServer.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_NOT_READY' } })
  })

  it('blocks users who are not assigned to a ready worker', async () => {
    const server = await createHostServer({
      authUser: aliceUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(403)
  })

  it('returns not-ready for an assigned ready worker without a registered access connection', async () => {
    const server = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_NOT_READY' } })
  })

  it('routes an assigned ready worker when access registry has the connection', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      sendRequest: async envelope => ({
        type: 'response',
        id: envelope.id,
        status: 200,
        headers: { 'content-type': 'text/plain', 'set-cookie': 'sid=worker' },
        bodyText: `worker:${envelope.path}:${envelope.headers.authorization ?? 'no-auth'}`,
      }),
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82/assets/app.js', {
      headers: { authorization: 'Bearer employee', cookie: 'sid=employee' },
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).toBe('worker:/assets/app.js:no-auth')
  })

  it('redirects the bare Workbench entry to a trailing slash so relative SPA assets resolve under the worker prefix', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    let forwardedToWorker = false
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      sendRequest: async (envelope) => {
        forwardedToWorker = true
        return {
          type: 'response',
          id: envelope.id,
          status: 200,
          headers: { 'content-type': 'text/html' },
          bodyText: `worker:${envelope.path}`,
        }
      },
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82', { redirect: 'manual' }))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/workers/wkr_82/')
    // The bare entry redirect is route-only: it must not forward to the worker.
    expect(forwardedToWorker).toBe(false)
  })

  it('forwards a /workers/:id subpath without redirecting so assets and api reach the worker', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      sendRequest: async envelope => ({
        type: 'response',
        id: envelope.id,
        status: 200,
        headers: { 'content-type': 'text/plain' },
        bodyText: `worker:${envelope.path}`,
      }),
      workerId: 'wkr_82',
    })

    // The trailing-slash entry maps to the worker root, and a deeper subpath
    // maps to its stripped local path — neither is redirected.
    const rootEntry = await server.fetch(new Request('http://host/workers/wkr_82/', { redirect: 'manual' }))
    expect(rootEntry.status).toBe(200)
    expect(await rootEntry.text()).toBe('worker:/')

    const subpath = await server.fetch(new Request('http://host/workers/wkr_82/api/sessions', { redirect: 'manual' }))
    expect(subpath.status).toBe(200)
    expect(await subpath.text()).toBe('worker:/api/sessions')

    const asset = await server.fetch(new Request('http://host/workers/wkr_82/assets/app.js', { redirect: 'manual' }))
    expect(asset.status).toBe(200)
    expect(await asset.text()).toBe('worker:/assets/app.js')
  })

  it('returns a fixed worker access failure without leaking worker error text', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      assignmentId: created.assignment.assignmentId,
      close() {},
      async sendRequest() {
        throw new Error('token=awt_secret_should_not_escape')
      },
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82/api/info'))
    const body = await response.text()

    expect(response.status).toBe(502)
    expect(body).toBe(JSON.stringify({ error: { code: 'WORKER_ACCESS_FAILED' } }))
    expect(body).not.toContain('awt_secret_should_not_escape')
  })

  it('returns upgrade required for worker access without a Bun websocket server', async () => {
    const server = await createHostServer({
      authUser: null,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/provision/access'))

    expect(response.status).toBe(426)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } })
  })

  it('upgrades worker access websocket requests when Bun server is provided', async () => {
    const upgrades: unknown[] = []
    const server = await createHostServer({
      authUser: null,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const bunServer = {
      upgrade(request: Request, options: unknown) {
        upgrades.push({ options, url: request.url })
        return true
      },
    } as Bun.Server<{ workerId?: string }>

    const response = await server.fetch(new Request('http://host/api/provision/access'), bunServer)

    expect(response.status).toBe(101)
    expect(upgrades).toHaveLength(1)
  })

  it('closes a hello with an invalid/revoked access token using the access_rejected (4401) close code', async () => {
    const server = await createHostServer({
      accessRegistry: createWorkerAccessRegistry(),
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const closeCalls: Array<{ code?: number, reason?: string }> = []
    const ws = {
      data: {},
      close(code?: number, reason?: string) {
        closeCalls.push({ code, reason })
      },
      send() {
        return 1
      },
    }

    // No assignment exists for this token → verifyAssignmentAccessToken returns null (the
    // revoked/denied branch). The worker reads 4401 to distinguish revocation from a transient blip.
    await server.websocket.message?.(ws as unknown as Bun.ServerWebSocket<{ workerId?: string }>, JSON.stringify({
      type: 'hello',
      assignmentId: 'asn_does_not_exist',
      token: 'awt_revoked_or_invalid',
      workerId: 'wkr_82',
    }))

    expect(closeCalls).toEqual([{ code: 4401, reason: 'access_rejected' }])
  })

  it('registers a websocket tunnel and forwards worker route requests through it', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
    })
    const checkInResponse = await json(await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    })))
    let closed = false
    const ws = {
      data: {},
      close() {
        closed = true
      },
      send(message: string) {
        const frame = JSON.parse(message)
        if (frame.type === 'request') {
          queueMicrotask(() => {
            server.websocket.message?.(ws as Bun.ServerWebSocket<{ workerId?: string }>, JSON.stringify({
              type: 'response',
              id: frame.id,
              status: 200,
              headers: { 'content-type': 'text/plain' },
              bodyText: `from-worker:${frame.path}`,
            }))
          })
        }
        return 1
      },
    }

    await server.websocket.message?.(ws as Bun.ServerWebSocket<{ workerId?: string }>, JSON.stringify({
      type: 'hello',
      assignmentId: created.assignment.assignmentId,
      token: checkInResponse.access.token,
      workerId: 'wkr_82',
    }))

    expect(closed).toBe(false)
    expect(accessRegistry.has('wkr_82')).toBe(true)
    const response = await server.fetch(new Request('http://host/workers/wkr_82/assets/app.js'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('from-worker:/assets/app.js')
  })

  it('keeps a new websocket tunnel registered when the old duplicate socket closes late', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
    })
    const checkInResponse = await json(await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    })))
    let oldClosed = 0
    let newClosed = 0
    const oldWs = {
      data: {},
      close() {
        oldClosed += 1
      },
      send() {
        return 1
      },
    }
    const newWs = {
      data: {},
      close() {
        newClosed += 1
      },
      send(message: string) {
        const frame = JSON.parse(message)
        if (frame.type === 'request') {
          queueMicrotask(() => {
            server.websocket.message?.(newWs as never, JSON.stringify({
              type: 'response',
              id: frame.id,
              status: 200,
              headers: { 'content-type': 'text/plain' },
              bodyText: 'new-tunnel',
            }))
          })
        }
        return 1
      },
    }
    const hello = JSON.stringify({
      type: 'hello',
      assignmentId: created.assignment.assignmentId,
      token: checkInResponse.access.token,
      workerId: 'wkr_82',
    })

    await server.websocket.message?.(oldWs as never, hello)
    await server.websocket.message?.(newWs as never, hello)
    server.websocket.close?.(oldWs as never, 1000, '')

    expect(oldClosed).toBe(1)
    expect(newClosed).toBe(0)
    expect(accessRegistry.has('wkr_82')).toBe(true)
    const response = await server.fetch(new Request('http://host/workers/wkr_82/api/info'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('new-tunnel')
  })

  it('ignores response frames for pending requests owned by a different socket', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
    })
    const checkInResponse = await json(await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    })))
    const wrongWs = {
      data: {},
      close() {},
      send() {
        return 1
      },
    }
    const ownerWs = {
      data: {},
      close() {},
      send(message: string) {
        const frame = JSON.parse(message)
        if (frame.type === 'request') {
          queueMicrotask(async () => {
            await server.websocket.message?.(wrongWs as never, JSON.stringify({
              type: 'response',
              id: frame.id,
              status: 200,
              headers: { 'content-type': 'text/plain' },
              bodyText: 'wrong-socket',
            }))
            await server.websocket.message?.(ownerWs as never, JSON.stringify({
              type: 'response',
              id: frame.id,
              status: 200,
              headers: { 'content-type': 'text/plain' },
              bodyText: 'owner-socket',
            }))
          })
        }
        return 1
      },
    }

    await server.websocket.message?.(ownerWs as never, JSON.stringify({
      type: 'hello',
      assignmentId: created.assignment.assignmentId,
      token: checkInResponse.access.token,
      workerId: 'wkr_82',
    }))

    const response = await server.fetch(new Request('http://host/workers/wkr_82/api/info'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('owner-socket')
  })

  it('closes a websocket that sends a hello frame with an invalid access token (cannot reach ready without a valid tunnel hello)', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const release = publishTestRelease()
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
    })
    // consume the token so an assignment exists in checked_in state
    const checkInResponse = await json(await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    })))
    expect(checkInResponse.access.mode).toBe('worker_access')

    let closed = false
    const ws = {
      data: {},
      close() { closed = true },
      send() { return 1 },
    }

    // Send hello with a forged/wrong access token — verifyAssignmentAccessToken returns null → ws.close()
    await server.websocket.message?.(ws as unknown as Bun.ServerWebSocket<{ workerId?: string }>, JSON.stringify({
      type: 'hello',
      assignmentId: created.assignment.assignmentId,
      token: 'awt_forged_invalid_token',
      workerId: 'wkr_82',
    }))

    expect(closed).toBe(true)
    expect(accessRegistry.has('wkr_82')).toBe(false)
  })

  it('emits a redacted per-request forward log without body, headers, secrets, or query', async () => {
    const originalInfo = console.warn
    const logs: string[] = []
    console.warn = (...values: unknown[]) => {
      logs.push(values.map(value => String(value)).join(' '))
    }
    try {
      const accessRegistry = createWorkerAccessRegistry()
      const server = await createHostServer({
        accessRegistry,
        dbPath: dbPath(),
        hostBrowserBaseUrl: 'http://localhost:54145',
        hostControlBaseUrl: 'http://localhost:54145',
        sessionAuth: sessionAuth(),
      })
      const created = createAssignment({
        assignedEmail: 'bob@zonease.org',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      })
      verifyAndConsumeProvisionToken(created.provisionToken)
      markAssignmentCheckedIn(created.assignment.assignmentId, {
        workerId: 'wkr_82',
        workerVersion: '1.0.0',
      })
      markAssignmentAccessReady(created.assignment.assignmentId)
      markAssignmentReady(created.assignment.assignmentId, {
        workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
      })
      accessRegistry.register({
        assignmentId: created.assignment.assignmentId,
        close() {},
        sendRequest: async envelope => ({
          type: 'response',
          id: envelope.id,
          status: 200,
          headers: { 'content-type': 'text/plain' },
          bodyText: 'worker-body-SENTINEL_BODY',
        }),
        workerId: 'wkr_82',
      })

      const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82/api/sessions?token=SENTINEL_TK&email=leak@secret.test', {
        body: 'SENTINEL_REQ_BODY',
        headers: {
          'authorization': 'Bearer SENTINEL_AUTH',
          'content-type': 'application/json',
          'cookie': `sid=SENTINEL_COOKIE; aiworker_session=${sessionCookie({
            email: 'bob@zonease.org',
            sub: 'usr_bob',
          })}`,
          'x-aiworker-user-email': 'bob@zonease.org',
        },
        method: 'POST',
      }))

      expect(response.status).toBe(200)

      const forwardLogs = logs.filter(line => line.includes('worker_route_forwarded'))
      expect(forwardLogs.length).toBe(1)
      const record = JSON.parse(forwardLogs[0]!) as Record<string, unknown>
      expect(record.event).toBe('worker_route_forwarded')
      expect(record.workerId).toBe('wkr_82')
      expect(record.localPath).toBe('/api/sessions')
      expect(record.responseStatus).toBe(200)
      expect(typeof record.requestId).toBe('string')
      expect((record.requestId as string).length).toBeGreaterThan(0)
      expect(Object.keys(record).sort()).toEqual(['event', 'localPath', 'requestId', 'responseStatus', 'workerId'])

      const line = forwardLogs[0]!
      expect(line).not.toContain('SENTINEL_BODY')
      expect(line).not.toContain('SENTINEL_REQ_BODY')
      expect(line).not.toContain('SENTINEL_AUTH')
      expect(line).not.toContain('SENTINEL_COOKIE')
      expect(line).not.toContain('SENTINEL_TK')
      expect(line).not.toContain('leak@secret.test')
      expect(line).not.toContain('bob@zonease.org')
      expect(line).not.toContain('authorization')
      expect(line).not.toContain('cookie')
      expect(line).not.toContain('x-aiworker-user-email')
    }
    finally {
      console.warn = originalInfo
    }
  })

  it('emits a forward log carrying the failure responseStatus when the tunnel fails', async () => {
    const originalInfo = console.warn
    const logs: string[] = []
    console.warn = (...values: unknown[]) => {
      logs.push(values.map(value => String(value)).join(' '))
    }
    try {
      const accessRegistry = createWorkerAccessRegistry()
      const server = await createHostServer({
        accessRegistry,
        authUser: bobUser,
        dbPath: dbPath(),
        ...hostUrls(),
      })
      const created = createAssignment({
        assignedEmail: 'bob@example.com',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      })
      verifyAndConsumeProvisionToken(created.provisionToken)
      markAssignmentCheckedIn(created.assignment.assignmentId, {
        workerId: 'wkr_82',
        workerVersion: '1.0.0',
      })
      markAssignmentAccessReady(created.assignment.assignmentId)
      markAssignmentReady(created.assignment.assignmentId, {
        workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
      })
      accessRegistry.register({
        assignmentId: created.assignment.assignmentId,
        close() {},
        async sendRequest() {
          throw new Error('tunnel down')
        },
        workerId: 'wkr_82',
      })

      const response = await server.fetch(new Request('http://host/workers/wkr_82/api/info'))
      expect(response.status).toBe(502)

      const forwardLogs = logs.filter(line => line.includes('worker_route_forwarded'))
      expect(forwardLogs.length).toBe(1)
      const record = JSON.parse(forwardLogs[0]!) as Record<string, unknown>
      expect(record.workerId).toBe('wkr_82')
      expect(record.localPath).toBe('/api/info')
      expect(record.responseStatus).toBe(502)
      expect(typeof record.requestId).toBe('string')
    }
    finally {
      console.warn = originalInfo
    }
  })

  it('emits a forward log with the 502 responseStatus when the worker response is malformed', async () => {
    const originalInfo = console.warn
    const logs: string[] = []
    console.warn = (...values: unknown[]) => {
      logs.push(values.map(value => String(value)).join(' '))
    }
    try {
      const accessRegistry = createWorkerAccessRegistry()
      const server = await createHostServer({
        accessRegistry,
        authUser: bobUser,
        dbPath: dbPath(),
        ...hostUrls(),
      })
      const created = createAssignment({
        assignedEmail: 'bob@example.com',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      })
      verifyAndConsumeProvisionToken(created.provisionToken)
      markAssignmentCheckedIn(created.assignment.assignmentId, {
        workerId: 'wkr_82',
        workerVersion: '1.0.0',
      })
      markAssignmentAccessReady(created.assignment.assignmentId)
      markAssignmentReady(created.assignment.assignmentId, {
        workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
      })
      accessRegistry.register({
        assignmentId: created.assignment.assignmentId,
        close() {},
        sendRequest: async envelope => ({
          type: 'response',
          id: envelope.id,
          status: 999,
          headers: {},
          bodyText: '',
        }) as never,
        workerId: 'wkr_82',
      })

      const response = await server.fetch(new Request('http://host/workers/wkr_82/api/info'))
      expect(response.status).toBe(502)

      const forwardLogs = logs.filter(line => line.includes('worker_route_forwarded'))
      expect(forwardLogs.length).toBe(1)
      const record = JSON.parse(forwardLogs[0]!) as Record<string, unknown>
      expect(record.workerId).toBe('wkr_82')
      expect(record.localPath).toBe('/api/info')
      expect(record.responseStatus).toBe(502)
      expect(typeof record.requestId).toBe('string')
    }
    finally {
      console.warn = originalInfo
    }
  })

  it('keeps concurrent worker forward logs attributed to their own worker', async () => {
    const originalInfo = console.warn
    const logs: string[] = []
    console.warn = (...values: unknown[]) => {
      logs.push(values.map(value => String(value)).join(' '))
    }
    try {
      const accessRegistry = createWorkerAccessRegistry()
      const server = await createHostServer({
        accessRegistry,
        dbPath: dbPath(),
        hostBrowserBaseUrl: 'http://localhost:54145',
        hostControlBaseUrl: 'http://localhost:54145',
        sessionAuth: sessionAuth(),
      })

      for (const { email, workerId } of [
        { email: 'alice@zonease.org', sub: 'usr_alice', workerId: 'wkr_aaa' },
        { email: 'bob@zonease.org', sub: 'usr_bob', workerId: 'wkr_bbb' },
      ]) {
        const created = createAssignment({
          assignedEmail: email,
          serverRef: 'host-main',
          soulReleaseRef: 'soul_release_1',
        })
        verifyAndConsumeProvisionToken(created.provisionToken)
        markAssignmentCheckedIn(created.assignment.assignmentId, {
          workerId,
          workerVersion: '1.0.0',
        })
        markAssignmentAccessReady(created.assignment.assignmentId)
        markAssignmentReady(created.assignment.assignmentId, {
          workbenchUrl: `https://aiworker.zonease.org/workers/${workerId}`,
        })
        accessRegistry.register({
          assignmentId: created.assignment.assignmentId,
          close() {},
          sendRequest: async envelope => ({
            type: 'response',
            id: envelope.id,
            status: 200,
            headers: { 'content-type': 'text/plain' },
            bodyText: workerId,
          }),
          workerId,
        })
      }

      const requestFor = (email: string, sub: string, workerId: string) =>
        server.fetch(new Request(`http://localhost:54145/workers/${workerId}/api/info`, {
          headers: {
            cookie: `aiworker_session=${sessionCookie({ email, sub })}`,
          },
        }))

      const [resA, resB] = await Promise.all([
        requestFor('alice@zonease.org', 'usr_alice', 'wkr_aaa'),
        requestFor('bob@zonease.org', 'usr_bob', 'wkr_bbb'),
      ])
      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)

      const forwardLogs = logs
        .filter(line => line.includes('worker_route_forwarded'))
        .map(line => JSON.parse(line) as Record<string, unknown>)
      expect(forwardLogs.length).toBe(2)
      const byWorker = new Map(forwardLogs.map(record => [record.workerId, record]))
      expect(byWorker.get('wkr_aaa')?.localPath).toBe('/api/info')
      expect(byWorker.get('wkr_bbb')?.localPath).toBe('/api/info')
      expect(forwardLogs.every(record => record.workerId === 'wkr_aaa' || record.workerId === 'wkr_bbb')).toBe(true)
    }
    finally {
      console.warn = originalInfo
    }
  })

  // ── Phase 3 credential_acquire / credential_refresh ──────────────────────────
  // A fake broker records its mint calls and returns a fixed grant so tests can
  // assert profile/providerKind derivation and the grant frame shape — never a real
  // network call or real provider quota.
  function createFakeBroker(grantToken = 'sk-ant-org-key-as-is') {
    const mintCalls: Array<{ profile: string | undefined, providerKind: string }> = []
    const broker = {
      mint(profile: string | undefined, providerKind: 'anthropic' | 'openai') {
        mintCalls.push({ profile, providerKind })
        return {
          providerKind,
          gatewayUrl: `https://gw.example.com/${providerKind}`,
          token: grantToken,
          expiresAt: '2999-01-01T00:00:00.000Z',
        }
      },
      revoke() {
        return { supported: false as const, reason: 'org-key mode has no per-worker revocation' }
      },
    }
    return { broker, mintCalls }
  }

  async function readyAssignmentAndHello(
    server: Awaited<ReturnType<typeof createHostServer>>,
    accessRegistry: ReturnType<typeof createWorkerAccessRegistry>,
    options: { workerId?: string, metadataJson?: Record<string, unknown> } = {},
  ): Promise<{ assignmentId: string, ws: { data: Record<string, unknown>, sent: string[], closed: boolean } }> {
    const workerId = options.workerId ?? 'wkr_82'
    const release = publishTestRelease()
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: release.releaseRef,
      ...(options.metadataJson ? { metadataJson: options.metadataJson } : {}),
    })
    const checkInResponse = await json(await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken, workerId)),
      method: 'POST',
    })))
    const ws = {
      data: {} as Record<string, unknown>,
      sent: [] as string[],
      closed: false,
      close() { this.closed = true },
      send(message: string) {
        this.sent.push(message)
        return 1
      },
    }
    await server.websocket.message?.(ws as never, JSON.stringify({
      type: 'hello',
      assignmentId: created.assignment.assignmentId,
      token: checkInResponse.access.token,
      workerId,
    }))
    return { assignmentId: created.assignment.assignmentId, ws }
  }

  it('mints a credential_grant on credential_acquire using the assignment derived from the authenticated connection', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const { broker, mintCalls } = createFakeBroker()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      credentialBroker: broker,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const { ws } = await readyAssignmentAndHello(server, accessRegistry)

    await server.websocket.message?.(ws as never, JSON.stringify({
      type: 'credential_acquire',
      providerKind: 'anthropic',
    }))

    expect(mintCalls).toEqual([{ profile: undefined, providerKind: 'anthropic' }])
    const grants = ws.sent.map(message => JSON.parse(message)).filter(frame => frame.type === 'credential_grant')
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({
      type: 'credential_grant',
      providerKind: 'anthropic',
      gatewayUrl: 'https://gw.example.com/anthropic',
      token: 'sk-ant-org-key-as-is',
      expiresAt: '2999-01-01T00:00:00.000Z',
    })
    expect(ws.closed).toBe(false)
  })

  it('treats credential_refresh the same as credential_acquire', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const { broker, mintCalls } = createFakeBroker()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      credentialBroker: broker,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const { ws } = await readyAssignmentAndHello(server, accessRegistry)

    await server.websocket.message?.(ws as never, JSON.stringify({
      type: 'credential_refresh',
      providerKind: 'openai',
    }))

    expect(mintCalls).toEqual([{ profile: undefined, providerKind: 'openai' }])
    const grants = ws.sent.map(message => JSON.parse(message)).filter(frame => frame.type === 'credential_grant')
    expect(grants).toHaveLength(1)
    expect(grants[0].providerKind).toBe('openai')
  })

  it('passes the per-assignment metadata profile to the broker', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const { broker, mintCalls } = createFakeBroker()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      credentialBroker: broker,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const { ws } = await readyAssignmentAndHello(server, accessRegistry, {
      metadataJson: { profile: 'acme' },
    })

    await server.websocket.message?.(ws as never, JSON.stringify({
      type: 'credential_acquire',
      providerKind: 'anthropic',
    }))

    expect(mintCalls).toEqual([{ profile: 'acme', providerKind: 'anthropic' }])
  })

  it('derives the assignment from each connection — a worker authenticated for A cannot mint for B', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const { broker, mintCalls } = createFakeBroker()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      credentialBroker: broker,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const a = await readyAssignmentAndHello(server, accessRegistry, { workerId: 'wkr_a', metadataJson: { profile: 'profile-a' } })
    const b = await readyAssignmentAndHello(server, accessRegistry, { workerId: 'wkr_b', metadataJson: { profile: 'profile-b' } })

    await server.websocket.message?.(a.ws as never, JSON.stringify({ type: 'credential_acquire', providerKind: 'anthropic' }))
    await server.websocket.message?.(b.ws as never, JSON.stringify({ type: 'credential_acquire', providerKind: 'anthropic' }))

    // Each connection minted with ITS OWN assignment's profile — derivation is
    // per-connection ws.data, not anything the frame could carry.
    expect(mintCalls).toEqual([
      { profile: 'profile-a', providerKind: 'anthropic' },
      { profile: 'profile-b', providerKind: 'anthropic' },
    ])
  })

  it('does not mint for a credential_acquire that arrives without a prior authenticated hello', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const { broker, mintCalls } = createFakeBroker()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      credentialBroker: broker,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const ws = {
      data: {} as Record<string, unknown>,
      sent: [] as string[],
      closed: false,
      close() { this.closed = true },
      send(message: string) {
        this.sent.push(message)
        return 1
      },
    }

    await server.websocket.message?.(ws as never, JSON.stringify({
      type: 'credential_acquire',
      providerKind: 'anthropic',
    }))

    expect(mintCalls).toHaveLength(0)
    expect(ws.sent).toHaveLength(0)
    expect(ws.closed).toBe(false)
  })

  it('ignores credential frames when no broker is configured (no crash, no grant)', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const { ws } = await readyAssignmentAndHello(server, accessRegistry)

    await server.websocket.message?.(ws as never, JSON.stringify({
      type: 'credential_acquire',
      providerKind: 'anthropic',
    }))

    const grants = ws.sent.map(message => JSON.parse(message)).filter(frame => frame.type === 'credential_grant')
    expect(grants).toHaveLength(0)
    expect(ws.closed).toBe(false)
  })

  it('does not tear down the tunnel or leak the org key when mint throws', async () => {
    const originalWarn = console.warn
    const logs: string[] = []
    console.warn = (...values: unknown[]) => {
      logs.push(values.map(value => String(value)).join(' '))
    }
    try {
      // The error message embeds BOTH a sk-ant- prefixed token (branch 1) AND a
      // long opaque ≥32-char bare run (branch 2, the {32,} catch-all) so the mint
      // redactor's two branches are both exercised on the live failure path. A real
      // mint error carries env-var NAMES not values, but this hostile message proves
      // safeCredentialMintMessage strips both shapes before the log line is emitted.
      const skAntToken = 'sk-ant-SENTINEL-mint-error-token-do-not-leak'
      const bareRun = 'BARE0123456789abcdefABCDEF0123456789xyz'
      const accessRegistry = createWorkerAccessRegistry()
      const throwingBroker = {
        mint() {
          throw new Error(`org-key rejected ${skAntToken} and bare ${bareRun} value`)
        },
        revoke() { return { supported: false as const } },
      }
      const server = await createHostServer({
        accessRegistry,
        authUser: bobUser,
        credentialBroker: throwingBroker,
        dbPath: dbPath(),
        ...hostUrls(),
      })
      const { ws } = await readyAssignmentAndHello(server, accessRegistry)

      await server.websocket.message?.(ws as never, JSON.stringify({
        type: 'credential_acquire',
        providerKind: 'anthropic',
      }))

      // No grant emitted, tunnel stays up (catch swallows the mint error so the
      // shared message() catch never fires ws.close()), and the worker still
      // forwards HTTP — degrade gracefully, do not crash.
      const grants = ws.sent.map(message => JSON.parse(message)).filter(frame => frame.type === 'credential_grant')
      expect(grants).toHaveLength(0)
      expect(ws.closed).toBe(false)
      expect(accessRegistry.has('wkr_82')).toBe(true)
      // A failure line may be logged but must never carry a token value — neither the
      // sk-ant- prefixed shape (branch 1) nor the long bare run (branch 2).
      const failLogs = logs.filter(line => line.includes('worker_credential_mint_failed'))
      expect(failLogs.length).toBeGreaterThanOrEqual(1)
      const failLogText = failLogs.join('\n')
      expect(failLogText).not.toContain(skAntToken)
      expect(failLogText).not.toContain(bareRun)
      expect(failLogText).toContain('[redacted]')
    }
    finally {
      console.warn = originalWarn
    }
  })

  it('never logs the granted org key token on a successful credential_acquire', async () => {
    const originalWarn = console.warn
    const logs: string[] = []
    console.warn = (...values: unknown[]) => {
      logs.push(values.map(value => String(value)).join(' '))
    }
    try {
      const accessRegistry = createWorkerAccessRegistry()
      const { broker } = createFakeBroker('sk-ant-super-secret-org-key')
      const server = await createHostServer({
        accessRegistry,
        authUser: bobUser,
        credentialBroker: broker,
        dbPath: dbPath(),
        ...hostUrls(),
      })
      const { ws } = await readyAssignmentAndHello(server, accessRegistry)

      await server.websocket.message?.(ws as never, JSON.stringify({
        type: 'credential_acquire',
        providerKind: 'anthropic',
      }))

      expect(logs.join('\n')).not.toContain('sk-ant-super-secret-org-key')
    }
    finally {
      console.warn = originalWarn
    }
  })
})

interface OidcFixture {
  config: OidcClientConfig
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  server: ReturnType<typeof Bun.serve>
}

async function createOidcFixture(options: {
  tokenBody?: unknown
  tokenStatus?: number
} = {}): Promise<OidcFixture> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  const server = Bun.serve({
    fetch: async (request) => {
      const url = new URL(request.url)

      if (url.pathname === '/oidc/.well-known/openid-configuration') {
        return Response.json({
          authorization_endpoint: `${url.origin}/discovered/auth`,
          jwks_uri: `${url.origin}/discovered/jwks`,
          token_endpoint: `${url.origin}/discovered/token`,
        })
      }

      if (url.pathname === '/discovered/jwks') {
        return Response.json({
          keys: [{ ...publicJwk, alg: 'RS256', kid: 'key-1', use: 'sig' }],
        })
      }

      if (url.pathname === '/discovered/token') {
        if (options.tokenStatus)
          return Response.json(options.tokenBody ?? { error: 'invalid_grant' }, { status: options.tokenStatus })

        const idToken = await new SignJWT({
          email: 'bob@zonease.org',
          email_verified: true,
          nonce: 'nonce-123',
          roles: ['host:admin'],
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
          .setSubject('usr_bob')
          .setIssuer(`${url.origin}/oidc`)
          .setAudience('client-id')
          .setExpirationTime('5m')
          .sign(privateKey)

        return Response.json({
          access_token: 'logto-access-token-that-must-not-be-stored',
          id_token: idToken,
          token_type: 'Bearer',
        })
      }

      return new Response('not found', { status: 404 })
    },
    port: 0,
  })

  const origin = `http://${server.hostname}:${server.port}`

  return {
    config: {
      allowedEmailDomains: ['zonease.org'],
      clientId: 'client-id',
      clientSecret: 'client-secret',
      endpoint: `${origin}/`,
      issuer: `${origin}/oidc`,
      redirectUri: 'http://localhost:54145/auth/callback',
    },
    fetch: async (input, init) => fetch(input, init),
    server,
  }
}

function setCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = headers.getSetCookie?.()
  if (values?.length)
    return values

  const header = response.headers.get('set-cookie')
  // eslint-disable-next-line regexp/no-super-linear-backtracking -- test helper splitting the test's own set-cookie header (trusted, bounded input)
  return header ? header.split(/,\s*(?=[^;,]+=)/) : []
}

function cookieValueFromSetCookie(setCookie: string, name = 'aiworker_session'): string {
  const [pair] = setCookie.split(';', 1)
  const prefix = `${name}=`
  if (!pair?.startsWith(prefix))
    throw new Error(`Expected Set-Cookie to start with ${prefix}`)
  return pair.slice(prefix.length)
}
