import type { GatewayConfig } from '../src/config'
import type { ConnectionData } from '../src/registry/types'
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
  registeredWorkers,
  runFleetMigrations,
} from '@aiworker/storage-sqlite/fleet'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import consola from 'consola'
import { eq } from 'drizzle-orm'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { __handleMessageForTest as handleMessage } from '../src/server'

/**
 * PLAN-018 S2 — gateway 侧 self-enroll handshake 测试。
 *
 * 这一组用例用真 fleet.db（drizzle + bun:sqlite，临时路径）+ 直接调
 * `__handleMessageForTest`，不经 Bun.serve；ws 只用最小 stub 抓 send/close。
 * 路径覆盖 PLAN-018 §Test plan 与 FEAT-024 AC #3 / #4 / #5 / #7 / #8。
 */

const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'
const SECOND_TOKEN = 'wtk_zyxwvutsrqponmlkjihgfedcba9876543210'
const JOIN_TOKEN = 'join-secret-abcdef0123456789'
const WRONG_JOIN = 'join-secret-totallybogus0000'
const SHARED_SECRET = 'shared-secret-1234567890abcdef'
const WORKER_ID = 'w_aaaabbbbcccd'

interface WsStub {
  data: ConnectionData
  send: (msg: string) => void
  close: (code: number, reason?: string) => void
  __sent: string[]
  __closes: Array<{ code: number, reason?: string }>
}

function makeWs(loopback = false, remoteAddress = '8.8.8.8'): WsStub {
  const ws: WsStub = {
    data: {
      role: undefined,
      agentId: undefined,
      deviceId: undefined,
      loopback,
      remoteAddress,
      connectedAt: Date.now(),
      subscribedAll: true,
    },
    send: (msg: string) => ws.__sent.push(msg),
    close: (code: number, reason?: string) => ws.__closes.push({ code, reason }),
    __sent: [],
    __closes: [],
  }
  return ws
}

function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    internalSharedSecret: undefined,
    masterKeyHex: TEST_MASTER,
    fleetDbPath: ':memory:',
    canLaunch: false,
    maxWorkers: undefined,
    joinToken: JOIN_TOKEN,
    enrollOtpTtlSec: 300,
    nodeEnv: 'test',
    supervisor: {
      dockerHost: '/var/run/docker.sock',
      network: 'aiworker_default',
      launchBaseUrlTemplate: 'http://{containerName}:3001',
    },
    ...overrides,
  }
}

let dir: string
let ctx: GatewayContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gw-enroll-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  ctx = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-enroll-test'),
    masterKeyHex: TEST_MASTER,
    supervisor: null,
    maxWorkers: undefined,
  }
})

afterEach(() => {
  ctx.forwards.dispose()
  closeFleetDb()
  rmSync(dir, { recursive: true, force: true })
})

function connectFrame(opts: {
  workerId?: string
  deviceId?: string
  authToken?: string
  enroll?: { joinToken: string, apiToken: string, displayName?: string } | null
}): string {
  const frame: Record<string, unknown> = {
    type: 'connect',
    role: 'node',
    agentId: opts.workerId ?? WORKER_ID,
    deviceId: opts.deviceId ?? 'dev-1',
    auth: { token: opts.authToken ?? '' },
  }
  if (opts.enroll !== null) {
    frame.enroll = opts.enroll ?? {
      joinToken: JOIN_TOKEN,
      apiToken: VALID_TOKEN,
      displayName: 'alpha',
    }
  }
  return JSON.stringify(frame)
}

function listAuditActions(): string[] {
  return getFleetDb().select().from(auditEvents).all().map(r => r.action)
}

describe('gateway self-enroll (PLAN-018 S2)', () => {
  test('1. happy path：fleet 行 self-enroll 落库 + audit + ws 保持 open', () => {
    const ws = makeWs()
    handleMessage(
      ws as never,
      connectFrame({}),
      ctx,
      makeConfig(),
    )
    expect(ws.__closes).toHaveLength(0)
    expect(ws.data.role).toBe('node')
    expect(ws.data.agentId).toBe(WORKER_ID)

    const row = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, WORKER_ID))
      .get()
    expect(row).toBeTruthy()
    expect(row!.addedBy).toBe('self-enroll')
    expect(row!.displayName).toBe('alpha')
    expect(row!.baseUrl).toBe('')
    expect(row!.apiTokenEnc.length).toBeGreaterThan(0)

    const actions = listAuditActions()
    expect(actions).toContain('gateway.worker.enrolled')
    expect(actions).toContain('gateway.connect.accepted')
    expect(actions).not.toContain('gateway.connect.rejected')
  })

  test('2. 错 joinToken → 4401 join_token_mismatch + rejected audit + fleet 不变', () => {
    const ws = makeWs()
    handleMessage(
      ws as never,
      connectFrame({ enroll: { joinToken: WRONG_JOIN, apiToken: VALID_TOKEN } }),
      ctx,
      makeConfig(),
    )
    expect(ws.__closes).toEqual([{ code: 4401, reason: 'auth:join_token_mismatch' }])
    expect(ws.data.role).toBeUndefined()

    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)

    const audits = getFleetDb().select().from(auditEvents).all()
    const rejected = audits.find(a => a.action === 'gateway.connect.rejected')
    expect(rejected).toBeTruthy()
    expect((rejected!.detail as { reason?: string })?.reason).toBe('join_token_mismatch')
  })

  test('3. AIWORKER_JOIN_TOKEN 未设 + 带 enroll → 4401 join_token_disabled', () => {
    const ws = makeWs()
    handleMessage(
      ws as never,
      connectFrame({}),
      ctx,
      makeConfig({ joinToken: undefined }),
    )
    expect(ws.__closes).toEqual([{ code: 4401, reason: 'auth:join_token_disabled' }])
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)
    const audits = getFleetDb().select().from(auditEvents).all()
    expect(audits.find(a => a.action === 'gateway.connect.rejected')).toBeTruthy()
    expect(audits.find(a => a.action === 'gateway.connect.accepted')).toBeFalsy()
  })

  test('4. 配额满 → 4401 quota_exceeded + rejected audit reason=quota_exceeded', () => {
    // 预置一行 self-enroll worker 占满 fleet
    ctx.persistence.upsertEnrolledWorker(
      {
        workerId: 'w_existingfleet',
        baseUrl: '',
        apiToken: VALID_TOKEN,
        displayName: 'exists',
        addedBy: 'self-enroll',
      },
      TEST_MASTER,
    )
    // 配额是 ctx 上的属性(与 workers.pair handler 同来源),不是 config。
    ctx.maxWorkers = 1
    const ws = makeWs()
    handleMessage(
      ws as never,
      connectFrame({ workerId: 'w_brandnewworkr' }),
      ctx,
      makeConfig(),
    )
    expect(ws.__closes).toEqual([{ code: 4401, reason: 'auth:quota_exceeded' }])
    const audits = getFleetDb().select().from(auditEvents).all()
    const rejected = audits.find(a =>
      a.action === 'gateway.connect.rejected'
      && (a.detail as { reason?: string }).reason === 'quota_exceeded',
    )
    expect(rejected).toBeTruthy()
    // 新 worker 没落库
    const newRow = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, 'w_brandnewworkr'))
      .get()
    expect(newRow).toBeUndefined()
  })

  test('5. 同 workerId 重连不带 enroll（loopback）→ 走原 node 路径，不 4401', () => {
    // 先 enroll
    handleMessage(makeWs() as never, connectFrame({}), ctx, makeConfig())
    // 再以 loopback 不带 enroll 重连
    const ws = makeWs(true, '127.0.0.1')
    handleMessage(
      ws as never,
      connectFrame({ enroll: null, deviceId: 'dev-2' }),
      ctx,
      makeConfig(),
    )
    expect(ws.__closes).toHaveLength(0)
    expect(ws.data.role).toBe('node')
    // fleet 行还在
    const row = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, WORKER_ID))
      .get()
    expect(row).toBeTruthy()
  })

  test('6. 重连带 enroll 同 displayName → 不写 enrolled audit（idempotent）', () => {
    handleMessage(makeWs() as never, connectFrame({}), ctx, makeConfig())
    const before = listAuditActions().filter(a => a === 'gateway.worker.enrolled').length
    expect(before).toBe(1)

    const ws2 = makeWs()
    handleMessage(ws2 as never, connectFrame({ deviceId: 'dev-2' }), ctx, makeConfig())
    expect(ws2.__closes).toHaveLength(0)

    const after = listAuditActions().filter(a => a === 'gateway.worker.enrolled').length
    expect(after).toBe(1)
  })

  test('7. 重连带 enroll 改 displayName → fleet 行更新 + 第二条 enrolled audit', () => {
    handleMessage(makeWs() as never, connectFrame({}), ctx, makeConfig())

    const ws2 = makeWs()
    handleMessage(
      ws2 as never,
      connectFrame({
        enroll: { joinToken: JOIN_TOKEN, apiToken: VALID_TOKEN, displayName: 'beta' },
        deviceId: 'dev-2',
      }),
      ctx,
      makeConfig(),
    )
    expect(ws2.__closes).toHaveLength(0)

    const row = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, WORKER_ID))
      .get()
    expect(row!.displayName).toBe('beta')

    const enrolledCount = listAuditActions().filter(a => a === 'gateway.worker.enrolled').length
    expect(enrolledCount).toBe(2)
  })

  test('8. enroll.apiToken 不匹配 wtk_ pattern → 协议层拒绝 close 4400', () => {
    const ws = makeWs()
    handleMessage(
      ws as never,
      connectFrame({ enroll: { joinToken: JOIN_TOKEN, apiToken: 'not_a_valid_token' } }),
      ctx,
      makeConfig(),
    )
    // parseFrame 内部失败,进 bad_frame 分支
    expect(ws.__closes).toEqual([{ code: 4400, reason: 'bad_frame' }])
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)
  })

  test('9. 远端 node 不带 enroll、gateway 也未配 sharedSecret → 维持 fail-closed', () => {
    // 与既有 auth.test.ts "remote：未配置 sharedSecret → 拒绝" 对齐:
    // gateway 没开 INTERNAL_SHARED_SECRET 时,远端 node 也没 enroll,
    // 应直接 4401 remote_requires_secret_but_unset,不会被 join_token 路径误吞。
    const ws = makeWs(false, '203.0.113.42')
    handleMessage(
      ws as never,
      connectFrame({ enroll: null }),
      ctx,
      makeConfig({ internalSharedSecret: undefined }),
    )
    expect(ws.__closes).toHaveLength(1)
    expect(ws.__closes[0]!.code).toBe(4401)
    expect(ws.__closes[0]!.reason).toBe('auth:remote_requires_secret_but_unset')
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)
  })

  test('补：sharedSecret + 无 enroll 的远端 node 路径不受 join_token 改动影响', () => {
    const ws = makeWs(false, '203.0.113.99')
    handleMessage(
      ws as never,
      connectFrame({ enroll: null, authToken: SHARED_SECRET, workerId: 'w_remoteclassic' }),
      ctx,
      makeConfig({ internalSharedSecret: SHARED_SECRET }),
    )
    expect(ws.__closes).toHaveLength(0)
    expect(ws.data.role).toBe('node')
    // fleet 不会因为 sharedSecret 路径而落 self-enroll 行
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)
  })
})

describe('upsertEnrolledWorker', () => {
  test('apiToken 不变更：unchanged 路径只刷 lastSeenAt', () => {
    const a = ctx.persistence.upsertEnrolledWorker(
      {
        workerId: WORKER_ID,
        baseUrl: '',
        apiToken: VALID_TOKEN,
        displayName: 'first',
        addedBy: 'self-enroll',
      },
      TEST_MASTER,
    )
    expect(a.kind).toBe('created')

    // 模拟 worker 重连 → 同 displayName / apiToken
    const b = ctx.persistence.upsertEnrolledWorker(
      {
        workerId: WORKER_ID,
        baseUrl: '',
        apiToken: SECOND_TOKEN,
        displayName: 'first',
        addedBy: 'self-enroll',
      },
      TEST_MASTER,
    )
    expect(b.kind).toBe('unchanged')
    expect(b.row.lastSeenAt).toBeDefined()
  })

  test('displayName 改变：updated 路径', () => {
    ctx.persistence.upsertEnrolledWorker(
      {
        workerId: WORKER_ID,
        baseUrl: '',
        apiToken: VALID_TOKEN,
        displayName: 'first',
        addedBy: 'self-enroll',
      },
      TEST_MASTER,
    )
    const r = ctx.persistence.upsertEnrolledWorker(
      {
        workerId: WORKER_ID,
        baseUrl: '',
        apiToken: VALID_TOKEN,
        displayName: 'second',
        addedBy: 'self-enroll',
      },
      TEST_MASTER,
    )
    expect(r.kind).toBe('updated')
    expect(r.row.displayName).toBe('second')
  })
})
