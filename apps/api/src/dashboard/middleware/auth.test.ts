import { Buffer } from 'node:buffer'
import { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'bun:test'

import { buildDashboardAuth } from './auth'

const SECRET = 'dashboard-shared-secret-1234567890'

function buildApp(secret: string = SECRET) {
  const app = new OpenAPIHono()
  app.use('*', buildDashboardAuth({ secret }))
  app.get('/guarded', c => c.json({ ok: true }))
  return app
}

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`
}

describe('buildDashboardAuth', () => {
  it('allows Bearer with the correct secret', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }))
    expect(res.status).toBe(200)
  })

  it('rejects Bearer with a wrong secret', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: 'Bearer not-the-secret' },
    }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('auth-required')
  })

  it('allows Basic with the correct password (username ignored)', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: basic('admin', SECRET) },
    }))
    expect(res.status).toBe(200)
  })

  it('allows Basic with an empty username so browsers can omit it', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: basic('', SECRET) },
    }))
    expect(res.status).toBe(200)
  })

  it('rejects Basic with a wrong password', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: basic('admin', 'wrong') },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects Basic whose body is not base64', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: 'Basic !!!not_base64!!!' },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects Basic with a missing colon separator', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: `Basic ${Buffer.from('no-colon-here', 'utf8').toString('base64')}` },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects a missing Authorization header with WWW-Authenticate: Basic', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded'))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic /)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('auth-required')
  })

  it('rejects an unknown scheme', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: 'Digest qop="auth"' },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects an empty Bearer credential', async () => {
    const res = await buildApp().fetch(new Request('http://d/guarded', {
      headers: { Authorization: 'Bearer ' },
    }))
    expect(res.status).toBe(401)
  })

  it('throws when constructed without a secret', () => {
    expect(() => buildDashboardAuth({ secret: '' })).toThrow()
  })
})
