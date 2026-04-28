import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditEventSchema } from '@zonease/aiworker-gateway-proto'
import {
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@zonease/aiworker-storage-sqlite/fleet'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { handleAuditList } from '../src/router/methods/audit'

/**
 * FEAT-034 Phase 2 — fleet UI `/admin/audit` 浏览能力的 server-side 校验：
 *
 * - 默认按 id 倒序、`limit` 默认 50、可分页
 * - `before` 游标只返回更早的行
 * - `action` 前缀过滤推到 SQL（LIKE 'gateway.connect.%' 等）
 * - `workerId` 精确过滤
 * - 结果通过 proto `auditEventSchema` 二次校验，不会偷偷漏字段
 */

let dir: string
let ctx: GatewayContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gw-audit-list-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  ctx = {
    persistence: new FleetPersistence(getFleetDb()),
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('audit-list-test'),
  }
})

afterEach(() => {
  ctx.forwards.dispose()
  closeFleetDb()
  rmSync(dir, { recursive: true, force: true })
})

function seedRows(): void {
  // 7 条 audit，按插入顺序 id=1..7。倒序后第一条应是 id=7。
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.worker.paired', workerId: 'w_a', detail: { ix: 1 } })
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.connect.accepted', workerId: 'w_a', detail: { ix: 2 } })
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.connect.rejected', workerId: 'w_b', detail: { ix: 3 } })
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.method.invoked', workerId: 'w_a', detail: { ix: 4 } })
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.connect.accepted', workerId: 'w_c', detail: { ix: 5 } })
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.method.invoked', workerId: 'w_b', detail: { ix: 6 } })
  ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.worker.paired', workerId: 'w_c', detail: { ix: 7 } })
}

describe('audit.list', () => {
  test('空表返回 events=[] hasMore=false', async () => {
    const r = await handleAuditList(ctx, {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { events: unknown[], hasMore: boolean }
      expect(result.events).toEqual([])
      expect(result.hasMore).toBe(false)
    }
  })

  test('默认按 id 倒序返回所有行', async () => {
    seedRows()
    const r = await handleAuditList(ctx, {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { events: Array<{ id: number, action: string }>, hasMore: boolean }
      expect(result.events.map(e => e.id)).toEqual([7, 6, 5, 4, 3, 2, 1])
      expect(result.hasMore).toBe(false)
      // proto schema 校验
      for (const e of result.events)
        expect(() => auditEventSchema.parse(e)).not.toThrow()
    }
  })

  test('limit + before 分页：limit=3 拿前 3 条，再用 before=last.id 拿下一页', async () => {
    seedRows()
    const r1 = await handleAuditList(ctx, { limit: 3 })
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      const page1 = r1.result as { events: Array<{ id: number }>, hasMore: boolean }
      expect(page1.events.map(e => e.id)).toEqual([7, 6, 5])
      expect(page1.hasMore).toBe(true)
      const r2 = await handleAuditList(ctx, { limit: 3, before: page1.events[page1.events.length - 1]!.id })
      expect(r2.ok).toBe(true)
      if (r2.ok) {
        const page2 = r2.result as { events: Array<{ id: number }>, hasMore: boolean }
        expect(page2.events.map(e => e.id)).toEqual([4, 3, 2])
        expect(page2.hasMore).toBe(true)
        const r3 = await handleAuditList(ctx, { limit: 3, before: page2.events[page2.events.length - 1]!.id })
        expect(r3.ok).toBe(true)
        if (r3.ok) {
          const page3 = r3.result as { events: Array<{ id: number }>, hasMore: boolean }
          expect(page3.events.map(e => e.id)).toEqual([1])
          expect(page3.hasMore).toBe(false)
        }
      }
    }
  })

  test('action 前缀过滤：只取 gateway.connect.*', async () => {
    seedRows()
    const r = await handleAuditList(ctx, { action: 'gateway.connect.' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { events: Array<{ id: number, action: string }>, hasMore: boolean }
      expect(result.events.map(e => e.action)).toEqual([
        'gateway.connect.accepted',
        'gateway.connect.rejected',
        'gateway.connect.accepted',
      ])
    }
  })

  test('workerId 精确过滤', async () => {
    seedRows()
    const r = await handleAuditList(ctx, { workerId: 'w_a' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { events: Array<{ id: number, workerId: string | null }>, hasMore: boolean }
      expect(result.events.every(e => e.workerId === 'w_a')).toBe(true)
      expect(result.events.map(e => e.id)).toEqual([4, 2, 1])
    }
  })

  test('action + workerId 组合过滤', async () => {
    seedRows()
    const r = await handleAuditList(ctx, { action: 'gateway.connect.', workerId: 'w_a' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { events: Array<{ id: number }>, hasMore: boolean }
      expect(result.events.map(e => e.id)).toEqual([2])
    }
  })

  test('limit 上限 200：超出 max 由 proto / handler 兜底（这里 handler 直接 clamp）', async () => {
    // schema 不允许 limit>200，这里直接试 limit=300 应被 invalid_params 拒。
    const r = await handleAuditList(ctx, { limit: 300 })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.code).toBe('invalid_params')
  })

  test('action LIKE 注入：% / _ 会按字面量转义，不会误匹配其他行', async () => {
    ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.percent%here', workerId: null })
    ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.percentXhere', workerId: null })
    ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.under_score', workerId: null })
    ctx.persistence.recordAudit({ actor: 'gateway', action: 'gateway.underXscore', workerId: null })
    const r = await handleAuditList(ctx, { action: 'gateway.percent%here' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = r.result as { events: Array<{ action: string }> }
      expect(result.events.map(e => e.action)).toEqual(['gateway.percent%here'])
    }
    const r2 = await handleAuditList(ctx, { action: 'gateway.under_score' })
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      const result = r2.result as { events: Array<{ action: string }> }
      expect(result.events.map(e => e.action)).toEqual(['gateway.under_score'])
    }
  })
})
