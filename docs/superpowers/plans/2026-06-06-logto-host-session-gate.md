# Logto Host Session Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real Logto Hosted Login for AIWorker Host with signed HttpOnly session cookies, `zonease.org` email enforcement, `/host` admin gate, `/workers/:workerId` assignment gate, and a local browser proof.

**Architecture:** Logto owns the hosted login UI. Host owns OIDC callback handling, signed session cookies, and authorization decisions. Browser routes may redirect to Logto; JSON API routes return JSON 403; Worker access never receives browser cookies or Logto tokens.

**Tech Stack:** Bun, TypeScript, Hono-style `Request`/`Response` handlers in `apps/host-cli`, `jose` for OIDC/JWT verification, Node `crypto` for HMAC and PKCE, existing `@zonease/aiworker-host-control` assignment/auth primitives, Playwright browser proof scripts.

---

## Scope Check

This plan is one subsystem: `Logto 托管登录 + Host Session Gate`. It does not implement Worker Access Tunnel, production Caddy/Cloudflare proof, custom Logto login UI, DB-backed sessions, or per-worker Logto path permissions.

## File Structure

- Create `apps/host-cli/src/host-session-cookie.ts`
  - Owns signed cookie creation, parsing, expiry checks, cookie attributes, clear-cookie headers, and `Cookie` header parsing.
- Create `apps/host-cli/src/host-session-cookie.test.ts`
  - Contract tests for tamper rejection, expiry, attributes, and token non-persistence.
- Create `apps/host-cli/src/host-oidc-client.ts`
  - Owns OIDC discovery, PKCE auth URL generation, callback code exchange, ID token verification, `zonease.org` claim mapping, and token redaction boundaries.
- Create `apps/host-cli/src/host-oidc-client.test.ts`
  - Contract tests with local JWKS and token endpoint fixtures.
- Create `apps/host-cli/src/logto-app-config.ts`
  - Owns reading root `.env`, redacted config loading, M2M token acquisition, Logto app lookup/create/update, and manual fallback output.
- Create `apps/host-cli/src/logto-app-config.test.ts`
  - Fetch-mock tests for M2M token, app creation/update, secret handling, and permission failure fallback.
- Modify `apps/host-cli/src/logto-auth.ts`
  - Keep existing Bearer JWT adapter; add shared claim normalizer or import it from `host-oidc-client` only if it does not create cycles. Prefer no change unless duplication becomes real.
- Modify `apps/host-cli/src/host-server.ts`
  - Add optional `sessionAuth` config, auth routes, `/api/auth/me`, browser redirect gates, JSON API gates, and signed-cookie auth provider.
- Modify `apps/host-cli/src/host-server.test.ts`
  - Add auth route and route gate tests.
- Modify `apps/host-cli/src/aiworker-host.ts`
  - Add serve options/env wiring for Logto hosted login proof and session secret.
- Modify `apps/host-cli/src/aiworker-host.test.ts`
  - Add CLI/env wiring tests.
- Create `tests/browser/logto-host-session-gate.spec.ts`
  - Local browser proof skeleton that supports manual Logto login and records evidence.
- Modify root `package.json`
  - Add `test:browser:logto-auth-proof` only after the proof script exists.

## Task 1: Signed Host Session Cookie Module

**Files:**
- Create: `apps/host-cli/src/host-session-cookie.ts`
- Create: `apps/host-cli/src/host-session-cookie.test.ts`

- [ ] **Step 1: Write failing tests for signed session cookies**

Create `apps/host-cli/src/host-session-cookie.test.ts`:

```ts
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
    const tampered = value.replace('alice', 'mallory')

    expect(readSignedCookie(tampered, {
      now: () => new Date('2026-06-06T04:01:00.000Z'),
      secret,
    })).toBeNull()
    expect(readSignedCookie(value, {
      now: () => new Date('2026-06-06T13:00:00.000Z'),
      secret,
    })).toBeNull()
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
```

- [ ] **Step 2: Run the failing cookie tests**

Run:

```bash
bun test apps/host-cli/src/host-session-cookie.test.ts --timeout=15000
```

Expected: FAIL because `apps/host-cli/src/host-session-cookie.ts` does not exist.

- [ ] **Step 3: Implement signed session cookies**

Create `apps/host-cli/src/host-session-cookie.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface HostSessionPayload {
  email: string
  expiresAt: string
  roles: string[]
  sub: string
}

export interface SignedCookieOptions {
  maxAgeSeconds: number
  now?: () => Date
  path: string
  requestUrl: string
  sameSite: 'Lax'
  secret: string
}

export function createSignedCookie<T extends { expiresAt: string }>(
  name: string,
  payload: T,
  options: SignedCookieOptions,
): string {
  const body = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(body, options.secret)
  const value = `${body}.${signature}`
  return `${name}=${value}; ${sessionCookieAttributes(options)}`
}

export function readSignedCookie<T extends { expiresAt?: unknown }>(
  value: string | null | undefined,
  options: { now?: () => Date, secret: string },
): T | null {
  if (!value)
    return null
  const [body, signature, extra] = value.split('.')
  if (!body || !signature || extra)
    return null
  if (!safeEqual(signature, sign(body, options.secret)))
    return null
  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlDecode(body))
  }
  catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object')
    return null
  const expiresAt = (parsed as { expiresAt?: unknown }).expiresAt
  if (typeof expiresAt !== 'string')
    return null
  const now = options.now?.() ?? new Date()
  if (Date.parse(expiresAt) <= now.getTime())
    return null
  return parsed as T
}

export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const result = new Map<string, string>()
  if (!header)
    return result
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0)
      continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key)
      result.set(key, value)
  }
  return result
}

export function sessionCookieAttributes(options: Omit<SignedCookieOptions, 'now' | 'secret'>): string {
  const attributes = [
    `Max-Age=${options.maxAgeSeconds}`,
    `Path=${options.path}`,
    'HttpOnly',
    `SameSite=${options.sameSite}`,
  ]
  if (new URL(options.requestUrl).protocol === 'https:')
    attributes.push('Secure')
  return attributes.join('; ')
}

export function clearCookieHeader(name: string, path: string, requestUrl: string): string {
  return `${name}=; ${sessionCookieAttributes({
    maxAgeSeconds: 0,
    path,
    requestUrl,
    sameSite: 'Lax',
  })}`
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}
```

- [ ] **Step 4: Run cookie tests and typecheck**

Run:

```bash
bun test apps/host-cli/src/host-session-cookie.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: both PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/host-cli/src/host-session-cookie.ts apps/host-cli/src/host-session-cookie.test.ts
git commit -m "feat(host): 添加签名 session cookie"
```

## Task 2: OIDC Client and `zonease.org` Claim Gate

**Files:**
- Create: `apps/host-cli/src/host-oidc-client.ts`
- Create: `apps/host-cli/src/host-oidc-client.test.ts`

- [ ] **Step 1: Write failing OIDC client tests**

Create `apps/host-cli/src/host-oidc-client.test.ts` with tests for:

```ts
import { describe, expect, it } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import {
  buildAuthorizationRedirect,
  exchangeAuthorizationCode,
  mapLogtoHostedLoginClaims,
  type OidcClientConfig,
} from './host-oidc-client'

describe('host oidc client', () => {
  const config: OidcClientConfig = {
    clientId: 'aiworker-local-client',
    clientSecret: 'client-secret',
    endpoint: 'https://auth.zonease.org/',
    issuer: 'https://auth.zonease.org/oidc',
    redirectUri: 'http://localhost:54145/auth/callback',
  }

  it('builds a Logto authorization redirect with PKCE, state, nonce and returnTo', async () => {
    const result = await buildAuthorizationRedirect(config, {
      authorizationEndpoint: 'https://auth.zonease.org/oidc/auth',
      randomBytes: size => Buffer.alloc(size, 1),
      returnTo: '/workers/wkr_82',
    })

    const url = new URL(result.redirectUrl)
    expect(url.origin + url.pathname).toBe('https://auth.zonease.org/oidc/auth')
    expect(url.searchParams.get('client_id')).toBe('aiworker-local-client')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:54145/auth/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(result.transaction.returnTo).toBe('/workers/wkr_82')
    expect(result.transaction.codeVerifier.length).toBeGreaterThan(40)
    expect(result.transaction.state.length).toBeGreaterThan(20)
    expect(result.transaction.nonce.length).toBeGreaterThan(20)
  })

  it('maps only verified zonease.org claims to a Host session payload', () => {
    expect(mapLogtoHostedLoginClaims({
      email: ' Alice@Zonease.org ',
      email_verified: true,
      roles: [' host:admin ', ''],
      sub: ' usr_alice ',
    }, '2026-06-06T12:00:00.000Z')).toEqual({
      email: 'alice@zonease.org',
      expiresAt: '2026-06-06T12:00:00.000Z',
      roles: ['host:admin'],
      sub: 'usr_alice',
    })

    expect(() => mapLogtoHostedLoginClaims({
      email: 'alice@example.com',
      email_verified: true,
      sub: 'usr_alice',
    }, '2026-06-06T12:00:00.000Z')).toThrow('zonease.org')

    expect(() => mapLogtoHostedLoginClaims({
      email: 'alice@zonease.org',
      email_verified: false,
      sub: 'usr_alice',
    }, '2026-06-06T12:00:00.000Z')).toThrow('verified email')
  })

  it('exchanges an authorization code and validates the ID token without returning Logto tokens', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const tokenRequests: Record<string, string>[] = []
    const issuer = 'http://127.0.0.1:0/oidc'
    const server = Bun.serve({
      fetch: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/oidc/jwks') {
          return Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'key-1', use: 'sig' }] })
        }
        if (url.pathname === '/oidc/token') {
          const form = Object.fromEntries(await request.formData()) as Record<string, string>
          tokenRequests.push(form)
          const idToken = await new SignJWT({
            email: 'alice@zonease.org',
            email_verified: true,
            nonce: 'nonce-123',
            roles: ['host:admin'],
          })
            .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
            .setSubject('usr_alice')
            .setIssuer(`http://${server.hostname}:${server.port}/oidc`)
            .setAudience('aiworker-local-client')
            .setExpirationTime('5m')
            .sign(privateKey)
          return Response.json({ access_token: 'logto-access-token', expires_in: 300, id_token: idToken, token_type: 'Bearer' })
        }
        return new Response('not found', { status: 404 })
      },
      port: 0,
    })

    try {
      const result = await exchangeAuthorizationCode({
        ...config,
        issuer: `http://${server.hostname}:${server.port}/oidc`,
      }, {
        code: 'auth-code',
        codeVerifier: 'code-verifier',
        nonce: 'nonce-123',
        now: () => new Date('2026-06-06T04:00:00.000Z'),
        tokenEndpoint: `http://${server.hostname}:${server.port}/oidc/token`,
      })

      expect(result).toEqual({
        email: 'alice@zonease.org',
        expiresAt: '2026-06-06T12:00:00.000Z',
        roles: ['host:admin'],
        sub: 'usr_alice',
      })
      expect(JSON.stringify(result)).not.toContain('logto-access-token')
      expect(tokenRequests[0]).toMatchObject({
        client_id: 'aiworker-local-client',
        code: 'auth-code',
        code_verifier: 'code-verifier',
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:54145/auth/callback',
      })
    }
    finally {
      server.stop(true)
    }
  })
})
```

- [ ] **Step 2: Run the failing OIDC client tests**

Run:

```bash
bun test apps/host-cli/src/host-oidc-client.test.ts --timeout=15000
```

Expected: FAIL because `apps/host-cli/src/host-oidc-client.ts` does not exist.

- [ ] **Step 3: Implement OIDC helper module**

Create `apps/host-cli/src/host-oidc-client.ts` with these public exports and behavior:

```ts
import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import type { HostSessionPayload } from './host-session-cookie'

import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface OidcClientConfig {
  clientId: string
  clientSecret: string
  endpoint: string
  issuer: string
  redirectUri: string
}

export interface OidcLoginTransaction {
  codeVerifier: string
  nonce: string
  returnTo: string
  state: string
}

export async function buildAuthorizationRedirect(
  config: OidcClientConfig,
  input: {
    authorizationEndpoint?: string
    randomBytes?: (size: number) => Buffer
    returnTo: string
  },
): Promise<{ redirectUrl: string, transaction: OidcLoginTransaction }> {
  const randomBytes = input.randomBytes ?? nodeRandomBytes
  const codeVerifier = randomString(randomBytes, 48)
  const state = randomString(randomBytes, 32)
  const nonce = randomString(randomBytes, 32)
  const authorizationEndpoint = input.authorizationEndpoint ?? `${config.issuer.replace(/\/+$/, '')}/auth`
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', codeChallenge(codeVerifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return {
    redirectUrl: url.toString(),
    transaction: { codeVerifier, nonce, returnTo: input.returnTo, state },
  }
}

export async function exchangeAuthorizationCode(
  config: OidcClientConfig,
  input: {
    code: string
    codeVerifier: string
    nonce: string
    now?: () => Date
    tokenEndpoint?: string
  },
): Promise<HostSessionPayload> {
  const tokenEndpoint = input.tokenEndpoint ?? `${config.issuer.replace(/\/+$/, '')}/token`
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams({
      client_id: config.clientId,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`Logto token exchange failed with status ${response.status}`)
  const body = await response.json() as { id_token?: unknown }
  if (typeof body.id_token !== 'string')
    throw new Error('Logto token response is missing id_token')
  const jwks = createRemoteJWKSet(logtoJwksUrl(config.issuer))
  const { payload } = await jwtVerify(body.id_token, jwks, {
    audience: config.clientId,
    issuer: config.issuer,
  })
  if (payload.nonce !== input.nonce)
    throw new Error('Logto ID token nonce mismatch')
  const expiresAt = new Date((input.now?.() ?? new Date()).getTime() + 8 * 60 * 60 * 1000).toISOString()
  return mapLogtoHostedLoginClaims(payload as Record<string, unknown>, expiresAt)
}

export function mapLogtoHostedLoginClaims(claims: Record<string, unknown>, expiresAt: string): HostSessionPayload {
  if (typeof claims.sub !== 'string' || claims.sub.trim().length === 0)
    throw new Error('Logto token is missing a subject')
  if (typeof claims.email !== 'string' || claims.email.trim().length === 0)
    throw new Error('Logto token is missing an email')
  if (claims.email_verified !== true)
    throw new Error('Logto token must contain a verified email')
  const email = claims.email.trim().toLowerCase()
  if (!email.endsWith('@zonease.org'))
    throw new Error('Logto token email must belong to zonease.org')
  return {
    email,
    expiresAt,
    roles: Array.isArray(claims.roles)
      ? claims.roles.filter((role): role is string => typeof role === 'string').map(role => role.trim()).filter(Boolean)
      : [],
    sub: claims.sub.trim(),
  }
}

function randomString(randomBytes: (size: number) => Buffer, size: number): string {
  return randomBytes(size).toString('base64url')
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function logtoJwksUrl(issuer: string): URL {
  const issuerUrl = new URL(issuer)
  const basePath = issuerUrl.pathname === '/' ? '/oidc' : issuerUrl.pathname.replace(/\/$/, '')
  return new URL(`${basePath}/jwks`, issuerUrl.origin)
}
```

- [ ] **Step 4: Run OIDC tests and focused Logto tests**

Run:

```bash
bun test apps/host-cli/src/host-oidc-client.test.ts apps/host-cli/src/logto-auth.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/host-cli/src/host-oidc-client.ts apps/host-cli/src/host-oidc-client.test.ts
git commit -m "feat(host): 添加 logto oidc 回调验证"
```

## Task 3: Logto Proof App Configuration Client

**Files:**
- Create: `apps/host-cli/src/logto-app-config.ts`
- Create: `apps/host-cli/src/logto-app-config.test.ts`

- [ ] **Step 1: Write failing Management API tests**

Create tests that mock fetch and assert:

```ts
import { describe, expect, it } from 'bun:test'

import {
  ensureLogtoProofApplication,
  loadLogtoM2MConfigText,
  redactLogtoConfigForOutput,
} from './logto-app-config'

describe('logto proof app config', () => {
  it('loads M2M config without exposing secrets in redacted output', () => {
    const config = loadLogtoM2MConfigText([
      'LOGTO_M2M_APP_ID=m2m-id',
      'LOGTO_M2M_APP_SECRET=m2m-secret',
      'LOGTO_ISSUER=https://auth.zonease.org/oidc',
      'LOGTO_ENDPOINT=https://auth.zonease.org/',
    ].join('\n'))

    expect(config).toEqual({
      endpoint: 'https://auth.zonease.org/',
      issuer: 'https://auth.zonease.org/oidc',
      m2mAppId: 'm2m-id',
      m2mAppSecret: 'm2m-secret',
    })
    expect(redactLogtoConfigForOutput(config)).toEqual({
      endpoint: 'https://auth.zonease.org/',
      issuer: 'https://auth.zonease.org/oidc',
      m2mAppId: 'm2m-id',
      m2mAppSecret: '[REDACTED]',
    })
  })

  it('creates a Traditional app and retrieves its secret when no proof app exists', async () => {
    const calls: { body: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: {
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        m2mAppId: 'm2m-id',
        m2mAppSecret: 'm2m-secret',
      },
      fetch: async (input, init) => {
        const url = input.toString()
        calls.push({ body: init?.body?.toString() ?? '', url })
        if (url === 'https://auth.zonease.org/oidc/token') {
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        }
        if (url === 'https://auth.zonease.org/api/applications') {
          if (init?.method === 'GET')
            return Response.json([])
          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        }
        if (url === 'https://auth.zonease.org/api/applications/web-app-id/secrets') {
          return Response.json([{ value: 'web-secret' }])
        }
        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'web-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(JSON.stringify(calls)).not.toContain('web-secret')
  })

  it('returns a manual configuration requirement when Management API is forbidden', async () => {
    const result = await ensureLogtoProofApplication({
      config: {
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        m2mAppId: 'm2m-id',
        m2mAppSecret: 'm2m-secret',
      },
      fetch: async input => input.toString().endsWith('/oidc/token')
        ? Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        : new Response('forbidden', { status: 403 }),
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      manualConfiguration: {
        applicationType: 'Traditional',
        issuer: 'https://auth.zonease.org/oidc',
        postLogoutRedirectUri: 'http://localhost:54145/host',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
    })
  })
})
```

- [ ] **Step 2: Run failing Management API tests**

Run:

```bash
bun test apps/host-cli/src/logto-app-config.test.ts --timeout=15000
```

Expected: FAIL because `logto-app-config.ts` does not exist.

- [ ] **Step 3: Implement Logto app config client**

Create `apps/host-cli/src/logto-app-config.ts` with:

```ts
export interface LogtoM2MConfig {
  endpoint: string
  issuer: string
  m2mAppId: string
  m2mAppSecret: string
}

export interface LogtoProofApplication {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface ManualLogtoConfiguration {
  manualConfiguration: {
    applicationType: 'Traditional'
    issuer: string
    postLogoutRedirectUri: string
    redirectUri: string
  }
}

export function loadLogtoM2MConfigText(text: string): LogtoM2MConfig {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const index = trimmed.indexOf('=')
    if (index <= 0)
      continue
    values.set(trimmed.slice(0, index), trimmed.slice(index + 1))
  }
  const config = {
    endpoint: requireValue(values, 'LOGTO_ENDPOINT'),
    issuer: requireValue(values, 'LOGTO_ISSUER'),
    m2mAppId: requireValue(values, 'LOGTO_M2M_APP_ID'),
    m2mAppSecret: requireValue(values, 'LOGTO_M2M_APP_SECRET'),
  }
  return config
}

export function redactLogtoConfigForOutput(config: LogtoM2MConfig) {
  return { ...config, m2mAppSecret: '[REDACTED]' }
}

export async function ensureLogtoProofApplication(input: {
  config: LogtoM2MConfig
  fetch?: typeof fetch
  hostBrowserBaseUrl: string
}): Promise<LogtoProofApplication | ManualLogtoConfiguration> {
  const fetchImpl = input.fetch ?? fetch
  const redirectUri = `${input.hostBrowserBaseUrl.replace(/\/+$/, '')}/auth/callback`
  const postLogoutRedirectUri = `${input.hostBrowserBaseUrl.replace(/\/+$/, '')}/host`
  const token = await requestManagementToken(input.config, fetchImpl)
  const app = await createProofApplication(input.config, fetchImpl, token, redirectUri, postLogoutRedirectUri)
  if (!app)
    return {
      manualConfiguration: {
        applicationType: 'Traditional',
        issuer: input.config.issuer,
        postLogoutRedirectUri,
        redirectUri,
      },
    }
  const secret = await readApplicationSecret(input.config, fetchImpl, token, app.id)
  if (!secret)
    return {
      manualConfiguration: {
        applicationType: 'Traditional',
        issuer: input.config.issuer,
        postLogoutRedirectUri,
        redirectUri,
      },
    }
  return { clientId: app.id, clientSecret: secret, redirectUri }
}

async function requestManagementToken(config: LogtoM2MConfig, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(new URL('/oidc/token', config.endpoint), {
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: new URL('/api', config.endpoint).toString().replace(/\/$/, ''),
      scope: 'all',
    }),
    headers: {
      authorization: `Basic ${Buffer.from(`${config.m2mAppId}:${config.m2mAppSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`Logto Management API token request failed with status ${response.status}`)
  const body = await response.json() as { access_token?: unknown }
  if (typeof body.access_token !== 'string' || body.access_token.length === 0)
    throw new Error('Logto Management API token response is missing access_token')
  return body.access_token
}

async function createProofApplication(
  config: LogtoM2MConfig,
  fetchImpl: typeof fetch,
  token: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<{ id: string } | null> {
  const response = await fetchImpl(new URL('/api/applications', config.endpoint), {
    body: JSON.stringify({
      description: 'Local proof application for AIWorker Host Logto integration.',
      name: 'AIWorker Local Auth Proof',
      oidcClientMetadata: {
        postLogoutRedirectUris: [postLogoutRedirectUri],
        redirectUris: [redirectUri],
      },
      type: 'Traditional',
    }),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  if (response.status === 401 || response.status === 403)
    return null
  if (!response.ok)
    throw new Error(`Logto application create failed with status ${response.status}`)
  const body = await response.json() as { id?: unknown }
  return typeof body.id === 'string' ? { id: body.id } : null
}

async function readApplicationSecret(
  config: LogtoM2MConfig,
  fetchImpl: typeof fetch,
  token: string,
  appId: string,
): Promise<string | null> {
  const response = await fetchImpl(new URL(`/api/applications/${encodeURIComponent(appId)}/secrets`, config.endpoint), {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
  })
  if (response.status === 401 || response.status === 403)
    return null
  if (!response.ok)
    throw new Error(`Logto application secret read failed with status ${response.status}`)
  const body = await response.json() as unknown
  if (!Array.isArray(body))
    return null
  const first = body.find(item => item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string') as { value: string } | undefined
  return first?.value ?? null
}

function requireValue(values: Map<string, string>, key: string): string {
  const value = values.get(key)
  if (!value)
    throw new Error(`Missing ${key} in Logto config`)
  return value
}
```

If a test reveals that Logto Cloud custom domains cannot serve Management API token or `/api` routes, change `LOGTO_M2M_ENDPOINT` in root `.env` to the default tenant endpoint and keep `LOGTO_M2M_ISSUER` as `https://auth.zonease.org/oidc`. Do not print the old secret.

- [ ] **Step 4: Run config tests**

Run:

```bash
bun test apps/host-cli/src/logto-app-config.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/host-cli/src/logto-app-config.ts apps/host-cli/src/logto-app-config.test.ts
git commit -m "feat(host): 添加 logto proof app 配置客户端"
```

## Task 4: Host Auth Routes and Session Auth Provider

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`

- [ ] **Step 1: Write failing Host auth route tests**

Append tests to `apps/host-cli/src/host-server.test.ts`:

```ts
it('redirects browser /host requests to Logto login when session is missing', async () => {
  const server = await createHostServer({
    dbPath: dbPath(),
    hostBrowserBaseUrl: 'http://localhost:54145',
    hostControlBaseUrl: 'http://localhost:54145',
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret: 'session-secret',
    },
  })

  const response = await server.fetch(new Request('http://localhost:54145/host', {
    headers: { accept: 'text/html' },
  }))

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toStartWith('/auth/login?returnTo=%2Fhost')
})

it('creates an auth transaction cookie and redirects /auth/login to Logto', async () => {
  const server = await createHostServer({
    dbPath: dbPath(),
    hostBrowserBaseUrl: 'http://localhost:54145',
    hostControlBaseUrl: 'http://localhost:54145',
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret: 'session-secret',
    },
  })

  const response = await server.fetch(new Request('http://localhost:54145/auth/login?returnTo=/workers/wkr_82'))

  expect(response.status).toBe(302)
  const location = new URL(response.headers.get('location')!)
  expect(location.origin + location.pathname).toBe('https://auth.zonease.org/oidc/auth')
  expect(location.searchParams.get('client_id')).toBe('client-id')
  expect(response.headers.get('set-cookie')).toContain('aiworker_auth_txn=')
  expect(response.headers.get('set-cookie')).toContain('HttpOnly')
})

it('rejects unsafe returnTo values before redirecting', async () => {
  const server = await createHostServer({
    dbPath: dbPath(),
    hostBrowserBaseUrl: 'http://localhost:54145',
    hostControlBaseUrl: 'http://localhost:54145',
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret: 'session-secret',
    },
  })

  const response = await server.fetch(new Request('http://localhost:54145/auth/login?returnTo=https://evil.example'))

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: { code: 'INVALID_RETURN_TO' } })
})
```

- [ ] **Step 2: Run failing Host auth route tests**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: FAIL because `sessionAuth` and `/auth/login` do not exist.

- [ ] **Step 3: Add Host auth option and login route**

Modify `apps/host-cli/src/host-server.ts`:

```ts
import type { OidcClientConfig, OidcLoginTransaction } from './host-oidc-client'
import type { HostSessionPayload } from './host-session-cookie'

import { buildAuthorizationRedirect } from './host-oidc-client'
import {
  createSignedCookie,
  parseCookieHeader,
  readSignedCookie,
} from './host-session-cookie'

interface HostSessionAuthOptions {
  oidc: OidcClientConfig
  sessionSecret: string
}

interface HostServerBaseOptions {
  accessRegistry?: WorkerAccessRegistry
  authProvider?: AuthProvider
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  optionsProvider?: () => Promise<HostOptionsView>
  sessionAuth?: HostSessionAuthOptions
  webBaseUrl?: string
  webStaticDir?: string
}
```

Inside `fetch(request)` before static serving:

```ts
if (request.method === 'GET' && url.pathname === '/auth/login')
  return handleAuthLogin(request, options.sessionAuth)
```

Add helpers:

```ts
async function handleAuthLogin(request: Request, sessionAuth: HostSessionAuthOptions | undefined): Promise<Response> {
  if (!sessionAuth)
    return json({ error: { code: 'AUTH_NOT_CONFIGURED' } }, { status: 501 })
  const url = new URL(request.url)
  const returnTo = normalizeReturnTo(url.searchParams.get('returnTo') ?? '/host')
  if (!returnTo)
    return json({ error: { code: 'INVALID_RETURN_TO' } }, { status: 400 })
  const redirect = await buildAuthorizationRedirect(sessionAuth.oidc, { returnTo })
  const headers = new Headers()
  headers.set('location', redirect.redirectUrl)
  headers.append('set-cookie', createSignedCookie<OidcLoginTransaction>('aiworker_auth_txn', {
    ...redirect.transaction,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }, {
    maxAgeSeconds: 600,
    path: '/auth',
    requestUrl: request.url,
    sameSite: 'Lax',
    secret: sessionAuth.sessionSecret,
  }))
  return new Response(null, { headers, status: 302 })
}

function normalizeReturnTo(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//'))
    return null
  if (value.startsWith('/auth/'))
    return null
  return value
}
```

For `/host` browser redirect, add:

```ts
if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/host')) {
  if (options.sessionAuth) {
    const user = readUserFromSessionCookie(request, options.sessionAuth.sessionSecret)
    if (!user)
      return redirectToLogin('/host')
    if (!userIsHostAdmin(user))
      return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
  }
  return devLanding(hostControlBaseUrl, options.webBaseUrl ?? hostBrowserBaseUrl)
}
```

Add:

```ts
function readUserFromSessionCookie(request: Request, secret: string): AuthenticatedHostUser | null {
  const cookie = parseCookieHeader(request.headers.get('cookie')).get('aiworker_session')
  const session = readSignedCookie<HostSessionPayload>(cookie, { secret })
  if (!session)
    return null
  return { email: session.email, roles: session.roles, subject: session.sub }
}

function redirectToLogin(returnTo: string): Response {
  return new Response(null, {
    headers: { location: `/auth/login?returnTo=${encodeURIComponent(returnTo)}` },
    status: 302,
  })
}
```

- [ ] **Step 4: Run Host route tests**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: new login tests PASS. Existing tests may fail if `/host` expected dev landing without session; update only tests that create `sessionAuth`.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts
git commit -m "feat(host): 添加 logto 登录入口"
```

## Task 5: Callback, Logout, `/api/auth/me`, and Route Gates

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`

- [ ] **Step 1: Write failing tests for callback/session gates**

Add tests:

```ts
it('returns null user from /api/auth/me without a session', async () => {
  const server = await createHostServer({
    dbPath: dbPath(),
    hostBrowserBaseUrl: 'http://localhost:54145',
    hostControlBaseUrl: 'http://localhost:54145',
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret: 'session-secret',
    },
  })

  const response = await server.fetch(new Request('http://localhost:54145/api/auth/me'))

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ user: null })
})

it('returns JSON 403 for /api/host/assignments when session auth is configured and no session exists', async () => {
  const server = await createHostServer({
    dbPath: dbPath(),
    hostBrowserBaseUrl: 'http://localhost:54145',
    hostControlBaseUrl: 'http://localhost:54145',
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret: 'session-secret',
    },
  })

  const response = await server.fetch(new Request('http://localhost:54145/api/host/assignments'))

  expect(response.status).toBe(403)
  expect(response.headers.get('content-type')).toContain('application/json')
})

it('redirects browser worker routes to login when session auth is configured and no session exists', async () => {
  const server = await createHostServer({
    dbPath: dbPath(),
    hostBrowserBaseUrl: 'http://localhost:54145',
    hostControlBaseUrl: 'http://localhost:54145',
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
      sessionSecret: 'session-secret',
    },
  })

  const response = await server.fetch(new Request('http://localhost:54145/workers/wkr_82'))

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fworkers%2Fwkr_82')
})
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: FAIL because `/api/auth/me` and session route gates do not exist.

- [ ] **Step 3: Implement me/logout/gates and callback seam**

Modify `host-server.ts` to add:

```ts
import { clearCookieHeader } from './host-session-cookie'
import { exchangeAuthorizationCode } from './host-oidc-client'

if (request.method === 'GET' && url.pathname === '/api/auth/me')
  return handleAuthMe(request, options.sessionAuth)

if (request.method === 'POST' && url.pathname === '/auth/logout')
  return handleAuthLogout(request)

if (request.method === 'GET' && url.pathname === '/auth/callback')
  return handleAuthCallback(request, options.sessionAuth)
```

Add:

```ts
async function handleAuthMe(request: Request, sessionAuth: HostSessionAuthOptions | undefined): Promise<Response> {
  if (!sessionAuth)
    return json({ user: null })
  const user = readUserFromSessionCookie(request, sessionAuth.sessionSecret)
  return json({ user })
}

function handleAuthLogout(request: Request): Response {
  return new Response(null, {
    headers: {
      'set-cookie': clearCookieHeader('aiworker_session', '/', request.url),
    },
    status: 204,
  })
}

async function handleAuthCallback(request: Request, sessionAuth: HostSessionAuthOptions | undefined): Promise<Response> {
  if (!sessionAuth)
    return json({ error: { code: 'AUTH_NOT_CONFIGURED' } }, { status: 501 })
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state)
    return json({ error: { code: 'INVALID_AUTH_CALLBACK' } }, { status: 400 })
  const transactionCookie = parseCookieHeader(request.headers.get('cookie')).get('aiworker_auth_txn')
  const transaction = readSignedCookie<OidcLoginTransaction & { expiresAt: string }>(transactionCookie, {
    secret: sessionAuth.sessionSecret,
  })
  if (!transaction || transaction.state !== state)
    return json({ error: { code: 'INVALID_AUTH_TRANSACTION' } }, { status: 400 })
  let session: HostSessionPayload
  try {
    session = await exchangeAuthorizationCode(sessionAuth.oidc, {
      code,
      codeVerifier: transaction.codeVerifier,
      nonce: transaction.nonce,
    })
  }
  catch {
    return json({ error: { code: 'AUTH_CALLBACK_FAILED' } }, { status: 403 })
  }
  const headers = new Headers()
  headers.set('location', transaction.returnTo)
  headers.append('set-cookie', clearCookieHeader('aiworker_auth_txn', '/auth', request.url))
  headers.append('set-cookie', createSignedCookie('aiworker_session', session, {
    maxAgeSeconds: 28800,
    path: '/',
    requestUrl: request.url,
    sameSite: 'Lax',
    secret: sessionAuth.sessionSecret,
  }))
  return new Response(null, { headers, status: 302 })
}
```

Thread `sessionAuth` through:

```ts
const effectiveAuthProvider = options.sessionAuth
  ? createCookieBackedAuthProvider(options.sessionAuth.sessionSecret)
  : authProvider
```

Use `effectiveAuthProvider` for `handleAssignments`, `handleOptions`, and `handleWorkerRoute` when `sessionAuth` exists. Keep legacy `authUser` tests working when `sessionAuth` is absent.

For worker route, check missing session before DB worker lookup:

```ts
if (options.sessionAuth && !readUserFromSessionCookie(request, options.sessionAuth.sessionSecret))
  return redirectToLogin(`/workers/${encodeURIComponent(workerId)}`)
```

- [ ] **Step 4: Run focused Host tests**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts apps/host-cli/src/host-session-cookie.test.ts apps/host-cli/src/host-oidc-client.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts
git commit -m "feat(host): 接入 session cookie 鉴权门禁"
```

## Task 6: CLI Env Wiring for Logto Hosted Login

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`

- [ ] **Step 1: Write failing CLI wiring tests**

Add tests that assert:

```ts
it('passes Logto session auth options to serve when env is configured', async () => {
  const captured: unknown[] = []
  const exitCode = await runHostCli(['serve', '--db', ':memory:', '--host-control-base-url', 'http://localhost:54145'], {
    env: {
      AIWORKER_HOST_SESSION_SECRET: 'session-secret',
      LOGTO_CLIENT_ID: 'client-id',
      LOGTO_CLIENT_SECRET: 'client-secret',
      LOGTO_ENDPOINT: 'https://auth.zonease.org/',
      LOGTO_ISSUER: 'https://auth.zonease.org/oidc',
    },
    serverFactory: async options => {
      captured.push(options)
      return { fetch: async () => new Response('ok') }
    },
  })

  expect(exitCode).toBe(0)
  expect(captured[0]).toMatchObject({
    sessionAuth: {
      oidc: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
      },
      sessionSecret: 'session-secret',
    },
  })
  expect(JSON.stringify(captured)).not.toContain('literal-secret-value')
})
```

Use existing `runHostCli` helper names from `aiworker-host.test.ts`. If the helper has a different signature, adapt the test to the existing local helper without changing production code first.

- [ ] **Step 2: Run failing CLI tests**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: FAIL because env wiring does not pass `sessionAuth`.

- [ ] **Step 3: Implement env wiring**

In `apps/host-cli/src/aiworker-host.ts`, add a helper:

```ts
function buildSessionAuthFromEnv(env: NodeJS.ProcessEnv, hostBrowserBaseUrl: string) {
  const sessionSecret = env.AIWORKER_HOST_SESSION_SECRET
  const clientId = env.LOGTO_CLIENT_ID
  const clientSecret = env.LOGTO_CLIENT_SECRET
  const endpoint = env.LOGTO_ENDPOINT
  const issuer = env.LOGTO_ISSUER
  if (!sessionSecret || !clientId || !clientSecret || !endpoint || !issuer)
    return undefined
  return {
    oidc: {
      clientId,
      clientSecret,
      endpoint,
      issuer,
      redirectUri: `${hostBrowserBaseUrl.replace(/\/+$/, '')}/auth/callback`,
    },
    sessionSecret,
  }
}
```

Pass it to `createHostServer` only for `serve`. Do not enable it for existing static `authUser` tests unless env is configured.

- [ ] **Step 4: Run CLI wiring tests**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts
git commit -m "feat(host): 暴露 logto 登录运行配置"
```

## Task 7: Local Browser Proof Script

**Files:**
- Create: `tests/browser/logto-host-session-gate.spec.ts`
- Modify: `package.json`
- Modify: `docs/testing.md` only if canonical test docs require listing the new browser proof.

- [ ] **Step 1: Write browser proof script**

Create `tests/browser/logto-host-session-gate.spec.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from 'playwright'

const baseUrl = process.env.AIWORKER_LOGTO_PROOF_BASE_URL ?? 'http://localhost:54145'
const evidenceDir = process.env.AIWORKER_EVIDENCE_DIR ?? join(process.cwd(), 'tmp', 'logto-auth-proof')

mkdirSync(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()

try {
  await page.goto(`${baseUrl}/host`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(url => url.hostname === 'auth.zonease.org' || url.pathname === '/host', { timeout: 120000 })
  const firstUrl = page.url()
  if (new URL(firstUrl).hostname === 'auth.zonease.org') {
    console.log('Complete Logto login in the opened browser window. Codex will wait for callback.')
    await page.waitForURL(url => url.origin === new URL(baseUrl).origin && url.pathname === '/host', { timeout: 300000 })
  }

  const me = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me')
    return { body: await response.json(), status: response.status }
  })

  const cookies = await page.context().cookies(baseUrl)
  const sessionCookie = cookies.find(cookie => cookie.name === 'aiworker_session')
  const evidence = {
    finalUrl: page.url(),
    me,
    sessionCookie: sessionCookie
      ? { httpOnly: sessionCookie.httpOnly, name: sessionCookie.name, sameSite: sessionCookie.sameSite, secure: sessionCookie.secure }
      : null,
  }
  writeFileSync(join(evidenceDir, 'logto-auth-proof.json'), JSON.stringify(evidence, null, 2))

  if (me.status !== 200 || !me.body?.user?.email?.endsWith('@zonease.org'))
    throw new Error(`Logto auth proof did not return a zonease.org user: ${JSON.stringify(evidence)}`)
  if (!sessionCookie?.httpOnly)
    throw new Error(`Logto auth proof did not create an HttpOnly aiworker_session cookie: ${JSON.stringify(evidence)}`)
}
finally {
  await browser.close()
}
```

- [ ] **Step 2: Add script**

Modify root `package.json` scripts:

```json
"test:browser:logto-auth-proof": "bun tests/browser/logto-host-session-gate.spec.ts"
```

- [ ] **Step 3: Run static proof checks**

Run without a server:

```bash
bun --check tests/browser/logto-host-session-gate.spec.ts
```

Expected: PASS type parse. Do not run the interactive browser proof until the Host server can be started with real Logto env.

- [ ] **Step 4: Commit Task 7**

```bash
git add tests/browser/logto-host-session-gate.spec.ts package.json docs/testing.md
git commit -m "test(host): 添加 logto 登录浏览器证明脚本"
```

## Task 8: Real Logto Proof Run and Final Verification

**Files:**
- No production code edits unless previous tasks exposed a verified defect.
- Evidence output goes under `tmp/logto-auth-proof/` and remains untracked.

- [ ] **Step 1: Start Host with Logto env**

Use root `.env` without printing secrets:

```bash
set -a
source .env
set +a
export AIWORKER_HOST_SESSION_SECRET="$(openssl rand -base64 32)"
source tmp/logto-auth-proof/web-app.env
bun run --filter '@zonease/aiworker-host-cli' -- aiworker-host serve --db tmp/logto-auth-proof/host.db --host-control-base-url http://localhost:54145 --host-browser-base-url http://localhost:54145
```

Create `tmp/logto-auth-proof/web-app.env` from the Traditional Web App values returned by `ensureLogtoProofApplication` in Task 3. If Management API permission is missing, configure the Traditional Web App manually, then write its actual App ID and App Secret into that env file with `chmod 600`.

Required Logto Web App settings:

```text
Redirect URI: http://localhost:54145/auth/callback
Post logout redirect URI: http://localhost:54145/host
Issuer: https://auth.zonease.org/oidc
```

- [ ] **Step 2: Run real browser proof**

In a second terminal:

```bash
bun run test:browser:logto-auth-proof
```

Expected:

- Browser reaches `auth.zonease.org` if not already logged in.
- User completes Logto hosted login manually.
- Browser returns to `http://localhost:54145/host`.
- `tmp/logto-auth-proof/logto-auth-proof.json` contains a `zonease.org` user and `aiworker_session` with `httpOnly: true`.

- [ ] **Step 3: Run final focused tests**

Run:

```bash
bun test apps/host-cli/src/host-session-cookie.test.ts apps/host-cli/src/host-oidc-client.test.ts apps/host-cli/src/logto-app-config.test.ts apps/host-cli/src/logto-auth.test.ts apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts packages/host-control/src/assignment.test.ts packages/host-control/src/access-adapter.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
bun run --filter '@zonease/aiworker-host-control' typecheck
bun run docs:check
git diff --check
```

Expected: all PASS.

- [ ] **Step 4: Run code review graph**

Run:

```bash
bun run crg:review
```

Expected: exit 0. If unrelated files are dirty, rerun code-review-graph with changed files limited to this feature and record the pollution in the final report.

- [ ] **Step 5: Commit proof wiring fixes if needed**

If the real proof required code changes, commit them:

```bash
git add apps/host-cli/src tests/browser package.json docs/testing.md
git commit -m "fix(host): 补齐 logto proof 运行边界"
```

If no code changes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: tasks cover signed cookies, OIDC redirect/callback, `zonease.org` claim gate, Logto app preparation, `/host` and `/workers/:workerId` gates, `/api/auth/me`, logout, browser proof, and secret redaction.
- Scope check: Worker Access Tunnel, production domain proof, custom Logto UI, DB-backed session, session revoke list, and per-worker Logto path permissions remain out of scope.
- Type consistency: `HostSessionPayload`, `OidcClientConfig`, and `OidcLoginTransaction` are introduced before subsequent tasks consume them.
- Verification coverage: each code unit has a focused Bun test, plus final focused package typechecks, docs check, diff check, browser proof, and code-review-graph review.
