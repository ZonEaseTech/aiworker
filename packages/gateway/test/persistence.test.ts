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
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { FleetPersistence } from '../src/registry/persistence'

/**
 * REFACTOR-007 §3 — 验证 fleet 持久化层的 count / list 走 SQL 而非 JS 端聚合。
 *
 * 不需要直接 spy SQL（Bun sqlite 没有 query log hook），但功能层面足以保证：
 * - count 返回精确行数（不依赖 .all().length）
 * - list 排序与新插入时间一致（addedAt DESC，下推到 SQL ORDER BY）
 */

const MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'

let dir: string
let persistence: FleetPersistence

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gw-fleet-persist-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  persistence = new FleetPersistence(getFleetDb())
})

afterEach(() => {
  closeFleetDb()
  rmSync(dir, { recursive: true, force: true })
})

describe('FleetPersistence.count / list', () => {
  test('countRegisteredWorkers 空表返回 0', () => {
    expect(persistence.countRegisteredWorkers()).toBe(0)
  })

  test('countRegisteredWorkers 与实际行数一致', () => {
    for (let i = 0; i < 5; i++) {
      persistence.createRegisteredWorker(
        {
          workerId: `w_count_${i.toString().padStart(8, '0')}`,
          baseUrl: 'http://w',
          apiToken: VALID_TOKEN,
          displayName: `n${i}`,
        },
        MASTER,
      )
    }
    expect(persistence.countRegisteredWorkers()).toBe(5)
    persistence.removeRegisteredWorker('w_count_00000002')
    expect(persistence.countRegisteredWorkers()).toBe(4)
  })

  test('listRegisteredWorkers 按 addedAt 降序返回（SQL ORDER BY 下推）', async () => {
    persistence.createRegisteredWorker(
      { workerId: 'w_old00000001', baseUrl: 'http://w', apiToken: VALID_TOKEN, displayName: 'old' },
      MASTER,
    )
    // addedAt 精度是毫秒；保险起见隔一帧再插入下一行。
    await new Promise(r => setTimeout(r, 5))
    persistence.createRegisteredWorker(
      { workerId: 'w_mid00000002', baseUrl: 'http://w', apiToken: VALID_TOKEN, displayName: 'mid' },
      MASTER,
    )
    await new Promise(r => setTimeout(r, 5))
    persistence.createRegisteredWorker(
      { workerId: 'w_new00000003', baseUrl: 'http://w', apiToken: VALID_TOKEN, displayName: 'new' },
      MASTER,
    )

    const rows = persistence.listRegisteredWorkers()
    expect(rows.map(r => r.id)).toEqual(['w_new00000003', 'w_mid00000002', 'w_old00000001'])
    // 不返回加密列。
    for (const r of rows) {
      expect((r as Record<string, unknown>).apiTokenEnc).toBeUndefined()
      expect((r as Record<string, unknown>).nonce).toBeUndefined()
      expect((r as Record<string, unknown>).authTag).toBeUndefined()
    }
  })
})
