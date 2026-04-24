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
import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@aiworker/storage-sqlite/worker'

import { beforeEach, describe, expect, it } from 'bun:test'
import { loadOrSeedConfig } from '../bootstrap/config'
import { ChannelRegistry } from '../channels/registry'
import { resetAvailabilityProbeForTests } from '../executor/availability'
import { ProcessManager } from '../orchestrator/process-manager'
import { resetSecretsVaultForTests } from '../secrets'
import { buildManagementRoutes } from './routes'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const STATE_TOKEN = 'wtk_management_routes_test_token_000000000000'

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
    run: () => ({ async* [Symbol.asyncIterator]() {} } as AsyncIterable<never>),
  }
}

function stubRuntime(processes?: ProcessManager): WorkerRuntime {
  return {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain: healthyBrain(),
    executor: healthyExecutor(),
    channels: new ChannelRegistry([]),
    bus: {} as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
    workspaces: {} as WorkerRuntime['workspaces'],
    processes: processes ?? ({} as WorkerRuntime['processes']),
    dispose: () => undefined,
  }
}

function stubState(configVersion = 1, processes?: ProcessManager): WorkerModeState {
  return {
    workerId: 'w_abcdefghjkmn',
    runtime: stubRuntime(processes),
    configVersion,
    startedAt: '2026-04-21T00:00:00.000Z',
    tokenPlaintext: STATE_TOKEN,
  }
}

function validConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    brains: [],
    brainWriteTarget: '',
    brainRetrieval: 'first-match',
    executor: {
      engine: 'http',
      variant: 'default',
      overrides: {
        baseUrl: 'http://localhost:4000',
        apiKey: 'key-one',
        model: 'gpt-4o-mini',
        timeoutMs: 30_000,
      },
    },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
    ...overrides,
  }
}

async function bootstrap(processes?: ProcessManager): Promise<{ state: WorkerModeState }> {
  closeWorkerDb()
  resetSecretsVaultForTests()
  const dir = mkdtempSync(join(tmpdir(), 'aiworker-mgmt-routes-'))
  initWorkerDb(join(dir, 'worker.db'))
  runWorkerMigrations()
  process.env.AIWORKER_MASTER_KEY = MASTER_KEY
  await loadOrSeedConfig(getWorkerDb())
  const state = stubState(1, processes)
  return { state }
}

function authed(path: string, init: RequestInit = {}, token = STATE_TOKEN): Request {
  const headers = new Headers(init.headers ?? {})
  headers.set('Authorization', `Bearer ${token}`)
  return new Request(`http://w${path}`, { ...init, headers })
}

describe('buildManagementRoutes', () => {
  beforeEach(() => {
    // Each test owns a fresh DB + vault.
  })

  it('GET /info returns WorkerInfo shape', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/info'))
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.workerId).toBe('w_abcdefghjkmn')
    expect(body.configVersion).toBe(1)
    expect(Array.isArray(body.brains)).toBe(true)
  })

  it('GET /info without a Bearer token returns 401 auth-failed', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/info'))
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('auth-failed')
  })

  it('GET /info with the right Bearer token returns 200', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/info'))
    expect(res.status).toBe(200)
  })

  it('GET /config returns { config, version }', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/config'))
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
    const res = await routes.fetch(authed('/config', {
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
    const res = await routes.fetch(authed('/config', {
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
    const res = await routes.fetch(authed('/config', {
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
    const res = await routes.fetch(authed('/config', {
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
    await routes.fetch(authed('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validConfig()),
    }))
    const res = await routes.fetch(authed('/secrets'))
    const body = await res.json() as { keys: string[] }
    expect(body.keys).toContain('executor.overrides.apiKey')
  })

  it('PUT /secrets/:key round-trips through GET', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const putRes = await routes.fetch(authed('/secrets/manual-key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'rotated' }),
    }))
    expect(putRes.status).toBe(200)
    const listRes = await routes.fetch(authed('/secrets'))
    const body = await listRes.json() as { keys: string[] }
    expect(body.keys).toContain('manual-key')
  })

  it('PUT /secrets/:key with empty value returns 400', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/secrets/k', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '' }),
    }))
    expect(res.status).toBe(400)
  })

  it('DELETE /secrets/:key returns 404 for unknown key', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/secrets/absent', { method: 'DELETE' }))
    expect(res.status).toBe(404)
  })

  it('POST /brain/test returns the brain probe response', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/brain/test', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { brains: Array<{ status: string }> }
    expect(Array.isArray(body.brains)).toBe(true)
  })

  it('POST /executor/test runs the probe when body.probe=true', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/executor/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: true }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { executor: { type: string, status: string } }
    expect(body.executor.type).toBeDefined()
  })

  it('POST /channels/:channel/test returns 404 for an unbound channel', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/channels/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(404)
  })

  it('POST /token/rotate returns a new token and rotates the in-memory state', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const originalToken = state.tokenPlaintext
    const res = await routes.fetch(authed('/token/rotate', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { newToken: string }
    expect(body.newToken).not.toBe(originalToken)
    expect(state.tokenPlaintext).toBe(body.newToken)

    // Old token is now rejected; new token is accepted.
    const stale = await routes.fetch(authed('/info', {}, originalToken))
    expect(stale.status).toBe(401)
    const fresh = await routes.fetch(authed('/info', {}, body.newToken))
    expect(fresh.status).toBe(200)
  })

  it('POST /reload succeeds and returns the current version', async () => {
    const { state } = await bootstrap()
    let called = 0
    const routes = buildManagementRoutes({
      getState: () => state,
      reloadRuntime: async () => { called += 1 },
    })
    const res = await routes.fetch(authed('/reload', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean, version: number }
    expect(body.ok).toBe(true)
    expect(body.version).toBe(1)
    expect(called).toBe(1)
  })

  it('POST /reload returns 500 when reloadRuntime throws', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({
      getState: () => state,
      reloadRuntime: async () => { throw new Error('nope') },
    })
    const res = await routes.fetch(authed('/reload', { method: 'POST' }))
    expect(res.status).toBe(500)
    const body = await res.json() as { ok: boolean, error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('nope')
  })

  it('GET /runtime/processes/capacity returns ProcessManager snapshot', async () => {
    const processes = new ProcessManager({
      maxConcurrentTotal: 3,
      perEngineLimits: { http: 2 },
      stallTimeoutMs: 60_000,
      killTimeoutMs: 5_000,
      autoCleanupDelayMs: 60_000,
      gcIntervalMs: 0,
    })
    try {
      const { state } = await bootstrap(processes)
      const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
      const res = await routes.fetch(authed('/runtime/processes/capacity'))
      expect(res.status).toBe(200)
      const body = await res.json() as {
        maxConcurrentTotal: number
        totalActive: number
        totalQueued: number
        availableSlots: number
        perEngine: Record<string, { limit: number, active: number, queued: number, available: number }>
        byState: Record<string, number>
        recentTerminal: unknown[]
      }
      expect(body.maxConcurrentTotal).toBe(3)
      expect(body.totalActive).toBe(0)
      expect(body.totalQueued).toBe(0)
      expect(body.availableSlots).toBe(3)
      expect(body.perEngine.http!.limit).toBe(2)
      expect(body.perEngine.http!.available).toBe(2)
      expect(body.byState.queued).toBe(0)
      expect(Array.isArray(body.recentTerminal)).toBe(true)
    }
    finally {
      processes.dispose()
    }
  })

  it('GET /runtime/processes/capacity requires bearer auth', async () => {
    const processes = new ProcessManager({
      maxConcurrentTotal: 1,
      perEngineLimits: {},
      stallTimeoutMs: 60_000,
      killTimeoutMs: 5_000,
      autoCleanupDelayMs: 60_000,
      gcIntervalMs: 0,
    })
    try {
      const { state } = await bootstrap(processes)
      const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
      const res = await routes.fetch(new Request('http://w/runtime/processes/capacity'))
      expect(res.status).toBe(401)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('auth-failed')
    }
    finally {
      processes.dispose()
    }
  })

  it('GET /engines requires bearer auth', async () => {
    const { state } = await bootstrap()
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(new Request('http://w/engines'))
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('auth-failed')
  })

  it('GET /engines returns one entry per EngineKind (acp expanded)', async () => {
    const { state } = await bootstrap()
    resetAvailabilityProbeForTests({
      resolveBinary: async () => null,
      pathExists: async () => false,
      homedir: () => '/home/test',
      now: () => 1,
    })
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })
    const res = await routes.fetch(authed('/engines'))
    expect(res.status).toBe(200)
    const body = await res.json() as {
      engines: Array<{ kind: string, agent?: string, status: string, authHint?: string }>
    }
    const kinds = body.engines.map(e => e.agent ? `${e.kind}:${e.agent}` : e.kind).sort()
    expect(kinds).toEqual([
      'acp:gemini',
      'acp:qwen',
      'claude-code',
      'cli',
      'codex',
      'cursor',
      'http',
      'mcp',
    ])
    // The three CLI-less engines should still report ready.
    expect(body.engines.find(e => e.kind === 'http')?.status).toBe('ready')
    expect(body.engines.find(e => e.kind === 'claude-code')?.status).toBe('not-found')
  })

  it('GET /engines?refresh=1 bypasses the 10-minute cache', async () => {
    const { state } = await bootstrap()
    let binaryCalls = 0
    resetAvailabilityProbeForTests({
      resolveBinary: async () => {
        binaryCalls += 1
        return null
      },
      pathExists: async () => false,
      homedir: () => '/home/test',
      now: () => 1,
    })
    const routes = buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} })

    await routes.fetch(authed('/engines'))
    const firstCount = binaryCalls
    await routes.fetch(authed('/engines'))
    // Second call without refresh hits the in-memory cache.
    expect(binaryCalls).toBe(firstCount)

    await routes.fetch(authed('/engines?refresh=1'))
    expect(binaryCalls).toBeGreaterThan(firstCount)
  })
})
