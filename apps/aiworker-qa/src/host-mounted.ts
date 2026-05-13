import process from 'node:process'

import { createSoulAppClient } from '@zonease/aiworker-soul-app-sdk'

import { qaReferenceSoulApp, qaSoulAppManifest } from './index'

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
      if (url.pathname === '/domain') {
        return Response.json({
          appId: qaSoulAppManifest.id,
          capabilities: qaSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: qaSoulAppManifest.soul.id,
          workspaceTypes: qaSoulAppManifest.workspaceTypes.map(type => type.id),
        })
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
