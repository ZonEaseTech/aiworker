import type { GatewayContext } from '../src/router/context'
import type { FleetSupervisor, LaunchLocalInput, LaunchLocalResult } from '../src/supervisor/service'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@zonease/aiworker-storage-sqlite/fleet'
import { describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { createWorkersLaunchHandler } from '../src/router/methods/workers'
import { LaunchFailedError, LaunchTimeoutError } from '../src/supervisor/errors'

const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'

/** 最小的 supervisor stub:只暴露 launchLocal,足够让 handler 跑通。 */
function makeSupervisor(impl: (input: LaunchLocalInput) => Promise<LaunchLocalResult>): FleetSupervisor {
  return {
    launchLocal: impl,
    ensureInfrastructure: async () => {},
    buildEnv: () => [],
    shutdown: async () => {},
  } as unknown as FleetSupervisor
}

function makeCtx(overrides: Partial<GatewayContext> = {}): { ctx: GatewayContext, cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gw-launch-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  const ctx: GatewayContext = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-test-launch'),
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

describe('workers.launch', () => {
  test('canLaunch=false → feature_disabled', async () => {
    const { ctx, cleanup } = makeCtx({ supervisor: null })
    try {
      const handler = createWorkersLaunchHandler()
      const r = await handler(ctx, {})
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('feature_disabled')
    }
    finally { cleanup() }
  })

  test('master key 缺失 → master_key_missing', async () => {
    const supervisor = makeSupervisor(async () => {
      throw new Error('should not be called')
    })
    const { ctx, cleanup } = makeCtx({ masterKeyHex: undefined, supervisor })
    try {
      const handler = createWorkersLaunchHandler()
      const r = await handler(ctx, {})
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('master_key_missing')
    }
    finally { cleanup() }
  })

  test('supervisor 超时 → launch_timeout', async () => {
    const supervisor = makeSupervisor(async () => {
      throw new LaunchTimeoutError('boom')
    })
    const { ctx, cleanup } = makeCtx({ supervisor })
    try {
      const handler = createWorkersLaunchHandler()
      const r = await handler(ctx, { displayName: 'w1' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('launch_timeout')
    }
    finally { cleanup() }
  })

  test('supervisor 失败 → launch_failed', async () => {
    const supervisor = makeSupervisor(async () => {
      throw new LaunchFailedError('docker not ready')
    })
    const { ctx, cleanup } = makeCtx({ supervisor })
    try {
      const handler = createWorkersLaunchHandler()
      const r = await handler(ctx, {})
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('launch_failed')
    }
    finally { cleanup() }
  })

  test('成功:fleet.db 出现新行 + 返回 deviceToken', async () => {
    const supervisor = makeSupervisor(async (input) => {
      expect(input.displayName).toBe('alpha')
      return {
        workerId: 'w_launchwxyz42',
        apiToken: VALID_TOKEN as unknown as LaunchLocalResult['apiToken'],
        baseUrl: 'http://aiworker-aa11:9217',
        containerId: 'container-1234567890ab',
        containerName: 'aiworker-aa11',
      }
    })
    const { ctx, cleanup } = makeCtx({ supervisor })
    try {
      const handler = createWorkersLaunchHandler()
      const r = await handler(ctx, { displayName: 'alpha' })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.result as { workerId: string, deviceToken: string }
        expect(out.workerId).toBe('w_launchwxyz42')
        expect(out.deviceToken).toBe(VALID_TOKEN)
      }
      const row = ctx.persistence.getRegisteredWorker('w_launchwxyz42')
      expect(row).toBeTruthy()
      expect(row!.addedBy).toBe('launch-local')
    }
    finally { cleanup() }
  })

  test('配额已满 → quota_exceeded,且 supervisor 不会被调用', async () => {
    let called = false
    const supervisor = makeSupervisor(async () => {
      called = true
      throw new Error('should not reach')
    })
    const { ctx, cleanup } = makeCtx({ supervisor, maxWorkers: 0 })
    try {
      const handler = createWorkersLaunchHandler()
      const r = await handler(ctx, {})
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('quota_exceeded')
      expect(called).toBe(false)
    }
    finally { cleanup() }
  })
})
