import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  closeWorkerDb,
  conversations,
  getWorkerDb,
  initWorkerDb,
  messages,
  runWorkerMigrations,
} from './index'

/**
 * REFACTOR-005 perf smoke：用 EXPLAIN QUERY PLAN 验证新索引被 planner 选中。
 * 同时跑一个 100k messages 单 conversation 的 wallclock 检查，全表扫不可能在
 * 200ms 内回点查（即使有 page cache）。
 */
describe('worker schema indexes (REFACTOR-005)', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-perf-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })
  afterEach(() => {
    closeWorkerDb()
  })

  function explain(query: string): string {
    const rows = getWorkerDb().all<{ detail: string }>(sql.raw(`EXPLAIN QUERY PLAN ${query}`))
    return rows.map(r => r.detail).join('\n')
  }

  it('messages_conversation_id_idx 命中 conversationId 点查', () => {
    const plan = explain(`SELECT * FROM messages WHERE conversation_id = 'x'`)
    expect(plan).toContain('messages_conversation_id_idx')
  })

  it('conversations_lookup_idx 命中 channel+chatId+threadId+status 复合 where', () => {
    const plan = explain(`SELECT * FROM conversations WHERE channel='telegram' AND chat_id='c1' AND thread_id='t1' AND status='open'`)
    expect(plan).toContain('conversations_lookup_idx')
  })

  it('conversations_lookup_idx 也能服务 channel+chatId+status 前缀查询（threadId 为 null）', () => {
    const plan = explain(`SELECT * FROM conversations WHERE channel='telegram' AND chat_id='c1' AND status='open'`)
    // 复合索引前两列前缀匹配应仍走索引
    expect(plan).toContain('conversations_lookup_idx')
  })

  it('conversations_last_active_at_idx 服务 ORDER BY last_active_at DESC LIMIT', () => {
    const plan = explain(`SELECT * FROM conversations ORDER BY last_active_at DESC LIMIT 200`)
    expect(plan).toContain('conversations_last_active_at_idx')
  })

  it('cron_jobs_due_idx 服务 enabled=1 AND next_run_at<=? 的 tick 扫描', () => {
    const plan = explain(`SELECT * FROM cron_jobs WHERE enabled=1 AND next_run_at <= '2026-01-01T00:00:00.000Z'`)
    expect(plan).toContain('cron_jobs_due_idx')
  })

  it('evolution_observations_noticed_at_idx 服务 ORDER BY noticed_at DESC LIMIT', () => {
    const plan = explain(`SELECT * FROM evolution_observations ORDER BY noticed_at DESC LIMIT 200`)
    expect(plan).toContain('evolution_observations_noticed_at_idx')
  })

  it('execution_logs_conversation_id_idx 服务 IN (?) 关联拉取', () => {
    const plan = explain(`SELECT * FROM execution_logs WHERE conversation_id IN ('a','b','c')`)
    expect(plan).toContain('execution_logs_conversation_id_idx')
  })

  it('agent_tasks_created_at_idx 服务 ORDER BY created_at DESC LIMIT', () => {
    const plan = explain(`SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 200`)
    expect(plan).toContain('agent_tasks_created_at_idx')
  })

  it('brain_artifacts indexes服务 scope+type 与 status+type 列表查询 (PLAN-099)', () => {
    const byScopeType = explain(`SELECT * FROM brain_artifacts WHERE scope_id = 'backend-hire-q3' AND type = 'candidate-resume'`)
    expect(byScopeType).toContain('brain_artifacts_scope_type_idx')

    const byStatusType = explain(`SELECT * FROM brain_artifacts WHERE status = 'active' AND type = 'code-module'`)
    expect(byStatusType).toContain('brain_artifacts_status_type_idx')

    const byUpdated = explain(`SELECT * FROM brain_artifacts ORDER BY updated_at DESC LIMIT 50`)
    expect(byUpdated).toContain('brain_artifacts_updated_at_idx')
  })

  it('session_entries indexes support active-session lookup and maintenance scans', () => {
    const byConversation = explain(`SELECT * FROM session_entries WHERE current_conversation_id = 'c1'`)
    expect(byConversation).toContain('session_entries_current_conversation_id_idx')

    const byActivity = explain(`SELECT * FROM session_entries ORDER BY last_interaction_at DESC LIMIT 200`)
    expect(byActivity).toContain('session_entries_last_interaction_at_idx')
  })

  it('100k messages 单 conversation 点查在毫秒级别', () => {
    const db = getWorkerDb()
    db.insert(conversations).values({
      id: 'c-target',
      channel: 'web',
      chatId: 'chat-target',
    }).run()
    db.insert(conversations).values({
      id: 'c-noise',
      channel: 'web',
      chatId: 'chat-noise',
    }).run()

    // 100k rows：99k 噪声 + 1k 目标 conversation。批量插入跑一次 transaction。
    const total = 100_000
    const targetCount = 1000
    const stmt = `INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', 'x', '2026-01-01T00:00:00.000Z')`
    db.run(sql.raw('BEGIN'))
    try {
      const insert = (db as unknown as { $client: { prepare: (q: string) => { run: (...args: unknown[]) => void } } }).$client.prepare(stmt)
      for (let i = 0; i < total - targetCount; i++)
        insert.run('c-noise')
      for (let i = 0; i < targetCount; i++)
        insert.run('c-target')
      db.run(sql.raw('COMMIT'))
    }
    catch (err) {
      db.run(sql.raw('ROLLBACK'))
      throw err
    }

    const start = performance.now()
    const rows = db.all<{ id: number }>(
      sql`SELECT id FROM ${messages} WHERE ${messages.conversationId} = ${'c-target'}`,
    )
    const elapsed = performance.now() - start
    expect(rows).toHaveLength(targetCount)
    // 全表扫 100k 行通常会到 50-200ms 区间；点查应该 << 50ms。
    // 留 100ms buffer 兼容慢一点的 CI runner。
    expect(elapsed).toBeLessThan(100)
  })
})
