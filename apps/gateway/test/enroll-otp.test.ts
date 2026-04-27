import type { ConnectionData } from '../src/registry/types'
import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrame } from '@aiworker/gateway-proto'
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
import { ForwardTable, NodeRegistry, OperatorRegistry, PendingEnrollmentRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { handleEnrollApprove, handleEnrollList, handleEnrollReject } from '../src/router/methods/enroll'

/**
 * PLAN-019 S2 — PendingEnrollmentRegistry + enroll.list/approve/reject handler 单测。
 *
 * 全部用真 fleet.db（drizzle + bun:sqlite，临时目录）+ 直接调 handler，
 * 不经 Bun.serve；ws 用最小 stub 抓 send/close。覆盖 PLAN-019 §Test plan
 * 中 unit (gateway) 的 happy / expire / reject / collision / list / not_found
 * / quota_exceeded 七条路径。
 */

const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'
const SECOND_TOKEN = 'wtk_zyxwvutsrqponmlkjihgfedcba9876543210'
const WORKER_ID_A = 'w_aaaabbbbcccd'
const WORKER_ID_B = 'w_eeeeffffgggh'
const WORKER_ID_C = 'w_iiiijjjjkkkl'

interface WsStub {
  data: ConnectionData
  send: (msg: string) => void
  close: (code: number, reason?: string) => void
  __sent: string[]
  __closes: Array<{ code: number, reason?: string }>
}

function makeWs(deviceId = 'dev-otp'): WsStub {
  const ws: WsStub = {
    data: {
      role: undefined,
      agentId: undefined,
      deviceId,
      loopback: false,
      remoteAddress: '203.0.113.7',
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

let dir: string
let ctx: GatewayContext
let registry: PendingEnrollmentRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gw-enroll-otp-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  registry = new PendingEnrollmentRegistry({
    ttlMs: 50,
    onExpire: (entry) => {
      try {
        entry.ws.close(4408, 'enroll:expired')
      }
      catch { /* */ }
      persistence.recordAudit({
        actor: 'gateway',
        action: 'gateway.enrollment.expired',
        workerId: entry.workerId,
        detail: { displayName: entry.displayName },
      })
    },
  })
  ctx = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-enroll-otp-test'),
    masterKeyHex: TEST_MASTER,
    supervisor: null,
    maxWorkers: undefined,
    pendingEnrollments: registry,
  }
})

afterEach(() => {
  ctx.forwards.dispose()
  registry.dispose()
  closeFleetDb()
  rmSync(dir, { recursive: true, force: true })
})

function listAuditActions(): string[] {
  return getFleetDb().select().from(auditEvents).all().map(r => r.action)
}

describe('PendingEnrollmentRegistry', () => {
  test('1. happy path：submit → list → approve → fleet 行落库 + audit + ws 收到 enrollment.approved', async () => {
    const ws = makeWs()
    const { otp, expiresAt } = registry.submit({
      workerId: WORKER_ID_A,
      apiToken: VALID_TOKEN,
      displayName: 'alpha',
      ws: ws as never,
    })
    expect(otp).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(registry.size()).toBe(1)

    // list 走 handler
    const listResult = await handleEnrollList(ctx, {})
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      const r = listResult.result as { pending: Array<{ otp: string, workerId: string, displayName?: string }> }
      expect(r.pending).toHaveLength(1)
      expect(r.pending[0]!.otp).toBe(otp)
      expect(r.pending[0]!.workerId).toBe(WORKER_ID_A)
      expect(r.pending[0]!.displayName).toBe('alpha')
      // 关键：list 不暴露 apiToken / ws
      expect((r.pending[0] as Record<string, unknown>).apiToken).toBeUndefined()
      expect((r.pending[0] as Record<string, unknown>).ws).toBeUndefined()
    }

    // approve
    const ar = await handleEnrollApprove(ctx, { otp })
    expect(ar.ok).toBe(true)
    if (ar.ok) {
      const r = ar.result as { workerId: string, deviceToken: string }
      expect(r.workerId).toBe(WORKER_ID_A)
      expect(r.deviceToken).toBe(VALID_TOKEN)
    }

    // fleet 行落地
    const row = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, WORKER_ID_A))
      .get()
    expect(row).toBeTruthy()
    expect(row!.addedBy).toBe('otp')
    expect(row!.displayName).toBe('alpha')
    expect(row!.baseUrl).toBe('')

    // audit
    const actions = listAuditActions()
    expect(actions).toContain('gateway.enrollment.approved')

    // ws 拿到 enrollment.approved
    expect(ws.__sent).toHaveLength(1)
    const parsed = parseFrame(ws.__sent[0]!)
    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.frame.type === 'event') {
      expect(parsed.frame.name).toBe('enrollment.approved')
      const payload = parsed.frame.payload as { workerId: string, deviceToken: string }
      expect(payload.workerId).toBe(WORKER_ID_A)
      expect(payload.deviceToken).toBe(VALID_TOKEN)
    }

    // pop 后 list 为空
    expect(registry.size()).toBe(0)
  })

  test('2. expire：submit → 等 TTL → ws 收到 4408 close + audit gateway.enrollment.expired', async () => {
    const ws = makeWs()
    registry.submit({
      workerId: WORKER_ID_A,
      apiToken: VALID_TOKEN,
      displayName: 'alpha',
      ws: ws as never,
    })
    expect(registry.size()).toBe(1)
    // ttlMs=50,等待 100ms 让 setTimeout 触发
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(registry.size()).toBe(0)
    expect(ws.__closes).toEqual([{ code: 4408, reason: 'enroll:expired' }])
    expect(listAuditActions()).toContain('gateway.enrollment.expired')
  })

  test('3. reject：submit → reject → ws 收到 4403 close + audit gateway.enrollment.rejected', async () => {
    const ws = makeWs()
    const { otp } = registry.submit({
      workerId: WORKER_ID_A,
      apiToken: VALID_TOKEN,
      displayName: 'alpha',
      ws: ws as never,
    })
    const r = await handleEnrollReject(ctx, { otp })
    expect(r.ok).toBe(true)
    if (r.ok)
      expect((r.result as { rejected: boolean }).rejected).toBe(true)
    expect(ws.__closes).toEqual([{ code: 4403, reason: 'enroll:rejected' }])

    const actions = listAuditActions()
    expect(actions).toContain('gateway.enrollment.rejected')

    // reject 后 list 为空
    expect(registry.size()).toBe(0)
  })

  test('4. collision：generator 第一次返回与已有 entry 同 OTP → 自动重 roll', () => {
    let calls = 0
    const stubGen = (): string => {
      calls++
      // 第 1 / 2 次都返回 'AAAA-BBBB',第 3 次起返回 'CCCC-DDDD'
      return calls <= 2 ? 'AAAA-BBBB' : 'CCCC-DDDD'
    }
    const r = new PendingEnrollmentRegistry({ ttlMs: 1_000, generateOtp: stubGen })
    try {
      const ws1 = makeWs('dev-1')
      const a = r.submit({ workerId: WORKER_ID_A, apiToken: VALID_TOKEN, ws: ws1 as never })
      expect(a.otp).toBe('AAAA-BBBB')
      const ws2 = makeWs('dev-2')
      const b = r.submit({ workerId: WORKER_ID_B, apiToken: SECOND_TOKEN, ws: ws2 as never })
      // 第 1 次 stubGen 返回 AAAA-BBBB(占用),第 2 次又返回 AAAA-BBBB(还占用),第 3 次返回 CCCC-DDDD
      expect(b.otp).toBe('CCCC-DDDD')
      expect(calls).toBe(3)
      expect(r.size()).toBe(2)
    }
    finally {
      r.dispose()
    }
  })

  test('5. list with 3 pending：全部返回 + shape 不含 apiToken/ws', async () => {
    const w1 = makeWs('dev-1')
    const w2 = makeWs('dev-2')
    const w3 = makeWs('dev-3')
    registry.submit({ workerId: WORKER_ID_A, apiToken: VALID_TOKEN, displayName: 'alpha', ws: w1 as never })
    registry.submit({ workerId: WORKER_ID_B, apiToken: SECOND_TOKEN, displayName: 'beta', ws: w2 as never })
    registry.submit({ workerId: WORKER_ID_C, apiToken: VALID_TOKEN, ws: w3 as never })

    const r = await handleEnrollList(ctx, {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { pending: Array<Record<string, unknown>> }
      expect(result.pending).toHaveLength(3)
      const ids = result.pending.map(e => e.workerId).sort()
      expect(ids).toEqual([WORKER_ID_A, WORKER_ID_B, WORKER_ID_C].sort())
      for (const e of result.pending) {
        expect(e).toHaveProperty('otp')
        expect(e).toHaveProperty('submittedAt')
        expect(e).toHaveProperty('expiresAt')
        // 关键:apiToken / ws 不可见
        expect(e.apiToken).toBeUndefined()
        expect(e.ws).toBeUndefined()
      }
    }
  })

  test('6. approve OTP 不存在 → not_found,fleet 不变', async () => {
    const r = await handleEnrollApprove(ctx, { otp: 'XXXX-YYYY' })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.code).toBe('not_found')
    const rows = getFleetDb().select().from(registeredWorkers).all()
    expect(rows).toHaveLength(0)
  })

  test('7. quota_exceeded：fleet 已满 → approve 短路、entry 仍留在队列里', async () => {
    // 先填一行非 OTP 来源占满 fleet
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
    ctx.maxWorkers = 1

    const ws = makeWs()
    const { otp } = registry.submit({
      workerId: WORKER_ID_A,
      apiToken: SECOND_TOKEN,
      displayName: 'alpha',
      ws: ws as never,
    })
    const r = await handleEnrollApprove(ctx, { otp })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.code).toBe('quota_exceeded')
    // entry 应该仍在队列里(未消费),让 operator 决定是 enroll.reject 还是
    // 先扩配额再 enroll.approve
    expect(registry.has(otp)).toBe(true)
    // ws 不应收到 enrollment.approved(approve 失败时不下行)
    expect(ws.__sent).toHaveLength(0)
    // 新 worker 行没落库
    const newRow = getFleetDb()
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, WORKER_ID_A))
      .get()
    expect(newRow).toBeUndefined()
  })

  test('8. master_key_missing：未配 master key → approve 短路,entry 留在队列里', async () => {
    ctx.masterKeyHex = undefined
    const ws = makeWs()
    const { otp } = registry.submit({
      workerId: WORKER_ID_A,
      apiToken: VALID_TOKEN,
      ws: ws as never,
    })
    const r = await handleEnrollApprove(ctx, { otp })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.code).toBe('master_key_missing')
    expect(registry.has(otp)).toBe(true)
  })

  test('9. dispose 清空所有 timer + entries', () => {
    const r = new PendingEnrollmentRegistry({ ttlMs: 5_000 })
    r.submit({ workerId: WORKER_ID_A, apiToken: VALID_TOKEN, ws: makeWs() as never })
    r.submit({ workerId: WORKER_ID_B, apiToken: SECOND_TOKEN, ws: makeWs() as never })
    expect(r.size()).toBe(2)
    r.dispose()
    expect(r.size()).toBe(0)
    expect(() => r.submit({ workerId: WORKER_ID_C, apiToken: VALID_TOKEN, ws: makeWs() as never }))
      .toThrow(/already disposed/)
  })

  test('10. reject OTP 不存在 → ok=true rejected=false', async () => {
    const r = await handleEnrollReject(ctx, { otp: 'XXXX-YYYY' })
    expect(r.ok).toBe(true)
    if (r.ok)
      expect((r.result as { rejected: boolean }).rejected).toBe(false)
  })
})

describe('handler feature_disabled fallback', () => {
  test('ctx.pendingEnrollments 缺省时三个 handler 都返回 feature_disabled', async () => {
    const noRegistryCtx: GatewayContext = { ...ctx, pendingEnrollments: undefined }
    for (const h of [handleEnrollList, handleEnrollApprove, handleEnrollReject]) {
      const r = await h(noRegistryCtx, { otp: 'AAAA-BBBB' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('feature_disabled')
    }
  })
})
