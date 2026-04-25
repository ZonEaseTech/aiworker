import type { Envelope } from '@aiworker/shared'
import type { CronJobInput, CronJobPatch, CronJobRecord } from './types'

import { cronJobs, getWorkerDb } from '@aiworker/storage-sqlite/worker'

import consola from 'consola'
import { CronExpressionParser } from 'cron-parser'
import { and, eq, lte } from 'drizzle-orm'

/**
 * Orchestrator 子集——只需要 `ingest`。给单测注入 stub 用。
 */
export interface CronOrchestratorLike {
  ingest: (envelope: Envelope) => Promise<void>
}

export interface CronServiceDeps {
  workerId: string
  /**
   * 懒取 orchestrator——遵循项目 hot-reload 不变量：runtime swap 后必须拿
   * 到新 orchestrator，不能把旧实例冻进闭包。
   */
  getOrchestrator: () => CronOrchestratorLike
}

const DEFAULT_TICK_INTERVAL_MS = 60_000
const DEFAULT_ACCOUNT_ID = 'sys:cron'

/**
 * Cron 调度服务（PLAN-014 §F4）。
 *
 * - `start()` 起 `setInterval` 每分钟 tick；
 * - 每次 tick 把所有 `enabled=true && nextRunAt <= now()` 的 row 合成
 *   envelope 喂给 `orchestrator.ingest`，并用 `cron-parser` 算出新的
 *   `nextRunAt`；
 * - `stop()` 清掉 setInterval，幂等；runtime hot-reload 通过 dispose 调用，
 *   保证老 runtime 的 cron tick 不会污染新 runtime；
 * - tick 内置 reentrancy 锁：单 cron 进程不会同时跑两次 tick；
 * - addJob/updateJob 都用 cron-parser 校验表达式合法性，非法表达式直接抛错。
 *
 * 注意：cron tick 不进 orchestrator hot path——它只在 setInterval 循环里
 * fire envelope，不参与会话内调度（与 evolution observer 离 hot path 类似）。
 */
export class CronService {
  private handle: ReturnType<typeof setInterval> | null = null
  /** tick reentrancy 锁，防止 setInterval 派发的两次 tick 重叠。 */
  private ticking = false

  constructor(private readonly deps: CronServiceDeps) {}

  /**
   * 起 tick loop。`intervalMs` 可选，仅测试用；生产固定 60s。
   * 重复调用幂等（已 start 直接返回）。
   */
  start(intervalMs: number = DEFAULT_TICK_INTERVAL_MS): void {
    if (this.handle !== null)
      return
    this.handle = setInterval(() => {
      void this.tick().catch(err => consola.warn(`[cron ${this.deps.workerId}] tick failed: ${String(err)}`))
    }, intervalMs)
  }

  /** 停 tick loop。幂等。 */
  stop(): void {
    if (this.handle === null)
      return
    clearInterval(this.handle)
    this.handle = null
  }

  // ---- CRUD ----

  /**
   * 新增一条 cron 任务。`expression` 非法时抛 cron-parser 原始错误。
   * 默认 `enabled=true` + `accountId='sys:cron'`。
   */
  async addJob(input: CronJobInput): Promise<CronJobRecord> {
    // 校验 expression 合法性——非法直接抛，不写库。
    const initialNext = computeNextRun(input.expression, new Date())
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const enabled = input.enabled ?? true
    const accountId = input.accountId ?? DEFAULT_ACCOUNT_ID
    if (accountId.length === 0)
      throw new Error('cron job accountId 不能为空字符串')

    const row: typeof cronJobs.$inferInsert = {
      id,
      expression: input.expression,
      prompt: input.prompt,
      channel: input.channel,
      chatId: input.chatId,
      accountId,
      enabled,
      lastRunAt: null,
      // disabled 的 job 不参与 tick；nextRunAt 留 null 当显式标记。
      nextRunAt: enabled ? initialNext.toISOString() : null,
      createdAt: now,
      updatedAt: now,
    }
    getWorkerDb().insert(cronJobs).values(row).run()
    const persisted = getWorkerDb().select().from(cronJobs).where(eq(cronJobs.id, id)).get()!
    return rowToRecord(persisted)
  }

  async listJobs(): Promise<CronJobRecord[]> {
    const rows = getWorkerDb().select().from(cronJobs).all()
    return rows.map(rowToRecord)
  }

  async getJob(id: string): Promise<CronJobRecord | null> {
    const row = getWorkerDb().select().from(cronJobs).where(eq(cronJobs.id, id)).get()
    return row ? rowToRecord(row) : null
  }

  async removeJob(id: string): Promise<{ removed: boolean }> {
    const db = getWorkerDb()
    const existing = db.select({ id: cronJobs.id }).from(cronJobs).where(eq(cronJobs.id, id)).get()
    if (!existing)
      return { removed: false }
    db.delete(cronJobs).where(eq(cronJobs.id, id)).run()
    return { removed: true }
  }

  /**
   * 局部更新；patch 中提供的字段才会被改写。
   * 如果 `expression` 或 `enabled` 改变，会重算 `nextRunAt`：
   *   - enabled=true → 用新 expression 算 next
   *   - enabled=false → nextRunAt 置 null
   */
  async updateJob(id: string, patch: CronJobPatch): Promise<CronJobRecord | null> {
    const row = getWorkerDb().select().from(cronJobs).where(eq(cronJobs.id, id)).get()
    if (!row)
      return null

    const next: Partial<typeof cronJobs.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    }

    let needRecomputeNext = false
    if (patch.expression !== undefined) {
      // 校验合法性——非法抛错不进 DB。
      computeNextRun(patch.expression, new Date())
      next.expression = patch.expression
      needRecomputeNext = true
    }
    if (patch.prompt !== undefined)
      next.prompt = patch.prompt
    if (patch.channel !== undefined)
      next.channel = patch.channel
    if (patch.chatId !== undefined)
      next.chatId = patch.chatId
    if (patch.accountId !== undefined) {
      if (patch.accountId.length === 0)
        throw new Error('cron job accountId 不能为空字符串')
      next.accountId = patch.accountId
    }
    if (patch.enabled !== undefined) {
      next.enabled = patch.enabled
      needRecomputeNext = true
    }

    if (needRecomputeNext) {
      const enabled = patch.enabled ?? row.enabled
      const expression = patch.expression ?? row.expression
      next.nextRunAt = enabled ? computeNextRun(expression, new Date()).toISOString() : null
    }

    getWorkerDb().update(cronJobs).set(next).where(eq(cronJobs.id, id)).run()
    const updated = getWorkerDb().select().from(cronJobs).where(eq(cronJobs.id, id)).get()!
    return rowToRecord(updated)
  }

  // ---- tick ----

  /**
   * 拉所有到期 job 并依次 fire。
   * 测试可以直接 `await tick()` 而不 start setInterval，绕开计时器。
   */
  async tick(now: Date = new Date()): Promise<void> {
    if (this.ticking)
      return
    this.ticking = true
    try {
      const nowIso = now.toISOString()
      // ISO 8601 字符串按字典序与时间顺序一致，这里 lte 直接拿到所有 nextRunAt <= now 的行。
      const rows = getWorkerDb()
        .select()
        .from(cronJobs)
        .where(and(eq(cronJobs.enabled, true), lte(cronJobs.nextRunAt, nowIso)))
        .all()
      for (const row of rows)
        await this.fireJob(row, now)
    }
    finally {
      this.ticking = false
    }
  }

  private async fireJob(row: typeof cronJobs.$inferSelect, now: Date): Promise<void> {
    const envelope: Envelope = {
      workerId: this.deps.workerId,
      channel: row.channel,
      accountId: row.accountId,
      chatId: row.chatId,
      text: row.prompt,
      receivedAt: now.toISOString(),
      raw: { source: 'cron', jobId: row.id },
    }

    // 先算 next，再写库（写库失败也不至于丢 next 算出来的结果——下一次 tick 可
    // 以重算）。next 计算异常时把 nextRunAt 设回 null，把 job 从 tick 扫描里
    // 摘出去等待 operator 排查。
    let nextIso: string | null = null
    try {
      nextIso = computeNextRun(row.expression, now).toISOString()
    }
    catch (err) {
      consola.warn(`[cron ${row.id}] expression "${row.expression}" 异常，停止后续触发: ${String(err)}`)
    }

    const nowIso = now.toISOString()
    getWorkerDb().update(cronJobs).set({
      lastRunAt: nowIso,
      nextRunAt: nextIso,
      updatedAt: nowIso,
    }).where(eq(cronJobs.id, row.id)).run()

    // ingest 不阻塞 tick——cron 不进 orchestrator hot path，await 只是把异常
    // catch 住继续下一条；tick reentrancy 锁防止下一次 setInterval 重叠。
    try {
      await this.deps.getOrchestrator().ingest(envelope)
    }
    catch (err) {
      consola.warn(`[cron ${row.id}] orchestrator.ingest 失败: ${String(err)}`)
    }
  }
}

/** 用 cron-parser 解析 5-field expression 并返回下一次触发的 Date。非法直接抛。 */
function computeNextRun(expression: string, currentDate: Date): Date {
  return CronExpressionParser.parse(expression, { currentDate }).next().toDate()
}

function rowToRecord(row: typeof cronJobs.$inferSelect): CronJobRecord {
  return {
    id: row.id,
    expression: row.expression,
    prompt: row.prompt,
    channel: row.channel,
    chatId: row.chatId,
    accountId: row.accountId,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
