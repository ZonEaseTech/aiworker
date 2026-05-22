import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'

import { CustomWidgetProof } from '../../product/web/widgets/custom-widget'
import { customSoulAppManifest } from '../index'
import { renderSoulAppStyleLink, serveSoulAppStyle } from '../web-style'

export function renderStandaloneHtml(): string {
  const appMarkup = renderToStaticMarkup(CustomWidgetProof({
    badgeLabel: 'Standalone',
    description: customSoulAppManifest.soul.domain,
    detail: customSoulAppManifest.description,
  }))
  return [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><title>AIWorker Custom</title>${renderSoulAppStyleLink()}</head>`,
    `<body data-soul-app-id="${customSoulAppManifest.id}">`,
    '<main>',
    appMarkup,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

export function serveStandalone(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const styleResponse = await serveSoulAppStyle(url)
      if (styleResponse)
        return styleResponse
      if (url.pathname === '/health') {
        return Response.json({
          appId: customSoulAppManifest.id,
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
  process.stdout.write(`${JSON.stringify({ appId: customSoulAppManifest.id, mode: 'standalone', url: `http://${server.hostname}:${server.port}` })}\n`)
}
