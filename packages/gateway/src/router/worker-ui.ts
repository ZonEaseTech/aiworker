import type { GatewayContext } from './context'
import { WORKER_ID_PATTERN } from '@zonease/aiworker-shared'
import { serveAdminStatic } from '../admin/serve-static'

const WORKER_PREFIX = '/w/'
const WORKER_API_PREFIX = '/api/worker'

interface ParsedWorkerUiPath {
  workerId: string
  pathnameAfterPrefix: string
  redirectToSlash: boolean
}

export function isWorkerUiPath(pathname: string): boolean {
  if (!pathname.startsWith(WORKER_PREFIX))
    return false
  const parsed = parseWorkerUiPath(pathname)
  return parsed !== undefined && (parsed.ok === false || !parsed.value.pathnameAfterPrefix.startsWith(apiPrefixWithoutSlash()))
}

export async function handleWorkerUi(
  _req: Request,
  url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  const parsed = parseWorkerUiPath(url.pathname)
  if (parsed === undefined)
    return new Response('not found', { status: 404 })
  if (!parsed.ok) {
    return json({
      error: {
        code: 'invalid-worker-id',
        message: parsed.message,
      },
    }, 400)
  }

  const { workerId } = parsed.value
  if (!ctx.nodes.has(workerId) && !ctx.persistence.getRegisteredWorker(workerId)) {
    return json({
      error: {
        code: 'not-found',
        message: `worker ${workerId} is not registered`,
      },
    }, 404)
  }

  if (parsed.value.redirectToSlash) {
    const dest = new URL(`${WORKER_PREFIX}${workerId}/`, url)
    return Response.redirect(dest.toString(), 308)
  }

  if (!ctx.workerWebStaticDir)
    return new Response('not found', { status: 404 })

  return serveAdminStatic({
    webStaticDir: ctx.workerWebStaticDir,
    pathnameAfterPrefix: parsed.value.pathnameAfterPrefix,
  })
}

function parseWorkerUiPath(pathname: string):
  | undefined
  | { ok: true, value: ParsedWorkerUiPath }
  | { ok: false, message: string } {
  if (!pathname.startsWith(WORKER_PREFIX))
    return undefined

  const suffix = pathname.slice(WORKER_PREFIX.length)
  const firstSlash = suffix.indexOf('/')
  const workerId = firstSlash === -1 ? suffix : suffix.slice(0, firstSlash)
  if (!WORKER_ID_PATTERN.test(workerId)) {
    return {
      ok: false,
      message: `workerId must match ${String(WORKER_ID_PATTERN)}`,
    }
  }

  if (firstSlash === -1) {
    return {
      ok: true,
      value: { workerId, pathnameAfterPrefix: '', redirectToSlash: true },
    }
  }

  const pathnameAfterPrefix = suffix.slice(firstSlash + 1)
  if (pathnameAfterPrefix.startsWith(apiPrefixWithoutSlash()))
    return undefined

  return {
    ok: true,
    value: { workerId, pathnameAfterPrefix, redirectToSlash: false },
  }
}

function apiPrefixWithoutSlash(): string {
  return WORKER_API_PREFIX.slice(1)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
