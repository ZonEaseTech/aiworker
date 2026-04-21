import type { WorkerInfo } from '@aiworker/shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import { closeFleetDb, getFleetDb, initFleetDb, runFleetMigrations } from '../../db/fleet'
import { auditEvents, registeredWorkers } from '../../db/fleet/schema'
import { WorkerClientAuthError, WorkerClientInvalidResponseError, WorkerClientNetworkError } from './client'
import { decryptToken } from './crypto'
import { buildRegistryRoutes } from './routes'
import { getById, registerWorker, RegistryNotFoundError, rotateRegisteredWorkerToken } from './service'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const ORIGINAL_TOKEN = 'wtk_original_0000000000000000000000000000'
const NEW_TOKEN = 'wtk_rotated_aaaa11112222333344445555666677778888'

function makeInfo(overrides: Partial<WorkerInfo> = {}): WorkerInfo {
  return {
    workerId: 'w_abcdef123456',
    runtimeVersion: '0.2.0',
    configVersion: 3,
    brains: [],
    executor: { type: 'http', status: 'healthy' },
    channels: [],
    evolutionEnabled: false,
    startedAt: '2026-04-21T00:00:00.000Z',
    ...overrides,
  }
}

function stubInfoClient(info: WorkerInfo) {
  return () => ({ info: async () => info })
}

async function seed(): Promise<void> {
  await registerWorker(
    {
      baseUrl: 'https://worker.example.com',
      apiToken: ORIGINAL_TOKEN,
      displayName: 'Alpha',
    },
    { masterKeyHex: MASTER_KEY, buildClient: stubInfoClient(makeInfo()) },
  )
}

describe('rotateRegisteredWorkerToken', () => {
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-rotate-token-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  it('updates apiTokenEnc + emits audit + returns lastFour without leaking plaintext', async () => {
    await seed()

    const result = await rotateRegisteredWorkerToken('w_abcdef123456', {
      masterKeyHex: MASTER_KEY,
      buildClient: () => ({ rotateToken: async () => ({ newToken: NEW_TOKEN as never }) }),
    })

    expect(result.lastFourOfNewToken).toBe(NEW_TOKEN.slice(-4))
    expect(typeof result.rotatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(result.rotatedAt))).toBe(false)
    // The plaintext must not surface anywhere on the wrapper response.
    expect(JSON.stringify(result)).not.toContain(NEW_TOKEN)

    const row = getById('w_abcdef123456')!
    const decrypted = decryptToken(row.apiTokenEnc, row.nonce, row.authTag, MASTER_KEY)
    expect(decrypted).toBe(NEW_TOKEN)

    const audits = getFleetDb().select().from(auditEvents).all()
    const rotation = audits.find(a => a.action === 'worker.token-rotated')
    expect(rotation).toBeDefined()
    expect(rotation!.workerId).toBe('w_abcdef123456')
    expect(rotation!.detail).toEqual({
      rotatedAt: result.rotatedAt,
      lastFourOfNewToken: result.lastFourOfNewToken,
    })
  })

  it('forwards the registered (decrypted) bearer to the worker client', async () => {
    await seed()
    const observed: { token: string | null } = { token: null }
    await rotateRegisteredWorkerToken('w_abcdef123456', {
      masterKeyHex: MASTER_KEY,
      buildClient: (_baseUrl, apiToken) => {
        observed.token = apiToken
        return { rotateToken: async () => ({ newToken: NEW_TOKEN as never }) }
      },
    })
    expect(observed.token).toBe(ORIGINAL_TOKEN)
  })

  it('throws RegistryNotFoundError for unknown id', async () => {
    await expect(rotateRegisteredWorkerToken('w_missing', {
      masterKeyHex: MASTER_KEY,
      buildClient: () => ({ rotateToken: async () => ({ newToken: NEW_TOKEN as never }) }),
    })).rejects.toBeInstanceOf(RegistryNotFoundError)
  })

  it('does NOT mutate apiTokenEnc when the worker call fails', async () => {
    await seed()
    const before = getById('w_abcdef123456')!
    await expect(rotateRegisteredWorkerToken('w_abcdef123456', {
      masterKeyHex: MASTER_KEY,
      buildClient: () => ({
        rotateToken: async () => {
          throw new WorkerClientNetworkError('boom')
        },
      }),
    })).rejects.toBeInstanceOf(WorkerClientNetworkError)

    const after = getById('w_abcdef123456')!
    expect(after.apiTokenEnc).toBe(before.apiTokenEnc)
    expect(after.nonce).toBe(before.nonce)
    expect(after.authTag).toBe(before.authTag)

    const audits = getFleetDb().select().from(auditEvents).all()
    expect(audits.find(a => a.action === 'worker.token-rotated')).toBeUndefined()
  })
})

describe('registry/routes POST /:id/rotate-token', () => {
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-rotate-route-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  afterEach(() => {
    // No global fetch mocking here — every test uses buildRotateClient.
  })

  it('returns 200 + lastFour + persists the new token (no plaintext in body)', async () => {
    await seed()
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      buildRotateClient: () => ({ rotateToken: async () => ({ newToken: NEW_TOKEN as never }) }),
    })

    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/rotate-token', {
      method: 'POST',
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.lastFourOfNewToken).toBe(NEW_TOKEN.slice(-4))
    expect(typeof body.rotatedAt).toBe('string')
    expect(JSON.stringify(body)).not.toContain(NEW_TOKEN)

    const stored = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, 'w_abcdef123456'))
      .get()!
    const decrypted = decryptToken(stored.apiTokenEnc, stored.nonce, stored.authTag, MASTER_KEY)
    expect(decrypted).toBe(NEW_TOKEN)
  })

  it('returns 404 when the registry id is unknown', async () => {
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      buildRotateClient: () => ({ rotateToken: async () => ({ newToken: NEW_TOKEN as never }) }),
    })
    const res = await routes.fetch(new Request('http://registry.test/w_missing/rotate-token', {
      method: 'POST',
    }))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not-found')
  })

  it('returns 401 when the worker rejects the bearer', async () => {
    await seed()
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      buildRotateClient: () => ({
        rotateToken: async () => {
          throw new WorkerClientAuthError()
        },
      }),
    })
    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/rotate-token', {
      method: 'POST',
    }))
    expect(res.status).toBe(401)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('auth-failed')
  })

  it('returns 502 worker-unreachable on a network failure', async () => {
    await seed()
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      buildRotateClient: () => ({
        rotateToken: async () => {
          throw new WorkerClientNetworkError('timed out')
        },
      }),
    })
    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/rotate-token', {
      method: 'POST',
    }))
    expect(res.status).toBe(502)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('worker-unreachable')
  })

  it('returns 502 invalid-rotate-response when the worker returns a malformed token', async () => {
    await seed()
    const routes = buildRegistryRoutes({
      masterKeyHex: MASTER_KEY,
      buildRotateClient: () => ({
        rotateToken: async () => {
          throw new WorkerClientInvalidResponseError('missing newToken')
        },
      }),
    })
    const res = await routes.fetch(new Request('http://registry.test/w_abcdef123456/rotate-token', {
      method: 'POST',
    }))
    expect(res.status).toBe(502)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-rotate-response')
  })
})
