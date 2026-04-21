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
import { decryptTokenFor, getById, registerWorker, RegistryConflictError } from './service'

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
})
