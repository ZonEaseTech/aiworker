import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'

import { QaReleaseWidgetProof } from '../../product/web/widgets/release-widget'
import { qaSoulAppManifest } from '../index'
import { renderSoulAppStyleLink, serveSoulAppStyle } from '../web-style'

export function renderStandaloneHtml(): string {
  const appMarkup = renderToStaticMarkup(QaReleaseWidgetProof({
    badgeLabel: 'Standalone',
    description: qaSoulAppManifest.soul.domain,
    detail: qaSoulAppManifest.description,
  }))
  return [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><title>AIWorker QA</title>${renderSoulAppStyleLink()}</head>`,
    `<body data-soul-app-id="${qaSoulAppManifest.id}">`,
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
          appId: qaSoulAppManifest.id,
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
  process.stdout.write(`${JSON.stringify({ appId: qaSoulAppManifest.id, mode: 'standalone', url: `http://${server.hostname}:${server.port}` })}\n`)
}
