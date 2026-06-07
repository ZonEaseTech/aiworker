import { Buffer } from 'node:buffer'
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

const forbiddenLogtoTokenKeys = new Set([
  'access_token',
  'accessToken',
  'id_token',
  'idToken',
  'refresh_token',
  'refreshToken',
])

export function assertHostSessionSecret(secret: string): string {
  const normalized = secret.trim()
  if (normalized.length < 32)
    throw new Error('Host session secret must be at least 32 non-whitespace characters')
  return normalized
}

export function createSignedCookie<T extends { expiresAt: string }>(
  name: string,
  payload: T,
  options: SignedCookieOptions,
): string {
  assertNoLogtoTokens(payload)
  const secret = assertHostSessionSecret(options.secret)

  const body = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(name, body, secret)
  const value = `${body}.${signature}`
  return `${name}=${value}; ${sessionCookieAttributes(options)}`
}

export function readSignedCookie<T extends { expiresAt?: unknown }>(
  name: string,
  value: string | null | undefined,
  options: { now?: () => Date, secret: string },
): T | null {
  const secret = assertHostSessionSecret(options.secret)
  if (!value)
    return null
  const [body, signature, extra] = value.split('.')
  if (!body || !signature || extra)
    return null
  if (!safeEqual(signature, sign(name, body, secret)))
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

  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs))
    return null

  const now = options.now?.() ?? new Date()
  if (expiresAtMs <= now.getTime())
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

function sign(name: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${name.length}:${name}:${body}`).digest('base64url')
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

function assertNoLogtoTokens(value: unknown): void {
  if (!value || typeof value !== 'object')
    return

  if (Array.isArray(value)) {
    for (const item of value)
      assertNoLogtoTokens(item)
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenLogtoTokenKeys.has(key))
      throw new Error('Refusing to persist Logto token fields in Host session cookies')
    assertNoLogtoTokens(nestedValue)
  }
}
