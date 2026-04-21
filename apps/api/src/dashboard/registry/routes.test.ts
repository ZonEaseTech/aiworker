import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { closeFleetDb, initFleetDb, runFleetMigrations } from '../../db/fleet'
import { buildRegistryRoutes } from './routes'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

const DEFAULT_INFO = {
  workerId: 'w_abcdef123456',
  runtimeVersion: '0.2.0',
  configVersion: 3,
  brains: [],
  executor: { type: 'http', status: 'healthy' },
  channels: [],
  evolutionEnabled: false,
  startedAt: '2026-04-21T00:00:00.000Z',
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function postRegister(routes: ReturnType<typeof buildRegistryRoutes>, body: unknown) {
  return routes.fetch(new Request('http://registry.test/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('registry/routes POST /register', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-routes-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      return impl(url, init ?? undefined)
    }) as typeof fetch
  }

  it('returns 201 and a sanitised body on happy path', async () => {
    mockFetch(() => okJson(DEFAULT_INFO))
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await postRegister(routes, {
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Alpha',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBe('w_abcdef123456')
    expect(body.baseUrl).toBe('https://worker.example.com')
    expect(body.displayName).toBe('Alpha')
    expect(body.lastSeenState).toBe('online')
    expect(body.lastConfigVersion).toBe(3)
    expect(body.addedBy).toBe('manual')
    // Encrypted columns must never leave the manager.
    expect(body.apiTokenEnc).toBeUndefined()
    expect(body.nonce).toBeUndefined()
    expect(body.authTag).toBeUndefined()
  })

  it('returns 409 when the worker id is already registered', async () => {
    mockFetch(() => okJson(DEFAULT_INFO))
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const first = await postRegister(routes, {
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Alpha',
    })
    expect(first.status).toBe(201)

    const second = await postRegister(routes, {
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Alpha v2',
    })
    expect(second.status).toBe(409)
    const body = await second.json() as { error: { code: string, workerId: string } }
    expect(body.error.code).toBe('already-registered')
    expect(body.error.workerId).toBe('w_abcdef123456')
  })

  it('returns 400 on malformed body', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await postRegister(routes, { baseUrl: 'not-a-url', apiToken: 'nope', displayName: '' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-body')
  })

  it('returns 401 when the worker rejects the bearer token', async () => {
    mockFetch(() => new Response('nope', { status: 401 }))
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await postRegister(routes, {
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Alpha',
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('auth-failed')
  })

  it('returns 502 when the worker is unreachable', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed: ECONNREFUSED')
    })
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await postRegister(routes, {
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Alpha',
    })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('worker-unreachable')
  })

  it('returns 502 when /info is malformed', async () => {
    mockFetch(() => okJson({ configVersion: 1 /* missing workerId */ }))
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await postRegister(routes, {
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Alpha',
    })
    expect(res.status).toBe(502)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-worker-info')
  })
})

describe('registry/routes CRUD + proxy', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-routes-crud-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      return impl(url, init ?? undefined)
    }) as typeof fetch
  }

  async function seedWorker(
    routes: ReturnType<typeof buildRegistryRoutes>,
    overrides: Partial<{ workerId: string, baseUrl: string, displayName: string }> = {},
  ) {
    const info = { ...DEFAULT_INFO, workerId: overrides.workerId ?? DEFAULT_INFO.workerId }
    mockFetch(() => okJson(info))
    const res = await postRegister(routes, {
      baseUrl: overrides.baseUrl ?? 'https://worker.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: overrides.displayName ?? 'Alpha',
    })
    expect(res.status).toBe(201)
  }

  it('GET / returns the registered workers list stripped of ciphertext columns', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes, { workerId: 'w_111111111111', displayName: 'Alpha' })
    await seedWorker(routes, { workerId: 'w_222222222222', displayName: 'Beta' })

    const res = await routes.fetch(new Request('http://registry.test/'))
    expect(res.status).toBe(200)
    const body = await res.json() as { workers: Array<Record<string, unknown>> }
    expect(body.workers).toHaveLength(2)
    for (const w of body.workers) {
      expect(w).not.toHaveProperty('apiTokenEnc')
      expect(w).not.toHaveProperty('nonce')
      expect(w).not.toHaveProperty('authTag')
    }
  })

  it('GET /:id returns the row or 404', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    const ok = await routes.fetch(new Request('http://registry.test/w_abcdef123456'))
    expect(ok.status).toBe(200)
    const row = await ok.json() as Record<string, unknown>
    expect(row.id).toBe('w_abcdef123456')
    expect(row).not.toHaveProperty('apiTokenEnc')

    const missing = await routes.fetch(new Request('http://registry.test/w_zzzzzzzzzzzz'))
    expect(missing.status).toBe(404)
  })

  it('PATCH /:id updates displayName + baseUrl', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alpha Prime', baseUrl: 'https://moved.example.com' }),
    }))
    expect(res.status).toBe(200)
    const row = await res.json() as Record<string, unknown>
    expect(row.displayName).toBe('Alpha Prime')
    expect(row.baseUrl).toBe('https://moved.example.com')
  })

  it('PATCH /:id rejects an empty patch', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })

  it('PATCH /:id returns 404 when the id is unknown', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await routes.fetch(new Request('http://registry.test/w_zzzzzzzzzzzz', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Nope' }),
    }))
    expect(res.status).toBe(404)
  })

  it('DELETE /:id returns 204 on success and 404 otherwise', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    const ok = await routes.fetch(new Request('http://registry.test/w_abcdef123456', {
      method: 'DELETE',
    }))
    expect(ok.status).toBe(204)

    const again = await routes.fetch(new Request('http://registry.test/w_abcdef123456', {
      method: 'DELETE',
    }))
    expect(again.status).toBe(404)
  })

  it('ALL /:id/proxy/worker/* forwards with Bearer + returns verbatim response', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    const calls: Array<{ url: string, init?: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      calls.push({ url, init })
      return new Response(JSON.stringify({ workerId: 'w_abcdef123456', ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Custom': 'keep' },
      })
    }) as typeof fetch

    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/proxy/worker/info', {
      method: 'GET',
      headers: { 'X-Request-Id': 'req-1' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ workerId: 'w_abcdef123456', ok: true })
    expect(res.headers.get('x-custom')).toBe('keep')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://worker.example.com/api/worker/info')
    const headers = new Headers(calls[0]!.init?.headers)
    // Bearer is injected by WorkerClient — the manager's upstream Authorization is stripped.
    expect(headers.get('authorization')).toBe('Bearer wtk_plain_token_0000000000000000000000000')
    expect(headers.get('x-request-id')).toBe('req-1')
  })

  it('ALL /:id/proxy/worker/* forwards non-GET JSON bodies verbatim', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    const calls: Array<{ url: string, init?: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      calls.push({ url, init })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/proxy/worker/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '7' },
      body: JSON.stringify({ runtimeVersion: '0.3.0' }),
    }))
    expect(res.status).toBe(200)
    expect(calls[0]!.url).toBe('https://worker.example.com/api/worker/config')
    expect(calls[0]!.init?.method).toBe('PUT')
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ runtimeVersion: '0.3.0' }))
    const headers = new Headers(calls[0]!.init?.headers)
    expect(headers.get('if-match')).toBe('7')
  })

  it('ALL /:id/proxy/worker/* passes 401 through verbatim', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    await seedWorker(routes)

    mockFetch(() => new Response(JSON.stringify({ error: 'nope' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }))

    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/proxy/worker/info', {
      method: 'GET',
    }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('nope')
  })

  it('ALL /:id/proxy/worker/* returns 404 when the registry id is unknown', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await routes.fetch(new Request('http://registry.test/w_missing/proxy/worker/info'))
    expect(res.status).toBe(404)
  })
})
