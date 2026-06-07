import type { AuthenticatedHostUser, AuthProvider } from '@zonease/aiworker-host-control'

import type { OidcFetch } from './host-oidc-client'

import { createRemoteJWKSet, jwtVerify } from 'jose'
import {
  discoverLogtoOidcIssuerConfiguration,
  mapLogtoHostClaims,

} from './host-oidc-client'

export interface LogtoClaims {
  email?: unknown
  email_verified?: unknown
  roles?: unknown
  sub?: unknown
  [claim: string]: unknown
}

export interface LogtoAuthOptions {
  audience: string
  allowedEmailDomains: string[]
  fetch?: OidcFetch
  issuer: string
}

export function extractBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization)
    return null

  const match = /^Bearer +(\S+)$/i.exec(authorization.trim())
  return match?.[1] ?? null
}

export function mapLogtoClaimsToUser(claims: LogtoClaims, allowedEmailDomains: string[]): AuthenticatedHostUser {
  const identity = mapLogtoHostClaims(claims, allowedEmailDomains)

  return {
    email: identity.email,
    roles: identity.roles,
    subject: identity.sub,
  }
}

export function createLogtoAuthProvider(options: LogtoAuthOptions): AuthProvider {
  let jwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null

  return {
    async authenticateRequest({ headers }) {
      const token = extractBearerToken(headers)
      if (!token)
        return null

      try {
        const { payload } = await jwtVerify(token, await resolveJwks(), {
          audience: options.audience,
          issuer: options.issuer,
        })
        return mapLogtoClaimsToUser(payload as LogtoClaims, options.allowedEmailDomains)
      }
      catch {
        return null
      }
    },
  }

  async function resolveJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    jwksPromise ??= discoverLogtoOidcIssuerConfiguration(options.issuer, { fetch: options.fetch })
      .then((discovery) => {
        const remoteJwks = createRemoteJWKSet(new URL(discovery.jwksUri))
        const retryingJwks = (async (
          ...args: Parameters<ReturnType<typeof createRemoteJWKSet>>
        ) => {
          try {
            return await remoteJwks(...args)
          }
          catch (error) {
            jwksPromise = null
            throw error
          }
        }) as ReturnType<typeof createRemoteJWKSet>
        return retryingJwks
      })
      .catch((error: unknown) => {
        jwksPromise = null
        throw error
      })
    return jwksPromise
  }
}
