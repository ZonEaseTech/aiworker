import type { MethodName, ResponseFrame } from '@zonease/aiworker-gateway-proto'
import type { AnyWs } from '../registry/types'
import type { GatewayContext } from './context'
import { encodeFrame, parseFrame } from '@zonease/aiworker-gateway-proto'
import { WORKER_ID_PATTERN } from '@zonease/aiworker-shared'
import { decryptToken, timingSafeEqualStrings } from '../registry/crypto'

const BRIDGE_PREFIX = '/w/'
const WORKER_API_PREFIX = '/api/worker'
const BRIDGE_TIMEOUT_MS = 60_000
const MAX_JSON_BODY_BYTES = 1024 * 1024
const MAX_EVENT_STREAMS = 50

let activeEventStreams = 0

interface ParsedBridgePath {
  workerId: string
  workerApiPath: string
}

interface BridgeRequest {
  method: MethodName
  params: Record<string, unknown>
  transformResult?: (result: unknown) => unknown
}

interface BridgeRouteAudit {
  method: string
  errorCode: string
}

interface BridgeAuditEntry {
  workerId: string
  method: string
  path: string
  result: 'success' | 'error'
  status: number
  latencyMs: number
  errorCode?: string
}

/**
 * Gateway HTTP bridge for the worker self-management API. This is not a
 * generic proxy: target worker identity comes only from `/w/:workerId`, and
 * only the small allowlist below is mapped into gateway WS/RPC methods.
 */
export async function handleWorkerApiBridge(
  req: Request,
  url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  const startedAt = Date.now()
  const parsed = parseBridgePath(url.pathname)
  if (parsed === undefined)
    return jsonError(404, 'not-found', 'Not a worker bridge path')
  if (!parsed.ok)
    return jsonError(400, 'invalid-worker-id', parsed.message)

  const auth = authorizeWorkerBridgeRequest(req, ctx, parsed.value.workerId)
  if (!auth.ok)
    return auth.response

  if (parsed.value.workerApiPath === `${WORKER_API_PREFIX}/events/stream`)
    return handleWorkerEventsStream(req, url, ctx, parsed.value, startedAt)

  const route = await buildBridgeRequest(req, url, parsed.value)
  if (!route.ok) {
    if (route.audit) {
      recordBridgeAudit(ctx, {
        workerId: parsed.value.workerId,
        method: route.audit.method,
        path: url.pathname,
        result: 'error',
        status: route.response.status,
        latencyMs: elapsedMs(startedAt),
        errorCode: route.audit.errorCode,
      })
    }
    return route.response
  }

  const frame = await forwardBridgeRequestToNode({
    ctx,
    workerId: parsed.value.workerId,
    method: route.value.method,
    params: route.value.params,
    signal: req.signal,
  })
  const response = responseFrameToHttp(frame, route.value.transformResult)
  recordBridgeAudit(ctx, {
    workerId: parsed.value.workerId,
    method: route.value.method,
    path: url.pathname,
    result: frame.ok ? 'success' : 'error',
    status: response.status,
    latencyMs: elapsedMs(startedAt),
    ...(frame.ok ? {} : { errorCode: frame.error.code }),
  })
  return response
}

export function isWorkerApiBridgePath(pathname: string): boolean {
  if (!pathname.startsWith(BRIDGE_PREFIX))
    return false
  const suffix = pathname.slice(BRIDGE_PREFIX.length)
  const firstSlash = suffix.indexOf('/')
  if (firstSlash === -1)
    return false
  return suffix.slice(firstSlash).startsWith(WORKER_API_PREFIX)
}

function authorizeWorkerBridgeRequest(
  req: Request,
  ctx: GatewayContext,
  workerId: string,
): { ok: true } | { ok: false, response: Response } {
  const presentedToken = bearerToken(req.headers.get('Authorization'))
  if (presentedToken === null) {
    return {
      ok: false,
      response: jsonError(401, 'auth-required', 'missing worker bearer token', {
        'WWW-Authenticate': 'Bearer',
      }),
    }
  }
  if (!ctx.masterKeyHex)
    return { ok: false, response: jsonError(503, 'auth-unavailable', 'gateway master key is not configured') }

  const row = ctx.persistence.getRegisteredWorkerRaw(workerId)
  if (!row)
    return { ok: false, response: jsonError(404, 'not-found', `worker ${workerId} is not registered`) }

  let expectedToken: string
  try {
    expectedToken = decryptToken(row.apiTokenEnc, row.nonce, row.authTag, ctx.masterKeyHex)
  }
  catch {
    return { ok: false, response: jsonError(503, 'auth-unavailable', 'worker token is not available') }
  }

  if (!timingSafeEqualStrings(presentedToken, expectedToken)) {
    return {
      ok: false,
      response: jsonError(401, 'auth-failed', 'invalid worker bearer token', {
        'WWW-Authenticate': 'Bearer',
      }),
    }
  }

  return { ok: true }
}

function bearerToken(value: string | null): string | null {
  if (value === null)
    return null
  const trimmed = value.trim()
  if (!trimmed.toLowerCase().startsWith('bearer '))
    return null
  const token = trimmed.slice('bearer '.length).trim()
  return token.length === 0 ? null : token
}

function parseBridgePath(pathname: string):
  | undefined
  | { ok: true, value: ParsedBridgePath }
  | { ok: false, message: string } {
  if (!pathname.startsWith(BRIDGE_PREFIX))
    return undefined

  const suffix = pathname.slice(BRIDGE_PREFIX.length)
  const firstSlash = suffix.indexOf('/')
  const workerId = firstSlash === -1 ? suffix : suffix.slice(0, firstSlash)
  if (!WORKER_ID_PATTERN.test(workerId)) {
    return {
      ok: false,
      message: `workerId must match ${String(WORKER_ID_PATTERN)}`,
    }
  }

  const workerApiPath = firstSlash === -1 ? '/' : suffix.slice(firstSlash)
  return { ok: true, value: { workerId, workerApiPath } }
}

async function buildBridgeRequest(
  req: Request,
  url: URL,
  path: ParsedBridgePath,
): Promise<
  | { ok: true, value: BridgeRequest }
  | { ok: false, response: Response, audit?: BridgeRouteAudit }
> {
  if (path.workerApiPath === `${WORKER_API_PREFIX}/info`) {
    if (req.method !== 'GET')
      return { ok: false, response: methodNotAllowed('GET') }
    return {
      ok: true,
      value: {
        method: 'workers.info',
        params: { workerId: path.workerId },
      },
    }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/config`) {
    if (req.method === 'GET') {
      return {
        ok: true,
        value: {
          method: 'config.get',
          params: { workerId: path.workerId },
        },
      }
    }
    if (req.method === 'PUT') {
      const ifMatch = parseIfMatch(req.headers.get('If-Match'))
      if (!ifMatch.ok) {
        return {
          ok: false,
          response: jsonError(400, 'invalid-if-match', ifMatch.message),
          audit: { method: 'config.put', errorCode: 'invalid-if-match' },
        }
      }
      const body = await readJsonBody(req)
      if (!body.ok) {
        return {
          ok: false,
          response: jsonError(body.status, body.code, body.message),
          audit: { method: 'config.put', errorCode: body.code },
        }
      }
      return {
        ok: true,
        value: {
          method: 'config.put',
          params: {
            workerId: path.workerId,
            ifMatch: ifMatch.value,
            config: body.value,
          },
        },
      }
    }
    return { ok: false, response: methodNotAllowed('GET, PUT') }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/cron`) {
    if (req.method === 'GET') {
      return {
        ok: true,
        value: { method: 'cron.list', params: { workerId: path.workerId } },
      }
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      if (!body.ok) {
        return {
          ok: false,
          response: jsonError(body.status, body.code, body.message),
          audit: { method: 'cron.add', errorCode: body.code },
        }
      }
      return {
        ok: true,
        value: {
          method: 'cron.add',
          params: { workerId: path.workerId, job: body.value },
          transformResult: passThroughCreated,
        },
      }
    }
    return { ok: false, response: methodNotAllowed('GET, POST') }
  }

  const cronJobMatch = path.workerApiPath.match(/^\/api\/worker\/cron\/([^/]+)$/)
  if (cronJobMatch) {
    const jobId = decodeURIComponent(cronJobMatch[1]!)
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req)
      if (!body.ok) {
        return {
          ok: false,
          response: jsonError(body.status, body.code, body.message),
          audit: { method: 'cron.update', errorCode: body.code },
        }
      }
      return {
        ok: true,
        value: {
          method: 'cron.update',
          params: { workerId: path.workerId, jobId, patch: body.value },
        },
      }
    }
    if (req.method === 'DELETE') {
      return {
        ok: true,
        value: {
          method: 'cron.remove',
          params: { workerId: path.workerId, jobId },
          transformResult: cronRemoveResultToRest,
        },
      }
    }
    return { ok: false, response: methodNotAllowed('PATCH, DELETE') }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/approvals`) {
    if (req.method !== 'GET')
      return { ok: false, response: methodNotAllowed('GET') }
    return {
      ok: true,
      value: { method: 'approval.list', params: { workerId: path.workerId } },
    }
  }

  const approvalGrantMatch = path.workerApiPath.match(/^\/api\/worker\/approvals\/([^/]+)\/([^/]+)\/grant$/)
  if (approvalGrantMatch) {
    if (req.method !== 'POST')
      return { ok: false, response: methodNotAllowed('POST') }
    const body = await readJsonBody(req)
    if (!body.ok) {
      return {
        ok: false,
        response: jsonError(body.status, body.code, body.message),
        audit: { method: 'approval.grant', errorCode: body.code },
      }
    }
    const decision = (body.value as Record<string, unknown>).decision
    if (decision !== 'allow' && decision !== 'deny') {
      return {
        ok: false,
        response: jsonError(400, 'invalid-body', 'decision must be "allow" or "deny"'),
        audit: { method: 'approval.grant', errorCode: 'invalid-body' },
      }
    }
    return {
      ok: true,
      value: {
        method: 'approval.grant',
        params: {
          workerId: path.workerId,
          taskId: decodeURIComponent(approvalGrantMatch[1]!),
          toolCallId: decodeURIComponent(approvalGrantMatch[2]!),
          decision,
        },
      },
    }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/secrets`) {
    if (req.method !== 'GET')
      return { ok: false, response: methodNotAllowed('GET') }
    return {
      ok: true,
      value: { method: 'secrets.list', params: { workerId: path.workerId } },
    }
  }

  const secretMatch = path.workerApiPath.match(/^\/api\/worker\/secrets\/([^/]+)$/)
  if (secretMatch) {
    const key = decodeURIComponent(secretMatch[1]!)
    if (!/^[\w.-]{1,128}$/.test(key)) {
      const method = req.method === 'DELETE' ? 'secrets.delete' : 'secrets.put'
      return {
        ok: false,
        response: jsonError(400, 'invalid-key', 'secret key must match [A-Za-z0-9._-] and be 1-128 chars'),
        audit: { method, errorCode: 'invalid-key' },
      }
    }
    if (req.method === 'PUT') {
      const body = await readJsonBody(req)
      if (!body.ok) {
        return {
          ok: false,
          response: jsonError(body.status, body.code, body.message),
          audit: { method: 'secrets.put', errorCode: body.code },
        }
      }
      const value = (body.value as Record<string, unknown>).value
      if (typeof value !== 'string' || value.length === 0) {
        return {
          ok: false,
          response: jsonError(400, 'invalid-body', 'secret value must be a non-empty string'),
          audit: { method: 'secrets.put', errorCode: 'invalid-body' },
        }
      }
      return {
        ok: true,
        value: { method: 'secrets.put', params: { workerId: path.workerId, key, value } },
      }
    }
    if (req.method === 'DELETE') {
      return {
        ok: true,
        value: { method: 'secrets.delete', params: { workerId: path.workerId, key } },
      }
    }
    return { ok: false, response: methodNotAllowed('PUT, DELETE') }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/engines`) {
    if (req.method !== 'GET')
      return { ok: false, response: methodNotAllowed('GET') }
    return {
      ok: true,
      value: {
        method: 'engines.list',
        params: { workerId: path.workerId, refresh: url.searchParams.get('refresh') === '1' },
      },
    }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/brain/test`) {
    if (req.method !== 'POST')
      return { ok: false, response: methodNotAllowed('POST') }
    return {
      ok: true,
      value: { method: 'brain.test', params: { workerId: path.workerId } },
    }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/executor/test`) {
    if (req.method !== 'POST')
      return { ok: false, response: methodNotAllowed('POST') }
    const body = await readOptionalJsonBody(req)
    if (!body.ok) {
      return {
        ok: false,
        response: jsonError(body.status, body.code, body.message),
        audit: { method: 'executor.test', errorCode: body.code },
      }
    }
    const probe = (body.value as Record<string, unknown> | undefined)?.probe
    return {
      ok: true,
      value: {
        method: 'executor.test',
        params: { workerId: path.workerId, ...(typeof probe === 'boolean' ? { probe } : {}) },
      },
    }
  }

  const channelTestMatch = path.workerApiPath.match(/^\/api\/worker\/channels\/([^/]+)\/test$/)
  if (channelTestMatch) {
    if (req.method !== 'POST')
      return { ok: false, response: methodNotAllowed('POST') }
    const body = await readOptionalJsonBody(req)
    if (!body.ok) {
      return {
        ok: false,
        response: jsonError(body.status, body.code, body.message),
        audit: { method: 'channel.test', errorCode: body.code },
      }
    }
    return {
      ok: true,
      value: {
        method: 'channel.test',
        params: {
          workerId: path.workerId,
          channel: decodeURIComponent(channelTestMatch[1]!),
          ...(body.value === undefined ? {} : { body: body.value }),
        },
      },
    }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/orchestrator/tasks`) {
    if (req.method === 'GET') {
      return {
        ok: true,
        value: { method: 'orchestrator.tasks.list', params: { workerId: path.workerId } },
      }
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      if (!body.ok) {
        return {
          ok: false,
          response: jsonError(body.status, body.code, body.message),
          audit: { method: 'orchestrator.tasks.create', errorCode: body.code },
        }
      }
      const prompt = (body.value as Record<string, unknown>).prompt
      if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.trim().length > 8000) {
        return {
          ok: false,
          response: jsonError(400, 'invalid-body', 'prompt is required and must be at most 8000 chars'),
          audit: { method: 'orchestrator.tasks.create', errorCode: 'invalid-body' },
        }
      }
      return {
        ok: true,
        value: {
          method: 'orchestrator.tasks.create',
          params: { workerId: path.workerId, prompt },
          transformResult: passThroughCreated,
        },
      }
    }
    return { ok: false, response: methodNotAllowed('GET, POST') }
  }

  if (path.workerApiPath === `${WORKER_API_PREFIX}/orchestrator/conversations`) {
    if (req.method !== 'GET')
      return { ok: false, response: methodNotAllowed('GET') }
    return {
      ok: true,
      value: { method: 'orchestrator.conversations.list', params: { workerId: path.workerId } },
    }
  }

  const messagesMatch = path.workerApiPath.match(/^\/api\/worker\/orchestrator\/conversations\/([^/]+)\/messages$/)
  if (messagesMatch) {
    if (req.method !== 'GET')
      return { ok: false, response: methodNotAllowed('GET') }
    return {
      ok: true,
      value: {
        method: 'orchestrator.messages.list',
        params: { workerId: path.workerId, conversationId: decodeURIComponent(messagesMatch[1]!) },
      },
    }
  }

  return {
    ok: false,
    response: jsonError(404, 'not-found', `Unsupported worker bridge path ${path.workerApiPath}`),
  }
}

type JsonBodyResult
  = | { ok: true, value: unknown }
    | { ok: false, status: number, code: string, message: string }

async function readJsonBody(req: Request): Promise<JsonBodyResult> {
  const size = Number.parseInt(req.headers.get('Content-Length') ?? '0', 10)
  if (Number.isFinite(size) && size > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'payload-too-large',
      message: 'Request body is too large',
    }
  }
  const text = await req.text().catch(() => undefined)
  if (text === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'invalid-body',
      message: 'Request body must be readable',
    }
  }
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'payload-too-large',
      message: 'Request body is too large',
    }
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  }
  catch {
    return {
      ok: false,
      status: 400,
      code: 'invalid-body',
      message: 'Request body must be valid JSON',
    }
  }
}

async function readOptionalJsonBody(req: Request): Promise<JsonBodyResult | { ok: true, value: undefined }> {
  if (!req.body)
    return { ok: true, value: undefined }
  const text = await req.text().catch(() => undefined)
  if (text === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'invalid-body',
      message: 'Request body must be readable',
    }
  }
  if (text.trim().length === 0)
    return { ok: true, value: undefined }
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'payload-too-large',
      message: 'Request body is too large',
    }
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  }
  catch {
    return {
      ok: false,
      status: 400,
      code: 'invalid-body',
      message: 'Request body must be valid JSON',
    }
  }
}

function passThroughCreated(result: unknown): unknown {
  return result
}

function cronRemoveResultToRest(result: unknown): unknown {
  const removed = Boolean((result as { removed?: boolean }).removed)
  return removed ? { ok: true } : result
}

function handleWorkerEventsStream(
  req: Request,
  url: URL,
  ctx: GatewayContext,
  path: ParsedBridgePath,
  startedAt: number,
): Response {
  if (req.method !== 'GET')
    return methodNotAllowed('GET')
  if (activeEventStreams >= MAX_EVENT_STREAMS) {
    return jsonError(503, 'too-many-event-streams', 'Too many active worker event streams')
  }
  if (!ctx.nodes.has(path.workerId) && !ctx.persistence.getRegisteredWorker(path.workerId)) {
    return jsonError(404, 'not-found', `worker ${path.workerId} is not registered`)
  }
  if (!ctx.nodes.has(path.workerId))
    return jsonError(503, 'node_offline', `worker ${path.workerId} 当前未连接到 gateway`)

  activeEventStreams += 1
  let closed = false
  const streamId = `http-sse-${crypto.randomUUID()}`
  let cleanupStream: (() => void) | undefined

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      const write = (chunk: string) => {
        if (closed)
          return
        if (controller.desiredSize !== null && controller.desiredSize <= 0)
          return
        controller.enqueue(encoder.encode(chunk))
      }
      const operatorWs = {
        send(message: string) {
          const parsed = parseFrame(message)
          if (!parsed.ok || parsed.frame.type !== 'event')
            return
          const payload = parsed.frame.payload as Record<string, unknown>
          if (payload.workerId !== path.workerId)
            return
          write(`event: ${parsed.frame.name}\ndata: ${JSON.stringify({ ...payload, at: parsed.frame.ts })}\n\n`)
        },
        close() {},
        data: {},
      } as unknown as AnyWs
      let keepalive: ReturnType<typeof setInterval> | undefined
      const cleanup = () => {
        if (closed)
          return
        closed = true
        activeEventStreams = Math.max(0, activeEventStreams - 1)
        ctx.operators.unregister(operatorWs)
        if (keepalive)
          clearInterval(keepalive)
        req.signal.removeEventListener('abort', cleanup)
      }
      cleanupStream = cleanup
      keepalive = setInterval(() => write(': keepalive\n\n'), 30_000)
      if (typeof (keepalive as unknown as { unref?: () => void }).unref === 'function')
        (keepalive as unknown as { unref: () => void }).unref()

      ctx.operators.register({
        agentId: streamId,
        deviceId: streamId,
        ws: operatorWs,
        connectedAt: Date.now(),
      })
      req.signal.addEventListener('abort', cleanup, { once: true })
      write(': connected\n\n')
    },
    cancel() {
      cleanupStream?.()
    },
  })

  recordBridgeAudit(ctx, {
    workerId: path.workerId,
    method: 'events.stream',
    path: url.pathname,
    result: 'success',
    status: 200,
    latencyMs: elapsedMs(startedAt),
  })

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

function parseIfMatch(value: string | null): { ok: true, value: number } | { ok: false, message: string } {
  if (value === null)
    return { ok: false, message: 'If-Match header is required' }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed))
    return { ok: false, message: 'If-Match must be a non-negative integer' }
  const version = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(version) || version < 0)
    return { ok: false, message: 'If-Match must be a non-negative integer' }
  return { ok: true, value: version }
}

interface ForwardBridgeArgs {
  ctx: GatewayContext
  workerId: string
  method: string
  params: unknown
  signal?: AbortSignal
}

function forwardBridgeRequestToNode(args: ForwardBridgeArgs): Promise<ResponseFrame> {
  const node = args.ctx.nodes.get(args.workerId)
  if (!node) {
    return Promise.resolve({
      type: 'response',
      id: crypto.randomUUID(),
      ok: false,
      error: {
        code: 'node_offline',
        message: `worker ${args.workerId} 当前未连接到 gateway`,
        details: { workerId: args.workerId },
      },
    })
  }

  const operatorRequestId = `http-${crypto.randomUUID()}`
  return new Promise<ResponseFrame>((resolve) => {
    let settled = false
    let gatewayRequestId: string | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    const cleanup = () => {
      if (timer)
        clearTimeout(timer)
      if (abort)
        args.signal?.removeEventListener('abort', abort)
    }
    const settle = (frame: ResponseFrame) => {
      if (settled)
        return
      settled = true
      cleanup()
      resolve(frame)
    }
    abort = () => {
      if (gatewayRequestId)
        args.ctx.forwards.consume(gatewayRequestId)
      settle({
        type: 'response',
        id: operatorRequestId,
        ok: false,
        error: {
          code: 'request_aborted',
          message: 'request aborted by client',
          details: { workerId: args.workerId, method: args.method },
        },
      })
    }

    const operatorWs = {
      send(message: string) {
        const parsed = parseFrame(message)
        if (parsed.ok && parsed.frame.type === 'response') {
          settle(parsed.frame)
          return
        }
        settle({
          type: 'response',
          id: operatorRequestId,
          ok: false,
          error: {
            code: 'bad_gateway',
            message: 'gateway bridge received a non-response frame',
          },
        })
      },
      close() {},
      data: {},
    } as unknown as AnyWs

    timer = setTimeout(() => {
      if (gatewayRequestId)
        args.ctx.forwards.consume(gatewayRequestId)
      settle({
        type: 'response',
        id: operatorRequestId,
        ok: false,
        error: {
          code: 'forward_timeout',
          message: `等待 worker ${args.workerId} 响应超时`,
          details: { workerId: args.workerId, method: args.method },
        },
      })
    }, BRIDGE_TIMEOUT_MS)
    if (typeof (timer as unknown as { unref?: () => void }).unref === 'function')
      (timer as unknown as { unref: () => void }).unref()

    args.signal?.addEventListener('abort', abort, { once: true })

    const pending = args.ctx.forwards.allocate({
      operatorRequestId,
      operatorWs,
      workerId: args.workerId,
      method: args.method,
    })
    gatewayRequestId = pending.gatewayRequestId

    try {
      node.ws.send(encodeFrame({
        type: 'request',
        id: pending.gatewayRequestId,
        method: args.method,
        params: args.params,
      }))
    }
    catch (err) {
      args.ctx.forwards.consume(pending.gatewayRequestId)
      settle({
        type: 'response',
        id: operatorRequestId,
        ok: false,
        error: {
          code: 'forward_failed',
          message: `转发到 worker ${args.workerId} 失败: ${err instanceof Error ? err.message : String(err)}`,
          details: { workerId: args.workerId },
        },
      })
    }
  })
}

function responseFrameToHttp(frame: ResponseFrame, transformResult?: (result: unknown) => unknown): Response {
  if (frame.ok)
    return json(transformResult ? transformResult(frame.result) : frame.result, 200)

  const code = normalizeRestErrorCode(frame.error.code)
  return json({
    error: {
      code,
      message: frame.error.message,
      ...(frame.error.details === undefined ? {} : { details: frame.error.details }),
    },
  }, statusForError(frame.error.code))
}

function recordBridgeAudit(ctx: GatewayContext, entry: BridgeAuditEntry): void {
  ctx.persistence.recordAudit({
    actor: 'gateway',
    action: 'gateway.method.invoked',
    workerId: entry.workerId,
    detail: {
      operator: 'http-bridge',
      workerId: entry.workerId,
      method: entry.method,
      path: entry.path,
      result: entry.result,
      status: entry.status,
      latencyMs: entry.latencyMs,
      ...(entry.errorCode === undefined ? {} : { errorCode: entry.errorCode }),
    },
  })
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

function statusForError(code: string): number {
  switch (code) {
    case 'invalid_params':
    case 'invalid_config':
    case 'invalid_body':
    case 'invalid_key':
    case 'invalid_cron':
      return 400
    case 'version_conflict':
      return 409
    case 'not_found':
      return 404
    case 'node_offline':
    case 'node_gone':
    case 'forward_failed':
      return 503
    case 'forward_timeout':
      return 504
    case 'request_aborted':
      return 499
    case 'method_not_implemented':
      return 501
    default:
      return 502
  }
}

function normalizeRestErrorCode(code: string): string {
  switch (code) {
    case 'invalid_config':
      return 'invalid-config'
    case 'version_conflict':
      return 'version-conflict'
    case 'invalid_body':
      return 'invalid-body'
    case 'invalid_key':
      return 'invalid-key'
    case 'invalid_cron':
      return 'invalid-cron'
    case 'not_found':
      return 'not-found'
    default:
      return code
  }
}

function methodNotAllowed(allow: string): Response {
  return json({ error: { code: 'method-not-allowed', message: 'method not allowed' } }, 405, { Allow: allow })
}

function jsonError(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, headers)
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
