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
  registeredWorkers,
  runFleetMigrations,
} from '@aiworker/storage-sqlite/fleet'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { PendingEnrollmentRegistry } from '../src/registry/pending'
import { FleetPersistence } from '../src/registry/persistence'
import { __handleCloseForTest as handleClose, __handleMessageForTest as handleMessage } from '../src/server'

/**
 * PLAN-019 S3 — gateway 侧 path-aware OTP enroll handshake 测试。
 *
 * 覆盖范围（S3 owns）：
 * - `/enroll-ws` + `enroll.mode='otp'` happy path → 推 enrollment.otp event +
 *   audit gateway.enrollment.requested + ws.data.role === 'node-pending'。
 * - `/enroll-ws` + 非 OTP（缺 enroll、enroll.mode='join-token'）→ close 4400
 *   wrong_path:expected_enroll_otp + audit gateway.connect.rejected。
 * - `/ws` + `enroll.mode='otp'` → close 4400 wrong_path:otp_must_use_enroll_ws。
 * - pending 状态下 ws 主动关闭 → handleClose 调 ctx.pending.removeByWs，pending
 *   表清干净 + audit gateway.enrollment.abandoned。
 * - `node-pending` 状态下任何 request/event 帧被忽略，连接保持。
 *
 * S2 覆盖：approve / reject / TTL 过期路径。S3 不重复测试。
 */

const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'
const JOIN_TOKEN = 'join-secret-abcdef0123456789'
const WORKER_ID = 'w_aaaabbbbcccd'

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
      remoteAddress: opts.remoteAddress ?? '8.8.8.8',
      connectedAt: Date.now(),
      subscribedAll: true,
      path: opts.path ?? '/enroll-ws',
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
let pending: PendingEnrollmentRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gw-enroll-otp-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  pending = new PendingEnrollmentRegistry({ ttlMs: 60_000 })
  ctx = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-enroll-otp-test'),
    masterKeyHex: TEST_MASTER,
    supervisor: null,
    maxWorkers: undefined,
    pending,
  }
})

afterEach(() => {
  ctx.forwards.dispose()
  ctx.pending?.dispose()
  closeFleetDb()
  rmSync(dir, { recursive: true, force: true })
})

interface ConnectFrameOpts {
  workerId?: string
  deviceId?: string
  authToken?: string
  enroll?:
    | { mode: 'otp', apiToken: string, displayName?: string }
    | { mode: 'join-token', joinToken: string, apiToken: string, displayName?: string }
    | null
}

function connectFrame(opts: ConnectFrameOpts = {}): string {
  const frame: Record<string, unknown> = {
    type: 'connect',
    role: 'node',
    agentId: opts.workerId ?? WORKER_ID,
    deviceId: opts.deviceId ?? 'dev-1',
    auth: { token: opts.authToken ?? '' },
  }
  if (opts.enroll === undefined) {
    frame.enroll = { mode: 'otp', apiToken: VALID_TOKEN, displayName: 'alpha' }
  }
  else if (opts.enroll !== null) {
    frame.enroll = opts.enroll
  }
  return JSON.stringify(frame)
}

function listAuditActions(): string[] {
  return getFleetDb().select().from(auditEvents).all().map(r => r.action)
}

function lastAudit(action: string): { detail: Record<string, unknown> } | undefined {
  const rows = getFleetDb().select().from(auditEvents).all()
  const row = rows.reverse().find(r => r.action === action)
  if (!row)
    return undefined
  return { detail: (row.detail ?? {}) as Record<string, unknown> }
}

describe('PLAN-019 S3 — /enroll-ws OTP submit', () => {
  test('1. happy path：推 enrollment.otp + 落 requested audit + role=node-pending + 不进 fleet', () => {
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(ws as never, connectFrame(), ctx, makeConfig())

    expect(ws.__closes).toHaveLength(0)
    expect(ws.data.role).toBe('node-pending')
    expect(ws.data.agentId).toBe(WORKER_ID)

    // 推送了 enrollment.otp event
    expect(ws.__sent).toHaveLength(1)
    const sent = JSON.parse(ws.__sent[0]!) as {
      type: string
      name: string
      payload: { workerId: string, otp: string, expiresAt: number }
    }
    expect(sent.type).toBe('event')
    expect(sent.name).toBe('enrollment.otp')
    expect(sent.payload.workerId).toBe(WORKER_ID)
    expect(sent.payload.otp).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(sent.payload.expiresAt).toBeGreaterThan(Date.now())

    // pending 表有一条
    expect(pending.size()).toBe(1)
    expect(pending.list()).toHaveLength(1)
    expect(pending.list()[0]!.workerId).toBe(WORKER_ID)

    // fleet.db 不写 row
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)

    // audit 落 requested，但不写 connect.accepted（OTP 还没真正建立 node）
    const actions = listAuditActions()
    expect(actions).toContain('gateway.enrollment.requested')
    expect(actions).not.toContain('gateway.connect.accepted')
    expect(actions).not.toContain('gateway.worker.enrolled')

    // audit detail 存哈希前缀，不存明文 OTP
    const requested = lastAudit('gateway.enrollment.requested')!
    expect(requested.detail.workerId).toBe(WORKER_ID)
    expect(requested.detail.otpHash).toMatch(/^[0-9a-f]{8}$/)
    expect(JSON.stringify(requested.detail)).not.toContain(sent.payload.otp)
  })

  test('2. /enroll-ws 缺 enroll → close 4400 wrong_path + audit rejected', () => {
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(ws as never, connectFrame({ enroll: null }), ctx, makeConfig())

    expect(ws.__closes).toEqual([{ code: 4400, reason: 'wrong_path:expected_enroll_otp' }])
    expect(ws.data.role).toBeUndefined()
    expect(pending.size()).toBe(0)

    const rejected = lastAudit('gateway.connect.rejected')!
    expect(rejected.detail.reason).toBe('wrong_path:expected_enroll_otp')
    expect(rejected.detail.path).toBe('/enroll-ws')
  })

  test('3. /enroll-ws + enroll.mode=join-token → close 4400 wrong_path', () => {
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(
      ws as never,
      connectFrame({
        enroll: { mode: 'join-token', joinToken: JOIN_TOKEN, apiToken: VALID_TOKEN },
      }),
      ctx,
      makeConfig(),
    )
    expect(ws.__closes).toEqual([{ code: 4400, reason: 'wrong_path:expected_enroll_otp' }])
    expect(pending.size()).toBe(0)

    const rejected = lastAudit('gateway.connect.rejected')!
    expect(rejected.detail.reason).toBe('wrong_path:expected_enroll_otp')
  })

  test('4. /ws + enroll.mode=otp → close 4400 wrong_path:otp_must_use_enroll_ws', () => {
    const ws = makeWs({ path: '/ws' })
    handleMessage(ws as never, connectFrame(), ctx, makeConfig())

    expect(ws.__closes).toEqual([{ code: 4400, reason: 'wrong_path:otp_must_use_enroll_ws' }])
    expect(ws.data.role).toBeUndefined()
    expect(pending.size()).toBe(0)
    // fleet 不变，没有 enrollment.requested audit
    const rejected = lastAudit('gateway.connect.rejected')!
    expect(rejected.detail.reason).toBe('wrong_path:otp_must_use_enroll_ws')
    expect(rejected.detail.path).toBe('/ws')
    expect(listAuditActions()).not.toContain('gateway.enrollment.requested')
  })

  test('5. node-pending 期间 ws.close → removeByWs 清表 + abandoned audit', () => {
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(ws as never, connectFrame(), ctx, makeConfig())
    expect(ws.data.role).toBe('node-pending')
    expect(pending.size()).toBe(1)

    handleClose(ws as never, 1000, 'client_closed', ctx)

    expect(pending.size()).toBe(0)
    const abandoned = lastAudit('gateway.enrollment.abandoned')!
    expect(abandoned.detail.workerId).toBe(WORKER_ID)
    expect(abandoned.detail.code).toBe(1000)
  })

  test('6. node-pending 期间 ws.close 但 entry 已被 approve/reject → 幂等不写 abandoned audit', () => {
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(ws as never, connectFrame(), ctx, makeConfig())
    // 模拟 operator 先 approve
    const list = pending.list()
    const otp = list[0]!.otp
    const entry = pending.approve(otp)
    expect(entry).toBeTruthy()
    expect(pending.size()).toBe(0)

    handleClose(ws as never, 1000, 'after_approve', ctx)
    // pending 仍然空
    expect(pending.size()).toBe(0)
    // 不应再写 abandoned audit
    const abandonedRows = getFleetDb()
      .select()
      .from(auditEvents)
      .all()
      .filter(r => r.action === 'gateway.enrollment.abandoned')
    expect(abandonedRows).toHaveLength(0)
  })

  test('7. node-pending 状态收到 request 帧 → 忽略，不 close，pending 表保留', () => {
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(ws as never, connectFrame(), ctx, makeConfig())
    expect(ws.data.role).toBe('node-pending')

    const stray = JSON.stringify({
      type: 'request',
      id: 'req-1',
      method: 'workers.list',
      params: {},
    })
    handleMessage(ws as never, stray, ctx, makeConfig())
    // 没有发送响应，没有关闭
    expect(ws.__closes).toHaveLength(0)
    // 仍然只发了首帧的 enrollment.otp
    expect(ws.__sent).toHaveLength(1)
    expect(pending.size()).toBe(1)
  })

  test('8. /ws + enroll.mode=join-token（PLAN-018 既有路径）不受 path-aware 改动影响', () => {
    const ws = makeWs({ path: '/ws' })
    handleMessage(
      ws as never,
      connectFrame({
        enroll: { mode: 'join-token', joinToken: JOIN_TOKEN, apiToken: VALID_TOKEN, displayName: 'classic' },
      }),
      ctx,
      makeConfig(),
    )
    // PLAN-018 happy path：升级为 node，落 fleet 行
    expect(ws.__closes).toHaveLength(0)
    expect(ws.data.role).toBe('node')
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.addedBy).toBe('self-enroll')
  })

  test('9. ctx.pending 缺失 → close 4500 enroll_unavailable（运维兜底）', () => {
    const localCtx: GatewayContext = { ...ctx, pending: undefined }
    const ws = makeWs({ path: '/enroll-ws' })
    handleMessage(ws as never, connectFrame(), ctx === localCtx ? ctx : localCtx, makeConfig())
    expect(ws.__closes).toEqual([{ code: 4500, reason: 'enroll_unavailable' }])
  })
})
