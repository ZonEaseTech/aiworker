import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'

import { createRemoteJWKSet, jwtVerify } from 'jose'

import type { HostSessionPayload } from './host-session-cookie'

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

export interface OidcDiscoveryMetadata {
  authorizationEndpoint: string
  jwksUri: string
  tokenEndpoint: string
}

export interface LogtoHostIdentity {
  email: string
  roles: string[]
  sub: string
}

export type OidcFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const discoveryCache = new Map<string, Promise<OidcDiscoveryMetadata>>()

export async function discoverLogtoOidcConfiguration(
  config: OidcClientConfig,
  input: { fetch?: OidcFetch } = {},
): Promise<OidcDiscoveryMetadata> {
  const issuer = normalizedIssuer(config.issuer)
  return discoverLogtoOidcIssuerConfiguration(issuer, input)
}

export async function discoverLogtoOidcIssuerConfiguration(
  issuerInput: string,
  input: { fetch?: OidcFetch } = {},
): Promise<OidcDiscoveryMetadata> {
  const issuer = normalizedIssuer(issuerInput)
  if (input.fetch)
    return fetchLogtoOidcConfiguration(issuer, input.fetch)

  const cached = discoveryCache.get(issuer)
  if (cached)
    return cached

  const promise = fetchLogtoOidcConfiguration(issuer, fetch)
    .catch((error: unknown) => {
      discoveryCache.delete(issuer)
      throw error
    })
  discoveryCache.set(issuer, promise)
  return promise
}

export async function beginLogtoHostedLogin(
  config: OidcClientConfig,
  input: {
    fetch?: OidcFetch
    randomBytes?: (size: number) => Buffer
    returnTo: string
  },
): Promise<{ redirectUrl: string, transaction: OidcLoginTransaction }> {
  const returnTo = normalizeLogtoReturnTo(input.returnTo)
  const discovery = await discoverLogtoOidcConfiguration(config, { fetch: input.fetch })
  return buildAuthorizationRedirectFromEndpoint(config, discovery.authorizationEndpoint, {
    ...input,
    returnTo,
  })
}

export async function buildAuthorizationRedirect(
  config: OidcClientConfig,
  input: {
    fetch?: OidcFetch
    randomBytes?: (size: number) => Buffer
    returnTo: string
  },
): Promise<{ redirectUrl: string, transaction: OidcLoginTransaction }> {
  return beginLogtoHostedLogin(config, input)
}

export async function exchangeLogtoHostedLoginCode(
  config: OidcClientConfig,
  input: {
    code: string
    codeVerifier: string
    fetch?: OidcFetch
    nonce: string
    now?: () => Date
  },
): Promise<HostSessionPayload> {
  const fetchFn = input.fetch ?? fetch
  const discovery = await discoverLogtoOidcConfiguration(config, { fetch: fetchFn })
  const response = await fetchFn(discovery.tokenEndpoint, {
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
    throw new Error(await tokenExchangeErrorMessage(response))

  const body = await response.json() as { id_token?: unknown }

  if (typeof body.id_token !== 'string')
    throw new Error('Logto token response is missing id_token')

  const jwks = createRemoteJWKSet(new URL(discovery.jwksUri))
  const { payload } = await jwtVerify(body.id_token, jwks, {
    audience: config.clientId,
    issuer: normalizedIssuer(config.issuer),
  })

  if (payload.nonce !== input.nonce)
    throw new Error('Logto ID token nonce mismatch')

  const expiresAt = new Date((input.now?.() ?? new Date()).getTime() + 8 * 60 * 60 * 1000).toISOString()

  return mapLogtoHostedLoginClaims(payload as Record<string, unknown>, expiresAt)
}

export async function exchangeAuthorizationCode(
  config: OidcClientConfig,
  input: {
    code: string
    codeVerifier: string
    fetch?: OidcFetch
    nonce: string
    now?: () => Date
  },
): Promise<HostSessionPayload> {
  return exchangeLogtoHostedLoginCode(config, input)
}

export function mapLogtoHostedLoginClaims(claims: Record<string, unknown>, expiresAt: string): HostSessionPayload {
  const identity = mapLogtoZoneaseClaims(claims)

  return {
    ...identity,
    expiresAt,
  }
}

export function mapLogtoZoneaseClaims(claims: Record<string, unknown>): LogtoHostIdentity {
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
    roles: Array.isArray(claims.roles)
      ? claims.roles
          .filter((role): role is string => typeof role === 'string')
          .map(role => role.trim())
          .filter(Boolean)
      : [],
    sub: claims.sub.trim(),
  }
}

function buildAuthorizationRedirectFromEndpoint(
  config: OidcClientConfig,
  authorizationEndpoint: string,
  input: {
    randomBytes?: (size: number) => Buffer
    returnTo: string
  },
): { redirectUrl: string, transaction: OidcLoginTransaction } {
  const randomBytes = input.randomBytes ?? nodeRandomBytes
  const codeVerifier = randomString(randomBytes, 48)
  const state = randomString(randomBytes, 32)
  const nonce = randomString(randomBytes, 32)
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

function randomString(randomBytes: (size: number) => Buffer, size: number): string {
  return randomBytes(size).toString('base64url')
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

async function fetchLogtoOidcConfiguration(issuer: string, fetchFn: OidcFetch): Promise<OidcDiscoveryMetadata> {
  const response = await fetchFn(`${issuer}/.well-known/openid-configuration`)
  if (!response.ok)
    throw new Error(`Logto OIDC discovery failed with status ${response.status}`)

  const body = await response.json() as Record<string, unknown>
  const authorizationEndpoint = readRequiredUrl(body, 'authorization_endpoint')
  const tokenEndpoint = readRequiredUrl(body, 'token_endpoint')
  const jwksUri = readRequiredUrl(body, 'jwks_uri')

  return {
    authorizationEndpoint,
    jwksUri,
    tokenEndpoint,
  }
}

function normalizedIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, '')
}

function readRequiredUrl(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`Logto OIDC discovery is missing ${key}`)

  return new URL(value).toString()
}

export function normalizeLogtoReturnTo(returnTo: string): string {
  if (
    returnTo.length === 0
    || returnTo !== returnTo.trim()
    || /[\u0000-\u001F\u007F]/.test(returnTo)
    || /\\/.test(returnTo)
    || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(returnTo)
    || !returnTo.startsWith('/')
    || returnTo.startsWith('//')
  ) {
    throw new Error('Logto returnTo must stay on an allowed same-site Host path')
  }

  const baseOrigin = 'https://aiworker.local'
  const url = new URL(returnTo, baseOrigin)
  if (url.origin !== baseOrigin)
    throw new Error('Logto returnTo must stay on an allowed same-site Host path')

  const normalized = `${url.pathname}${url.search}${url.hash}`
  if (url.pathname === '/host')
    return normalized

  if (/^\/workers\/[A-Za-z0-9_-]+$/.test(url.pathname))
    return normalized

  throw new Error('Logto returnTo must stay on an allowed same-site Host path')
}

async function tokenExchangeErrorMessage(response: Response): Promise<string> {
  const body = await readJsonObject(response)
  const safeError = sanitizeOAuthErrorField(body?.error)
  const safeDescription = sanitizeOAuthErrorField(body?.error_description)
  const details = [safeError, safeDescription].filter(Boolean).join(': ')

  return details
    ? `Logto token exchange failed with status ${response.status}: ${details}`
    : `Logto token exchange failed with status ${response.status}`
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await response.json()
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return null
    return body as Record<string, unknown>
  }
  catch {
    return null
  }
}

function sanitizeOAuthErrorField(value: unknown): string | null {
  if (typeof value !== 'string')
    return null

  const sanitized = value
    .replace(/\b(?:access_token|id_token|refresh_token|client_secret)\b\s*[:=]\s*["']?[^,\s"'}]+/gi, '[redacted]')
    .replace(/\b(?:access_token|id_token|refresh_token|client_secret)\b/gi, '[redacted]')
    .replace(/[A-Za-z0-9._~+/-]{32,}/g, '[redacted]')
    .trim()
    .slice(0, 160)

  return sanitized.length > 0 ? sanitized : null
}
