import type { WorkerInfo } from '@aiworker/shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'bun:test'

import { closeFleetDb, getFleetDb, initFleetDb, runFleetMigrations } from '../../db/fleet'
import { auditEvents, registeredWorkers } from '../../db/fleet/schema'
import {
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from './client'
import { decryptToken } from './crypto'
import {
  decryptTokenFor,
  deleteWorker,
  getById,
  getWorkerById,
  listWorkers,
  registerWorker,
  RegistryConflictError,
  RegistryNotFoundError,
  updateWorker,
} from './service'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

function stubClient(info: WorkerInfo) {
  return () => ({ info: async () => info })
}

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

describe('registry/service', () => {
  beforeEach(() => {
    closeFleetDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-registry-'))
    initFleetDb(join(dir, 'fleet.db'))
    runFleetMigrations('./drizzle/fleet')
  })

  it('registers a new worker and writes an audit row', async () => {
    const info = makeInfo()
    const row = await registerWorker(
      {
        baseUrl: 'https://worker.example.com/',
        apiToken: 'wtk_plain_token_0000000000000000000000000',
        displayName: 'Alpha',
      },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(info) },
    )

    expect(row.id).toBe('w_abcdef123456')
    expect(row.baseUrl).toBe('https://worker.example.com')
    expect(row.displayName).toBe('Alpha')
    expect(row.addedBy).toBe('manual')
    expect(row.lastSeenState).toBe('online')
    expect(row.lastConfigVersion).toBe(3)
    expect(row.apiTokenEnc.length).toBeGreaterThan(0)

    const decrypted = decryptToken(row.apiTokenEnc, row.nonce, row.authTag, MASTER_KEY)
    expect(decrypted).toBe('wtk_plain_token_0000000000000000000000000')

    const db = getFleetDb()
    const all = db.select().from(registeredWorkers).all()
    expect(all).toHaveLength(1)
    const audits = db.select().from(auditEvents).all()
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('worker.registered')
    expect(audits[0]!.workerId).toBe('w_abcdef123456')
    expect(audits[0]!.detail).toEqual({
      baseUrl: 'https://worker.example.com',
      displayName: 'Alpha',
    })
  })

  it('throws RegistryConflictError when the id already exists', async () => {
    const info = makeInfo()
    await registerWorker(
      {
        baseUrl: 'https://worker.example.com',
        apiToken: 'wtk_plain_token_0000000000000000000000000',
        displayName: 'Alpha',
      },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(info) },
    )

    await expect(registerWorker(
      {
        baseUrl: 'https://worker.example.com',
        apiToken: 'wtk_plain_token_0000000000000000000000000',
        displayName: 'Alpha again',
      },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(info) },
    )).rejects.toBeInstanceOf(RegistryConflictError)

    const db = getFleetDb()
    expect(db.select().from(registeredWorkers).all()).toHaveLength(1)
  })

  it('bubbles client auth / network / shape errors unchanged', async () => {
    const throwingClient = (err: unknown) => () => ({
      info: async () => {
        throw err
      },
    })

    await expect(registerWorker(
      { baseUrl: 'https://x', apiToken: 'wtk_tok', displayName: 'A' },
      { masterKeyHex: MASTER_KEY, buildClient: throwingClient(new WorkerClientAuthError()) },
    )).rejects.toBeInstanceOf(WorkerClientAuthError)

    await expect(registerWorker(
      { baseUrl: 'https://x', apiToken: 'wtk_tok', displayName: 'A' },
      { masterKeyHex: MASTER_KEY, buildClient: throwingClient(new WorkerClientNetworkError('down')) },
    )).rejects.toBeInstanceOf(WorkerClientNetworkError)

    await expect(registerWorker(
      { baseUrl: 'https://x', apiToken: 'wtk_tok', displayName: 'A' },
      { masterKeyHex: MASTER_KEY, buildClient: throwingClient(new WorkerClientInvalidResponseError('bad')) },
    )).rejects.toBeInstanceOf(WorkerClientInvalidResponseError)

    const db = getFleetDb()
    expect(db.select().from(registeredWorkers).all()).toHaveLength(0)
  })

  it('getById returns the row with undefined for null columns', async () => {
    await registerWorker(
      {
        baseUrl: 'https://worker.example.com',
        apiToken: 'wtk_plain_token_0000000000000000000000000',
        displayName: 'Alpha',
      },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo()) },
    )
    const row = getById('w_abcdef123456')
    expect(row).not.toBeNull()
    expect(row!.lastSeenAt).toBeDefined()
    expect(getById('w_missing')).toBeNull()
  })

  it('decryptTokenFor round-trips the stored token', async () => {
    const row = await registerWorker(
      {
        baseUrl: 'https://worker.example.com',
        apiToken: 'wtk_plain_token_0000000000000000000000000',
        displayName: 'Alpha',
      },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo()) },
    )
    expect(decryptTokenFor(row, MASTER_KEY)).toBe('wtk_plain_token_0000000000000000000000000')
  })

  it('listWorkers returns every row stripped of at-rest ciphertext columns', async () => {
    await registerWorker(
      { baseUrl: 'https://a.example.com', apiToken: 'wtk_aaa', displayName: 'Alpha' },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo({ workerId: 'w_aaaaaaaaaaaa' })) },
    )
    await registerWorker(
      { baseUrl: 'https://b.example.com', apiToken: 'wtk_bbb', displayName: 'Beta' },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo({ workerId: 'w_bbbbbbbbbbbb' })) },
    )
    const workers = listWorkers()
    expect(workers).toHaveLength(2)
    for (const w of workers) {
      expect(w).not.toHaveProperty('apiTokenEnc')
      expect(w).not.toHaveProperty('nonce')
      expect(w).not.toHaveProperty('authTag')
    }
    // Beta was registered last → shown first (addedAt DESC).
    expect(workers[0]!.id).toBe('w_bbbbbbbbbbbb')
  })

  it('getWorkerById strips ciphertext columns and returns null when missing', async () => {
    await registerWorker(
      { baseUrl: 'https://worker.example.com', apiToken: 'wtk_tok', displayName: 'Alpha' },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo()) },
    )
    const safe = getWorkerById('w_abcdef123456')
    expect(safe).not.toBeNull()
    expect(safe!.displayName).toBe('Alpha')
    expect(safe).not.toHaveProperty('apiTokenEnc')
    expect(getWorkerById('w_missing')).toBeNull()
  })

  it('updateWorker patches displayName + baseUrl, trims trailing slash, and emits an audit row', async () => {
    await registerWorker(
      { baseUrl: 'https://worker.example.com', apiToken: 'wtk_tok', displayName: 'Alpha' },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo()) },
    )

    const after = updateWorker('w_abcdef123456', {
      displayName: 'Alpha Prime',
      baseUrl: 'https://moved.example.com/',
    })
    expect(after.displayName).toBe('Alpha Prime')
    expect(after.baseUrl).toBe('https://moved.example.com')
    // Encrypted token columns are NOT returned from a patch response.
    expect(after).not.toHaveProperty('apiTokenEnc')

    const db = getFleetDb()
    const audits = db.select().from(auditEvents).all()
    // Registration audit + update audit.
    const updates = audits.filter(a => a.action === 'worker.updated')
    expect(updates).toHaveLength(1)
    expect(updates[0]!.workerId).toBe('w_abcdef123456')
    expect(updates[0]!.detail).toEqual({
      displayName: 'Alpha Prime',
      baseUrl: 'https://moved.example.com',
    })
  })

  it('updateWorker accepts a single-field patch and leaves the other column untouched', async () => {
    await registerWorker(
      { baseUrl: 'https://worker.example.com', apiToken: 'wtk_tok', displayName: 'Alpha' },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo()) },
    )
    const after = updateWorker('w_abcdef123456', { displayName: 'Alpha v2' })
    expect(after.displayName).toBe('Alpha v2')
    expect(after.baseUrl).toBe('https://worker.example.com')
  })

  it('updateWorker throws RegistryNotFoundError when id is unknown', () => {
    expect(() => updateWorker('w_missing', { displayName: 'Nope' }))
      .toThrow(RegistryNotFoundError)
  })

  it('deleteWorker removes the row and emits an unregister audit event', async () => {
    await registerWorker(
      { baseUrl: 'https://worker.example.com', apiToken: 'wtk_tok', displayName: 'Alpha' },
      { masterKeyHex: MASTER_KEY, buildClient: stubClient(makeInfo()) },
    )
    deleteWorker('w_abcdef123456')
    expect(getById('w_abcdef123456')).toBeNull()

    const db = getFleetDb()
    const audits = db.select().from(auditEvents).all()
    const unregister = audits.find(a => a.action === 'worker.unregistered')
    expect(unregister).toBeDefined()
    expect(unregister!.workerId).toBe('w_abcdef123456')
    expect(unregister!.detail).toEqual({
      baseUrl: 'https://worker.example.com',
      displayName: 'Alpha',
    })
  })

  it('deleteWorker throws RegistryNotFoundError for unknown id', () => {
    expect(() => deleteWorker('w_missing')).toThrow(RegistryNotFoundError)
  })
})
