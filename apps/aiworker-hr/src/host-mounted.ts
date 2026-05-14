import { Buffer } from 'node:buffer'
import process from 'node:process'

import { createSoulAppClient } from '@zonease/aiworker-soul-app-sdk'

import { hrReferenceSoulApp, hrSoulAppManifest } from './index'

interface MountContext {
  brokerUrl?: string
  hostUrl?: string
  operatorId?: string | null
  sessionId?: string | null
  surface?: {
    id?: string
    scope?: string
  }
  workerId?: string | null
  workspaceId?: string | null
}

interface BrokerSearchResult {
  items?: Array<Record<string, unknown>>
}

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/health') {
        return Response.json({
          appId: hrSoulAppManifest.id,
          mode: 'host-mounted',
          status: 'ok',
        })
      }
      const tokenError = verifyMountToken(request)
      if (tokenError)
        return tokenError
      if (url.pathname === '/domain') {
        return Response.json({
          appId: hrSoulAppManifest.id,
          capabilities: hrSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: hrSoulAppManifest.soul.id,
          workspaceTypes: hrSoulAppManifest.workspaceTypes.map(type => type.id),
        })
      }
      if (url.pathname === '/surfaces/routes/hr-home' || url.pathname === '/surfaces/panels/hr-profile-panel') {
        return Response.json(hrDescriptorSurface(request, url.pathname))
      }
      if (url.pathname === '/frames/widgets/hr-people-widget') {
        return new Response(hrWidgetFrameHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url.pathname === '/protocol/actions' && request.method === 'POST') {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>
        return Response.json(await hrProtocolAction(request, String(body.protocolAction ?? '')))
      }
      if (url.pathname === '/protocol/search' && request.method === 'GET') {
        return Response.json(await hrProtocolSearch(request, url))
      }
      if (url.pathname === '/broker/permissions') {
        const hostUrl = request.headers.get('x-aiworker-host-url') ?? Bun.env.AIWORKER_HOST_URL
        if (!hostUrl)
          return Response.json({ appId: hrSoulAppManifest.id, broker: 'not-configured', permissions: [] })
        const client = createSoulAppClient({ appId: hrSoulAppManifest.id, baseUrl: hostUrl })
        return Response.json(await client.broker.permissions.list())
      }
      if (url.pathname === '/protocol/capabilities') {
        return Response.json({
          capabilities: await hrReferenceSoulApp.ui?.capabilities({
            appId: hrSoulAppManifest.id,
            permissions: hrSoulAppManifest.permissions,
          }),
        })
      }
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown HR app route: ${url.pathname}` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(`${JSON.stringify({ appId: hrSoulAppManifest.id, mode: 'host-mounted', url: `http://${server.hostname}:${server.port}` })}\n`)
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

function hrDescriptorSurface(request: Request, pathname: string) {
  const context = readMountContext(request)
  return {
    actions: [
      {
        id: 'create-profile-review',
        label: 'Create review',
        method: 'POST',
        target: `${context?.brokerUrl ?? '/broker'}/reviews`,
      },
    ],
    appId: hrSoulAppManifest.id,
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
      { label: 'Domain', value: hrSoulAppManifest.soul.domain },
      { label: 'Workspace types', value: hrSoulAppManifest.workspaceTypes.map(type => type.name).join(', ') },
      { label: 'Evidence broker', value: hrSoulAppManifest.connectors.required.map(connector => connector.id).join(', ') },
    ],
    path: pathname,
    renderer: 'host-descriptor',
    status: 'ready',
    title: pathname.includes('/routes/') ? 'HR Mounted Workbench' : 'People Profile Panel',
    type: 'aiworker.surface.descriptor.v1',
  }
}

function hrWidgetFrameHtml(request: Request): string {
  const context = readMountContext(request)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>HR People Widget</title></head>',
    '<body>',
    '<main>',
    '<h1>People Widget</h1>',
    `<p data-soul-app-id="${hrSoulAppManifest.id}">Mounted HR frame surface</p>`,
    `<p data-surface-id="${context?.surface?.id ?? 'unknown'}">Scope ${context?.surface?.scope ?? 'workspace'}</p>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

async function hrProtocolAction(request: Request, protocolAction: string) {
  if (protocolAction === 'peopleProfiles.create') {
    const persisted = await persistPeopleProfileDraft(request)
    if (!persisted.ok)
      return persisted
    return {
      message: 'People profile draft opened by HR app.',
      ok: true,
      redirectTo: '/hr/people',
      refresh: true,
    }
  }
  if (protocolAction === 'people.refresh') {
    return {
      message: 'People data refreshed by HR app.',
      ok: true,
      refresh: true,
    }
  }
  if (protocolAction === 'drawers.evidence.toggle') {
    return {
      message: 'Evidence drawer intent emitted by HR app.',
      ok: true,
    }
  }
  if (protocolAction === 'settings.open') {
    return {
      message: 'HR settings are owned by the HR app.',
      ok: true,
    }
  }
  return {
    message: `Unknown HR protocol action: ${protocolAction}`,
    ok: false,
  }
}

async function persistPeopleProfileDraft(request: Request): Promise<{ message: string, ok: false } | { ok: true }> {
  const context = readMountContext(request)
  if (!context?.hostUrl)
    return { ok: true }

  const draftKey = `drafts/people-profile/${context.workspaceId ?? 'app'}`
  const workspaceRef = context.workspaceId ?? 'app'
  const client = createSoulAppClient({ appId: hrSoulAppManifest.id, baseUrl: context.hostUrl })
  try {
    await client.broker.storage.put(draftKey, {
      appId: hrSoulAppManifest.id,
      kind: 'people-profile',
      source: 'hr-mounted-action',
      status: 'draft',
      workspaceId: context.workspaceId ?? null,
    }, brokerScope(context))
    await client.broker.search.upsert(draftKey, {
      kind: 'people-profile',
      reference: {
        id: workspaceRef,
        type: context.workspaceId ? 'workspace' : 'app',
      },
      sessionId: context.sessionId ?? null,
      summary: `HR app-owned people profile draft for workspace ${workspaceRef}.`,
      title: 'People profile draft',
      workspaceId: context.workspaceId ?? null,
    }, brokerScope(context))
    return { ok: true }
  }
  catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    }
  }
}

async function hrProtocolSearch(request: Request, url: URL) {
  const query = url.searchParams.get('query') ?? ''
  const brokerItems = await queryBrokerPeopleProfileSearch(request, query)
  if (brokerItems?.length) {
    return {
      items: brokerItems,
      providerId: 'peopleProfiles.search',
    }
  }

  return {
    items: [{
      appId: hrSoulAppManifest.id,
      authority: 'soul-app' as const,
      id: 'people-profile-draft',
      kind: 'people-profile',
      openAction: {
        id: 'create-people-profile',
        input: { query },
      },
      status: 'draft',
      summary: query ? `HR app-owned profile match for ${query}` : 'Open HR profile workspace',
      title: query ? `People profile: ${query}` : 'People profile draft',
    }],
    providerId: 'peopleProfiles.search',
  }
}

async function queryBrokerPeopleProfileSearch(request: Request, query: string): Promise<Array<Record<string, unknown>> | null> {
  const context = readMountContext(request)
  if (!context?.hostUrl)
    return null

  const client = createSoulAppClient({ appId: hrSoulAppManifest.id, baseUrl: context.hostUrl })
  try {
    const result = await client.broker.search.query(query, brokerScope(context)) as BrokerSearchResult
    return Array.isArray(result.items) ? result.items : null
  }
  catch {
    return null
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
      hostUrl: request.headers.get('x-aiworker-host-url') ?? undefined,
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

function brokerScope(context: MountContext) {
  return {
    operatorId: context.operatorId ?? undefined,
    sessionId: context.sessionId ?? undefined,
    workerId: context.workerId ?? undefined,
    workspaceId: context.workspaceId ?? undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
