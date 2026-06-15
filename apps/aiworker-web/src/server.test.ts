import { describe, expect, test } from 'bun:test'

import { contentType, createServer, resolveStaticPath, staticRoot } from '@/server'

describe('Bun static server helpers', () => {
  test('serves from the Vite dist directory by default', () => {
    expect(staticRoot()).toEndWith('/dist')
  })

  test('keeps SPA fallback paths inside the static root', () => {
    expect(resolveStaticPath('/')).toBe(`${staticRoot()}/index.html`)
    expect(resolveStaticPath('/admin/../assets/app.js')).toBe(`${staticRoot()}/assets/app.js`)
    expect(resolveStaticPath('/../../etc/passwd')).toBe(`${staticRoot()}/etc/passwd`)
  })

  test('rejects malformed encoded paths before static resolution', () => {
    expect(resolveStaticPath('/%E0%A4%A')).toBeNull()
  })

  test('rejects state-changing methods at the static boundary', async () => {
    const server = createServer({ port: 0 })

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/assignments`, {
        method: 'POST',
      })

      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET, HEAD')
      expect(response.headers.get('x-aiworker-boundary')).toBe('admin-control-plane-only')
    }
    finally {
      server.stop(true)
    }
  })

  test('maps production asset content types', () => {
    expect(contentType('index.html')).toBe('text/html; charset=utf-8')
    expect(contentType('assets/app.css')).toBe('text/css; charset=utf-8')
    expect(contentType('assets/app.woff2')).toBe('font/woff2')
  })
})
