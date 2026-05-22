import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'

import { CustomWidgetProof } from '../../product/web/widgets/custom-widget'
import { customSoulAppManifest } from '../index'
import { renderSoulAppStyleLink, serveSoulAppStyle } from '../web-style'

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const styleResponse = await serveSoulAppStyle(url)
      if (styleResponse)
        return styleResponse
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
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown Custom app route: ${url.pathname}` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(`${JSON.stringify({ appId: customSoulAppManifest.id, mode: 'host-mounted', url: `http://${server.hostname}:${server.port}` })}\n`)
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
