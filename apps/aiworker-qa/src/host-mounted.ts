import { Buffer } from 'node:buffer'
import process from 'node:process'

import { createSoulAppClient } from '@zonease/aiworker-soul-app-sdk'

import { qaReferenceSoulApp, qaSoulAppManifest } from './index'

interface MountContext {
  brokerUrl?: string
  surface?: {
    id?: string
    scope?: string
  }
  workspaceId?: string | null
}

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
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
      if (url.pathname === '/domain') {
        return Response.json({
          appId: qaSoulAppManifest.id,
          capabilities: qaSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: qaSoulAppManifest.soul.id,
          workspaceTypes: qaSoulAppManifest.workspaceTypes.map(type => type.id),
        })
      }
      if (url.pathname === '/surfaces/routes/qa-home' || url.pathname === '/surfaces/panels/qa-release-panel') {
        return Response.json(qaDescriptorSurface(request, url.pathname))
      }
      if (url.pathname === '/frames/widgets/qa-release-widget') {
        return new Response(qaWidgetFrameHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url.pathname === '/protocol/actions' && request.method === 'POST') {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>
        return Response.json(qaProtocolAction(String(body.protocolAction ?? '')))
      }
      if (url.pathname === '/protocol/search' && request.method === 'GET') {
        return Response.json(qaProtocolSearch(url))
      }
      if (url.pathname === '/broker/permissions') {
        const hostUrl = request.headers.get('x-aiworker-host-url') ?? Bun.env.AIWORKER_HOST_URL
        if (!hostUrl)
          return Response.json({ appId: qaSoulAppManifest.id, broker: 'not-configured', permissions: [] })
        const client = createSoulAppClient({ appId: qaSoulAppManifest.id, baseUrl: hostUrl })
        return Response.json(await client.broker.permissions.list())
      }
      if (url.pathname === '/protocol/capabilities') {
        return Response.json({
          capabilities: await qaReferenceSoulApp.ui?.capabilities({
            appId: qaSoulAppManifest.id,
            permissions: qaSoulAppManifest.permissions,
          }),
        })
      }
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown QA app route: ${url.pathname}` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(`${JSON.stringify({ appId: qaSoulAppManifest.id, mode: 'host-mounted', url: `http://${server.hostname}:${server.port}` })}\n`)
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

function qaDescriptorSurface(request: Request, pathname: string) {
  const context = readMountContext(request)
  return {
    actions: [
      {
        id: 'create-release-review',
        label: 'Create review',
        method: 'POST',
        target: `${context?.brokerUrl ?? '/broker'}/reviews`,
      },
    ],
    appId: qaSoulAppManifest.id,
    authority: 'soul-app',
    cache: {
      freshness: 'non-authoritative',
    },
    context: {
      signed: Boolean(request.headers.get('x-aiworker-mount-signature')),
      surfaceId: context?.surface?.id ?? null,
      workspaceId: context?.workspaceId ?? null,
    },
    fields: [
      { label: 'Domain', value: qaSoulAppManifest.soul.domain },
      { label: 'Workspace types', value: qaSoulAppManifest.workspaceTypes.map(type => type.name).join(', ') },
      { label: 'Evidence broker', value: qaSoulAppManifest.connectors.required.map(connector => connector.id).join(', ') },
    ],
    path: pathname,
    renderer: 'host-descriptor',
    status: 'ready',
    title: pathname.includes('/routes/') ? 'QA Mounted Workbench' : 'Release Gate Panel',
    type: 'aiworker.surface.descriptor.v1',
  }
}

function qaWidgetFrameHtml(request: Request): string {
  const context = readMountContext(request)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>QA Release Widget</title></head>',
    '<body>',
    '<main>',
    '<h1>Release Widget</h1>',
    `<p data-soul-app-id="${qaSoulAppManifest.id}">Mounted QA frame surface</p>`,
    `<p data-surface-id="${context?.surface?.id ?? 'unknown'}">Scope ${context?.surface?.scope ?? 'workspace'}</p>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

function qaProtocolAction(protocolAction: string) {
  if (protocolAction === 'releaseGates.create') {
    return {
      message: 'Release gate draft opened by QA app.',
      ok: true,
      redirectTo: '/qa/release',
      refresh: true,
    }
  }
  if (protocolAction === 'release.refresh') {
    return {
      message: 'Release data refreshed by QA app.',
      ok: true,
      refresh: true,
    }
  }
  if (protocolAction === 'settings.open') {
    return {
      message: 'QA settings are owned by the QA app.',
      ok: true,
    }
  }
  return {
    message: `Unknown QA protocol action: ${protocolAction}`,
    ok: false,
  }
}

function qaProtocolSearch(url: URL) {
  const query = url.searchParams.get('query') ?? ''
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
    providerId: 'releases.search',
  }
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
      brokerUrl: typeof parsed.brokerUrl === 'string' ? parsed.brokerUrl : undefined,
      surface: surface
        ? {
            id: typeof surface.id === 'string' ? surface.id : undefined,
            scope: typeof surface.scope === 'string' ? surface.scope : undefined,
          }
        : undefined,
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
