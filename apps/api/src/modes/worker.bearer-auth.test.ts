import type { WorkerModeState, WorkerRuntime } from '@zonease/aiworker-core'
import type {
  BrainProvider,
  ExecutorProvider,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenAPIHono } from '@hono/zod-openapi'
import {
  ApprovalStore,
  ChannelRegistry,
  loadOrSeedConfig,
  resetSecretsVaultForTests,
} from '@zonease/aiworker-core'
import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'

import { describe, expect, it } from 'bun:test'
import { errorHandler } from '../shared/middleware/error-handler'
import { buildEventRoutes } from '../worker/events/routes'
import { evolutionRoutes } from '../worker/evolution/routes'
import { buildBearerAuth } from '../worker/management/bearer-auth'
import { buildManagementRoutes } from '../worker/management/routes'
import { buildOrchestratorRoutes } from '../worker/orchestrator/routes'

/**
 * BUG-015 e2e 回归：把 `modes/worker.ts` 的中间件 + 路由挂载顺序复刻一份，验证
 * `/api/worker/{orchestrator,evolution,events,info}` 全部走 bearer-auth；`/health`
 * 与公开 channels webhook 不被中间件误伤。
 *
 * 之所以不直接调 `bootstrapWorkerApp`：它会 mint 新 identity / 真实 build
 * runtime（含 brain/executor provider），开销 + 副作用太大。手工 wrapper 与
 * worker.ts 顺序一致即可证明守门行为。
 */

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const STATE_TOKEN = 'wtk_worker_bearer_auth_e2e_token_0000000000000'

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

function stubRuntime(): WorkerRuntime {
  return {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain: healthyBrain(),
    executor: healthyExecutor(),
    channels: new ChannelRegistry([]),
    bus: { on: () => () => undefined } as unknown as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
    cron: {} as WorkerRuntime['cron'],
    workspaces: {} as WorkerRuntime['workspaces'],
    processes: {} as WorkerRuntime['processes'],
    approvals: new ApprovalStore(),
    dispose: () => undefined,
  }
}

async function bootstrapApp(): Promise<{ app: OpenAPIHono, state: WorkerModeState }> {
  closeWorkerDb()
  resetSecretsVaultForTests()
  const dir = mkdtempSync(join(tmpdir(), 'aiworker-worker-bearer-auth-'))
  initWorkerDb(join(dir, 'worker.db'))
  runWorkerMigrations()
  process.env.AIWORKER_MASTER_KEY = MASTER_KEY
  await loadOrSeedConfig(getWorkerDb())

  const state: WorkerModeState = {
    workerId: 'w_abcdefghjkmn',
    runtime: stubRuntime(),
    configVersion: 1,
    startedAt: '2026-04-27T00:00:00.000Z',
    tokenPlaintext: STATE_TOKEN,
  }

  const app = new OpenAPIHono()
  app.onError(errorHandler)

  // /health: 公开监控端点，必须不被 bearer-auth 拦。
  app.get('/health', c => c.json({ status: 'ok' }))

  // 模拟 channels webhook：挂在 `/`，不在 `/api/worker/*` 范围。
  const channels = new OpenAPIHono()
  channels.post('/web/webhook', c => c.json({ ok: true }))
  app.route('/', channels)

  app.use('/api/worker/*', buildBearerAuth({
    getIdentity: () => ({ tokenPlaintext: state.tokenPlaintext }),
  }))

  app.route('/api/worker/orchestrator', buildOrchestratorRoutes(() => state.runtime))
  app.route('/api/worker/evolution', evolutionRoutes)
  app.route('/api/worker/events', buildEventRoutes(() => state.runtime))
  app.route('/api/worker', buildManagementRoutes({ getState: () => state, reloadRuntime: async () => {} }))

  return { app, state }
}

function authed(path: string, init: RequestInit = {}, token = STATE_TOKEN): Request {
  const headers = new Headers(init.headers ?? {})
  headers.set('Authorization', `Bearer ${token}`)
  return new Request(`http://w${path}`, { ...init, headers })
}

describe('worker app bearer-auth e2e (BUG-015)', () => {
  it('orchestrator POST /tasks rejects requests with no Authorization header', async () => {
    const { app } = await bootstrapApp()
    const res = await app.fetch(new Request('http://w/api/worker/orchestrator/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    }))
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('auth-failed')
  })

  it('orchestrator GET /tasks rejects requests without bearer + accepts with bearer', async () => {
    const { app } = await bootstrapApp()
    const unauth = await app.fetch(new Request('http://w/api/worker/orchestrator/tasks'))
    expect(unauth.status).toBe(401)
    const ok = await app.fetch(authed('/api/worker/orchestrator/tasks'))
    expect(ok.status).toBe(200)
    const body = await ok.json() as { tasks: unknown[] }
    expect(Array.isArray(body.tasks)).toBe(true)
  })

  it('orchestrator GET /conversations rejects without bearer + accepts with bearer', async () => {
    const { app } = await bootstrapApp()
    const unauth = await app.fetch(new Request('http://w/api/worker/orchestrator/conversations'))
    expect(unauth.status).toBe(401)
    const ok = await app.fetch(authed('/api/worker/orchestrator/conversations'))
    expect(ok.status).toBe(200)
  })

  it('events GET /stream rejects without bearer', async () => {
    const { app } = await bootstrapApp()
    const res = await app.fetch(new Request('http://w/api/worker/events/stream'))
    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('auth-failed')
  })

  it('evolution GET /drafts rejects without bearer + accepts with bearer', async () => {
    const { app } = await bootstrapApp()
    const unauth = await app.fetch(new Request('http://w/api/worker/evolution/drafts'))
    expect(unauth.status).toBe(401)
    const ok = await app.fetch(authed('/api/worker/evolution/drafts'))
    expect(ok.status).toBe(200)
  })

  it('evolution POST /drafts/:id/approve rejects without bearer', async () => {
    const { app } = await bootstrapApp()
    const res = await app.fetch(new Request('http://w/api/worker/evolution/drafts/1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(401)
  })

  it('management GET /info still requires bearer (post-refactor regression check)', async () => {
    const { app } = await bootstrapApp()
    const unauth = await app.fetch(new Request('http://w/api/worker/info'))
    expect(unauth.status).toBe(401)
    const ok = await app.fetch(authed('/api/worker/info'))
    expect(ok.status).toBe(200)
  })

  it('/health stays public (bearer-auth must not catch it)', async () => {
    const { app } = await bootstrapApp()
    const res = await app.fetch(new Request('http://w/health'))
    expect(res.status).toBe(200)
  })

  it('channels webhook (mounted at root) stays public', async () => {
    const { app } = await bootstrapApp()
    const res = await app.fetch(new Request('http://w/web/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }))
    expect(res.status).toBe(200)
  })

  it('rejects a wrong bearer token even when the path is correct', async () => {
    const { app } = await bootstrapApp()
    const res = await app.fetch(authed(
      '/api/worker/orchestrator/tasks',
      {},
      'wtk_wrong_token_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    ))
    expect(res.status).toBe(401)
  })
})
