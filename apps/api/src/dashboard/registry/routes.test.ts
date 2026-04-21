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
