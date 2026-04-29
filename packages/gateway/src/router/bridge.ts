import type { ResponseFrame } from '@zonease/aiworker-gateway-proto'
import type { AnyWs } from '../registry/types'
import type { GatewayContext } from './context'
import { encodeFrame, parseFrame } from '@zonease/aiworker-gateway-proto'
import { WORKER_ID_PATTERN } from '@zonease/aiworker-shared'

const BRIDGE_PREFIX = '/w/'
const WORKER_API_PREFIX = '/api/worker'
const BRIDGE_TIMEOUT_MS = 60_000

interface ParsedBridgePath {
  workerId: string
  workerApiPath: string
}

interface BridgeRequest {
  method: 'workers.info' | 'config.get' | 'config.put'
  params: Record<string, unknown>
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
  const parsed = parseBridgePath(url.pathname)
  if (parsed === undefined)
    return jsonError(404, 'not-found', 'Not a worker bridge path')
  if (!parsed.ok)
    return jsonError(400, 'invalid-worker-id', parsed.message)

  const route = await buildBridgeRequest(req, parsed.value)
  if (!route.ok)
    return route.response

  const frame = await forwardBridgeRequestToNode({
    ctx,
    workerId: parsed.value.workerId,
    method: route.value.method,
    params: route.value.params,
  })
  return responseFrameToHttp(frame)
}

export function isWorkerApiBridgePath(pathname: string): boolean {
  return pathname.startsWith(BRIDGE_PREFIX)
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
  path: ParsedBridgePath,
): Promise<
  | { ok: true, value: BridgeRequest }
  | { ok: false, response: Response }
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
        }
      }
      const body = await req.json().catch(() => undefined)
      if (body === undefined) {
        return {
          ok: false,
          response: jsonError(400, 'invalid-body', 'Request body must be valid JSON'),
        }
      }
      return {
        ok: true,
        value: {
          method: 'config.put',
          params: {
            workerId: path.workerId,
            ifMatch: ifMatch.value,
            config: body,
          },
        },
      }
    }
    return { ok: false, response: methodNotAllowed('GET, PUT') }
  }

  return {
    ok: false,
    response: jsonError(404, 'not-found', `Unsupported worker bridge path ${path.workerApiPath}`),
  }
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
    const settle = (frame: ResponseFrame) => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      resolve(frame)
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

function responseFrameToHttp(frame: ResponseFrame): Response {
  if (frame.ok)
    return json(frame.result, 200)

  const code = normalizeRestErrorCode(frame.error.code)
  return json({
    error: {
      code,
      message: frame.error.message,
      ...(frame.error.details === undefined ? {} : { details: frame.error.details }),
    },
  }, statusForError(frame.error.code))
}

function statusForError(code: string): number {
  switch (code) {
    case 'invalid_params':
    case 'invalid_config':
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
    default:
      return code
  }
}

function methodNotAllowed(allow: string): Response {
  return json({ error: { code: 'method-not-allowed', message: 'method not allowed' } }, 405, { Allow: allow })
}

function jsonError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status)
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
