import type { AuthProvider, AuthenticatedHostUser } from '@zonease/aiworker-host-control'

import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface LogtoClaims {
  email?: unknown
  email_verified?: unknown
  roles?: unknown
  sub?: unknown
  [claim: string]: unknown
}

export interface LogtoAuthOptions {
  audience: string
  issuer: string
}

export function extractBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization)
    return null

  const match = /^Bearer +(\S+)$/i.exec(authorization.trim())
  return match?.[1] ?? null
}

export function mapLogtoClaimsToUser(claims: LogtoClaims): AuthenticatedHostUser {
  if (typeof claims.sub !== 'string' || claims.sub.trim().length === 0)
    throw new Error('Logto token is missing a subject')

  if (typeof claims.email !== 'string' || claims.email.trim().length === 0)
    throw new Error('Logto token is missing an email')

  if (claims.email_verified !== true)
    throw new Error('Logto token must contain a verified email')

  return {
    email: claims.email.trim().toLowerCase(),
    roles: Array.isArray(claims.roles)
      ? claims.roles
          .filter((role): role is string => typeof role === 'string')
          .map(role => role.trim())
          .filter(Boolean)
      : [],
    subject: claims.sub.trim(),
  }
}

export function createLogtoAuthProvider(options: LogtoAuthOptions): AuthProvider {
  const jwks = createRemoteJWKSet(logtoJwksUrl(options.issuer))

  return {
    async authenticateRequest({ headers }) {
      const token = extractBearerToken(headers)
      if (!token)
        return null

      try {
        const { payload } = await jwtVerify(token, jwks, {
          audience: options.audience,
          issuer: options.issuer,
        })
        return mapLogtoClaimsToUser(payload as LogtoClaims)
      }
      catch {
        return null
      }
    },
  }
}

function logtoJwksUrl(issuer: string): URL {
  const issuerUrl = new URL(issuer)
  const basePath = issuerUrl.pathname === '/' ? '/oidc' : issuerUrl.pathname.replace(/\/$/, '')
  return new URL(`${basePath}/jwks`, issuerUrl.origin)
}
