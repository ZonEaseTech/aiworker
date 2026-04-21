import type {
  BrainProvider,
  ExecutorProvider,
  WorkerConfig,
} from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import type { WorkerRuntime } from '../runtime'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'bun:test'

import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '../../db/worker'
import { loadOrSeedConfig } from '../bootstrap/config'
import { resetSecretsVaultForTests } from '../secrets'
import { buildManagementRoutes } from './routes'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

function healthyBrain(): BrainProvider {
  return {
    name: 'multi',
    health: async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
    listSkills: async () => [],
    listMemories: async () => [],
    searchMemories: async () => [],
    writeMemory: async () => { throw new Error('unused') },
  }
}

function healthyExecutor(): ExecutorProvider {
  return {
    name: 'http',
    health: async () => ({ name: 'http', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    runChat: () => ({ async* [Symbol.asyncIterator]() {} } as AsyncIterable<never>),
  }
}

function stubRuntime(): WorkerRuntime {
  return {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain: healthyBrain(),
    executor: healthyExecutor(),
    channels: {} as WorkerRuntime['channels'],
    bus: {} as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
    dispose: () => undefined,
  }
}

function stubState(configVersion = 1): WorkerModeState {
  return {
    workerId: 'w_abcdefghjkmn',
    runtime: stubRuntime(),
    configVersion,
    startedAt: '2026-04-21T00:00:00.000Z',
  }
}

function validConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    brains: [],
    brainWriteTarget: '',
    brainRetrieval: 'first-match',
    executor: {
      type: 'http',
      baseUrl: 'http://localhost:4000',
      apiKey: 'key-one',
      model: 'gpt-4o-mini',
      timeoutMs: 30_000,
    },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
    ...overrides,
  }
}

async function bootstrap(): Promise<{ state: WorkerModeState }> {
  closeWorkerDb()
  resetSecretsVaultForTests()
  const dir = mkdtempSync(join(tmpdir(), 'aiworker-mgmt-routes-'))
  initWorkerDb(join(dir, 'worker.db'))
  runWorkerMigrations('./drizzle/worker')
  process.env.AIWORKER_MASTER_KEY = MASTER_KEY
  await loadOrSeedConfig(getWorkerDb())
  const state = stubState(1)
  return { state }
}

describe('buildManagementRoutes', () => {
  beforeEach(() => {
    // Each test owns a fresh DB + vault.
  })

  it('GET /info returns WorkerInfo shape', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/info'))
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.workerId).toBe('w_abcdefghjkmn')
    expect(body.configVersion).toBe(1)
    expect(Array.isArray(body.brains)).toBe(true)
  })

  it('GET /config returns { config, version }', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/config'))
    expect(res.status).toBe(200)
    const body = await res.json() as { config: WorkerConfig, version: number }
    expect(body.version).toBe(1)
    expect(Array.isArray(body.config.brains)).toBe(true)
  })

  it('PUT /config bumps version, calls reloadRuntime with new config, returns runtimeReload=ok', async () => {
    const { state } = await bootstrap()
    let reloaded: { cfg: WorkerConfig, v: number } | null = null
    const routes = buildManagementRoutes({
      getState: () => state,
      reloadRuntime: async (cfg, v) => {
        reloaded = { cfg, v }
      },
    })
    const res = await routes.fetch(new Request('http://w/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validConfig()),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { version: number, runtimeReload: string }
    expect(body.version).toBe(2)
    expect(body.runtimeReload).toBe('ok')
    expect(reloaded!.v).toBe(2)
  })

  it('PUT /config surfaces runtimeReload=failed when reload throws', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({
      getState: () => state,
      reloadRuntime: async () => { throw new Error('boom') },
    })
    const res = await routes.fetch(new Request('http://w/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validConfig()),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { runtimeReload: string, version: number }
    expect(body.runtimeReload).toBe('failed')
    expect(body.version).toBe(2)
  })

  it('PUT /config with If-Match mismatch returns 409', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '999' },
      body: JSON.stringify(validConfig()),
    }))
    expect(res.status).toBe(409)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('version-conflict')
  })

  it('PUT /config with invalid body returns 400', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brains: 'nope' }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-config')
  })

  it('GET /secrets returns the vault keys after PUT /config', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    await routes.fetch(new Request('http://w/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validConfig()),
    }))
    const res = await routes.fetch(new Request('http://w/secrets'))
    const body = await res.json() as { keys: string[] }
    expect(body.keys).toContain('executor.apiKey')
  })

  it('PUT /secrets/:key round-trips through GET', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const putRes = await routes.fetch(new Request('http://w/secrets/manual-key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'rotated' }),
    }))
    expect(putRes.status).toBe(200)
    const listRes = await routes.fetch(new Request('http://w/secrets'))
    const body = await listRes.json() as { keys: string[] }
    expect(body.keys).toContain('manual-key')
  })

  it('PUT /secrets/:key with empty value returns 400', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/secrets/k', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '' }),
    }))
    expect(res.status).toBe(400)
  })

  it('DELETE /secrets/:key returns 404 for unknown key', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/secrets/absent', { method: 'DELETE' }))
    expect(res.status).toBe(404)
  })
})
