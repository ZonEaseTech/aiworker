import type { AuthenticatedHostUser, AuthProvider, WorkerAccessConnection, WorkerAccessRegistry } from '@zonease/aiworker-host-control'
import type { HostAssignmentRow, HostSoulReleaseRow } from '@zonease/aiworker-storage-sqlite/host'
import type { WorkerAccessRequestEnvelope, WorkerAccessResponseEnvelope } from '@zonease/aiworker-worker-control-protocol'
import type { Buffer } from 'node:buffer'
import type { OidcClientConfig, OidcFetch, OidcLoginTransaction } from './host-oidc-client'
import type { HostOptionsView, ProvisioningAdapterType, ProvisioningTargetMaturity } from './host-options'
import type { HostSessionPayload } from './host-session-cookie'

import type { ProvisioningDeliveryResult } from './provisioning-target-adapters'
import { existsSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

import {
  createAccessRequestEnvelope,
  createAssignmentView,
  createStaticAuthProvider,
  createWorkerAccessRegistry,
  mapWorkerAccessPath,
  parseAccessResponseEnvelope,
  userCanOpenWorker,
  userIsHostAdmin,
} from '@zonease/aiworker-host-control'
import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import {
  bootstrapHostAdminEmails,
  createAssignment,
  getAssignmentByWorkerId,
  getSoulRelease,
  initHostDb,
  issueAssignmentAccessToken,
  listAssignments,
  listSoulReleases,
  markAssignmentAccessReady,
  markAssignmentCheckedIn,
  markAssignmentReady,
  publishSoulRelease,
  runHostMigrations,
  userHasHostPermission,
  verifyAndConsumeProvisionToken,
  verifyAssignmentAccessToken,
} from '@zonease/aiworker-storage-sqlite/host'
import {
  parseWorkerAccessFrame,
  parseWorkerCheckInRequest,
  parseWorkerCheckInResponse,
} from '@zonease/aiworker-worker-control-protocol'
import {
  buildAuthorizationRedirect,
  exchangeAuthorizationCode,
  normalizeLogtoReturnTo,
} from './host-oidc-client'
import { buildHostOptions } from './host-options'
import {
  clearCookieHeader,
  createSignedCookie,
  parseCookieHeader,
  readSignedCookie,
} from './host-session-cookie'
import { assertRemoteAisshCallbackReachable, resolveAdapterRuntimeControlBaseUrl } from './host-url-contract'
import { deliverProvisioningTarget } from './provisioning-target-adapters'

interface HostSessionAuthOptions {
  bootstrapAdminEmails?: string[]
  fetch?: OidcFetch
  now?: () => Date
  oidc: OidcClientConfig
  randomBytes?: (size: number) => Buffer
  sessionSecret: string
}

interface HostServerBaseOptions {
  accessRegistry?: WorkerAccessRegistry
  authProvider?: AuthProvider
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  optionsProvider?: () => Promise<HostOptionsView>
  sessionAuth?: HostSessionAuthOptions
  webBaseUrl?: string
  webStaticDir?: string
}

export interface HostServerOptions extends HostServerBaseOptions {
  hostBrowserBaseUrl: string
  hostControlBaseUrl: string
}

interface LegacyHostServerOptions extends HostServerBaseOptions {
  hostBrowserBaseUrl?: string
  hostControlBaseUrl?: string
  publicBaseUrl: string
}

export interface HostServer {
  fetch: (request: Request, server?: Bun.Server<WorkerAccessSocketData>) => Promise<Response>
  websocket: Bun.WebSocketHandler<WorkerAccessSocketData>
}

interface WorkerAccessSocketData {
  accessConnection?: WorkerAccessConnection
  closing?: boolean
  workerId?: string
}

const WORKER_RESPONSE_HEADER_DENYLIST = [
  'authorization',
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const

interface CreateAssignmentRequest {
  assignedEmail?: unknown
  adapterRuntimeControlBaseUrl?: unknown
  provisioningTarget?: unknown
  soulReleaseRef?: unknown
}

interface ParsedProvisioningTarget {
  adapterType: ProvisioningAdapterType
  maturity: ProvisioningTargetMaturity
  ref: string
}

let activeHostDbPath: string | null = null

export async function createHostServer(options: HostServerOptions): Promise<HostServer>
export async function createHostServer(options: LegacyHostServerOptions): Promise<HostServer>
export async function createHostServer(options: HostServerOptions | LegacyHostServerOptions): Promise<HostServer> {
  const dbPath = normalizeDbPath(options.dbPath)
  if (activeHostDbPath && activeHostDbPath !== dbPath && existsSync(activeHostDbPath)) {
    throw new Error(`Cannot create Host server with different Host dbPath in one process: active=${activeHostDbPath} requested=${dbPath}`)
  }

  activeHostDbPath = dbPath
  initHostDb(dbPath)
  runHostMigrations()
  if (options.sessionAuth?.bootstrapAdminEmails?.length) {
    bootstrapHostAdminEmails(options.sessionAuth.bootstrapAdminEmails, {
      now: () => (options.sessionAuth!.now?.() ?? new Date()).toISOString(),
    })
  }

  const hostControlBaseUrl = options.hostControlBaseUrl ?? ('publicBaseUrl' in options ? options.publicBaseUrl : undefined)
  if (!hostControlBaseUrl)
    throw new Error('Host server requires hostControlBaseUrl')
  const hostBrowserBaseUrl = options.hostBrowserBaseUrl ?? options.webBaseUrl ?? hostControlBaseUrl

  const authProvider = options.authProvider ?? createStaticAuthProvider(options.authUser ?? null)
  const effectiveAuthProvider = options.sessionAuth
    ? createCookieBackedAuthProvider(options.sessionAuth)
    : authProvider
  const accessRegistry = options.accessRegistry ?? createWorkerAccessRegistry()
  const webStaticDir = options.webStaticDir ? normalizeStaticDir(options.webStaticDir) : null
  const pending = new Map<string, {
    reject: (error: Error) => void
    resolve: (response: WorkerAccessResponseEnvelope) => void
    timeout: ReturnType<typeof setTimeout>
    ws: Bun.ServerWebSocket<WorkerAccessSocketData>
  }>()
  const normalizedHostBrowserBaseUrl = hostBrowserBaseUrl.replace(/\/+$/, '')

  function sendSocketRequest(ws: Bun.ServerWebSocket<WorkerAccessSocketData>, envelope: WorkerAccessRequestEnvelope): Promise<WorkerAccessResponseEnvelope> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pending.delete(envelope.id))
          reject(new Error('worker access request timed out'))
      }, 15000)
      pending.set(envelope.id, { reject, resolve, timeout, ws })
      ws.send(JSON.stringify(envelope))
    })
  }

  function rejectPendingForSocket(ws: Bun.ServerWebSocket<WorkerAccessSocketData>, reason: string): void {
    for (const [id, request] of pending) {
      if (request.ws !== ws)
        continue
      clearTimeout(request.timeout)
      pending.delete(id)
      request.reject(new Error(reason))
    }
  }

  async function handleWorkerAccessSocketMessage(ws: Bun.ServerWebSocket<WorkerAccessSocketData>, message: string | Buffer): Promise<void> {
    const frame = parseWorkerAccessFrame(JSON.parse(String(message)))

    if (frame.type === 'hello') {
      const assignment = verifyAssignmentAccessToken({
        assignmentId: frame.assignmentId,
        token: frame.token,
        workerId: frame.workerId,
      })
      if (!assignment) {
        // 撤销/拒绝 auth 失败用可区分的 application close code(4401 = access_rejected,在 RFC 6455
        // 私有 4000–4999 段)。worker 据此区分「access 被撤销/拒绝、需 re-provision」与「瞬断需重连」:
        // 4401 → 清持久 token + 停重连循环;其余裸 close → 走重连。绝不携带 token。
        ws.close(4401, 'access_rejected')
        return
      }

      let readyAssignment = assignment
      if (readyAssignment.status === 'checked_in') {
        const accessReady = markAssignmentAccessReady(readyAssignment.assignmentId)
        if (!accessReady) {
          ws.close()
          return
        }
        readyAssignment = accessReady
      }
      if (readyAssignment.status === 'access_ready') {
        const ready = markAssignmentReady(readyAssignment.assignmentId, {
          workbenchUrl: `${normalizedHostBrowserBaseUrl}/workers/${encodeURIComponent(frame.workerId)}`,
        })
        if (!ready) {
          ws.close()
          return
        }
      }

      const connection: WorkerAccessConnection = {
        assignmentId: assignment.assignmentId,
        close: () => {
          if (ws.data.closing)
            return
          ws.data.closing = true
          ws.close()
        },
        sendRequest: envelope => sendSocketRequest(ws, envelope),
        workerId: frame.workerId,
      }
      accessRegistry.register(connection)
      ws.data.workerId = frame.workerId
      ws.data.accessConnection = connection
      return
    }

    if (frame.type === 'response') {
      const request = pending.get(frame.id)
      if (!request || request.ws !== ws)
        return
      pending.delete(frame.id)
      clearTimeout(request.timeout)
      request.resolve(frame)
      return
    }

    if (frame.type === 'close') {
      const request = pending.get(frame.id)
      if (!request || request.ws !== ws)
        return
      pending.delete(frame.id)
      clearTimeout(request.timeout)
      request.reject(new Error('worker access request closed'))
      return
    }

    if (frame.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', id: frame.id }))
    }
  }

  return {
    async fetch(request, server) {
      const url = resolveForwardedUrl(request)
      const decodedPathname = decodePathname(url.pathname)
      if (!decodedPathname)
        return json({ error: { code: 'INVALID_STATIC_PATH' } }, { status: 400 })

      if (request.method === 'GET' && url.pathname === '/auth/login')
        return handleAuthLogin(request, options.sessionAuth)

      if (request.method === 'GET' && url.pathname === '/auth/callback')
        return handleAuthCallback(request, options.sessionAuth)

      if (request.method === 'POST' && url.pathname === '/auth/logout')
        return handleAuthLogout(request)

      if (request.method === 'GET' && url.pathname === '/api/auth/me')
        return handleAuthMe(request, effectiveAuthProvider)

      if (isHostBrowserMethod(request.method) && isHostBrowserRoute(decodedPathname)) {
        if (options.sessionAuth) {
          const user = readUserFromSessionCookie(request.headers, options.sessionAuth)
          if (!user)
            return redirectToLogin('/host')
          if (!userIsHostAdmin(user))
            return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
        }

        const hostWebResponse = await serveHostWebStatic(request, webStaticDir)
        if (hostWebResponse)
          return hostWebResponse

        return devLanding(hostControlBaseUrl, options.webBaseUrl ?? hostBrowserBaseUrl)
      }

      const hostWebResponse = await serveHostWebStatic(request, webStaticDir)
      if (hostWebResponse)
        return hostWebResponse

      if (url.pathname === '/api/host/assignments') {
        return handleAssignments(request, effectiveAuthProvider, {
          hostBrowserBaseUrl,
          hostControlBaseUrl,
        })
      }

      if (request.method === 'GET' && url.pathname === '/api/host/options')
        return handleOptions(request, effectiveAuthProvider, options.optionsProvider ?? buildHostOptions)

      if (url.pathname === '/api/host/soul-releases')
        return handleSoulReleases(request, effectiveAuthProvider)

      if (request.method === 'POST' && url.pathname === '/api/provision/check-in')
        return handleCheckIn(request)

      if (request.method === 'GET' && url.pathname === '/api/provision/access') {
        if (!server)
          return json({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } }, { status: 426 })
        const upgraded = server.upgrade(request, { data: {} })
        return upgraded ? new Response(null, { status: 101 }) : json({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } }, { status: 426 })
      }

      const workerMatch = /^\/workers\/([^/]+)(?:\/.*)?$/.exec(url.pathname)
      if (workerMatch && isWorkerAccessMethod(request.method)) {
        const workerId = decodeURIComponent(workerMatch[1]!)
        if (options.sessionAuth && !readUserFromSessionCookie(request.headers, options.sessionAuth)) {
          if (request.method === 'GET' || request.method === 'HEAD')
            return redirectToLogin(`/workers/${encodeURIComponent(workerId)}`)
          return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
        }
        return handleWorkerRoute(request, effectiveAuthProvider, accessRegistry, workerId)
      }

      return json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
    },
    websocket: {
      close(ws) {
        rejectPendingForSocket(ws, 'worker access socket closed')
        if (!ws.data.workerId || !ws.data.accessConnection)
          return
        ws.data.closing = true
        accessRegistry.removeIfCurrent(ws.data.workerId, ws.data.accessConnection)
      },
      message(ws, message) {
        handleWorkerAccessSocketMessage(ws, message).catch(() => ws.close())
      },
    },
  }
}

async function handleAuthLogin(request: Request, sessionAuth: HostSessionAuthOptions | undefined): Promise<Response> {
  if (!sessionAuth)
    return json({ error: { code: 'AUTH_NOT_CONFIGURED' } }, { status: 501 })

  const url = resolveForwardedUrl(request)
  const returnToResult = normalizeSafeReturnTo(url.searchParams.get('returnTo') ?? '/host')
  if (!returnToResult.ok)
    return json({ error: { code: 'INVALID_RETURN_TO' } }, { status: 400 })

  const callbackOrigin = new URL(sessionAuth.oidc.redirectUri).origin
  if (url.origin !== callbackOrigin) {
    const canonicalLoginUrl = new URL('/auth/login', callbackOrigin)
    canonicalLoginUrl.searchParams.set('returnTo', returnToResult.value)
    return new Response(null, {
      headers: { location: canonicalLoginUrl.toString() },
      status: 302,
    })
  }

  const redirect = await buildAuthorizationRedirect(sessionAuth.oidc, {
    returnTo: returnToResult.value,
    ...(sessionAuth.fetch ? { fetch: sessionAuth.fetch } : {}),
    ...(sessionAuth.randomBytes ? { randomBytes: sessionAuth.randomBytes } : {}),
  })
  const now = sessionAuth.now?.() ?? new Date()
  const headers = new Headers()
  headers.set('location', redirect.redirectUrl)
  headers.append('set-cookie', createSignedCookie<OidcLoginTransaction & { expiresAt: string }>('aiworker_auth_txn', {
    ...redirect.transaction,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  }, {
    maxAgeSeconds: 600,
    path: '/auth',
    requestUrl: url.href,
    sameSite: 'Lax',
    secret: sessionAuth.sessionSecret,
  }))
  return new Response(null, { headers, status: 302 })
}

async function handleAuthCallback(request: Request, sessionAuth: HostSessionAuthOptions | undefined): Promise<Response> {
  if (!sessionAuth)
    return json({ error: { code: 'AUTH_NOT_CONFIGURED' } }, { status: 501 })

  const url = resolveForwardedUrl(request)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state)
    return json({ error: { code: 'INVALID_AUTH_CALLBACK' } }, { status: 400 })

  const transactionValue = parseCookieHeader(request.headers.get('cookie')).get('aiworker_auth_txn')
  const transaction = readSignedCookie<OidcLoginTransaction & { expiresAt: string }>('aiworker_auth_txn', transactionValue, {
    secret: sessionAuth.sessionSecret,
    ...(sessionAuth.now ? { now: sessionAuth.now } : {}),
  })
  const returnToResult = transaction ? normalizeSafeReturnTo(transaction.returnTo) : { ok: false as const }
  if (!transaction || transaction.state !== state || !returnToResult.ok || !isOidcLoginTransaction(transaction))
    return json({ error: { code: 'INVALID_AUTH_TRANSACTION' } }, { status: 400 })

  let session: HostSessionPayload
  try {
    session = await exchangeAuthorizationCode(sessionAuth.oidc, {
      code,
      codeVerifier: transaction.codeVerifier,
      nonce: transaction.nonce,
      ...(sessionAuth.fetch ? { fetch: sessionAuth.fetch } : {}),
      ...(sessionAuth.now ? { now: sessionAuth.now } : {}),
    })
  }
  catch (error) {
    console.warn(JSON.stringify({
      event: 'host_auth_callback_failed',
      reason: safeAuthFailureMessage(error),
    }))
    return json({ error: { code: 'AUTH_CALLBACK_FAILED' } }, { status: 403 })
  }

  const headers = new Headers()
  headers.set('location', returnToResult.value)
  headers.append('set-cookie', clearCookieHeader('aiworker_auth_txn', '/auth', url.href))
  headers.append('set-cookie', createSignedCookie('aiworker_session', session, {
    maxAgeSeconds: 8 * 60 * 60,
    path: '/',
    requestUrl: url.href,
    sameSite: 'Lax',
    secret: sessionAuth.sessionSecret,
  }))
  return new Response(null, { headers, status: 302 })
}

function handleAuthLogout(request: Request): Response {
  const url = resolveForwardedUrl(request)
  const returnToResult = normalizeSafeReturnTo(url.searchParams.get('returnTo') ?? '/host')
  const headers = new Headers()
  headers.set('location', returnToResult.ok ? returnToResult.value : '/host')
  headers.append('set-cookie', clearCookieHeader('aiworker_session', '/', url.href))
  return new Response(null, { headers, status: 302 })
}

// `/api/auth/me` is the Host Web's operator-identity probe. It runs through the
// effective auth provider so it answers truthfully in BOTH modes: the
// cookie-backed Logto provider when sessionAuth is configured (prod path stays
// byte-identical), and the static dev-admin provider otherwise — so a local
// `--dev-admin-email` operator is reported instead of a misleading 401.
async function handleAuthMe(request: Request, authProvider: AuthProvider): Promise<Response> {
  const user = await authProvider.authenticateRequest({ headers: request.headers })
  if (!user)
    return json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })

  return json({ user })
}

function createCookieBackedAuthProvider(sessionAuth: HostSessionAuthOptions): AuthProvider {
  return {
    async authenticateRequest({ headers }) {
      return readUserFromSessionCookie(headers, sessionAuth)
    },
  }
}

function readUserFromSessionCookie(headers: Headers, sessionAuth: HostSessionAuthOptions): AuthenticatedHostUser | null {
  const value = parseCookieHeader(headers.get('cookie')).get('aiworker_session')
  const session = readSignedCookie<HostSessionPayload>('aiworker_session', value, {
    secret: sessionAuth.sessionSecret,
    ...(sessionAuth.now ? { now: sessionAuth.now } : {}),
  })
  if (!isHostSessionPayload(session))
    return null

  return {
    email: session.email,
    roles: userHasHostPermission(session.email, 'host:admin') ? ['host:admin'] : [],
    subject: session.sub,
  }
}

// The Host binds to 127.0.0.1 (loopback); only a co-located reverse proxy
// (e.g. Caddy terminating TLS in front of Cloudflare) can connect, so the
// X-Forwarded-* headers it injects are trusted here. The proxy reaches the
// Host over plaintext http, which makes Bun's request.url scheme http even
// when the external request is https; this helper recovers the real external
// scheme/host for auth-origin decisions and Secure-cookie selection.
function resolveForwardedUrl(request: Request): URL {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwardedProto)
    url.protocol = forwardedProto
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    ?? request.headers.get('host')
  if (forwardedHost)
    url.host = forwardedHost
  return url
}

function redirectToLogin(returnTo: string): Response {
  return new Response(null, {
    headers: { location: `/auth/login?returnTo=${encodeURIComponent(returnTo)}` },
    status: 302,
  })
}

function isHostBrowserMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD'
}

function isWorkerAccessMethod(method: string): boolean {
  return method === 'GET'
    || method === 'HEAD'
    || method === 'POST'
    || method === 'PUT'
    || method === 'PATCH'
    || method === 'DELETE'
    || method === 'OPTIONS'
}

function isHostSessionPayload(value: HostSessionPayload | null): value is HostSessionPayload {
  return value !== null
    && typeof value.email === 'string'
    && value.email.trim().length > 0
    && typeof value.sub === 'string'
    && value.sub.trim().length > 0
    && Array.isArray(value.roles)
    && value.roles.every(role => typeof role === 'string')
}

function isHostBrowserRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/host' || pathname.startsWith('/host/')
}

function normalizeSafeReturnTo(value: string): { ok: true, value: string } | { ok: false } {
  try {
    return { ok: true, value: normalizeLogtoReturnTo(value) }
  }
  catch {
    return { ok: false }
  }
}

function isOidcLoginTransaction(value: OidcLoginTransaction & { expiresAt: string }): boolean {
  return typeof value.codeVerifier === 'string'
    && value.codeVerifier.length > 0
    && typeof value.nonce === 'string'
    && value.nonce.length > 0
    && typeof value.returnTo === 'string'
    && value.returnTo.length > 0
    && typeof value.state === 'string'
    && value.state.length > 0
}

function safeAuthFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/\b(?:access_token|id_token|refresh_token|client_secret|code)\s*[:=]\s*["']?[^,\s"'}]+/gi, '[redacted]')
    .replace(/\b(?:access_token|id_token|refresh_token|client_secret)\b/gi, '[redacted]')
    .replace(/[\w.~+/-]{32,}/g, '[redacted]')
    .trim()
    .slice(0, 240)
}

async function handleAssignments(
  request: Request,
  authProvider: AuthProvider,
  urls: {
    hostBrowserBaseUrl: string
    hostControlBaseUrl: string
  },
): Promise<Response> {
  const user = await authProvider.authenticateRequest({ headers: request.headers })
  if (!user || !userIsHostAdmin(user))
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  if (request.method === 'GET')
    return json({ assignments: listAssignments().map(toAssignmentView) })

  if (request.method !== 'POST')
    return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405 })

  let body: CreateAssignmentRequest
  try {
    body = await request.json() as CreateAssignmentRequest
  }
  catch {
    return json({ error: { code: 'INVALID_JSON' } }, { status: 400 })
  }

  const provisioningTarget = parseProvisioningTarget(body.provisioningTarget)
  if (
    !isNonEmptyString(body.assignedEmail)
    || !isEmail(body.assignedEmail)
    || !provisioningTarget
    || !isNonEmptyString(body.soulReleaseRef)
    || (body.adapterRuntimeControlBaseUrl !== undefined && !isNonEmptyString(body.adapterRuntimeControlBaseUrl))
  ) {
    return json({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }, { status: 400 })
  }

  let adapterRuntimeControlBaseUrl: string
  try {
    adapterRuntimeControlBaseUrl = resolveAdapterRuntimeControlBaseUrl({
      adapterRuntimeControlBaseUrl: isNonEmptyString(body.adapterRuntimeControlBaseUrl) ? body.adapterRuntimeControlBaseUrl : undefined,
      adapterType: provisioningTarget.adapterType,
      hostControlBaseUrl: urls.hostControlBaseUrl,
    })
    if (provisioningTarget.adapterType === 'aissh')
      assertRemoteAisshCallbackReachable({ adapterRuntimeControlBaseUrl, targetRef: provisioningTarget.ref })
  }
  catch (error) {
    if (isProvisioningTargetUnreachable(error))
      return json({ error: { code: 'PROVISIONING_TARGET_UNREACHABLE' } }, { status: 400 })
    return json({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }, { status: 400 })
  }

  let created: ReturnType<typeof createAssignment>
  try {
    created = createAssignment({
      assignedEmail: body.assignedEmail,
      provisioningTarget,
      soulReleaseRef: body.soulReleaseRef,
    })
  }
  catch {
    return json({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }, { status: 400 })
  }

  let delivery: ProvisioningDeliveryResult
  try {
    delivery = deliverProvisioningTarget({
      adapterRuntimeControlBaseUrl,
      adapterType: provisioningTarget.adapterType,
      assignedEmail: created.assignment.assignedEmail,
      assignmentId: created.assignment.assignmentId,
      hostBrowserBaseUrl: urls.hostBrowserBaseUrl,
      hostControlBaseUrl: urls.hostControlBaseUrl,
      maturity: provisioningTarget.maturity,
      provisionToken: created.provisionToken,
      soulReleaseRef: body.soulReleaseRef,
      targetRef: provisioningTarget.ref,
    })
  }
  catch (error) {
    if (isProvisioningTargetUnreachable(error))
      return json({ error: { code: 'PROVISIONING_TARGET_UNREACHABLE' } }, { status: 400 })
    return json({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }, { status: 400 })
  }

  return json({
    assignment: toAssignmentView(created.assignment),
    deliveryReceipt: delivery.deliveryReceipt,
    deliveryStatus: delivery.deliveryStatus,
    expectedCheckInDeadline: delivery.expectedCheckInDeadline,
    operatorHint: delivery.operatorHint,
    provisionCommand: delivery.provisionCommand,
    provisionToken: created.provisionToken,
  }, { status: 201 })
}

async function handleOptions(
  request: Request,
  authProvider: AuthProvider,
  optionsProvider: () => Promise<HostOptionsView>,
): Promise<Response> {
  const user = await authProvider.authenticateRequest({ headers: request.headers })
  if (!user || !userIsHostAdmin(user))
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
  return json(await optionsProvider())
}

function toSoulReleaseView(row: HostSoulReleaseRow): Record<string, unknown> {
  return {
    name: row.name,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
    releaseRef: row.releaseRef,
    soulId: row.soulId,
    source: row.source,
    version: row.version,
  }
}

async function handleSoulReleases(request: Request, authProvider: AuthProvider): Promise<Response> {
  const user = await authProvider.authenticateRequest({ headers: request.headers })
  if (!user || !userIsHostAdmin(user))
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  if (request.method === 'GET')
    return json({ releases: listSoulReleases().map(toSoulReleaseView) })

  if (request.method !== 'POST')
    return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405 })

  let body: { descriptor?: unknown, version?: unknown }
  try {
    body = await request.json() as { descriptor?: unknown, version?: unknown }
  }
  catch {
    return json({ error: { code: 'INVALID_JSON' } }, { status: 400 })
  }

  // Host stores the descriptor as an opaque release artifact: it validates the
  // descriptor-only v1 shape but never interprets domain fields.
  let descriptor: ReturnType<typeof parseSoulDescriptorV1>
  try {
    descriptor = parseSoulDescriptorV1(body.descriptor)
  }
  catch {
    return json({ error: { code: 'INVALID_SOUL_DESCRIPTOR' } }, { status: 400 })
  }

  const identity = descriptor.identity as Record<string, unknown>
  const soulId = identity.id
  const name = identity.name
  if (typeof soulId !== 'string' || soulId.trim().length === 0 || typeof name !== 'string' || name.trim().length === 0)
    return json({ error: { code: 'INVALID_SOUL_DESCRIPTOR' } }, { status: 400 })

  let version: number | undefined
  if (body.version !== undefined) {
    if (typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 1)
      return json({ error: { code: 'INVALID_SOUL_RELEASE_VERSION' } }, { status: 400 })
    version = body.version
  }

  try {
    const release = publishSoulRelease({
      soulId,
      name,
      descriptor,
      ...(version !== undefined ? { version } : {}),
      publishedBy: 'web',
    })
    return json({ release: toSoulReleaseView(release) }, { status: 201 })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('already exists'))
      return json({ error: { code: 'SOUL_RELEASE_CONFLICT' } }, { status: 409 })
    return json({ error: { code: 'INVALID_SOUL_DESCRIPTOR' } }, { status: 400 })
  }
}

async function handleCheckIn(request: Request): Promise<Response> {
  let checkIn: ReturnType<typeof parseWorkerCheckInRequest>
  try {
    checkIn = parseWorkerCheckInRequest(await request.json())
  }
  catch {
    return json({ error: { code: 'INVALID_CHECK_IN_REQUEST' } }, { status: 400 })
  }

  const assignment = verifyAndConsumeProvisionToken(checkIn.provisionToken)
  if (!assignment)
    return json({ error: { code: 'INVALID_PROVISION_TOKEN' } }, { status: 401 })

  // D4 worker_id 守卫:worker_id 在 markAssignmentCheckedIn 的 UPDATE 首次写,且有 UNIQUE 索引。
  // 若该 worker_id 已绑到「另一」assignment,UPDATE 会抛 UNIQUE 异常(≈500)。在 handler 预判
  // 拦截,诚实 409,绝不让 UNIQUE 抛到响应。同一 assignment(幂等重放)放行往下。
  const boundToWorkerId = getAssignmentByWorkerId(checkIn.worker.workerId)
  if (boundToWorkerId && boundToWorkerId.assignmentId !== assignment.assignmentId)
    return json({ error: { code: 'WORKER_ID_ALREADY_BOUND' } }, { status: 409 })

  // release 解析在 markAssignmentCheckedIn 之前:缺 release 时 assignment 保持 provisioning
  // 状态不被推进为 checked_in,实现诚实失败而非静默推进无 soul 的 worker。
  // descriptor-only:Host 透传不透明 descriptorJson,不解析领域字段。
  const release = getSoulRelease(assignment.soulReleaseRef)
  if (!release)
    return json({ error: { code: 'SOUL_RELEASE_NOT_FOUND' } }, { status: 404 })

  const checkedIn = markAssignmentCheckedIn(assignment.assignmentId, {
    workerId: checkIn.worker.workerId,
    workerVersion: checkIn.worker.version,
  })
  if (!checkedIn)
    return json({ error: { code: 'ASSIGNMENT_NOT_FOUND' } }, { status: 404 })

  const issued = issueAssignmentAccessToken(checkedIn.assignmentId)
  if (!issued)
    return json({ error: { code: 'WORKER_ACCESS_TOKEN_NOT_ISSUED' } }, { status: 500 })

  const response = parseWorkerCheckInResponse({
    access: {
      mode: 'worker_access',
      token: issued.accessToken,
    },
    assignment: {
      assignedEmail: checkedIn.assignedEmail,
      assignmentId: checkedIn.assignmentId,
      soulReleaseRef: checkedIn.soulReleaseRef,
      workerId: checkIn.worker.workerId,
      soulDescriptor: release.descriptorJson,
    },
  })
  return json(response)
}

async function handleWorkerRoute(
  request: Request,
  authProvider: AuthProvider,
  accessRegistry: WorkerAccessRegistry,
  workerId: string,
): Promise<Response> {
  const assignment = getAssignmentByWorkerId(workerId)
  if (!assignment)
    return json({ error: { code: 'WORKER_NOT_FOUND' } }, { status: 404 })

  const user = await authProvider.authenticateRequest({ headers: request.headers })
  if (!user)
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  const assignmentView = toAssignmentView(assignment)
  const readyAuthView = createAssignmentView({ ...assignmentView, status: 'ready' })
  if (!userIsHostAdmin(user) && !userCanOpenWorker(user, readyAuthView))
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  // Until a Worker access connection is registered, the employee URL is not ready and Host must not pretend it is. aissh success and check-in are not enough.
  if (assignment.status !== 'ready' || !accessRegistry.has(workerId))
    return json({ error: { code: 'WORKER_ACCESS_NOT_READY' } }, { status: 503 })

  const requestUrl = new URL(request.url)
  // Thin trailing-slash redirect for the bare Workbench entry, applied only
  // after assignment/auth/readiness gates pass so 403/404/503 still take
  // precedence for the bare URL. The Workbench SPA is built with a relative
  // asset base (`./assets/...`), so it must load under a trailing-slash
  // document URL for the browser to resolve those assets against
  // `/workers/:id/` instead of `/workers/`. Only the bare GET/HEAD entry is
  // redirected; every `/workers/:id/<subpath>` (including the trailing-slash
  // root itself) forwards through mapWorkerAccessPath unchanged. Route only,
  // never the body.
  if ((request.method === 'GET' || request.method === 'HEAD')
    && requestUrl.pathname === `/workers/${encodeURIComponent(workerId)}`) {
    return new Response(null, {
      headers: { location: `${requestUrl.pathname}/${requestUrl.search}` },
      status: 302,
    })
  }
  let localPath: string
  try {
    localPath = mapWorkerAccessPath(`${requestUrl.pathname}${requestUrl.search}`, workerId)
  }
  catch {
    return json({ error: { code: 'INVALID_WORKER_ACCESS_PATH' } }, { status: 400 })
  }
  const envelope = await createAccessRequestEnvelope(new Request(new URL(localPath, request.url), request))
  const requestId = envelope.id
  // Redacted per-request forwarding log. This closure closes over only the four
  // scalar fields below, so it structurally cannot see body, headers, or secrets.
  // localPath drops the query string because it may carry token/email/secret.
  const logForwardedRequestPath = localPath.split('?', 1)[0] ?? '/'
  const logForward = (responseStatus: number): void => {
    console.warn(JSON.stringify({
      event: 'worker_route_forwarded',
      workerId,
      requestId,
      localPath: logForwardedRequestPath,
      responseStatus,
    }))
  }
  let tunneled: WorkerAccessResponseEnvelope | null
  try {
    tunneled = await accessRegistry.sendRequest(workerId, envelope)
  }
  catch {
    logForward(502)
    return json({ error: { code: 'WORKER_ACCESS_FAILED' } }, { status: 502 })
  }
  if (!tunneled) {
    logForward(503)
    return json({ error: { code: 'WORKER_ACCESS_NOT_READY' } }, { status: 503 })
  }
  let parsed: WorkerAccessResponseEnvelope
  try {
    parsed = parseAccessResponseEnvelope(tunneled)
  }
  catch {
    logForward(502)
    return json({ error: { code: 'WORKER_ACCESS_FAILED' } }, { status: 502 })
  }
  logForward(parsed.status)
  return new Response(parsed.bodyText, {
    headers: sanitizeWorkerResponseHeaders(parsed.headers),
    status: parsed.status,
  })
}

function toAssignmentView(row: HostAssignmentRow) {
  const metadata = readAssignmentMetadata(row.metadataJson)
  return createAssignmentView({
    assignedEmail: row.assignedEmail,
    assignmentId: row.assignmentId,
    provisioningAdapterType: metadata.provisioningAdapterType,
    provisioningTargetMaturity: metadata.provisioningTargetMaturity,
    provisioningTargetRef: metadata.provisioningTargetRef ?? row.serverRef,
    revokedAt: row.revokedAt,
    serverRef: row.serverRef,
    soulReleaseRef: row.soulReleaseRef,
    status: row.status,
    workerId: row.workerId,
    workbenchUrl: row.workbenchUrl,
  })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function sanitizeWorkerResponseHeaders(source: Record<string, string>): Headers {
  const headers = new Headers(source)
  for (const header of WORKER_RESPONSE_HEADER_DENYLIST)
    headers.delete(header)
  return headers
}

function parseProvisioningTarget(value: unknown): ParsedProvisioningTarget | null {
  if (!value || typeof value !== 'object')
    return null
  const record = value as Record<string, unknown>
  if (record.adapterType !== 'aissh' && record.adapterType !== 'docker' && record.adapterType !== 'local')
    return null
  if (record.maturity !== 'production' && record.maturity !== 'preview' && record.maturity !== 'dev')
    return null
  if (typeof record.ref !== 'string' || record.ref.trim().length === 0)
    return null
  return {
    adapterType: record.adapterType,
    maturity: record.maturity,
    ref: record.ref,
  }
}

function readAssignmentMetadata(value: unknown): {
  provisioningAdapterType?: ProvisioningAdapterType
  provisioningTargetMaturity?: ProvisioningTargetMaturity
  provisioningTargetRef?: string
} {
  if (!value || typeof value !== 'object')
    return {}

  const record = value as Record<string, unknown>
  return {
    ...(record.provisioningAdapterType === 'aissh' || record.provisioningAdapterType === 'docker' || record.provisioningAdapterType === 'local'
      ? { provisioningAdapterType: record.provisioningAdapterType }
      : {}),
    ...(record.provisioningTargetMaturity === 'production' || record.provisioningTargetMaturity === 'preview' || record.provisioningTargetMaturity === 'dev'
      ? { provisioningTargetMaturity: record.provisioningTargetMaturity }
      : {}),
    ...(typeof record.provisioningTargetRef === 'string' && record.provisioningTargetRef.trim().length > 0
      ? { provisioningTargetRef: record.provisioningTargetRef }
      : {}),
  }
}

function isProvisioningTargetUnreachable(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Remote aissh target cannot use a loopback Host callback URL')
}

function isEmail(value: string): boolean {
  const normalized = value.trim()
  if (/\s/.test(normalized))
    return false

  const at = normalized.indexOf('@')
  if (at <= 0 || at !== normalized.lastIndexOf('@'))
    return false

  const emailHost = normalized.slice(at + 1)
  return emailHost.includes('.') && !emailHost.startsWith('.') && !emailHost.endsWith('.')
}

function normalizeDbPath(dbPath: string): string {
  return dbPath === ':memory:' ? dbPath : resolve(dbPath)
}

function normalizeStaticDir(webStaticDir: string): string {
  const root = resolve(webStaticDir)
  const indexPath = join(root, 'index.html')
  if (!existsSync(indexPath))
    throw new Error(`Host Web static directory is missing index.html: ${root}`)
  return root
}

async function serveHostWebStatic(request: Request, webStaticDir: null | string): Promise<null | Response> {
  if (!webStaticDir || (request.method !== 'GET' && request.method !== 'HEAD'))
    return null

  const url = new URL(request.url)
  const pathname = decodePathname(url.pathname)
  if (!pathname)
    return json({ error: { code: 'INVALID_STATIC_PATH' } }, { status: 400 })

  const filePath = resolveStaticFilePath(webStaticDir, pathname)
  if (!filePath)
    return null

  if (!isPathInsideRoot(webStaticDir, filePath))
    return null

  const file = Bun.file(filePath)
  if (!await file.exists())
    return null

  const headers = new Headers()
  headers.set('content-type', contentTypeForPath(filePath))
  return new Response(request.method === 'HEAD' ? null : file, { headers })
}

function decodePathname(pathname: string): null | string {
  try {
    return decodeURIComponent(pathname)
  }
  catch {
    return null
  }
}

function resolveStaticFilePath(webStaticDir: string, pathname: string): null | string {
  if (pathname === '/' || pathname === '/host' || pathname.startsWith('/host/'))
    return resolve(webStaticDir, 'index.html')

  if (pathname === '/favicon.svg' || pathname.startsWith('/assets/'))
    return resolve(webStaticDir, pathname.replace(/^\/+/, ''))

  return null
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`
  return candidate === root || candidate.startsWith(normalizedRoot)
}

function contentTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(value), { ...init, headers })
}

function text(value: string, init: ResponseInit = {}): Response {
  return new Response(value, init)
}

function devLanding(publicBaseUrl: string, webBaseUrl: string): Response {
  const normalizedWebBaseUrl = webBaseUrl.replace(/\/+$/, '')
  return text([
    'AIWorker Host API is running.',
    `Host Web: ${normalizedWebBaseUrl}/host`,
    `Host API: ${publicBaseUrl}`,
    'Endpoints: /api/host/options, /api/host/assignments, /api/provision/check-in',
  ].join('\n'))
}
