import process from 'node:process'

import { hrSoulAppManifest } from './index'

export function renderStandaloneHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>AIWorker HR</title></head>',
    `<body data-soul-app-id="${hrSoulAppManifest.id}">`,
    '<main>',
    `<h1>${hrSoulAppManifest.name}</h1>`,
    `<p>${hrSoulAppManifest.description}</p>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

export function serveStandalone(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    fetch(request) {
      const url = new URL(request.url)
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
