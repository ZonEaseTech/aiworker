import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import process from 'node:process'

const root = process.env.AIWORKER_WEB_DIST ?? join(process.cwd(), 'dist')
const port = Number(process.env.PORT ?? 5273)

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

export function staticRoot() {
  return root
}

export function contentType(pathname: string) {
  const dot = pathname.lastIndexOf('.')
  return dot >= 0 ? (contentTypes[pathname.slice(dot)] ?? 'application/octet-stream') : 'application/octet-stream'
}

export function resolveStaticPath(urlPathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPathname)
  }
  catch (error) {
    if (error instanceof URIError) {
      return null
    }

    throw error
  }

  const cleaned = normalize(decoded).replace(/^([/\\]*\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  return join(root, cleaned === '' ? 'index.html' : cleaned)
}

export function createServer(options: { port?: number } = {}) {
  return Bun.serve({
    port: options.port ?? port,
    fetch(request: Request) {
      const url = new URL(request.url)

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            'allow': 'GET, HEAD',
            'x-aiworker-boundary': 'admin-control-plane-only',
          },
        })
      }

      if (url.pathname === '/healthz') {
        return Response.json({ ok: true, surface: 'aiworker-web', runtime: 'bun' })
      }

      let filePath = resolveStaticPath(url.pathname)
      if (filePath === null) {
        return new Response('Bad Request', {
          status: 400,
          headers: {
            'x-aiworker-boundary': 'admin-control-plane-only',
          },
        })
      }

      if (!existsSync(filePath)) {
        filePath = join(root, 'index.html')
      }

      return new Response(Bun.file(filePath), {
        headers: {
          'content-type': contentType(filePath),
          'x-aiworker-boundary': 'admin-control-plane-only',
        },
      })
    },
  })
}

if (import.meta.main) {
  createServer()
  process.stdout.write(`aiworker-web listening on http://127.0.0.1:${port} root=${root}\n`)
}
