import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'

import { HrHomeRouteSurface } from '../../product/web/routes/hr-route'
import { hrSoulAppManifest } from '../index'
import { renderSoulAppClientScript, renderSoulAppStyleLink, serveSoulAppWebAsset } from '../web-style'

export function renderStandaloneHtml(): string {
  const appMarkup = renderToStaticMarkup(HrHomeRouteSurface({
    badgeLabel: 'Standalone',
    description: hrSoulAppManifest.description,
  }))
  return [
    '<!doctype html>',
    '<html lang="en" class="h-full">',
    `<head><meta charset="utf-8"><title>AIWorker HR</title>${renderSoulAppStyleLink()}</head>`,
    `<body class="h-full overflow-hidden" data-soul-app-id="${hrSoulAppManifest.id}">`,
    '<main id="aiworker-hr-root" class="h-full min-h-0">',
    appMarkup,
    '</main>',
    '<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">{"appId":"aiworker-hr","routePrefix":"standalone://aiworker-hr"}</script>',
    renderSoulAppClientScript('/assets/hr-home-client.js'),
    '</body>',
    '</html>',
  ].join('')
}

export function serveStandalone(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const assetResponse = await serveSoulAppWebAsset(url)
      if (assetResponse)
        return assetResponse
      if (url.pathname === '/health') {
        return Response.json({
          appId: hrSoulAppManifest.id,
          mode: 'standalone',
          status: 'ok',
        })
      }
      return new Response(renderStandaloneHtml(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveStandalone()
  process.stdout.write(`${JSON.stringify({ appId: hrSoulAppManifest.id, mode: 'standalone', url: `http://${server.hostname}:${server.port}` })}\n`)
}
