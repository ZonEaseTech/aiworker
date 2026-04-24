import type { RegisteredWorker } from '@aiworker/shared'
import type { FleetDatabase } from '@aiworker/storage-sqlite/fleet'
import { auditEvents, registeredWorkers } from '@aiworker/storage-sqlite/fleet'
import { eq } from 'drizzle-orm'

/**
 * gateway 的 fleet.db 访问层。
 *
 * 设计约束：gateway 对 `registered_workers` **只读 + 删除**。不做 insert /
 * update：
 * - insert 走 `workers.pair`（S2 本波是 501 stub，S5 实现）；
 * - update 走 `workers.update`（未在当前 PLAN-013 内设计，可后续补）。
 *
 * 除此之外 gateway 可以写 `audit_events`（gateway 动作的运维日志）。
 */
export class FleetPersistence {
  constructor(private readonly db: FleetDatabase) {}

  /**
   * 列表。按 `addedAt` 降序——运维视角最新注册的排最前。
   * 故意不返回加密列（`apiTokenEnc` / `nonce` / `authTag`）——虽然 gateway
   * 进程内部可见，但外层 method handler 不应该需要，减少误用面。
   */
  listRegisteredWorkers(): Array<Omit<RegisteredWorker, 'apiTokenEnc' | 'nonce' | 'authTag'>> {
    const rows = this.db.select().from(registeredWorkers).all()
    return rows
      .map((row) => {
        const { apiTokenEnc: _t, nonce: _n, authTag: _a, ...safe } = row
        return {
          ...safe,
          lastSeenAt: safe.lastSeenAt ?? undefined,
          lastSeenState: safe.lastSeenState ?? undefined,
          lastConfigVersion: safe.lastConfigVersion ?? undefined,
        }
      })
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }

  getRegisteredWorker(workerId: string): Omit<RegisteredWorker, 'apiTokenEnc' | 'nonce' | 'authTag'> | undefined {
    const row = this.db
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, workerId))
      .get()
    if (!row)
      return undefined
    const { apiTokenEnc: _t, nonce: _n, authTag: _a, ...safe } = row
    return {
      ...safe,
      lastSeenAt: safe.lastSeenAt ?? undefined,
      lastSeenState: safe.lastSeenState ?? undefined,
      lastConfigVersion: safe.lastConfigVersion ?? undefined,
    }
  }

  /** 删除一条 registered_workers 行。返回是否有行被删除。 */
  removeRegisteredWorker(workerId: string): boolean {
    const row = this.db
      .select({ id: registeredWorkers.id })
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, workerId))
      .get()
    if (!row)
      return false
    this.db.delete(registeredWorkers).where(eq(registeredWorkers.id, workerId)).run()
    return true
  }

  /** 单条 audit 写入。gateway 动作走这条链。 */
  recordAudit(entry: {
    actor: string
    action: string
    workerId?: string | null
    detail?: Record<string, unknown>
  }): void {
    this.db
      .insert(auditEvents)
      .values({
        actor: entry.actor,
        action: entry.action,
        workerId: entry.workerId ?? null,
        detail: entry.detail,
      })
      .run()
  }
}
