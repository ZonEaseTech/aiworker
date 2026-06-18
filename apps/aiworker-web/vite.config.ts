import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

type AdminServerModule = typeof import('./src/server')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), aiworkerAdminRuntimePlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep package-name vendor groups explicit so Vite/Rolldown or dependency changes are reviewed before entry chunk size can drift again.
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|react-router|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](?:radix-ui|@radix-ui|@phosphor-icons)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: ['20831--main--ben--ben.coder.tbc.5ok.co'],
  },
})

export function aiworkerAdminRuntimePlugin(): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!isAdminRuntimeCandidate(request)) {
          next()
          return
        }

        try {
          const { handleAdminRuntimeRequest } = await server.ssrLoadModule('/src/server.ts') as AdminServerModule
          const runtimeResponse = await handleAdminRuntimeRequest(await nodeRequestToWebRequest(request), process.env, {
            htmlNavigationGuard: true,
            staticBoundaryMethodGuard: true,
          })
          if (!runtimeResponse) {
            next()
            return
          }

          await writeWebResponseToNode(response, runtimeResponse, request.method)
        }
        catch (error) {
          next(error)
        }
      })
    },
    name: 'aiworker-admin-runtime',
  }
}

function isAdminRuntimeCandidate(request: IncomingMessage): boolean {
  const pathname = nodeRequestPathname(request)
  if (
    pathname === '/healthz'
    || pathname === '/login'
    || pathname === '/callback'
    || pathname === '/logout'
    || pathname.startsWith('/api/')
  ) {
    return true
  }

  if (request.method !== 'GET' && request.method !== 'HEAD')
    return true

  return isHtmlNavigationRequest(request, pathname)
}

function isHtmlNavigationRequest(request: IncomingMessage, pathname: string): boolean {
  const lastSegment = pathname.split('/').at(-1) ?? ''
  if (pathname.startsWith('/@') || lastSegment.includes('.'))
    return false
  const destination = headerValue(request.headers, 'sec-fetch-dest')
  if (destination === 'document')
    return true
  const accept = headerValue(request.headers, 'accept')
  return Boolean(accept?.includes('text/html'))
}

async function nodeRequestToWebRequest(request: IncomingMessage): Promise<Request> {
  const method = request.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readNodeRequestBody(request)
  return new Request(nodeRequestUrl(request), {
    body,
    headers: nodeRequestHeaders(request.headers),
    method,
  })
}

function nodeRequestHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined)
      continue
    if (Array.isArray(value)) {
      for (const item of value)
        result.append(key, item)
      continue
    }
    result.set(key, value)
  }
  return result
}

function nodeRequestPathname(request: IncomingMessage): string {
  return new URL(request.url ?? '/', requestOrigin(request)).pathname
}

function nodeRequestUrl(request: IncomingMessage): string {
  return new URL(request.url ?? '/', requestOrigin(request)).toString()
}

function requestOrigin(request: IncomingMessage): string {
  const host = headerValue(request.headers, 'host') || '127.0.0.1'
  const forwardedProto = headerValue(request.headers, 'x-forwarded-proto')
  const protocol = forwardedProto?.split(',')[0]?.trim() === 'https' ? 'https' : 'http'
  return `${protocol}://${host}`
}

function headerValue(headers: IncomingHttpHeaders, key: string): string | undefined {
  const value = headers[key]
  return Array.isArray(value) ? value[0] : value
}

async function readNodeRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of request)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  if (chunks.length === 0)
    return undefined
  return Buffer.concat(chunks).toString('utf8')
}

async function writeWebResponseToNode(response: ServerResponse, webResponse: Response, method: string | undefined): Promise<void> {
  response.statusCode = webResponse.status
  response.statusMessage = webResponse.statusText
  webResponse.headers.forEach((value, key) => response.setHeader(key, value))
  if (method === 'HEAD' || !webResponse.body) {
    response.end()
    return
  }

  response.end(Buffer.from(await webResponse.arrayBuffer()))
}
