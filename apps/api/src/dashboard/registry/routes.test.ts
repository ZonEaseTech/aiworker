import type { WorkerApiToken } from '@aiworker/shared'
import type { RegistrySupervisor } from './routes'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeFleetDb, initFleetDb, runFleetMigrations } from '@aiworker/storage-sqlite/fleet'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { LaunchFailedError, LaunchTimeoutError } from '../supervisor/errors'
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
    runFleetMigrations()
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
    runFleetMigrations()
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

describe('registry/routes POST /launch-local', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-routes-launch-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function makeSupervisor(impl?: Partial<RegistrySupervisor>): RegistrySupervisor {
    return {
      launchLocal: impl?.launchLocal ?? (async () => ({
        workerId: 'w_abc456def789',
        baseUrl: 'http://aiworker-deadbeef:3001',
        apiToken: 'wtk_launched_token_0000000000000000000000000' as WorkerApiToken,
        containerId: 'container-id-abc',
        containerName: 'aiworker-deadbeef',
      })),
    }
  }

  function postLaunch(routes: ReturnType<typeof buildRegistryRoutes>, body: unknown) {
    return routes.fetch(new Request('http://registry.test/launch-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
  }

  it('is not mounted when canLaunch=false (returns 404)', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await postLaunch(routes, { displayName: 'Alpha' })
    expect(res.status).toBe(404)
  })

  it('is not mounted when canLaunch=true but supervisor is null', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY, canLaunch: true, supervisor: null })
    const res = await postLaunch(routes, { displayName: 'Alpha' })
    expect(res.status).toBe(404)
  })

  it('returns 201 with a sanitised row and one-time apiToken on success', async () => {
    // The supervisor stub returns a fixed (workerId, apiToken). registerWorker
    // calls the worker's /info endpoint with that token, so we also need to
    // intercept that fetch.
    globalThis.fetch = (async () => new Response(JSON.stringify({
      workerId: 'w_abc456def789',
      configVersion: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      canLaunch: true,
      supervisor: makeSupervisor(),
    })
    const res = await postLaunch(routes, { displayName: 'Alpha' })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBe('w_abc456def789')
    expect(body.displayName).toBe('Alpha')
    expect(body.addedBy).toBe('launch-local')
    expect(body.apiTokenEnc).toBeUndefined()
    // PLAN-010 §P6: one-time plaintext bearer surfaced back to the UI.
    expect(body.apiToken).toBe('wtk_launched_token_0000000000000000000000000')
  })

  it('returns 400 when the payload is invalid', async () => {
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      canLaunch: true,
      supervisor: makeSupervisor(),
    })
    const res = await postLaunch(routes, { displayName: '' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-body')
  })

  it('maps supervisor LaunchFailedError to 500 launch-failed', async () => {
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      canLaunch: true,
      supervisor: makeSupervisor({
        launchLocal: async () => {
          throw new LaunchFailedError('docker ping failed')
        },
      }),
    })
    const res = await postLaunch(routes, { displayName: 'Alpha' })
    expect(res.status).toBe(500)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('launch-failed')
  })

  it('maps supervisor LaunchTimeoutError to 504 launch-timeout', async () => {
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      canLaunch: true,
      supervisor: makeSupervisor({
        launchLocal: async () => {
          throw new LaunchTimeoutError('no bootstrap token after 30000ms')
        },
      }),
    })
    const res = await postLaunch(routes, { displayName: 'Alpha' })
    expect(res.status).toBe(504)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('launch-timeout')
  })
})

describe('registry/routes GET /capabilities (PLAN-010 §P2)', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-routes-caps-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('reports canLaunch=false when launch is disabled', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    const res = await routes.fetch(new Request('http://registry.test/capabilities'))
    expect(res.status).toBe(200)
    const body = await res.json() as { canLaunch: boolean, maxWorkers: number | null, currentWorkers: number }
    expect(body.canLaunch).toBe(false)
    expect(body.maxWorkers).toBeNull()
    expect(body.currentWorkers).toBe(0)
  })

  it('reports canLaunch=true + maxWorkers when both flags are on', async () => {
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      canLaunch: true,
      supervisor: { launchLocal: async () => { throw new Error('never called') } },
      maxWorkers: 5,
    })
    const res = await routes.fetch(new Request('http://registry.test/capabilities'))
    expect(res.status).toBe(200)
    const body = await res.json() as { canLaunch: boolean, maxWorkers: number | null, currentWorkers: number }
    expect(body.canLaunch).toBe(true)
    expect(body.maxWorkers).toBe(5)
    expect(body.currentWorkers).toBe(0)
  })

  it('currentWorkers tracks the registered_workers row count', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ ...DEFAULT_INFO, workerId: 'w_111111111111' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch

    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY, maxWorkers: 3 })
    await postRegister(routes, {
      baseUrl: 'https://w1.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'One',
    })
    const res = await routes.fetch(new Request('http://registry.test/capabilities'))
    const body = await res.json() as { currentWorkers: number, maxWorkers: number | null }
    expect(body.currentWorkers).toBe(1)
    expect(body.maxWorkers).toBe(3)
  })
})

describe('registry/routes quota enforcement (PLAN-010 §P3)', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-routes-quota-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockInfoFor(workerId: string) {
    globalThis.fetch = (async () => new Response(JSON.stringify({ ...DEFAULT_INFO, workerId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
  }

  it('POST /register allows up to maxWorkers rows then 409s', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY, maxWorkers: 2 })

    mockInfoFor('w_first_00000')
    const first = await postRegister(routes, {
      baseUrl: 'https://a.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'A',
    })
    expect(first.status).toBe(201)

    mockInfoFor('w_second_0000')
    const second = await postRegister(routes, {
      baseUrl: 'https://b.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'B',
    })
    expect(second.status).toBe(201)

    mockInfoFor('w_third_00000')
    const third = await postRegister(routes, {
      baseUrl: 'https://c.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'C',
    })
    expect(third.status).toBe(409)
    const body = await third.json() as { error: { code: string, limit: number, current: number } }
    expect(body.error.code).toBe('quota-exceeded')
    expect(body.error.limit).toBe(2)
    expect(body.error.current).toBe(2)
  })

  it('POST /launch-local is blocked by quota before the supervisor is called', async () => {
    let launchCalls = 0
    const supervisor: RegistrySupervisor = {
      launchLocal: async () => {
        launchCalls += 1
        return {
          workerId: 'w_launched_000',
          baseUrl: 'http://aiworker-x:3001',
          apiToken: 'wtk_launched_token_0000000000000000000000000' as WorkerApiToken,
          containerId: 'c-x',
          containerName: 'aiworker-x',
        }
      },
    }

    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      canLaunch: true,
      supervisor,
      maxWorkers: 1,
    })

    // Seed one worker via /register so launch-local is already at quota.
    mockInfoFor('w_seed_000000')
    const seed = await postRegister(routes, {
      baseUrl: 'https://seed.example.com',
      apiToken: 'wtk_plain_token_0000000000000000000000000',
      displayName: 'Seed',
    })
    expect(seed.status).toBe(201)

    const res = await routes.fetch(new Request('http://registry.test/launch-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Over' }),
    }))
    expect(res.status).toBe(409)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('quota-exceeded')
    expect(launchCalls).toBe(0)
  })

  it('no cap when maxWorkers is omitted', async () => {
    const routes = buildRegistryRoutes({ masterKeyHex: MASTER_KEY })
    for (let i = 0; i < 5; i++) {
      mockInfoFor(`w_loop${String(i).padStart(7, '0')}`)
      const res = await postRegister(routes, {
        baseUrl: `https://w${i}.example.com`,
        apiToken: 'wtk_plain_token_0000000000000000000000000',
        displayName: `N${i}`,
      })
      expect(res.status).toBe(201)
    }
  })
})
