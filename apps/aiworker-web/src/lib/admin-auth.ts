import type { AdminRemediationCode } from '@/lib/admin-remediation'
import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { adminApiErrorPayload } from '@/lib/admin-remediation'

export type AdminAuthMode = 'local' | 'locked' | 'logto' | 'misconfigured'

export interface AdminSession {
  email: string
  emailVerified: boolean
  expiresAt: number
  name?: string
  sub: string
}

export interface AdminAuthBootstrapStatus {
  authenticated: boolean
  loginRequired: boolean
  loginUrl: string
  logoutUrl: string
  mode: AdminAuthMode
  remediationCode?: AdminRemediationCode
  via?: 'session' | 'token'
  userEmail?: string
}

export interface LogtoRuntimeConfig {
  allowAnyEmail: boolean
  allowedEmailDomains: string[]
  baseUrl: string
  clientId: string
  clientSecret: string
  cookieSecret: string
  endpoint: string
  issuer: string
  redirectUri: string
}

export type LogtoRuntimeState
  = | { config: LogtoRuntimeConfig, kind: 'configured' }
    | { kind: 'disabled' }
    | { kind: 'misconfigured', missing: string[], present: string[] }

export type AdminAuthorization
  = | { ok: true, session: AdminSession | null, via: 'local' | 'session' | 'token' }
    | { code: AdminRemediationCode, ok: false, status: number }

interface OidcMetadata {
  authorization_endpoint?: string
  end_session_endpoint?: string
  issuer?: string
  token_endpoint?: string
  userinfo_endpoint?: string
}

interface LoginState {
  codeVerifier: string
  expiresAt: number
  returnTo?: string
  state: string
  v: 1
}

interface TokenResponse {
  access_token?: unknown
  id_token?: unknown
}

interface UserInfo {
  email?: unknown
  email_verified?: unknown
  name?: unknown
  sub?: unknown
}

const sessionCookieName = 'aiworker_admin_session'
const loginStateCookieName = 'aiworker_logto_state'
const sessionMaxAgeSeconds = 8 * 60 * 60
const loginStateMaxAgeSeconds = 10 * 60
const authScope = 'openid profile email'

export function logtoRuntimeState(env: NodeJS.ProcessEnv = process.env): LogtoRuntimeState {
  const endpoint = normalizeUrl(env.LOGTO_ENDPOINT)
  const clientId = readFirstEnv(env, ['LOGTO_CLIENT_ID', 'LOGTO_APP_ID'])
  const clientSecret = readFirstEnv(env, ['LOGTO_CLIENT_SECRET', 'LOGTO_APP_SECRET'])
  const baseUrl = normalizeUrl(env.LOGTO_BASE_URL)
  const logtoSpecificPresent = Boolean(
    env.LOGTO_ENDPOINT?.trim()
    || env.LOGTO_CLIENT_ID?.trim()
    || env.LOGTO_APP_ID?.trim()
    || env.LOGTO_CLIENT_SECRET?.trim()
    || env.LOGTO_APP_SECRET?.trim()
    || env.LOGTO_COOKIE_SECRET?.trim()
    || env.LOGTO_BASE_URL?.trim()
    || env.LOGTO_ALLOWED_EMAIL_DOMAINS?.trim(),
  )

  if (!logtoSpecificPresent)
    return { kind: 'disabled' }

  const cookieSecret = readFirstEnv(env, ['LOGTO_COOKIE_SECRET', 'AIWORKER_SESSION_SECRET'])
  const allowAnyEmail = env.AIWORKER_WEB_ALLOW_ANY_LOGTO_EMAIL === '1'
  const allowedEmailDomains = parseEmailDomains(env.LOGTO_ALLOWED_EMAIL_DOMAINS || env.AIWORKER_ALLOWED_EMAIL_DOMAINS || '')
  const values = {
    endpoint,
    clientId,
    clientSecret,
    cookieSecret,
    baseUrl,
    allowedEmailDomains: allowAnyEmail || allowedEmailDomains.length > 0 ? 'configured' : '',
  }
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  const present = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key]) => key)

  if (missing.length)
    return { kind: 'misconfigured', missing, present }

  const issuer = `${endpoint.replace(/\/+$/, '')}/oidc`
  return {
    config: {
      allowAnyEmail,
      allowedEmailDomains,
      baseUrl,
      clientId,
      clientSecret,
      cookieSecret,
      endpoint,
      issuer,
      redirectUri: `${baseUrl.replace(/\/+$/, '')}/callback`,
    },
    kind: 'configured',
  }
}

export function adminAuthBootstrapStatus(request: Request | null, env: NodeJS.ProcessEnv = process.env): AdminAuthBootstrapStatus {
  const state = logtoRuntimeState(env)
  const session = request ? readAdminSession(request, env) : null
  const tokenAuthorized = request ? adminTokenAuthorized(request, env) : false
  const authenticated = Boolean(session) || tokenAuthorized
  const via = session ? 'session' : tokenAuthorized ? 'token' : undefined
  if (state.kind === 'configured') {
    return {
      authenticated,
      loginRequired: true,
      loginUrl: '/login',
      logoutUrl: '/logout',
      mode: 'logto',
      ...(via ? { via } : {}),
      ...(session?.email ? { userEmail: session.email } : {}),
    }
  }
  if (state.kind === 'misconfigured') {
    return {
      authenticated: false,
      loginRequired: true,
      loginUrl: '/login',
      logoutUrl: '/logout',
      mode: 'misconfigured',
      remediationCode: 'admin_auth_misconfigured',
    }
  }
  if (authRequiredWithoutLogto(env)) {
    return {
      authenticated,
      loginRequired: true,
      loginUrl: '/login',
      logoutUrl: '/logout',
      mode: 'locked',
      remediationCode: 'admin_auth_required',
      ...(via ? { via } : {}),
    }
  }
  return {
    authenticated,
    loginRequired: false,
    loginUrl: '/login',
    logoutUrl: '/logout',
    mode: 'local',
    ...(via ? { via } : {}),
  }
}

export function authorizeAdminRead(request: Request, env: NodeJS.ProcessEnv = process.env): AdminAuthorization {
  const token = adminTokenAuthorized(request, env)
  if (token)
    return { ok: true, session: null, via: 'token' }
  const session = readAdminSession(request, env)
  if (session)
    return { ok: true, session, via: 'session' }

  const state = logtoRuntimeState(env)
  if (state.kind === 'misconfigured')
    return { code: 'admin_auth_misconfigured', ok: false, status: 503 }
  if (state.kind === 'configured' || authRequiredWithoutLogto(env))
    return { code: 'admin_auth_required', ok: false, status: 401 }
  return { ok: true, session: null, via: 'local' }
}

export function authorizeAdminMutation(request: Request, env: NodeJS.ProcessEnv = process.env): AdminAuthorization {
  const token = adminTokenAuthorized(request, env)
  if (token)
    return { ok: true, session: null, via: 'token' }
  const session = readAdminSession(request, env)
  if (session)
    return { ok: true, session, via: 'session' }

  const state = logtoRuntimeState(env)
  if (state.kind === 'misconfigured')
    return { code: 'admin_auth_misconfigured', ok: false, status: 503 }
  if (state.kind === 'configured' || authRequiredWithoutLogto(env))
    return { code: 'admin_auth_required', ok: false, status: 401 }
  if (env.AIWORKER_WEB_ADMIN_TOKEN?.trim())
    return { code: 'admin_token_required', ok: false, status: 401 }
  return { ok: true, session: null, via: 'local' }
}

export function adminAuthErrorResponse(auth: Extract<AdminAuthorization, { ok: false }>): Response {
  return Response.json(adminApiErrorPayload(auth.code), {
    status: auth.status,
    headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
  })
}

export function readAdminSession(request: Request, env: NodeJS.ProcessEnv = process.env): AdminSession | null {
  const state = logtoRuntimeState(env)
  if (state.kind !== 'configured')
    return null
  const value = parseCookies(request.headers.get('cookie')).get(sessionCookieName)
  if (!value)
    return null
  const payload = verifySignedJson<AdminSession>(value, state.config.cookieSecret)
  if (!payload || payload.expiresAt < Date.now())
    return null
  if (!payload.emailVerified || !emailAllowed(payload.email, state.config))
    return null
  return payload
}

export async function loginResponse(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const runtime = logtoRuntimeState(env)
  if (runtime.kind !== 'configured')
    return authSetupPageResponse(runtime.kind === 'misconfigured' ? 'misconfigured' : authRequiredWithoutLogto(env) ? 'locked' : 'local', env)

  const canonicalRedirect = canonicalLoginRedirect(request, runtime.config)
  if (canonicalRedirect)
    return canonicalRedirect

  const metadata = await fetchOidcMetadata(runtime.config)
  const authorizationEndpoint = requireMetadataUrl(metadata.authorization_endpoint, 'authorization_endpoint')
  const state = randomToken()
  const codeVerifier = randomToken(48)
  const url = new URL(request.url)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  const loginState: LoginState = {
    codeVerifier,
    expiresAt: Date.now() + loginStateMaxAgeSeconds * 1000,
    ...(returnTo ? { returnTo } : {}),
    state,
    v: 1,
  }
  const redirect = new URL(authorizationEndpoint)
  redirect.searchParams.set('client_id', runtime.config.clientId)
  redirect.searchParams.set('code_challenge', codeChallenge(codeVerifier))
  redirect.searchParams.set('code_challenge_method', 'S256')
  redirect.searchParams.set('redirect_uri', runtime.config.redirectUri)
  redirect.searchParams.set('response_type', 'code')
  redirect.searchParams.set('scope', authScope)
  redirect.searchParams.set('state', state)

  return redirectResponse(redirect.href, [
    signedCookie(loginStateCookieName, loginState, runtime.config.cookieSecret, runtime.config, loginStateMaxAgeSeconds),
  ])
}

function canonicalLoginRedirect(request: Request, config: Pick<LogtoRuntimeConfig, 'baseUrl'>): Response | null {
  try {
    const requestUrl = new URL(request.url)
    const baseUrl = new URL(config.baseUrl)
    if (requestMatchesConfiguredBase(request, requestUrl, baseUrl))
      return null
    const redirect = new URL(`${requestUrl.pathname}${requestUrl.search}`, baseUrl)
    return redirectResponse(redirect.href)
  }
  catch {
    return null
  }
}

function requestMatchesConfiguredBase(request: Request, requestUrl: URL, baseUrl: URL): boolean {
  const forwardedHost = firstForwardedValue(request.headers.get('x-forwarded-host'))?.toLowerCase()
  const forwardedProto = firstForwardedValue(request.headers.get('x-forwarded-proto'))?.toLowerCase()
  const configuredHost = baseUrl.host.toLowerCase()
  if (forwardedHost === configuredHost)
    return !forwardedProto || `${forwardedProto}:` === baseUrl.protocol
  if (requestUrl.host.toLowerCase() !== configuredHost)
    return false
  return requestUrl.protocol === baseUrl.protocol || (baseUrl.protocol === 'https:' && requestUrl.protocol === 'http:')
}

export async function callbackResponse(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const runtime = logtoRuntimeState(env)
  if (runtime.kind !== 'configured')
    return redirectResponse('/login')

  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim()
  const state = url.searchParams.get('state')?.trim()
  if (!code || !state)
    return redirectResponse('/login')

  const cookies = parseCookies(request.headers.get('cookie'))
  const loginState = verifySignedJson<LoginState>(cookies.get(loginStateCookieName) ?? '', runtime.config.cookieSecret)
  if (!loginState || loginState.expiresAt < Date.now() || loginState.state !== state)
    return redirectResponse('/login', [clearCookie(loginStateCookieName, runtime.config)])

  const metadata = await fetchOidcMetadata(runtime.config)
  const tokenEndpoint = requireMetadataUrl(metadata.token_endpoint, 'token_endpoint')
  const userinfoEndpoint = requireMetadataUrl(metadata.userinfo_endpoint, 'userinfo_endpoint')
  const token = await exchangeCodeForToken(tokenEndpoint, runtime.config, code, loginState.codeVerifier)
  const accessToken = typeof token.access_token === 'string' ? token.access_token : ''
  if (!accessToken)
    return redirectResponse('/login', [clearCookie(loginStateCookieName, runtime.config)])

  const user = await fetchUserInfo(userinfoEndpoint, accessToken)
  const session = sessionFromUserInfo(user, runtime.config)
  if (!session) {
    return redirectResponse('/login?denied=domain', [
      clearCookie(loginStateCookieName, runtime.config),
      clearCookie(sessionCookieName, runtime.config),
    ])
  }

  return redirectResponse(loginState.returnTo ?? '/', [
    clearCookie(loginStateCookieName, runtime.config),
    signedCookie(sessionCookieName, session, runtime.config.cookieSecret, runtime.config, sessionMaxAgeSeconds),
  ])
}

export function logoutResponse(request: Request, env: NodeJS.ProcessEnv = process.env): Response {
  const runtime = logtoRuntimeState(env)
  const config = runtime.kind === 'configured' ? runtime.config : fallbackCookieConfig(request)
  return redirectResponse('/login', [
    clearCookie(sessionCookieName, config),
    clearCookie(loginStateCookieName, config),
  ])
}

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/'))
    return null
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x20 || code === 0x7F)
      return null
  }
  if (value.startsWith('//') || value.startsWith('/\\'))
    return null
  if (value === '/' || value.startsWith('/login') || value.startsWith('/callback') || value.startsWith('/logout'))
    return null
  return value
}

export function emailAllowed(email: string, config: Pick<LogtoRuntimeConfig, 'allowAnyEmail' | 'allowedEmailDomains'>): boolean {
  if (config.allowAnyEmail)
    return true
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1)
    return false
  return config.allowedEmailDomains.includes(email.slice(at + 1).toLowerCase())
}

function sessionFromUserInfo(user: UserInfo, config: LogtoRuntimeConfig): AdminSession | null {
  const email = typeof user.email === 'string' ? user.email : ''
  const sub = typeof user.sub === 'string' ? user.sub : ''
  const emailVerified = user.email_verified === true
  if (!email || !sub || !emailVerified || !emailAllowed(email, config))
    return null
  const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : undefined
  return {
    email,
    emailVerified,
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000,
    ...(name ? { name } : {}),
    sub,
  }
}

async function fetchOidcMetadata(config: LogtoRuntimeConfig): Promise<OidcMetadata> {
  const response = await fetch(`${config.issuer}/.well-known/openid-configuration`)
  if (!response.ok)
    throw new Error(`Logto OIDC discovery failed (${response.status})`)
  return await response.json() as OidcMetadata
}

async function exchangeCodeForToken(tokenEndpoint: string, config: LogtoRuntimeConfig, code: string, codeVerifier: string): Promise<TokenResponse> {
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`Logto token exchange failed (${response.status})`)
  return await response.json() as TokenResponse
}

async function fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<UserInfo> {
  const response = await fetch(userinfoEndpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok)
    throw new Error(`Logto userinfo failed (${response.status})`)
  return await response.json() as UserInfo
}

function requireMetadataUrl(value: string | undefined, name: string): string {
  if (!value)
    throw new Error(`Logto OIDC discovery is missing ${name}`)
  return value
}

function authRequiredWithoutLogto(env: NodeJS.ProcessEnv): boolean {
  if (env.AIWORKER_WEB_REQUIRE_AUTH === '1')
    return true
  const host = env.AIWORKER_WEB_HOST?.trim() || '127.0.0.1'
  return env.AIWORKER_WEB_ALLOW_REMOTE === '1' && !isLoopbackHost(host)
}

function adminTokenAuthorized(request: Request, env: NodeJS.ProcessEnv): boolean {
  const expectedToken = env.AIWORKER_WEB_ADMIN_TOKEN?.trim()
  if (!expectedToken)
    return false
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const explicit = request.headers.get('x-aiworker-admin-token')?.trim()
  return bearer === expectedToken || explicit === expectedToken
}

function parseEmailDomains(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean)
}

function firstForwardedValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null
}

function readFirstEnv(env: NodeJS.ProcessEnv, keys: string[]): string {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value)
      return value
  }
  return ''
}

function normalizeUrl(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed)
    return ''
  return trimmed.replace(/\/+$/, '')
}

function codeChallenge(codeVerifier: string): string {
  return base64Url(createHash('sha256').update(codeVerifier).digest())
}

function randomToken(bytes = 32): string {
  return base64Url(randomBytes(bytes))
}

function signedCookie(name: string, payload: unknown, secret: string, config: Pick<LogtoRuntimeConfig, 'baseUrl'>, maxAge: number): string {
  return cookieHeader(name, signJson(payload, secret), config, maxAge)
}

function signJson(payload: unknown, secret: string): string {
  const body = base64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = base64Url(createHmac('sha256', secret).update(body).digest())
  return `${body}.${signature}`
}

function verifySignedJson<T>(value: string, secret: string): T | null {
  const [body, signature, ...rest] = value.split('.')
  if (!body || !signature || rest.length)
    return null
  const expected = base64Url(createHmac('sha256', secret).update(body).digest())
  if (!timingSafeStringEqual(signature, expected))
    return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  }
  catch {
    return null
  }
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function cookieHeader(name: string, value: string, config: Pick<LogtoRuntimeConfig, 'baseUrl'>, maxAge: number): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    cookieSecure(config) ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function clearCookie(name: string, config: Pick<LogtoRuntimeConfig, 'baseUrl'>): string {
  return cookieHeader(name, '', config, 0)
}

function cookieSecure(config: Pick<LogtoRuntimeConfig, 'baseUrl'>): boolean {
  return config.baseUrl.startsWith('https://') || process.env.NODE_ENV === 'production'
}

function parseCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>()
  for (const chunk of (header ?? '').split(';')) {
    const index = chunk.indexOf('=')
    if (index <= 0)
      continue
    map.set(chunk.slice(0, index).trim(), chunk.slice(index + 1).trim())
  }
  return map
}

function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, 'x-aiworker-boundary': 'admin-control-plane-only' })
  for (const cookie of cookies)
    headers.append('set-cookie', cookie)
  return new Response(null, { headers, status: 302 })
}

function authSetupPageResponse(mode: 'local' | 'locked' | 'misconfigured', env: NodeJS.ProcessEnv): Response {
  const title = mode === 'local' ? 'AIWorker Web local bootstrap' : mode === 'locked' ? 'AIWorker Web authentication required' : 'AIWorker Web authentication is misconfigured'
  const detail = mode === 'local'
    ? 'Logto is not configured. Local fixture preview remains available; bind Logto before exposing this app remotely.'
    : mode === 'locked'
      ? 'This server requires administrator authentication before it can expose the control-plane UI.'
      : 'Logto runtime variables are partially configured. Run the Logto setup script and restart the server.'
  const domains = env.LOGTO_ALLOWED_EMAIL_DOMAINS || env.AIWORKER_ALLOWED_EMAIL_DOMAINS || ''
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8fb; color: #14171f; }
    main { max-width: 560px; padding: 28px; border: 1px solid #d9dee8; background: #fff; border-radius: 8px; box-shadow: 0 16px 48px rgb(20 23 31 / 8%); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { line-height: 1.6; color: #4a5568; }
    code { background: #eef2f7; padding: 2px 5px; border-radius: 4px; }
    a { color: #0f766e; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(detail)}</p>
    <p>Setup command: <code>bun scripts/setup-logto.mjs</code></p>
    ${domains ? `<p>Allowed domains: <code>${escapeHtml(domains)}</code></p>` : ''}
    ${mode === 'local' ? '<p><a href="/">Continue to local preview</a></p>' : ''}
  </main>
</body>
</html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-aiworker-boundary': 'admin-control-plane-only',
    },
    status: mode === 'local' ? 200 : 503,
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function fallbackCookieConfig(request: Request): Pick<LogtoRuntimeConfig, 'baseUrl'> {
  const url = new URL(request.url)
  return { baseUrl: `${url.protocol}//${url.host}` }
}

function base64Url(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
}
