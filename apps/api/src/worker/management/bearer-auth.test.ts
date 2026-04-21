import { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'bun:test'

import { buildBearerAuth } from './bearer-auth'

function buildApp(token: string) {
  const app = new OpenAPIHono()
  app.use('*', buildBearerAuth({ getIdentity: () => ({ tokenPlaintext: token }) }))
  app.get('/guarded', c => c.json({ ok: true }))
  return app
}

describe('buildBearerAuth', () => {
  it('allows a request carrying the correct Bearer token', async () => {
    const app = buildApp('wtk_correct_token_value_0000000000000000000000')
    const res = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: 'Bearer wtk_correct_token_value_0000000000000000000000' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('rejects a request with no Authorization header (401 auth-failed)', async () => {
    const app = buildApp('wtk_token_abc')
    const res = await app.fetch(new Request('http://w/guarded'))
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('auth-failed')
  })

  it('rejects a request with a non-Bearer scheme', async () => {
    const app = buildApp('wtk_token_abc')
    const res = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    }))
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('auth-failed')
  })

  it('rejects a request with the wrong token', async () => {
    const app = buildApp('wtk_correct_token_value_0000000000000000000000')
    const res = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: 'Bearer wtk_wrong_token_value_xxxxxxxxxxxxxxxxxxxxxxx' },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects a request with empty credential after Bearer', async () => {
    const app = buildApp('wtk_token_abc')
    const res = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: 'Bearer ' },
    }))
    expect(res.status).toBe(401)
  })

  it('picks up a rotated token on the next call', async () => {
    let token = 'wtk_first_value_0000000000000000000000000000'
    const app = new OpenAPIHono()
    app.use('*', buildBearerAuth({ getIdentity: () => ({ tokenPlaintext: token }) }))
    app.get('/guarded', c => c.json({ ok: true }))
    const firstRes = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(firstRes.status).toBe(200)

    token = 'wtk_second_value_000000000000000000000000000'
    const staleRes = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: 'Bearer wtk_first_value_0000000000000000000000000000' },
    }))
    expect(staleRes.status).toBe(401)

    const freshRes = await app.fetch(new Request('http://w/guarded', {
      headers: { Authorization: `Bearer ${token}` },
    }))
    expect(freshRes.status).toBe(200)
  })
})
