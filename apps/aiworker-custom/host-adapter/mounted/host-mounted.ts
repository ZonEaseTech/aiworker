import { Buffer } from 'node:buffer'
import process from 'node:process'

import { mountSessionApiProxy } from '@zonease/aiworker-soul-app-runtime'
import { renderUniversalWorkbenchHtml } from '@zonease/aiworker-soul-app-runtime/universal-workbench-html'

import { customSoulAppManifest } from '../index'
import { serveSoulAppWebAsset } from '../web-style'

interface MountContext {
  sessionId?: string | null
  workerId?: string | null
  workspaceId?: string | null
}

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const assetResponse = await serveSoulAppWebAsset(url)
      if (assetResponse)
        return assetResponse
      if (url.pathname === '/health') {
        return Response.json({
          appId: customSoulAppManifest.id,
          mode: 'host-mounted',
          status: 'ok',
        })
      }
      const tokenError = verifyMountToken(request)
      if (tokenError)
        return tokenError
      const sessionProxy = mountedSessionProxyResponse(request)
      if (sessionProxy)
        return sessionProxy
      if (url.pathname === '/domain') {
        return Response.json({
          appId: customSoulAppManifest.id,
          capabilities: customSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: customSoulAppManifest.soul.id,
          workspaceTypes: customSoulAppManifest.workspaceTypes.map(type => type.id),
        })
      }
      if (url.pathname === '/api/capabilities' && request.method === 'GET')
        return Response.json({ capabilities: customSoulAppManifest.capabilities })
      if (url.pathname === '/micro-app/workbench/universal') {
        return new Response(customUniversalWorkbenchHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown Custom app route: ${url.pathname}` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

function mountedSessionProxyResponse(request: Request): Promise<Response> | null {
  const context = readMountContext(request)
  const url = new URL(request.url)
  const workerId = context?.workerId ?? url.searchParams.get('workerId')
  const hostApiBaseUrl = request.headers.get('x-aiworker-host-url')
  if (!hostApiBaseUrl || !workerId)
    return null
  return mountSessionApiProxy(request, {
    hostApiBaseUrl,
    workerId,
    workspaceId: context?.workspaceId ?? url.searchParams.get('workspaceId'),
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(`${JSON.stringify({ appId: customSoulAppManifest.id, mode: 'host-mounted', url: `http://${server.hostname}:${server.port}` })}\n`)
}

function customUniversalWorkbenchHtml(request: Request): string {
  const context = readMountContext(request)
  const url = new URL(request.url)
  const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  return renderUniversalWorkbenchHtml({
    appId: customSoulAppManifest.id,
    appName: customSoulAppManifest.name,
    routePrefix: mountedRoutePrefix(),
    sessionId: context?.sessionId ?? url.searchParams.get('sessionId'),
    styleHref: `${mountedRoutePrefix()}/styles.css`,
    theme,
    workerId: context?.workerId ?? url.searchParams.get('workerId'),
    workspaceId: context?.workspaceId ?? url.searchParams.get('workspaceId'),
  })
}

function verifyMountToken(request: Request): Response | null {
  const expected = Bun.env.AIWORKER_MOUNT_TOKEN
  if (!expected)
    return null
  const actual = request.headers.get('x-aiworker-mount-token')
  return actual === expected
    ? null
    : Response.json({ error: { code: 'INVALID_MOUNT_TOKEN', message: 'Host mount token is required.' } }, { status: 401 })
}

function mountedRoutePrefix(): string {
  return `/api/local/apps/${customSoulAppManifest.id}`
}

function readMountContext(request: Request): MountContext | null {
  const payload = request.headers.get('x-aiworker-mount-context')
  if (!payload)
    return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown
    if (!isRecord(parsed))
      return null
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      workerId: typeof parsed.workerId === 'string' ? parsed.workerId : null,
      workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : null,
    }
  }
  catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
