import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'

import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface HostSessionPayload {
  email: string
  expiresAt: string
  roles: string[]
  sub: string
}

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
    transaction: {
      codeVerifier,
      nonce,
      returnTo: input.returnTo,
      state,
    },
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
      ? claims.roles
          .filter((role): role is string => typeof role === 'string')
          .map(role => role.trim())
          .filter(Boolean)
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
