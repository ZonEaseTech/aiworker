import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import process from 'node:process'
import { appendApprovalDecision, controlPlaneDirFromEnv, loadAdminDataApiPayload, runApprovedAssignmentApplyJob, runAssignmentPairJob } from './admin-api'
import { adminAuthBootstrapStatus, adminAuthErrorResponse, authorizeAdminMutation, authorizeAdminRead, callbackResponse, loginResponse, logoutResponse, logtoRuntimeState, safeReturnTo } from './lib/admin-auth'
import { adminApiErrorPayload, classifyAdminError } from './lib/admin-remediation'

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
  const effectiveEnv = serverEnvForHost(listenHost)
  return Bun.serve({
    hostname: listenHost,
    port: options.port ?? port,
    async fetch(request: Request) {
      const url = new URL(request.url)

      if (url.pathname === '/healthz') {
        return Response.json({ ok: true, surface: 'aiworker-web', runtime: 'bun' })
      }

      if (url.pathname === '/login') {
        if (request.method !== 'GET' && request.method !== 'HEAD')
          return methodNotAllowed('GET, HEAD')
        return loginResponse(request, effectiveEnv)
      }

      if (url.pathname === '/callback') {
        if (request.method !== 'GET' && request.method !== 'HEAD')
          return methodNotAllowed('GET, HEAD')
        return callbackResponse(request, effectiveEnv)
      }

      if (url.pathname === '/logout') {
        if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'HEAD')
          return methodNotAllowed('GET, POST, HEAD')
        return logoutResponse(request, effectiveEnv)
      }

      if (url.pathname === '/api/auth/session') {
        if (request.method !== 'GET' && request.method !== 'HEAD')
          return methodNotAllowed('GET, HEAD')
        const auth = authorizeAdminRead(request, effectiveEnv)
        return Response.json({
          auth: adminAuthBootstrapStatus(request, effectiveEnv),
          authorized: auth.ok,
        })
      }

      if (url.pathname === '/api/admin-data') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return methodNotAllowed('GET, HEAD')
        }
        const guard = adminReadGuard(request, effectiveEnv)
        if (guard)
          return guard

        try {
          return Response.json(await loadAdminDataApiPayload(undefined, request, effectiveEnv))
        }
        catch {
          return Response.json(adminApiErrorPayload('control_plane_unavailable'), {
            status: 500,
            headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
          })
        }
      }

      const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/)
      if (approvalMatch) {
        if (request.method !== 'POST') {
          return methodNotAllowed('POST')
        }
        const guard = adminMutationGuard(request, effectiveEnv)
        if (guard)
          return guard

        const root = controlPlaneDirFromEnv(effectiveEnv)
        if (!root) {
          return Response.json(adminApiErrorPayload('control_plane_dir_required'), {
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
        const guard = adminMutationGuard(request, effectiveEnv)
        if (guard)
          return guard

        const root = controlPlaneDirFromEnv(effectiveEnv)
        if (!root) {
          return Response.json(adminApiErrorPayload('control_plane_dir_required'), {
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
        const guard = adminMutationGuard(request, effectiveEnv)
        if (guard)
          return guard

        const root = controlPlaneDirFromEnv(effectiveEnv)
        if (!root) {
          return Response.json(adminApiErrorPayload('control_plane_dir_required'), {
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

      const htmlGuard = await adminHtmlNavigationGuard(request, url, effectiveEnv)
      if (htmlGuard)
        return htmlGuard

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

function adminReadGuard(request: Request, env: NodeJS.ProcessEnv): Response | null {
  const auth = authorizeAdminRead(request, env)
  if (!auth.ok)
    return adminAuthErrorResponse(auth)
  return null
}

function adminMutationGuard(request: Request, env: NodeJS.ProcessEnv): Response | null {
  if (request.headers.get(adminActionHeader) !== '1') {
    return Response.json(adminApiErrorPayload('admin_action_header_required'), {
      status: 403,
      headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
    })
  }
  if (!isSameOriginMutation(request)) {
    return Response.json(adminApiErrorPayload('same_origin_required'), {
      status: 403,
      headers: { 'x-aiworker-boundary': 'admin-control-plane-only' },
    })
  }
  const auth = authorizeAdminMutation(request, env)
  if (!auth.ok)
    return adminAuthErrorResponse(auth)
  return null
}

async function adminHtmlNavigationGuard(request: Request, url: URL, env: NodeJS.ProcessEnv): Promise<Response | null> {
  if (!isHtmlNavigation(request, url))
    return null
  const auth = authorizeAdminRead(request, env)
  if (auth.ok)
    return null
  if (auth.code === 'admin_auth_required' && logtoRuntimeState(env).kind === 'configured') {
    const returnTo = safeReturnTo(`${url.pathname}${url.search}`)
    const loginUrl = new URL('/login', url)
    if (returnTo)
      loginUrl.searchParams.set('returnTo', returnTo)
    return new Response(null, {
      headers: {
        'location': loginUrl.pathname + loginUrl.search,
        'x-aiworker-boundary': 'admin-control-plane-only',
      },
      status: 302,
    })
  }
  return loginResponse(request, env)
}

function serverEnvForHost(listenHost: string): NodeJS.ProcessEnv {
  return listenHost === hostname ? process.env : { ...process.env, AIWORKER_WEB_HOST: listenHost }
}

function isHtmlNavigation(request: Request, url: URL): boolean {
  if (url.pathname.startsWith('/api/'))
    return false
  const lastSegment = url.pathname.split('/').at(-1) ?? ''
  if (lastSegment.includes('.'))
    return false
  const destination = request.headers.get('sec-fetch-dest')
  if (destination === 'document')
    return true
  const accept = request.headers.get('accept')
  return !accept || accept.includes('text/html')
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
  const code = classifyAdminError(error)
  return Response.json(adminApiErrorPayload(code), {
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
