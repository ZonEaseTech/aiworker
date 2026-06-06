import { createHash } from 'node:crypto'

import { describe, expect, it } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import {
  beginLogtoHostedLogin,
  discoverLogtoOidcIssuerConfiguration,
  exchangeLogtoHostedLoginCode,
  mapLogtoHostedLoginClaims,
  mapLogtoZoneaseClaims,
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

  it('discovers the authorization endpoint and builds a PKCE redirect with state and nonce', async () => {
    const discoveryRequests: string[] = []
    const result = await beginLogtoHostedLogin(config, {
      fetch: async input => {
        discoveryRequests.push(String(input))
        return Response.json({
          authorization_endpoint: 'https://login.zonease.test/custom/auth',
          jwks_uri: 'https://login.zonease.test/custom/jwks',
          token_endpoint: 'https://login.zonease.test/custom/token',
        })
      },
      randomBytes: size => Buffer.alloc(size, 1),
      returnTo: '/workers/wkr_82',
    })

    const url = new URL(result.redirectUrl)

    expect(discoveryRequests).toEqual(['https://auth.zonease.org/oidc/.well-known/openid-configuration'])
    expect(url.origin + url.pathname).toBe('https://login.zonease.test/custom/auth')
    expect(url.searchParams.get('client_id')).toBe('aiworker-local-client')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:54145/auth/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe(result.transaction.state)
    expect(url.searchParams.get('nonce')).toBe(result.transaction.nonce)
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256')
      .update(result.transaction.codeVerifier)
      .digest('base64url'))
    expect(result.transaction.returnTo).toBe('/workers/wkr_82')
    expect(result.transaction.codeVerifier.length).toBeGreaterThan(40)
    expect(result.transaction.state.length).toBeGreaterThan(20)
    expect(result.transaction.nonce.length).toBeGreaterThan(20)
  })

  it('rejects absolute returnTo values before discovery', async () => {
    await expect(beginLogtoHostedLogin(config, {
      fetch: async () => {
        throw new Error('discovery should not run for unsafe returnTo')
      },
      returnTo: 'https://evil.example/workers/wkr_82',
    })).rejects.toThrow('returnTo')
  })

  it('allows only normalized Host and Worker returnTo paths', async () => {
    const discovery = {
      authorization_endpoint: 'https://login.zonease.test/custom/auth',
      jwks_uri: 'https://login.zonease.test/custom/jwks',
      token_endpoint: 'https://login.zonease.test/custom/token',
    }
    const host = await beginLogtoHostedLogin({
      ...config,
      issuer: 'https://safe-return.zonease.test/oidc-host',
    }, {
      fetch: async () => Response.json(discovery),
      returnTo: '/host',
    })
    const worker = await beginLogtoHostedLogin({
      ...config,
      issuer: 'https://safe-return.zonease.test/oidc-worker',
    }, {
      fetch: async () => Response.json(discovery),
      returnTo: '/workers/wkr_82?tab=chat#latest',
    })

    expect(host.transaction.returnTo).toBe('/host')
    expect(worker.transaction.returnTo).toBe('/workers/wkr_82?tab=chat#latest')
  })

  it('rejects returnTo values that could escape the same-site Host surface', async () => {
    const unsafeReturnToValues = [
      '//evil.example',
      '/\\evil.example',
      '/%5Cevil.example',
      '/%2Fevil.example',
      '/workers/%2fwkr_82',
      '/workers/wkr_82%5cadmin',
      '/auth/callback',
      'https://evil.example/host',
      '/host\u0000',
    ]

    for (const returnTo of unsafeReturnToValues) {
      await expect(beginLogtoHostedLogin(config, {
        fetch: async () => {
          throw new Error('discovery should not run for unsafe returnTo')
        },
        returnTo,
      })).rejects.toThrow('returnTo')
    }
  })

  it('discovers issuer metadata without requiring a confidential client config', async () => {
    const discoveryRequests: string[] = []
    const discovery = await discoverLogtoOidcIssuerConfiguration('https://issuer.zonease.test/oidc/', {
      fetch: async input => {
        discoveryRequests.push(String(input))
        return Response.json({
          authorization_endpoint: 'https://issuer.zonease.test/custom/auth',
          jwks_uri: 'https://issuer.zonease.test/custom/jwks',
          token_endpoint: 'https://issuer.zonease.test/custom/token',
        })
      },
    })

    expect(discoveryRequests).toEqual(['https://issuer.zonease.test/oidc/.well-known/openid-configuration'])
    expect(discovery).toEqual({
      authorizationEndpoint: 'https://issuer.zonease.test/custom/auth',
      jwksUri: 'https://issuer.zonease.test/custom/jwks',
      tokenEndpoint: 'https://issuer.zonease.test/custom/token',
    })
  })

  it('keeps injected discovery fetch results isolated for the same issuer', async () => {
    const issuer = 'https://isolated-fetch.zonease.test/oidc'
    const first = await discoverLogtoOidcIssuerConfiguration(issuer, {
      fetch: async () => Response.json({
        authorization_endpoint: 'https://first.zonease.test/auth',
        jwks_uri: 'https://first.zonease.test/jwks',
        token_endpoint: 'https://first.zonease.test/token',
      }),
    })
    const second = await discoverLogtoOidcIssuerConfiguration(issuer, {
      fetch: async () => Response.json({
        authorization_endpoint: 'https://second.zonease.test/auth',
        jwks_uri: 'https://second.zonease.test/jwks',
        token_endpoint: 'https://second.zonease.test/token',
      }),
    })

    expect(first.authorizationEndpoint).toBe('https://first.zonease.test/auth')
    expect(second.authorizationEndpoint).toBe('https://second.zonease.test/auth')
  })

  it('maps only verified zonease.org claims to a Host session payload', () => {
    expect(mapLogtoZoneaseClaims({
      email: ' User@Zonease.org ',
      email_verified: true,
      roles: [' host:admin ', ''],
      sub: ' usr_user ',
    })).toEqual({
      email: 'user@zonease.org',
      roles: ['host:admin'],
      sub: 'usr_user',
    })

    expect(mapLogtoHostedLoginClaims({
      email: ' Alice@Zonease.org ',
      email_verified: true,
      roles: [' host:admin ', '', '  ', 42],
      sub: ' usr_alice ',
    }, '2026-06-06T12:00:00.000Z')).toEqual({
      email: 'alice@zonease.org',
      expiresAt: '2026-06-06T12:00:00.000Z',
      roles: ['host:admin'],
      sub: 'usr_alice',
    })

    expect(mapLogtoHostedLoginClaims({
      email: 'bob@zonease.org',
      email_verified: true,
      sub: 'usr_bob',
    }, '2026-06-06T12:00:00.000Z')).toEqual({
      email: 'bob@zonease.org',
      expiresAt: '2026-06-06T12:00:00.000Z',
      roles: [],
      sub: 'usr_bob',
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

  it('exchanges an authorization code through discovered token and JWKS endpoints without returning Logto tokens', async () => {
    const fixture = await createOidcFixture()
    try {
      const result = await exchangeLogtoHostedLoginCode(fixture.config, {
        code: 'auth-code',
        codeVerifier: 'code-verifier',
        fetch: fixture.fetch,
        nonce: 'nonce-123',
        now: () => new Date('2026-06-06T04:00:00.000Z'),
      })

      expect(result).toEqual({
        email: 'alice@zonease.org',
        expiresAt: '2026-06-06T12:00:00.000Z',
        roles: ['host:admin'],
        sub: 'usr_alice',
      })
      expect(JSON.stringify(result)).not.toContain('logto-access-token')
      expect(fixture.requests).toContain('GET /oidc/.well-known/openid-configuration')
      expect(fixture.requests).toContain('POST /discovered/token')
      expect(fixture.requests).toContain('GET /discovered/jwks')
      expect(fixture.tokenRequests[0]).toMatchObject({
        client_id: 'aiworker-local-client',
        code: 'auth-code',
        code_verifier: 'code-verifier',
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:54145/auth/callback',
      })
    }
    finally {
      fixture.server.stop(true)
    }
  })

  it('redacts OAuth JSON error responses without exposing token-like values', async () => {
    const fixture = await createOidcFixture({
      tokenBody: {
        access_token: 'secret-token-value-that-must-not-leak-abcdefghijklmnopqrstuvwxyz',
        error: 'invalid_grant',
        error_description: 'authorization code expired secret-token-value-that-must-not-leak-abcdefghijklmnopqrstuvwxyz',
      },
      tokenStatus: 400,
    })

    try {
      let message = ''
      try {
        await exchangeLogtoHostedLoginCode(fixture.config, {
          code: 'auth-code',
          codeVerifier: 'code-verifier',
          fetch: fixture.fetch,
          nonce: 'nonce-123',
        })
      }
      catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }

      expect(message).toContain('invalid_grant')
      expect(message).toContain('authorization code expired')
      expect(message).not.toContain('access_token')
      expect(message).not.toContain('secret-token-value')
    }
    finally {
      fixture.server.stop(true)
    }
  })

  it('fails closed when the ID token nonce does not match the login transaction', async () => {
    const fixture = await createOidcFixture({
      tokenClaims: { nonce: 'wrong-nonce' },
    })

    try {
      await expect(exchangeLogtoHostedLoginCode(fixture.config, {
        code: 'auth-code',
        codeVerifier: 'code-verifier',
        fetch: fixture.fetch,
        nonce: 'nonce-123',
      })).rejects.toThrow('nonce mismatch')
    }
    finally {
      fixture.server.stop(true)
    }
  })

  it('fails closed when the ID token audience does not match the Host client', async () => {
    const fixture = await createOidcFixture({
      tokenAudience: 'other-client',
    })

    try {
      await expect(exchangeLogtoHostedLoginCode(fixture.config, {
        code: 'auth-code',
        codeVerifier: 'code-verifier',
        fetch: fixture.fetch,
        nonce: 'nonce-123',
      })).rejects.toThrow()
    }
    finally {
      fixture.server.stop(true)
    }
  })
})

interface OidcFixture {
  config: OidcClientConfig
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  requests: string[]
  server: ReturnType<typeof Bun.serve>
  tokenRequests: Record<string, string>[]
}

async function createOidcFixture(options: {
  tokenAudience?: string
  tokenBody?: unknown
  tokenClaims?: Record<string, unknown>
  tokenIssuer?: string
  tokenStatus?: number
} = {}): Promise<OidcFixture> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  const requests: string[] = []
  const tokenRequests: Record<string, string>[] = []
  const server = Bun.serve({
    fetch: async request => {
      const url = new URL(request.url)
      requests.push(`${request.method} ${url.pathname}`)

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
        const form = Object.fromEntries(await request.formData())
        tokenRequests.push(Object.fromEntries(
          Object.entries(form).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        ))

        if (options.tokenStatus)
          return Response.json(options.tokenBody ?? { error: 'invalid_grant' }, { status: options.tokenStatus })

        const idToken = await new SignJWT({
          email: 'alice@zonease.org',
          email_verified: true,
          nonce: 'nonce-123',
          roles: ['host:admin'],
          ...options.tokenClaims,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
          .setSubject('usr_alice')
          .setIssuer(options.tokenIssuer ?? `${url.origin}/oidc`)
          .setAudience(options.tokenAudience ?? 'aiworker-local-client')
          .setExpirationTime('5m')
          .sign(privateKey)

        return Response.json({
          access_token: 'logto-access-token',
          expires_in: 300,
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
      clientId: 'aiworker-local-client',
      clientSecret: 'client-secret',
      endpoint: `${origin}/`,
      issuer: `${origin}/oidc`,
      redirectUri: 'http://localhost:54145/auth/callback',
    },
    fetch: async (input, init) => fetch(input, init),
    requests,
    server,
    tokenRequests,
  }
}
