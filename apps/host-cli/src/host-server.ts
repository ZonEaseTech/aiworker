import type { AuthenticatedHostUser, WorkerAccessRegistry } from '@zonease/aiworker-host-control'
import type { HostAssignmentRow } from '@zonease/aiworker-storage-sqlite/host'

import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

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

export interface HostServerOptions {
  accessRegistry?: WorkerAccessRegistry
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  publicBaseUrl: string
}

export interface HostServer {
  fetch: (request: Request) => Promise<Response>
}

interface CreateAssignmentRequest {
  assignedEmail?: unknown
  serverRef?: unknown
  soulReleaseRef?: unknown
}

let activeHostDbPath: string | null = null

export async function createHostServer(options: HostServerOptions): Promise<HostServer> {
  const dbPath = normalizeDbPath(options.dbPath)
  if (activeHostDbPath && activeHostDbPath !== dbPath && existsSync(activeHostDbPath)) {
    throw new Error(`Cannot create Host server with different Host dbPath in one process: active=${activeHostDbPath} requested=${dbPath}`)
  }

  activeHostDbPath = dbPath
  initHostDb(dbPath)
  runHostMigrations()

  const authProvider = createStaticAuthProvider(options.authUser ?? null)
  const accessRegistry = options.accessRegistry ?? createWorkerAccessRegistry()

  return {
    async fetch(request) {
      const url = new URL(request.url)

      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/host'))
        return text('AIWorker Host')

      if (url.pathname === '/api/host/assignments')
        return handleAssignments(request, authProvider)

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
  authProvider: ReturnType<typeof createStaticAuthProvider>,
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

  if (!isNonEmptyString(body.assignedEmail) || !isEmail(body.assignedEmail) || !isNonEmptyString(body.serverRef) || !isNonEmptyString(body.soulReleaseRef))
    return json({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }, { status: 400 })

  const created = createAssignment({
    assignedEmail: body.assignedEmail,
    serverRef: body.serverRef,
    soulReleaseRef: body.soulReleaseRef,
  })
  return json({
    assignment: toAssignmentView(created.assignment),
    provisionToken: created.provisionToken,
  }, { status: 201 })
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
  authProvider: ReturnType<typeof createStaticAuthProvider>,
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
  return createAssignmentView({
    assignedEmail: row.assignedEmail,
    assignmentId: row.assignmentId,
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

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function normalizeDbPath(dbPath: string): string {
  return dbPath === ':memory:' ? dbPath : resolve(dbPath)
}

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(value), { ...init, headers })
}

function text(value: string, init: ResponseInit = {}): Response {
  return new Response(value, init)
}
