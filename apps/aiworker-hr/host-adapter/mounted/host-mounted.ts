import { Buffer } from 'node:buffer'
import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'
import { renderUniversalWorkbenchHtml } from '@zonease/aiworker-soul-app-runtime/universal-workbench-html'

import { HrHomeRouteSurface } from '../../product/web/routes/hr-route'
import { HrPeopleWidgetProof } from '../../product/web/widgets/people-widget'
import { hrReferenceSoulApp, hrSoulAppManifest } from '../index'
import { renderSoulAppClientScript, renderSoulAppStyleLink, serveSoulAppWebAsset } from '../web-style'
import { hrChildRouteBridgeScript } from './route-bridge'

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

interface PeopleProfileDraftDescriptor {
  appId: string
  authority: 'soul-app'
  id: string
  kind: 'people-profile'
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

interface MicroAppHostData {
  appId: string
  routePrefix: string
  theme: 'dark' | 'light'
  workerId: string | null
  workspaceId: string | null
}

const peopleProfileDrafts = new Map<string, PeopleProfileDraftDescriptor>()

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const assetResponse = await serveSoulAppWebAsset(url)
      if (assetResponse)
        return assetResponse
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
      if (url.pathname === '/micro-app/workbench/universal') {
        return new Response(hrUniversalWorkbenchHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url.pathname === '/micro-app/routes/hr-home') {
        return new Response(hrRouteMicroAppHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url.pathname === '/micro-app/widgets/hr-people-widget') {
        return new Response(hrWidgetMicroAppHtml(request), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url.pathname === '/api/capabilities' && request.method === 'GET') {
        return Response.json({
          capabilities: await hrReferenceSoulApp.ui?.capabilities({
            appId: hrSoulAppManifest.id,
            permissions: hrSoulAppManifest.permissions,
          }),
        })
      }
      if (url.pathname === '/api/people-profiles' && request.method === 'POST')
        return Response.json(await createPeopleProfileDraft(request))
      if (url.pathname === '/api/people-profiles/search' && request.method === 'GET') {
        return Response.json(await searchPeopleProfiles(request, url))
      }
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown HR app route: ${url.pathname}` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

function hrUniversalWorkbenchHtml(request: Request): string {
  const context = readMountContext(request)
  const url = new URL(request.url)
  const theme = readMicroAppTheme(request)
  return renderUniversalWorkbenchHtml({
    appId: hrSoulAppManifest.id,
    appName: hrSoulAppManifest.name,
    routePrefix: mountedRoutePrefix(),
    sessionId: context?.sessionId ?? url.searchParams.get('sessionId'),
    styleHref: mountedStyleHref(),
    theme,
    workerId: context?.workerId ?? url.searchParams.get('workerId'),
    workspaceId: context?.workspaceId ?? url.searchParams.get('workspaceId'),
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

function hrRouteMicroAppHtml(request: Request): string {
  const context = readMountContext(request)
  const surfaceId = context?.surface?.id ?? 'hr-home'
  const theme = readMicroAppTheme(request)
  const hostData = microAppHostData(request, theme)
  const routeMarkup = renderToStaticMarkup(HrHomeRouteSurface({
    badgeLabel: 'Mounted',
    description: 'Host-mounted HR app-owned people workbench.',
  }))
  return [
    '<!doctype html>',
    microAppHtmlOpen(theme),
    `<head><meta charset="utf-8"><title>HR People Workbench</title>${renderSoulAppStyleLink(mountedStyleHref())}</head>`,
    '<body class="h-full overflow-hidden">',
    `<main id="aiworker-hr-root" class="h-full min-h-0" data-soul-app-id="${escapeHtmlAttribute(hrSoulAppManifest.id)}" data-surface-id="${escapeHtmlAttribute(surfaceId)}">`,
    routeMarkup,
    '</main>',
    renderMicroAppHostDataScript(hostData),
    `<script>${microAppBridgeScript(hrSoulAppManifest.id, surfaceId, hostData)}</script>`,
    `<script>${hrChildRouteBridgeScript(hrSoulAppManifest.id, surfaceId)}</script>`,
    renderSoulAppClientScript(mountedClientHref()),
    '</body>',
    '</html>',
  ].join('')
}

function hrWidgetMicroAppHtml(request: Request): string {
  const context = readMountContext(request)
  const scope = context?.surface?.scope ?? 'workspace'
  const surfaceId = context?.surface?.id ?? 'unknown'
  const theme = readMicroAppTheme(request)
  const widgetMarkup = renderToStaticMarkup(HrPeopleWidgetProof({
    badgeLabel: 'Mounted',
    description: 'Host-mounted HR People micro-app surface.',
    detail: `Mounted HR micro-app surface for ${scope} scope.`,
  }))
  return [
    '<!doctype html>',
    microAppHtmlOpen(theme),
    `<head><meta charset="utf-8"><title>HR People Widget</title>${renderSoulAppStyleLink(mountedStyleHref())}</head>`,
    '<body>',
    `<main data-soul-app-id="${escapeHtmlAttribute(hrSoulAppManifest.id)}" data-surface-id="${escapeHtmlAttribute(surfaceId)}">`,
    widgetMarkup,
    '</main>',
    '<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">{}</script>',
    `<script>${microAppBridgeScript(hrSoulAppManifest.id, surfaceId, {})}</script>`,
    '</body>',
    '</html>',
  ].join('')
}

function microAppHostData(request: Request, theme: 'dark' | 'light'): MicroAppHostData {
  const context = readMountContext(request)
  const url = new URL(request.url)
  return {
    appId: hrSoulAppManifest.id,
    routePrefix: mountedRoutePrefix(),
    theme,
    workerId: context?.workerId ?? url.searchParams.get('workerId'),
    workspaceId: context?.workspaceId ?? url.searchParams.get('workspaceId'),
  }
}

function readMicroAppTheme(request: Request): 'dark' | 'light' {
  return new URL(request.url).searchParams.get('theme') === 'dark' ? 'dark' : 'light'
}

function microAppHtmlOpen(theme: 'dark' | 'light'): string {
  return theme === 'dark'
    ? '<html lang="en" class="dark h-full" style="color-scheme:dark">'
    : '<html lang="en" class="h-full" style="color-scheme:light">'
}

function mountedStyleHref(): string {
  return `${mountedRoutePrefix()}/styles.css`
}

function mountedClientHref(): string {
  return `${mountedRoutePrefix()}/assets/hr-home-client.js`
}

function mountedRoutePrefix(): string {
  return `/api/local/apps/${hrSoulAppManifest.id}`
}

function renderMicroAppHostDataScript(hostData: unknown): string {
  return `<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">${jsonScriptPayload(hostData)}</script>`
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function microAppBridgeScript(appId: string, surfaceId: string, defaultHostData: unknown): string {
  return `;(() => {
  const appId = ${jsonScriptValue(appId)};
  const surfaceId = ${jsonScriptValue(surfaceId)};
  const defaultHostData = ${jsonScriptPayload(defaultHostData)};
  window.__AIWORKER_HR_CHILD_ROUTE__ = '/hr';
  const hostDataElement = document.getElementById('aiworker-micro-app-host-data');
  const setHostData = (value) => {
    const data = value && typeof value === 'object' ? { ...defaultHostData, ...value } : defaultHostData;
    window.__AIWORKER_MICRO_APP_HOST_DATA__ = data;
    if (hostDataElement)
      hostDataElement.textContent = JSON.stringify(data);
    return data;
  };
  const dispatch = (payload) => {
    const api = window.microApp;
    if (api && typeof api.dispatch === 'function')
      api.dispatch(payload);
  };
  let readyDispatched = false;
  const dispatchReady = (receivedHostData, data) => {
    if (readyDispatched)
      return;
    readyDispatched = true;
    dispatch({
      appId,
      receivedHostData,
      surfaceId,
      theme: data && typeof data.theme === 'string' ? data.theme : null,
      type: 'ready',
      workerId: data && typeof data.workerId === 'string' ? data.workerId : null,
      workspaceId: data && typeof data.workspaceId === 'string' ? data.workspaceId : null,
    });
  };
  let attempts = 0;
  const bind = () => {
    const api = window.microApp;
    if (!api) {
      attempts += 1;
      if (attempts <= 30) {
        window.setTimeout(bind, 16);
        return;
      }
      setHostData(defaultHostData);
      return;
    }
    const receiveHostData = (data) => {
      const normalized = setHostData(data);
      dispatchReady(true, normalized);
    };
    if (typeof api.addDataListener === 'function')
      api.addDataListener(receiveHostData, true);
    if (typeof api.getData === 'function') {
      const current = api.getData();
      if (current && typeof current === 'object' && Object.keys(current).length > 0)
        receiveHostData(current);
    }
    if (!readyDispatched) {
      const normalized = setHostData(defaultHostData);
      dispatchReady(false, normalized);
    }
    window.addEventListener('unload', () => {
      if (typeof api.removeDataListener === 'function')
        api.removeDataListener(receiveHostData);
    }, { once: true });
  };
  bind();
})();`
}

function jsonScriptValue(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C').replaceAll('>', '\\u003E').replaceAll('&', '\\u0026')
}

function jsonScriptPayload(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C').replaceAll('>', '\\u003E').replaceAll('&', '\\u0026')
}

async function createPeopleProfileDraft(request: Request) {
  const persisted = await persistPeopleProfileDraft(request)
  if (!persisted.ok)
    return persisted
  return {
    message: 'People profile draft opened by HR app.',
    ok: true,
    redirectTo: '/hr/profiles/new',
    refresh: true,
  }
}

async function persistPeopleProfileDraft(request: Request): Promise<{ message: string, ok: false } | { ok: true }> {
  const context = readMountContext(request)
  const draftKey = peopleProfileDraftKey(context)
  const workspaceRef = context?.workspaceId ?? 'app'
  peopleProfileDrafts.set(draftKey, {
    appId: hrSoulAppManifest.id,
    authority: 'soul-app',
    id: draftKey,
    kind: 'people-profile',
    openAction: {
      id: 'create-people-profile',
      input: { workspaceId: context?.workspaceId ?? null },
    },
    sessionId: context?.sessionId ?? null,
    status: 'draft',
    summary: `HR app-owned people profile draft for workspace ${workspaceRef}.`,
    title: 'People profile draft',
    workspaceId: context?.workspaceId ?? null,
  })
  return { ok: true }
}

async function searchPeopleProfiles(request: Request, url: URL) {
  const query = url.searchParams.get('query') ?? ''
  const appOwnedItems = queryPeopleProfileDrafts(request, query)
  if (appOwnedItems.length) {
    return {
      items: appOwnedItems,
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
  }
}

function queryPeopleProfileDrafts(request: Request, query: string): PeopleProfileDraftDescriptor[] {
  const context = readMountContext(request)
  const normalizedQuery = query.trim().toLowerCase()
  return Array.from(peopleProfileDrafts.values()).filter((item) => {
    if (context?.workspaceId && item.workspaceId !== context.workspaceId)
      return false
    if (!normalizedQuery)
      return true
    return [item.id, item.kind, item.summary, item.title].some(value => value.toLowerCase().includes(normalizedQuery))
  })
}

function peopleProfileDraftKey(context: MountContext | null): string {
  return `drafts/people-profile/${context?.workspaceId ?? 'app'}`
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
