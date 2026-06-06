import type { AuthenticatedHostUser, AuthProvider, WorkerAccessRegistry } from '@zonease/aiworker-host-control'
import type { HostAssignmentRow } from '@zonease/aiworker-storage-sqlite/host'
import type { HostOptionsView, ProvisioningAdapterType, ProvisioningTargetMaturity } from './host-options'
import type { ProvisioningDeliveryResult } from './provisioning-target-adapters'

import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

import {
  createAssignmentView,
  createStaticAuthProvider,
  createWorkerAccessRegistry,
  userCanOpenWorker,
  userIsHostAdmin,
} from '@zonease/aiworker-host-control'
import {
  createAssignment,
  getAssignmentByWorkerId,
  initHostDb,
  listAssignments,
  markAssignmentCheckedIn,
  runHostMigrations,
  verifyAndConsumeProvisionToken,
} from '@zonease/aiworker-storage-sqlite/host'
import {
  parseWorkerCheckInRequest,
  parseWorkerCheckInResponse,
} from '@zonease/aiworker-worker-control-protocol'
import { buildHostOptions } from './host-options'
import { assertRemoteAisshCallbackReachable, resolveAdapterRuntimeControlBaseUrl } from './host-url-contract'
import { deliverProvisioningTarget } from './provisioning-target-adapters'

interface HostServerBaseOptions {
  accessRegistry?: WorkerAccessRegistry
  authProvider?: AuthProvider
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  optionsProvider?: () => Promise<HostOptionsView>
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
  fetch: (request: Request) => Promise<Response>
}

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

  const hostControlBaseUrl = options.hostControlBaseUrl ?? ('publicBaseUrl' in options ? options.publicBaseUrl : undefined)
  if (!hostControlBaseUrl)
    throw new Error('Host server requires hostControlBaseUrl')
  const hostBrowserBaseUrl = options.hostBrowserBaseUrl ?? options.webBaseUrl ?? hostControlBaseUrl

  const authProvider = options.authProvider ?? createStaticAuthProvider(options.authUser ?? null)
  const accessRegistry = options.accessRegistry ?? createWorkerAccessRegistry()
  const webStaticDir = options.webStaticDir ? normalizeStaticDir(options.webStaticDir) : null

  return {
    async fetch(request) {
      const url = new URL(request.url)

      const hostWebResponse = await serveHostWebStatic(request, webStaticDir)
      if (hostWebResponse)
        return hostWebResponse

      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/host'))
        return devLanding(hostControlBaseUrl, options.webBaseUrl ?? hostBrowserBaseUrl)

      if (url.pathname === '/api/host/assignments')
        return handleAssignments(request, authProvider, {
          hostBrowserBaseUrl,
          hostControlBaseUrl,
        })

      if (request.method === 'GET' && url.pathname === '/api/host/options')
        return handleOptions(request, authProvider, options.optionsProvider ?? buildHostOptions)

      if (request.method === 'POST' && url.pathname === '/api/provision/check-in')
        return handleCheckIn(request)

      if (request.method === 'GET' && url.pathname === '/api/provision/access')
        return json({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } }, { status: 426 })

      const workerMatch = /^\/workers\/([^/]+)$/.exec(url.pathname)
      if (request.method === 'GET' && workerMatch)
        return handleWorkerRoute(request, authProvider, accessRegistry, decodeURIComponent(workerMatch[1]!))

      return json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
    },
  }
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

  const checkedIn = markAssignmentCheckedIn(assignment.assignmentId, {
    workerId: checkIn.worker.workerId,
    workerVersion: checkIn.worker.version,
  })
  if (!checkedIn)
    return json({ error: { code: 'ASSIGNMENT_NOT_FOUND' } }, { status: 404 })

  const response = parseWorkerCheckInResponse({
    access: {
      mode: 'worker_access',
      token: createAccessToken(),
    },
    assignment: {
      assignedEmail: checkedIn.assignedEmail,
      assignmentId: checkedIn.assignmentId,
      soulReleaseRef: checkedIn.soulReleaseRef,
      workerId: checkIn.worker.workerId,
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
  if (!userCanOpenWorker(user, readyAuthView))
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  // Until a Worker access connection is registered, the employee URL is not ready and Host must not pretend it is. aissh success and check-in are not enough.
  if (assignment.status !== 'ready' || !accessRegistry.has(workerId))
    return json({ error: { code: 'WORKER_ACCESS_NOT_READY' } }, { status: 503 })

  return json({ routed: true, workerId })
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

function createAccessToken(): string {
  return `awt_${randomBytes(32).toString('base64url')}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
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
