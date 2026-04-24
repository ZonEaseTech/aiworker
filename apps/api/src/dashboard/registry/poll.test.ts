import type { RegisteredWorker, WorkerInfo } from '@aiworker/shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { auditEvents, closeFleetDb, getFleetDb, initFleetDb, registeredWorkers, runFleetMigrations } from '@aiworker/storage-sqlite/fleet'

import { beforeEach, describe, expect, it } from 'bun:test'
import {
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from './client'
import { encryptToken } from './crypto'
import { WorkerPoller } from './poll'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const FIXED_NOW = '2026-04-21T12:00:00.000Z'

function seedWorker(id: string, baseUrl: string, apiToken: string, initialState?: RegisteredWorker['lastSeenState'], configVersion = 1): void {
  const sealed = encryptToken(apiToken, MASTER_KEY)
  getFleetDb().insert(registeredWorkers).values({
    id,
    baseUrl,
    displayName: id,
    apiTokenEnc: sealed.ciphertext,
    nonce: sealed.nonce,
    authTag: sealed.authTag,
    addedAt: '2026-04-20T00:00:00.000Z',
    addedBy: 'manual',
    lastSeenAt: '2026-04-20T00:00:00.000Z',
    lastSeenState: initialState,
    lastConfigVersion: configVersion,
  }).run()
}

function makeInfo(workerId: string, overrides: Partial<WorkerInfo> = {}): WorkerInfo {
  return {
    workerId,
    runtimeVersion: '0.2.0',
    configVersion: 7,
    brains: [],
    executor: { type: 'http', status: 'healthy' },
    channels: [],
    evolutionEnabled: false,
    startedAt: '2026-04-21T00:00:00.000Z',
    ...overrides,
  }
}

type StubBuilder = (baseUrl: string, _token: string) => { info: () => Promise<WorkerInfo> }

function buildStubFactory(responders: Record<string, () => Promise<WorkerInfo>>): StubBuilder {
  return (baseUrl) => {
    const responder = responders[baseUrl]
    if (!responder)
      throw new Error(`no stub responder for baseUrl ${baseUrl}`)
    return { info: responder }
  }
}

describe('registry/poll WorkerPoller', () => {
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-poll-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations()
  })

  it('pollOnce updates lastSeen fields per worker and audits only state transitions', async () => {
    // Three rows: two previously online (one stays online, one flips to
    // auth-failed), and one previously unknown that comes up offline.
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 1)
    seedWorker('w_beta00000001', 'https://beta.test', 'wtk_beta_0000000000000000000000000000', 'online', 1)
    seedWorker('w_gamma0000001', 'https://gamma.test', 'wtk_gamma_000000000000000000000000000', undefined, 1)

    const buildClient = buildStubFactory({
      'https://alpha.test': async () => makeInfo('w_alpha000001', { configVersion: 9 }),
      'https://beta.test': async () => { throw new WorkerClientAuthError() },
      'https://gamma.test': async () => { throw new WorkerClientNetworkError('ECONNREFUSED') },
    })

    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
      now: () => new Date(FIXED_NOW),
    })

    const results = await poller.pollOnce()
    expect(results).toHaveLength(3)
    const byId = new Map(results.map(r => [r.id, r]))
    expect(byId.get('w_alpha000001')).toEqual({ id: 'w_alpha000001', state: 'online', configVersion: 9 })
    expect(byId.get('w_beta00000001')).toEqual({ id: 'w_beta00000001', state: 'auth-failed' })
    expect(byId.get('w_gamma0000001')).toEqual({ id: 'w_gamma0000001', state: 'offline' })

    const db = getFleetDb()
    const rows = db.select().from(registeredWorkers).all().sort((a, b) => a.id.localeCompare(b.id))
    expect(rows).toHaveLength(3)
    expect(rows[0]!.id).toBe('w_alpha000001')
    expect(rows[0]!.lastSeenAt).toBe(FIXED_NOW)
    expect(rows[0]!.lastSeenState).toBe('online')
    expect(rows[0]!.lastConfigVersion).toBe(9)
    expect(rows[1]!.id).toBe('w_beta00000001')
    expect(rows[1]!.lastSeenAt).toBe(FIXED_NOW)
    expect(rows[1]!.lastSeenState).toBe('auth-failed')
    // Auth-failed leaves lastConfigVersion untouched.
    expect(rows[1]!.lastConfigVersion).toBe(1)
    expect(rows[2]!.id).toBe('w_gamma0000001')
    expect(rows[2]!.lastSeenState).toBe('offline')

    // State-change audits: alpha stayed online → no audit; beta + gamma flipped → 2 audits.
    const audits = db.select().from(auditEvents).all().filter(a => a.action === 'worker.state-changed')
    expect(audits).toHaveLength(2)
    const byWorker = new Map(audits.map(a => [a.workerId, a]))
    expect(byWorker.get('w_beta00000001')!.detail).toEqual({ from: 'online', to: 'auth-failed' })
    expect(byWorker.get('w_gamma0000001')!.detail).toEqual({ from: null, to: 'offline' })
  })

  it('flags config-version-mismatch when the worker reports a different id', async () => {
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 1)
    const buildClient = buildStubFactory({
      'https://alpha.test': async () => makeInfo('w_different00', { configVersion: 42 }),
    })
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
      now: () => new Date(FIXED_NOW),
    })
    const results = await poller.pollOnce()
    expect(results).toEqual([{ id: 'w_alpha000001', state: 'config-version-mismatch' }])

    const row = getFleetDb().select().from(registeredWorkers).all()[0]!
    expect(row.lastSeenState).toBe('config-version-mismatch')
    // The reported configVersion is NOT trusted when id doesn't match.
    expect(row.lastConfigVersion).toBe(1)

    const audits = getFleetDb().select().from(auditEvents).all().filter(a => a.action === 'worker.state-changed')
    expect(audits).toHaveLength(1)
    expect(audits[0]!.detail).toEqual({ from: 'online', to: 'config-version-mismatch' })
  })

  it('maps WorkerClientInvalidResponseError to offline', async () => {
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 1)
    const buildClient = buildStubFactory({
      'https://alpha.test': async () => { throw new WorkerClientInvalidResponseError('bad shape') },
    })
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
      now: () => new Date(FIXED_NOW),
    })
    const [result] = await poller.pollOnce()
    expect(result).toEqual({ id: 'w_alpha000001', state: 'offline' })
  })

  it('does not emit an audit row when state is unchanged across polls', async () => {
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 5)
    const buildClient = buildStubFactory({
      'https://alpha.test': async () => makeInfo('w_alpha000001', { configVersion: 5 }),
    })
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
      now: () => new Date(FIXED_NOW),
    })
    await poller.pollOnce()
    await poller.pollOnce()

    const audits = getFleetDb().select().from(auditEvents).all().filter(a => a.action === 'worker.state-changed')
    expect(audits).toHaveLength(0)
  })

  it('passes intervalMs / 2 as the per-call timeout to buildClient', async () => {
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 1)
    const seen: number[] = []
    const buildClient = (baseUrl: string, _token: string, timeoutMs: number) => {
      seen.push(timeoutMs)
      return { info: async () => makeInfo('w_alpha000001', { configVersion: 1 }) }
    }
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
    })
    await poller.pollOnce()
    expect(seen).toEqual([15_000])
  })

  it('start() installs a timer that fires pollOnce and stop() cancels it', async () => {
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 1)
    let callCount = 0
    const buildClient = buildStubFactory({
      'https://alpha.test': async () => {
        callCount++
        return makeInfo('w_alpha000001', { configVersion: callCount })
      },
    })
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      // Minimum allowed; keeps the suite fast while still exercising setInterval.
      intervalMs: 50,
      jitterMs: 0,
      buildClient,
    })
    poller.start()
    // Give the interval time to fire at least once.
    await new Promise(resolve => setTimeout(resolve, 120))
    await poller.stop()
    const afterStop = callCount
    expect(afterStop).toBeGreaterThan(0)
    // No more ticks after stop.
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(callCount).toBe(afterStop)
  })

  it('runs pollWorker calls in parallel up to the concurrency limit', async () => {
    for (let i = 0; i < 10; i++) {
      const id = `w_parallel${String(i).padStart(4, '0')}`
      seedWorker(id, `https://p${i}.test`, `wtk_parallel_${i}_0000000000000000000000`, 'online', 1)
    }

    let inFlight = 0
    let peak = 0
    const buildClient = (baseUrl: string) => ({
      info: async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setTimeout(resolve, 20))
        inFlight--
        // Echo a workerId derived from baseUrl so the id-match check passes.
        const index = Number.parseInt(baseUrl.match(/p(\d+)\.test/)![1]!, 10)
        const id = `w_parallel${String(index).padStart(4, '0')}`
        return makeInfo(id, { configVersion: 1 })
      },
    })
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
    })
    const results = await poller.pollOnce()
    expect(results).toHaveLength(10)
    // Default concurrency is 8 — at most 8 info() calls overlap.
    expect(peak).toBeLessThanOrEqual(8)
    expect(peak).toBeGreaterThan(1)
  })

  it('start() is a no-op when intervalMs <= 0 and stop() stays safe', async () => {
    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 0,
      jitterMs: 0,
      buildClient: () => ({ info: async () => makeInfo('w_never') }),
    })
    poller.start()
    // No timer was installed; stop resolves immediately.
    await poller.stop()
  })

  it('stop() clears the interval and awaits an in-flight pollOnce', async () => {
    seedWorker('w_alpha000001', 'https://alpha.test', 'wtk_alpha_0000000000000000000000000000', 'online', 1)

    let resolveInfo: ((value: WorkerInfo) => void) | undefined
    const buildClient = buildStubFactory({
      'https://alpha.test': () => new Promise<WorkerInfo>((resolve) => {
        resolveInfo = resolve
      }),
    })

    const poller = new WorkerPoller({
      db: getFleetDb(),
      masterKeyHex: MASTER_KEY,
      intervalMs: 30_000,
      jitterMs: 0,
      buildClient,
      now: () => new Date(FIXED_NOW),
    })

    const inflight = poller.pollOnce()
    // Give the stub a chance to register the pending promise.
    await Promise.resolve()
    expect(resolveInfo).toBeDefined()

    const stopPromise = poller.stop()
    resolveInfo!(makeInfo('w_alpha000001', { configVersion: 2 }))
    await inflight
    await stopPromise

    const row = getFleetDb().select().from(registeredWorkers).all()[0]!
    expect(row.lastSeenState).toBe('online')
    expect(row.lastConfigVersion).toBe(2)
  })
})
