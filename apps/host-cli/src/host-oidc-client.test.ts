import { createHash } from 'node:crypto'

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

  it('maps only verified zonease.org claims to a Host session payload', () => {
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

  it('exchanges an authorization code and validates the ID token without returning Logto tokens', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const tokenRequests: Record<string, string>[] = []
    const server = Bun.serve({
      fetch: async request => {
        const url = new URL(request.url)

        if (url.pathname === '/oidc/jwks') {
          return Response.json({
            keys: [{ ...publicJwk, alg: 'RS256', kid: 'key-1', use: 'sig' }],
          })
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
            .setIssuer(`${url.origin}/oidc`)
            .setAudience('aiworker-local-client')
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

  it('does not expose token endpoint response bodies when exchange fails', async () => {
    const server = Bun.serve({
      fetch: request => {
        const url = new URL(request.url)

        if (url.pathname === '/oidc/token')
          return new Response('access_token=secret-token', { status: 500 })

        return new Response('not found', { status: 404 })
      },
      port: 0,
    })

    try {
      await expect(exchangeAuthorizationCode({
        ...config,
        issuer: `http://${server.hostname}:${server.port}/oidc`,
      }, {
        code: 'auth-code',
        codeVerifier: 'code-verifier',
        nonce: 'nonce-123',
        tokenEndpoint: `http://${server.hostname}:${server.port}/oidc/token`,
      })).rejects.not.toThrow('secret-token')
    }
    finally {
      server.stop(true)
    }
  })
})
