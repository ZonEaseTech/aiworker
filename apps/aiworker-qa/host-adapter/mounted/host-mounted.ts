import { Buffer } from 'node:buffer'
import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'
import { mountSessionApiProxy } from '@zonease/aiworker-soul-app-runtime'
import { renderUniversalWorkbenchHtml } from '@zonease/aiworker-soul-app-runtime/universal-workbench-html'

import { QaReleaseWidgetProof } from '../../product/web/widgets/release-widget'
import { qaSoulAppManifest } from '../index'
import { renderSoulAppStyleLink, serveSoulAppWebAsset } from '../web-style'

interface MountContext {
  operatorId?: string | null
  sessionId?: string | null
  surface?: {
    id?: string
    scope?: string
  }
  workerId?: string | null
  workspaceId?: string | null
}

interface ReleaseGateDraftDescriptor {
  appId: string
  authority: 'soul-app'
  id: string
  kind: 'release-gate'
  openAction: {
    id: string
    input: Record<string, unknown>
  }
  sessionId: string | null
  status: 'draft'
  summary: string
  title: string
  workspaceId: string | null
}

const releaseGateDrafts = new Map<string, ReleaseGateDraftDescriptor>()

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const assetResponse = await serveSoulAppWebAsset(url)
      if (assetResponse)
        return assetResponse
      if (url.pathname === '/health') {
        return Response.json({
          appId: qaSoulAppManifest.id,
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
          appId: qaSoulAppManifest.id,
          capabilities: qaSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: qaSoulAppManifest.soul.id,
          workspaceTypes: qaSoulAppManifest.workspaceTypes.map(type => type.id),
        })
      }
      if (url.pathname === '/api/capabilities' && request.method === 'GET')
        return Response.json({ capabilities: qaSoulAppManifest.capabilities })
      if (url.pathname === '/api/release-gates' && request.method === 'POST')
        return Response.json(await createReleaseGateDraft(request))
      if (url.pathname === '/api/release-gates/search' && request.method === 'GET')
        return Response.json(searchReleaseGates(request, url))
      if (url.pathname === '/micro-app/workbench/universal') {
        return new Response(qaUniversalWorkbenchHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url.pathname === '/micro-app/widgets/qa-release-widget') {
        return new Response(qaWidgetMicroAppHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown QA app route: ${url.pathname}` } }, { status: 404 })
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
  process.stdout.write(`${JSON.stringify({ appId: qaSoulAppManifest.id, mode: 'host-mounted', url: `http://${server.hostname}:${server.port}` })}\n`)
}

function qaUniversalWorkbenchHtml(request: Request): string {
  const context = readMountContext(request)
  const url = new URL(request.url)
  const theme = readMicroAppTheme(request)
  return renderUniversalWorkbenchHtml({
    appId: qaSoulAppManifest.id,
    appName: qaSoulAppManifest.name,
    routePrefix: mountedRoutePrefix(),
    sessionId: context?.sessionId ?? url.searchParams.get('sessionId'),
    styleHref: mountedStyleHref(),
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

function qaWidgetMicroAppHtml(request: Request): string {
  const context = readMountContext(request)
  const scope = context?.surface?.scope ?? 'workspace'
  const surfaceId = context?.surface?.id ?? 'unknown'
  const theme = readMicroAppTheme(request)
  const widgetMarkup = renderToStaticMarkup(QaReleaseWidgetProof({
    badgeLabel: 'Mounted',
    description: 'Host-mounted QA Release micro-app surface.',
    detail: `Mounted QA micro-app surface for ${scope} scope.`,
  }))
  return [
    '<!doctype html>',
    microAppHtmlOpen(theme),
    `<head><meta charset="utf-8"><title>QA Release Widget</title>${renderSoulAppStyleLink(mountedStyleHref())}</head>`,
    '<body>',
    `<main data-soul-app-id="${escapeHtmlAttribute(qaSoulAppManifest.id)}" data-surface-id="${escapeHtmlAttribute(surfaceId)}">`,
    widgetMarkup,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

function readMicroAppTheme(request: Request): 'dark' | 'light' {
  return new URL(request.url).searchParams.get('theme') === 'dark' ? 'dark' : 'light'
}

function microAppHtmlOpen(theme: 'dark' | 'light'): string {
  return theme === 'dark'
    ? '<html lang="en" class="dark" style="color-scheme:dark">'
    : '<html lang="en" style="color-scheme:light">'
}

function mountedStyleHref(): string {
  return `${mountedRoutePrefix()}/styles.css`
}

function mountedRoutePrefix(): string {
  return `/api/local/apps/${qaSoulAppManifest.id}`
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

async function createReleaseGateDraft(request: Request) {
  const persisted = await persistReleaseGateDraft(request)
  if (!persisted.ok)
    return persisted
  return {
    message: 'Release gate draft opened by QA app.',
    ok: true,
    redirectTo: '/qa/release',
    refresh: true,
  }
}

async function persistReleaseGateDraft(request: Request): Promise<{ message: string, ok: false } | { ok: true }> {
  const context = readMountContext(request)
  const draftKey = releaseGateDraftKey(context)
  const workspaceRef = context?.workspaceId ?? 'app'
  releaseGateDrafts.set(draftKey, {
    appId: qaSoulAppManifest.id,
    authority: 'soul-app',
    id: draftKey,
    kind: 'release-gate',
    openAction: {
      id: 'create-release-gate',
      input: { workspaceId: context?.workspaceId ?? null },
    },
    sessionId: context?.sessionId ?? null,
    status: 'draft',
    summary: `QA app-owned release gate draft for workspace ${workspaceRef}.`,
    title: 'Release gate draft',
    workspaceId: context?.workspaceId ?? null,
  })
  return { ok: true }
}

function searchReleaseGates(request: Request, url: URL) {
  const query = url.searchParams.get('query') ?? ''
  const appOwnedItems = queryReleaseGateDrafts(request, query)
  if (appOwnedItems.length) {
    return {
      items: appOwnedItems,
    }
  }

  return {
    items: [{
      appId: qaSoulAppManifest.id,
      authority: 'soul-app' as const,
      id: 'release-gate-draft',
      kind: 'release-gate',
      openAction: {
        id: 'create-release-gate',
        input: { query },
      },
      status: 'draft',
      summary: query ? `QA app-owned release match for ${query}` : 'Open QA release gate workspace',
      title: query ? `Release gate: ${query}` : 'Release gate draft',
    }],
  }
}

function queryReleaseGateDrafts(request: Request, query: string): ReleaseGateDraftDescriptor[] {
  const context = readMountContext(request)
  const normalizedQuery = query.trim().toLowerCase()
  return Array.from(releaseGateDrafts.values()).filter((item) => {
    if (context?.workspaceId && item.workspaceId !== context.workspaceId)
      return false
    if (!normalizedQuery)
      return true
    return [item.id, item.kind, item.summary, item.title].some(value => value.toLowerCase().includes(normalizedQuery))
  })
}

function releaseGateDraftKey(context: MountContext | null): string {
  return `drafts/release-gate/${context?.workspaceId ?? 'app'}`
}

function readMountContext(request: Request): MountContext | null {
  const payload = request.headers.get('x-aiworker-mount-context')
  if (!payload)
    return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown
    if (!isRecord(parsed))
      return null
    const surface = isRecord(parsed.surface) ? parsed.surface : null
    return {
      operatorId: typeof parsed.operatorId === 'string' ? parsed.operatorId : null,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      surface: surface
        ? {
            id: typeof surface.id === 'string' ? surface.id : undefined,
            scope: typeof surface.scope === 'string' ? surface.scope : undefined,
          }
        : undefined,
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
