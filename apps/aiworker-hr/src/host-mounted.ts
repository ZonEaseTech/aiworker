import process from 'node:process'

import { createSoulAppClient } from '@zonease/aiworker-soul-app-sdk'

import { hrReferenceSoulApp, hrSoulAppManifest } from './index'

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
      if (url.pathname === '/domain') {
        return Response.json({
          appId: hrSoulAppManifest.id,
          capabilities: hrSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: hrSoulAppManifest.soul.id,
          workspaceTypes: hrSoulAppManifest.workspaceTypes.map(type => type.id),
        })
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
