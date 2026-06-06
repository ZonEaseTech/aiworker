import { describe, expect, it } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import { createLogtoAuthProvider, extractBearerToken, mapLogtoClaimsToUser } from './logto-auth'

describe('logto auth adapter', () => {
  it('extracts only Authorization Bearer tokens', () => {
    expect(extractBearerToken(new Headers({ Authorization: 'Bearer token_123' }))).toBe('token_123')
    expect(extractBearerToken(new Headers({ Authorization: 'bearer token_123' }))).toBe('token_123')
    expect(extractBearerToken(new Headers({ Authorization: 'Basic token_123' }))).toBeNull()
    expect(extractBearerToken(new Headers({ Authorization: 'Bearer ' }))).toBeNull()
    expect(extractBearerToken(new Headers({ Authorization: 'Bearer\ttoken_123' }))).toBeNull()
    expect(extractBearerToken(new Headers({ Authorization: 'Bearer token_123 extra' }))).toBeNull()
    expect(extractBearerToken(new Headers())).toBeNull()
  })

  it('maps verified Logto claims to a Host user without worker permissions', () => {
    const user = mapLogtoClaimsToUser({
      email: '  User@Zonease.org ',
      email_verified: true,
      roles: [' host:admin ', 42, null, '', '  ', 'employee'],
      sub: ' usr_user ',
      workerId: 'wkr_not_a_permission',
    }, ['zonease.org'])

    expect(user).toEqual({
      email: 'user@zonease.org',
      roles: [],
      subject: 'usr_user',
    })
    expect(user).not.toHaveProperty('workerId')
  })

  it('rejects verified non-zonease email claims', () => {
    expect(() => mapLogtoClaimsToUser({
      email: 'user@example.com',
      email_verified: true,
      sub: 'usr_user',
    }, ['zonease.org'])).toThrow('allowed email domain')
  })

  it('rejects unverified email claims', () => {
    expect(() => mapLogtoClaimsToUser({
      email: 'alice@example.com',
      email_verified: false,
      sub: 'usr_alice',
    }, ['example.com'])).toThrow('verified email')
  })

  it('rejects missing subject or email claims', () => {
    expect(() => mapLogtoClaimsToUser({
      email: 'alice@example.com',
      email_verified: true,
    }, ['example.com'])).toThrow('subject')

    expect(() => mapLogtoClaimsToUser({
      email: '',
      email_verified: true,
      sub: 'usr_alice',
    }, ['example.com'])).toThrow('email')
  })

  it('authenticates a JWT against the discovery jwks_uri instead of a hand-built JWKS URL', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const requests: string[] = []
    const jwksServer = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        requests.push(url.pathname)

        if (url.pathname === '/tenant/oidc/.well-known/openid-configuration') {
          return Response.json({
            authorization_endpoint: `${url.origin}/tenant/oidc/auth`,
            jwks_uri: `${url.origin}/discovered/jwks`,
            token_endpoint: `${url.origin}/tenant/oidc/token`,
          })
        }

        if (url.pathname === '/tenant/oidc/jwks')
          return new Response('hand-built jwks path is not allowed', { status: 500 })

        if (url.pathname !== '/discovered/jwks')
          return new Response('not found', { status: 404 })

        return Response.json({
          keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key', use: 'sig' }],
        })
      },
      port: 0,
    })

    try {
      const issuer = `http://${jwksServer.hostname}:${jwksServer.port}/tenant/oidc`
      const provider = createLogtoAuthProvider({
        allowedEmailDomains: ['zonease.org'],
        audience: 'host-cli',
        issuer,
      })
      const token = await new SignJWT({
        email: 'User@Zonease.org',
        email_verified: true,
        roles: ['host:admin'],
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject('usr_user')
        .setIssuer(issuer)
        .setAudience('host-cli')
        .setExpirationTime('5m')
        .sign(privateKey)
      const wrongAudienceToken = await new SignJWT({
        email: 'User@Zonease.org',
        email_verified: true,
        roles: ['host:admin'],
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject('usr_user')
        .setIssuer(issuer)
        .setAudience('other-audience')
        .setExpirationTime('5m')
        .sign(privateKey)
      const unverifiedEmailToken = await new SignJWT({
        email: 'User@Zonease.org',
        email_verified: false,
        roles: ['host:admin'],
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject('usr_user')
        .setIssuer(issuer)
        .setAudience('host-cli')
        .setExpirationTime('5m')
        .sign(privateKey)

      expect(await provider.authenticateRequest({ headers: new Headers() })).toBeNull()
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) })).toEqual({
        email: 'user@zonease.org',
        roles: [],
        subject: 'usr_user',
      })
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: 'Bearer not-a-jwt' }) })).toBeNull()
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${wrongAudienceToken}` }) })).toBeNull()
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${unverifiedEmailToken}` }) })).toBeNull()
      expect(requests).toEqual([
        '/tenant/oidc/.well-known/openid-configuration',
        '/discovered/jwks',
      ])
    }
    finally {
      jwksServer.stop(true)
    }
  })

  it('uses discovery jwks_uri for a root issuer URL', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const requests: string[] = []
    const jwksServer = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        requests.push(url.pathname)

        if (url.pathname === '/.well-known/openid-configuration') {
          return Response.json({
            authorization_endpoint: `${url.origin}/oidc/auth`,
            jwks_uri: `${url.origin}/root-discovered/jwks`,
            token_endpoint: `${url.origin}/oidc/token`,
          })
        }

        if (url.pathname === '/oidc/jwks')
          return new Response('hand-built root jwks path is not allowed', { status: 500 })

        if (url.pathname !== '/root-discovered/jwks')
          return new Response('not found', { status: 404 })

        return Response.json({
          keys: [{ ...publicJwk, alg: 'RS256', kid: 'root-key', use: 'sig' }],
        })
      },
      port: 0,
    })

    try {
      const issuer = `http://${jwksServer.hostname}:${jwksServer.port}/`
      const provider = createLogtoAuthProvider({
        allowedEmailDomains: ['zonease.org'],
        audience: 'host-cli',
        issuer,
      })
      const token = await new SignJWT({
        email: 'root@zonease.org',
        email_verified: true,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'root-key' })
        .setSubject('usr_root')
        .setIssuer(issuer)
        .setAudience('host-cli')
        .setExpirationTime('5m')
        .sign(privateKey)

      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) })).toEqual({
        email: 'root@zonease.org',
        roles: [],
        subject: 'usr_root',
      })
      expect(requests).toEqual([
        '/.well-known/openid-configuration',
        '/root-discovered/jwks',
      ])
    }
    finally {
      jwksServer.stop(true)
    }
  })

  it('retries OIDC discovery after an initial provider failure', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    let discoveryAttempts = 0
    const jwksServer = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname !== '/retry-discovered/jwks')
          return new Response('not found', { status: 404 })

        return Response.json({
          keys: [{ ...publicJwk, alg: 'RS256', kid: 'retry-key', use: 'sig' }],
        })
      },
      port: 0,
    })

    try {
      const issuer = `http://${jwksServer.hostname}:${jwksServer.port}/retry/oidc`
      const provider = createLogtoAuthProvider({
        allowedEmailDomains: ['zonease.org'],
        audience: 'host-cli',
        fetch: async () => {
          discoveryAttempts += 1
          if (discoveryAttempts === 1)
            return new Response('temporary discovery failure', { status: 500 })

          return Response.json({
            authorization_endpoint: `${issuer}/auth`,
            jwks_uri: `http://${jwksServer.hostname}:${jwksServer.port}/retry-discovered/jwks`,
            token_endpoint: `${issuer}/token`,
          })
        },
        issuer,
      })
      const token = await new SignJWT({
        email: 'retry@zonease.org',
        email_verified: true,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'retry-key' })
        .setSubject('usr_retry')
        .setIssuer(issuer)
        .setAudience('host-cli')
        .setExpirationTime('5m')
        .sign(privateKey)
      const request = { headers: new Headers({ Authorization: `Bearer ${token}` }) }

      expect(await provider.authenticateRequest(request)).toBeNull()
      expect(await provider.authenticateRequest(request)).toEqual({
        email: 'retry@zonease.org',
        roles: [],
        subject: 'usr_retry',
      })
      expect(discoveryAttempts).toBe(2)
    }
    finally {
      jwksServer.stop(true)
    }
  })
})
