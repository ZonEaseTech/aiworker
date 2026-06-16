import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import process from 'node:process'
import { appendApprovalDecision, controlPlaneDirFromEnv, loadAdminDataApiPayload, runApprovedAssignmentApplyJob, runAssignmentPairJob } from './admin-api'

const root = process.env.AIWORKER_WEB_DIST ?? join(process.cwd(), 'dist')
const port = Number(process.env.PORT ?? 20831)
const hostname = serverHostname()
const adminActionHeader = 'x-aiworker-admin-action'

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

export function staticRoot() {
  return root
}

export function contentType(pathname: string) {
  const dot = pathname.lastIndexOf('.')
  return dot >= 0 ? (contentTypes[pathname.slice(dot)] ?? 'application/octet-stream') : 'application/octet-stream'
}

export function resolveStaticPath(urlPathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPathname)
  }
  catch (error) {
    if (error instanceof URIError) {
      return null
    }

    throw error
  }

  const cleaned = normalize(decoded).replace(/^([/\\]*\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  return join(root, cleaned === '' ? 'index.html' : cleaned)
}

export function serverHostname(env: NodeJS.ProcessEnv = process.env): string {
  return env.AIWORKER_WEB_HOST?.trim() || '127.0.0.1'
}

export function assertServerHostAllowed(host: string, env: NodeJS.ProcessEnv = process.env): void {
  if (isLoopbackHost(host))
    return
  if (env.AIWORKER_WEB_ALLOW_REMOTE === '1')
    return
  throw new Error(`AIWorker Web refuses to listen on ${host}; set AIWORKER_WEB_ALLOW_REMOTE=1 only behind an authenticated admin boundary.`)
}

export function createServer(options: { hostname?: string, port?: number } = {}) {
  const listenHost = options.hostname ?? hostname
  assertServerHostAllowed(listenHost)
  return Bun.serve({
    hostname: listenHost,
    port: options.port ?? port,
    async fetch(request: Request) {
      const url = new URL(request.url)

      if (url.pathname === '/api/admin-data') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return methodNotAllowed('GET, HEAD')
        }

        return Response.json(await loadAdminDataApiPayload())
      }

      const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/)
      if (approvalMatch) {
        if (request.method !== 'POST') {
          return methodNotAllowed('POST')
        }
        const guard = adminMutationGuard(request)
        if (guard)
          return guard

        const root = controlPlaneDirFromEnv()
        if (!root) {
          return Response.json({ error: 'control_plane_dir_required' }, {
            status: 409,
            headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
          })
        }

        const input = await request.json().catch(() => ({})) as Parameters<typeof appendApprovalDecision>[2]
        try {
          const record = await appendApprovalDecision(root, decodeURIComponent(approvalMatch[1]!), input)
          return Response.json({ approval: record })
        }
        catch (error) {
          return adminApiErrorResponse(error, 409)
        }
      }

      const applyMatch = url.pathname.match(/^\/api\/assignments\/([^/]+)\/apply$/)
      if (applyMatch) {
        if (request.method !== 'POST') {
          return methodNotAllowed('POST')
        }
        const guard = adminMutationGuard(request)
        if (guard)
          return guard

        const root = controlPlaneDirFromEnv()
        if (!root) {
          return Response.json({ error: 'control_plane_dir_required' }, {
            status: 409,
            headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
          })
        }

        try {
          const result = await runApprovedAssignmentApplyJob(root, decodeURIComponent(applyMatch[1]!))
          return Response.json({ job: result })
        }
        catch (error) {
          return adminApiErrorResponse(error, 409)
        }
      }

      const pairMatch = url.pathname.match(/^\/api\/assignments\/([^/]+)\/pair$/)
      if (pairMatch) {
        if (request.method !== 'POST') {
          return methodNotAllowed('POST')
        }
        const guard = adminMutationGuard(request)
        if (guard)
          return guard

        const root = controlPlaneDirFromEnv()
        if (!root) {
          return Response.json({ error: 'control_plane_dir_required' }, {
            status: 409,
            headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
          })
        }

        try {
          const result = await runAssignmentPairJob(root, decodeURIComponent(pairMatch[1]!))
          return Response.json({ pair: result })
        }
        catch (error) {
          return adminApiErrorResponse(error, 409)
        }
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return methodNotAllowed('GET, HEAD')
      }

      if (url.pathname === '/healthz') {
        return Response.json({ ok: true, surface: 'aiworker-web', runtime: 'bun' })
      }

      let filePath = resolveStaticPath(url.pathname)
      if (filePath === null) {
        return new Response('Bad Request', {
          status: 400,
          headers: {
            'x-aiworker-boundary': 'admin-control-plane-only',
          },
        })
      }

      if (!existsSync(filePath)) {
        filePath = join(root, 'index.html')
      }

      return new Response(Bun.file(filePath), {
        headers: {
          'content-type': contentType(filePath),
          'x-aiworker-boundary': 'admin-control-plane-only',
        },
      })
    },
  })
}

function adminMutationGuard(request: Request): Response | null {
  if (request.headers.get(adminActionHeader) !== '1') {
    return Response.json({ error: 'admin_action_header_required' }, {
      status: 403,
      headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
    })
  }
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: 'same_origin_required' }, {
      status: 403,
      headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
    })
  }
  const expectedToken = process.env.AIWORKER_WEB_ADMIN_TOKEN?.trim()
  if (expectedToken) {
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    const explicit = request.headers.get('x-aiworker-admin-token')?.trim()
    if (bearer !== expectedToken && explicit !== expectedToken) {
      return Response.json({ error: 'admin_token_required' }, {
        status: 401,
        headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
      })
    }
  }
  return null
}

function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin)
    return true
  try {
    const requestUrl = new URL(request.url)
    const originUrl = new URL(origin)
    const sameProtocol = originUrl.protocol === requestUrl.protocol || (originUrl.protocol === 'https:' && requestUrl.protocol === 'http:')
    return sameProtocol && originUrl.host === requestUrl.host
  }
  catch {
    return false
  }
}

function adminApiErrorResponse(error: unknown, status: number): Response {
  const message = error instanceof Error ? error.message : String(error)
  return Response.json({ error: message }, {
    status,
    headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
  })
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
}

function methodNotAllowed(allow: string): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      allow,
      'x-aiworker-boundary': 'admin-control-plane-only',
    },
  })
}

if (import.meta.main) {
  createServer()
  process.stdout.write(`aiworker-web listening on http://${hostname}:${port} root=${root}\n`)
}
