import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createWorkerAccessRegistry } from '@zonease/aiworker-host-control'
import {
  createAssignment,
  markAssignmentAccessReady,
  markAssignmentCheckedIn,
  markAssignmentReady,
  verifyAndConsumeProvisionToken,
} from '@zonease/aiworker-storage-sqlite/host'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import {
  createSignedCookie,
  readSignedCookie,
  type HostSessionPayload,
} from './host-session-cookie'
import type { OidcClientConfig } from './host-oidc-client'
import { createHostServer } from './host-server'

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

  function sessionAuth(input: {
    fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    now?: () => Date
    oidc?: OidcClientConfig
  } = {}) {
    return {
      fetch: input.fetch ?? (async () => Response.json({
        authorization_endpoint: 'https://auth.zonease.org/oidc/auth',
        jwks_uri: 'https://auth.zonease.org/oidc/jwks',
        token_endpoint: 'https://auth.zonease.org/oidc/token',
      })),
      now: input.now,
      oidc: input.oidc ?? {
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
        roles: ['host:admin'],
        sub: 'usr_bob',
      })
    }
    finally {
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
        roles: ['host:admin'],
        subject: 'usr_bob',
      },
    })
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
      async sendRequest() {
        throw new Error('sendRequest should not be called by the placeholder route')
      },
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82', {
      headers: {
        accept: 'text/html',
        cookie: `aiworker_session=${sessionCookie({
          email: 'bob@zonease.org',
          sub: 'usr_bob',
        })}`,
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ routed: true, workerId: 'wkr_82' })
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
          descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
          id: 'aiworker-freeform',
          name: 'AIWorker Freeform',
          releaseRef: 'aiworker-freeform@dev',
          source: 'official',
        }],
      }),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/options'))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.provisioningTargets[0].id).toBe('aissh:srv-1')
    expect(body.soulReleases[0].releaseRef).toBe('aiworker-freeform@dev')
    expect(JSON.stringify(body)).not.toContain('token')
    expect(JSON.stringify(body)).not.toContain('secret')
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

  it('consumes a provision token exactly once and returns a worker_access receipt', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
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
      soulReleaseRef: 'soul_release_1',
      workerId: 'wkr_82',
    })

    const second = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))
    expect(second.status).toBe(401)
  })

  it('leaves an assignment not ready after check-in until worker access is ready', async () => {
    const adminServer = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = await json(await adminServer.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
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
      async sendRequest() {
        throw new Error('sendRequest should not be called by the placeholder route')
      },
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ routed: true, workerId: 'wkr_82' })
  })

  it('returns upgrade required for worker access before websocket support exists', async () => {
    const server = await createHostServer({
      authUser: null,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/provision/access'))

    expect(response.status).toBe(426)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } })
  })
})

interface OidcFixture {
  config: OidcClientConfig
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  server: ReturnType<typeof Bun.serve>
}

async function createOidcFixture(): Promise<OidcFixture> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  const server = Bun.serve({
    fetch: async request => {
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
  return header ? header.split(/,\s*(?=[^;,]+=)/) : []
}

function cookieValueFromSetCookie(setCookie: string, name = 'aiworker_session'): string {
  const [pair] = setCookie.split(';', 1)
  const prefix = `${name}=`
  if (!pair?.startsWith(prefix))
    throw new Error(`Expected Set-Cookie to start with ${prefix}`)
  return pair.slice(prefix.length)
}
