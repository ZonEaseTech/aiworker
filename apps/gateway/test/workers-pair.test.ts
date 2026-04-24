import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  registeredWorkers,
  runFleetMigrations,
} from '@aiworker/storage-sqlite/fleet'
import { describe, expect, test } from 'bun:test'
import consola from 'consola'
import { eq } from 'drizzle-orm'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { createWorkersPairHandler } from '../src/router/methods/workers'

/** 辅助:构造一份最小 WorkerInfo 供 info() stub 返回。 */
function fakeWorkerInfo(workerId: string, configVersion = 1) {
  return {
    workerId,
    configVersion,
    runtimeVersion: 'test-0.0.0',
    brains: [],
    executor: { type: 'openai', status: 'ok' as const },
    channels: [],
    evolutionEnabled: false,
    startedAt: new Date().toISOString(),
  } as never
}

const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'

function makeCtx(overrides: Partial<GatewayContext> = {}): { ctx: GatewayContext, cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gw-pair-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  const ctx: GatewayContext = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-test-pair'),
    masterKeyHex: TEST_MASTER,
    supervisor: null,
    maxWorkers: undefined,
    ...overrides,
  }
  return {
    ctx,
    cleanup: () => {
      ctx.forwards.dispose()
      closeFleetDb()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('workers.pair', () => {
  test('参数缺失 → invalid_params', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const handler = createWorkersPairHandler()
      const r = await handler(ctx, { workerBaseUrl: '' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('invalid_params')
    }
    finally { cleanup() }
  })

  test('master key 缺失 → master_key_missing', async () => {
    const { ctx, cleanup } = makeCtx({ masterKeyHex: undefined })
    try {
      const handler = createWorkersPairHandler()
      const r = await handler(ctx, {
        workerBaseUrl: 'http://worker',
        bootstrapToken: VALID_TOKEN,
        displayName: 'alpha',
      })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('master_key_missing')
    }
    finally { cleanup() }
  })

  test('worker /info 返回 401 → auth_failed', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const handler = createWorkersPairHandler({
        buildClient: () => ({
          info: async () => {
            const { WorkerClientAuthError } = await import('../src/registry/worker-client')
            throw new WorkerClientAuthError()
          },
        }),
      })
      const r = await handler(ctx, {
        workerBaseUrl: 'http://worker',
        bootstrapToken: VALID_TOKEN,
        displayName: 'alpha',
      })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('auth_failed')
    }
    finally { cleanup() }
  })

  test('成功:加密落库 + 返回 deviceToken', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const handler = createWorkersPairHandler({
        buildClient: () => ({
          info: async () => fakeWorkerInfo('w_zzyytt112233'),
        }),
      })
      const r = await handler(ctx, {
        workerBaseUrl: 'http://worker-alpha:3001/',
        bootstrapToken: VALID_TOKEN,
        displayName: 'alpha',
      })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.result as { workerId: string, deviceToken: string }
        expect(out.workerId).toBe('w_zzyytt112233')
        expect(out.deviceToken).toBe(VALID_TOKEN)
      }
      // fleet.db 里应该有 row,加密列非空,baseUrl 去尾斜杠。
      const row = getFleetDb()
        .select()
        .from(registeredWorkers)
        .where(eq(registeredWorkers.id, 'w_zzyytt112233'))
        .get()
      expect(row).toBeTruthy()
      expect(row!.baseUrl).toBe('http://worker-alpha:3001')
      expect(row!.apiTokenEnc.length).toBeGreaterThan(0)
      expect(row!.nonce.length).toBeGreaterThan(0)
      expect(row!.authTag.length).toBeGreaterThan(0)
    }
    finally { cleanup() }
  })

  test('已注册 → already_registered', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      // 预置一行。
      ctx.persistence.createRegisteredWorker(
        {
          workerId: 'w_abcdefghijkm',
          baseUrl: 'http://existing',
          apiToken: VALID_TOKEN,
          displayName: 'existing',
        },
        TEST_MASTER,
      )
      const handler = createWorkersPairHandler({
        buildClient: () => ({
          info: async () => fakeWorkerInfo('w_abcdefghijkm'),
        }),
      })
      const r = await handler(ctx, {
        workerBaseUrl: 'http://worker',
        bootstrapToken: VALID_TOKEN,
        displayName: 'dupe',
      })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('already_registered')
    }
    finally { cleanup() }
  })

  test('配额已满 → quota_exceeded', async () => {
    const { ctx, cleanup } = makeCtx({ maxWorkers: 0 })
    try {
      const handler = createWorkersPairHandler({
        buildClient: () => ({
          info: async () => fakeWorkerInfo('w_shouldnotreach'),
        }),
      })
      const r = await handler(ctx, {
        workerBaseUrl: 'http://worker',
        bootstrapToken: VALID_TOKEN,
      })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('quota_exceeded')
    }
    finally { cleanup() }
  })
})
