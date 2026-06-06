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
      email: '  Alice@Example.COM ',
      email_verified: true,
      roles: [' host:admin ', 42, null, '', '  ', 'employee'],
      sub: ' usr_alice ',
      workerId: 'wkr_not_a_permission',
    })

    expect(user).toEqual({
      email: 'alice@example.com',
      roles: ['host:admin', 'employee'],
      subject: 'usr_alice',
    })
    expect(user).not.toHaveProperty('workerId')
  })

  it('rejects unverified email claims', () => {
    expect(() => mapLogtoClaimsToUser({
      email: 'alice@example.com',
      email_verified: false,
      sub: 'usr_alice',
    })).toThrow('verified email')
  })

  it('rejects missing subject or email claims', () => {
    expect(() => mapLogtoClaimsToUser({
      email: 'alice@example.com',
      email_verified: true,
    })).toThrow('subject')

    expect(() => mapLogtoClaimsToUser({
      email: '',
      email_verified: true,
      sub: 'usr_alice',
    })).toThrow('email')
  })

  it('authenticates a JWT against a path-preserving Logto JWKS URL', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const jwksRequests: string[] = []
    const jwksServer = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        jwksRequests.push(url.pathname)
        if (url.pathname !== '/tenant/oidc/jwks')
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
        audience: 'host-cli',
        issuer,
      })
      const token = await new SignJWT({
        email: 'User@Example.com',
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
        email: 'User@Example.com',
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
        email: 'User@Example.com',
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
        email: 'user@example.com',
        roles: ['host:admin'],
        subject: 'usr_user',
      })
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: 'Bearer not-a-jwt' }) })).toBeNull()
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${wrongAudienceToken}` }) })).toBeNull()
      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${unverifiedEmailToken}` }) })).toBeNull()
      expect(jwksRequests).toEqual(['/tenant/oidc/jwks'])
    }
    finally {
      jwksServer.stop(true)
    }
  })

  it('uses /oidc/jwks for a root issuer URL', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const jwksRequests: string[] = []
    const jwksServer = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        jwksRequests.push(url.pathname)
        if (url.pathname !== '/oidc/jwks')
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
        audience: 'host-cli',
        issuer,
      })
      const token = await new SignJWT({
        email: 'root@example.com',
        email_verified: true,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'root-key' })
        .setSubject('usr_root')
        .setIssuer(issuer)
        .setAudience('host-cli')
        .setExpirationTime('5m')
        .sign(privateKey)

      expect(await provider.authenticateRequest({ headers: new Headers({ Authorization: `Bearer ${token}` }) })).toEqual({
        email: 'root@example.com',
        roles: [],
        subject: 'usr_root',
      })
      expect(jwksRequests).toEqual(['/oidc/jwks'])
    }
    finally {
      jwksServer.stop(true)
    }
  })
})
