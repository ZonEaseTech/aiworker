import type { GatewayConfig } from '../src/config'
import type { ConnectionData, ConnectionPath } from '../src/registry/types'
import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  auditEvents,
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@zonease/aiworker-storage-sqlite/fleet'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ConnectRateLimiter, ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { __handleMessageForTest as handleMessage } from '../src/server'

/**
 * BUG-020 — connect 失败 brute-force 计数与审计的端到端验证（unit-level：直接喂
 * `__handleMessageForTest`，跳过 Bun.serve 升级层）。fetch 拦截 + 429 由 e2e
 * 在 dispatch.test.ts 一类测试套覆盖时间不够时本测试套先保证业务面正确。
 */

const SHARED_SECRET = 'shared-secret-1234567890abcdef'
const VALID_BEARER = 'shared-secret-1234567890abcdef'

interface WsStub {
  data: ConnectionData
  send: (msg: string) => void
  close: (code: number, reason?: string) => void
  __sent: string[]
  __closes: Array<{ code: number, reason?: string }>
}

function makeWs(opts: { path?: ConnectionPath, loopback?: boolean, remoteAddress?: string } = {}): WsStub {
  const ws: WsStub = {
    data: {
      role: undefined,
      agentId: undefined,
      deviceId: undefined,
      loopback: opts.loopback ?? false,
      remoteAddress: opts.remoteAddress ?? '203.0.113.7',
      connectedAt: Date.now(),
      subscribedAll: true,
      path: opts.path ?? '/ws',
    },
    send: (msg: string) => ws.__sent.push(msg),
    close: (code: number, reason?: string) => ws.__closes.push({ code, reason }),
    __sent: [],
    __closes: [],
  }
  return ws
}

function operatorConnectFrame(token: string): string {
  return JSON.stringify({
    type: 'connect',
    role: 'operator',
    agentId: 'op-1',
    deviceId: 'dev-1',
    auth: { token },
  })
}

function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    internalSharedSecret: SHARED_SECRET,
    masterKeyHex: undefined,
    fleetDbPath: ':memory:',
    canLaunch: false,
    maxWorkers: undefined,
    joinToken: undefined,
    enrollOtpTtlSec: 300,
    nodeEnv: 'test',
    supervisor: {
      dockerHost: '/var/run/docker.sock',
      network: 'aiworker_default',
      launchBaseUrlTemplate: 'http://{containerName}:9217',
    },
    ...overrides,
  }
}

let dir: string
let ctx: GatewayContext
let rl: ConnectRateLimiter

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gw-brute-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  rl = new ConnectRateLimiter({ threshold: 3, windowMs: 60_000, blockMs: 600_000 })
  ctx = {
    persistence: new FleetPersistence(getFleetDb()),
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-brute-test'),
    masterKeyHex: undefined,
    supervisor: null,
    maxWorkers: undefined,
    connectRateLimiter: rl,
  }
})

afterEach(() => {
  ctx.forwards.dispose()
  closeFleetDb()
  rmSync(dir, { recursive: true, force: true })
})

function listAuditActions(): string[] {
  return getFleetDb().select().from(auditEvents).all().map(r => r.action)
}

function lastAuditDetail(action: string): Record<string, unknown> | undefined {
  const rows = getFleetDb().select().from(auditEvents).all().reverse()
  const row = rows.find(r => r.action === action)
  if (!row)
    return undefined
  return (row.detail ?? {}) as Record<string, unknown>
}

describe('BUG-020 — connect 失败累计 / brute-force 阻断', () => {
  test('远程 IP 多次错误 token 累计达阈值 → 进入 block + 写 brute_force_blocked audit', () => {
    for (let i = 0; i < 2; i++) {
      const ws = makeWs({ remoteAddress: '203.0.113.7' })
      handleMessage(ws as never, operatorConnectFrame('wrong-token-xx'), ctx, makeConfig())
      expect(ws.__closes[0]?.code).toBe(4401)
    }
    expect(rl.isBlocked('203.0.113.7').blocked).toBe(false)

    // 第三次失败 → 进入 block
    const ws3 = makeWs({ remoteAddress: '203.0.113.7' })
    handleMessage(ws3 as never, operatorConnectFrame('wrong-token-xx'), ctx, makeConfig())
    expect(ws3.__closes[0]?.code).toBe(4401)
    const block = rl.isBlocked('203.0.113.7')
    expect(block.blocked).toBe(true)
    expect(block.retryAfterMs).toBeGreaterThan(0)

    const actions = listAuditActions()
    expect(actions.filter(a => a === 'gateway.connect.rejected').length).toBe(3)
    expect(actions).toContain('gateway.connect.brute_force_blocked')

    const detail = lastAuditDetail('gateway.connect.brute_force_blocked')
    expect(detail).toBeDefined()
    expect(detail!.remoteAddress).toBe('203.0.113.7')
    expect(detail!.fails).toBe(3)
    expect(detail!.triggerReason).toBe('invalid_token')
  })

  test('握手成功后再失败 1 次 → 计数被清，不会立刻触发 block', () => {
    const ok = makeWs({ remoteAddress: '203.0.113.7' })
    handleMessage(ok as never, operatorConnectFrame(VALID_BEARER), ctx, makeConfig())
    expect(ok.__closes).toHaveLength(0)
    expect(ok.data.role).toBe('operator')

    // 之前如果 rl 还残留 → recordSuccess 应已清干净
    const after = makeWs({ remoteAddress: '203.0.113.7' })
    handleMessage(after as never, operatorConnectFrame('wrong-x'), ctx, makeConfig())
    expect(after.__closes[0]?.code).toBe(4401)
    expect(rl.isBlocked('203.0.113.7').blocked).toBe(false)
    expect(listAuditActions()).not.toContain('gateway.connect.brute_force_blocked')
  })

  test('loopback IP 即便多次失败也不入计数', () => {
    for (let i = 0; i < 5; i++) {
      const ws = makeWs({ remoteAddress: '127.0.0.1', loopback: true })
      handleMessage(ws as never, operatorConnectFrame('wrong-x'), ctx, makeConfig())
    }
    expect(rl.isBlocked('127.0.0.1').blocked).toBe(false)
    expect(rl.size()).toBe(0)
    expect(listAuditActions()).not.toContain('gateway.connect.brute_force_blocked')
  })

  test('wrong_path 不计入 brute-force（协议错配 ≠ 穷举尝试）', () => {
    // /enroll-ws 收到非 OTP 帧 → wrong_path:expected_enroll_otp
    const ws = makeWs({ remoteAddress: '198.51.100.9', path: '/enroll-ws' })
    handleMessage(ws as never, operatorConnectFrame('whatever'), ctx, makeConfig())
    expect(ws.__closes[0]?.code).toBe(4400)
    expect(ws.__closes[0]?.reason).toContain('wrong_path:')
    expect(rl.size()).toBe(0)
    expect(listAuditActions()).not.toContain('gateway.connect.brute_force_blocked')
  })

  test('多 IP 累计互不干扰', () => {
    for (let i = 0; i < 2; i++) {
      const a = makeWs({ remoteAddress: '203.0.113.10' })
      handleMessage(a as never, operatorConnectFrame('wrong'), ctx, makeConfig())
    }
    const b = makeWs({ remoteAddress: '198.51.100.20' })
    handleMessage(b as never, operatorConnectFrame('wrong'), ctx, makeConfig())
    expect(rl.snapshot('203.0.113.10')?.fails).toBe(2)
    expect(rl.snapshot('198.51.100.20')?.fails).toBe(1)
    expect(rl.isBlocked('203.0.113.10').blocked).toBe(false)
    expect(rl.isBlocked('198.51.100.20').blocked).toBe(false)
  })
})
