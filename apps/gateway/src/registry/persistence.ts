import type { RegisteredWorker } from '@aiworker/shared'
import type { FleetDatabase } from '@aiworker/storage-sqlite/fleet'
import { auditEvents, registeredWorkers } from '@aiworker/storage-sqlite/fleet'
import { eq } from 'drizzle-orm'
import { encryptToken } from './crypto'

export interface CreateRegisteredWorkerInput {
  workerId: string
  baseUrl: string
  apiToken: string
  displayName: string
  addedBy?: RegisteredWorker['addedBy']
  configVersion?: number
}

export interface UpdateRegisteredTokenInput {
  workerId: string
  newToken: string
}

/**
 * Gateway 的 fleet.db 访问层。
 *
 * 设计约束（CLAUDE.md §Architecture Constraints）：
 * - gateway 持有 fleet.db 的 master key；`registered_workers` 的 `apiTokenEnc`
 *   + `nonce` + `authTag` 三列只由这里写入/更新，绝不暴露给 handler 层。
 * - gateway 侧同样可以写 `audit_events`（gateway 动作的运维日志）。
 * - `fleet.db` **只**存指针与审计事件；worker 的 config / secrets / 会话数据
 *   一律属于 `worker.db`（worker 容器自持），不会落到这里。
 */
export class FleetPersistence {
  constructor(private readonly db: FleetDatabase) {}

  /**
   * 列表。按 `addedAt` 降序——运维视角最新注册的排最前。
   * 故意不返回加密列（`apiTokenEnc` / `nonce` / `authTag`）——虽然 gateway
   * 进程内部可见,但外层 method handler 不应该需要,减少误用面。
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

  /**
   * 取包含加密列的完整行——token.rotate / 历史迁移场景需要它才能解回明文。
   * handler 层原则上不应碰它，`decryptTokenFor` 会封一层读取。
   */
  getRegisteredWorkerRaw(workerId: string): RegisteredWorker | undefined {
    const row = this.db
      .select()
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, workerId))
      .get()
    if (!row)
      return undefined
    return {
      ...row,
      lastSeenAt: row.lastSeenAt ?? undefined,
      lastSeenState: row.lastSeenState ?? undefined,
      lastConfigVersion: row.lastConfigVersion ?? undefined,
    }
  }

  /**
   * 新插入一条已验证的 worker 指针。
   * 调用方（`workers.pair` handler）负责事前：
   * - 验证 `workerId` 与 bootstrap token 在 worker 侧匹配（调用 worker `/info`）;
   * - 检查 `registered_workers` 里是否已有同 id（否则抛业务错误）。
   *
   * 这里只做加密落库 + audit。
   */
  createRegisteredWorker(
    input: CreateRegisteredWorkerInput,
    masterKeyHex: string,
  ): Omit<RegisteredWorker, 'apiTokenEnc' | 'nonce' | 'authTag'> {
    const sealed = encryptToken(input.apiToken, masterKeyHex)
    const now = new Date().toISOString()
    const baseUrl = input.baseUrl.replace(/\/+$/, '')
    const row: RegisteredWorker = {
      id: input.workerId,
      baseUrl,
      displayName: input.displayName,
      apiTokenEnc: sealed.ciphertext,
      nonce: sealed.nonce,
      authTag: sealed.authTag,
      addedAt: now,
      addedBy: input.addedBy ?? 'manual',
      lastSeenAt: now,
      lastSeenState: 'online',
      lastConfigVersion: input.configVersion,
    }
    this.db.insert(registeredWorkers).values(row).run()
    this.db.insert(auditEvents).values({
      actor: 'gateway',
      action: 'gateway.worker.paired',
      workerId: input.workerId,
      detail: { baseUrl, displayName: input.displayName, addedBy: row.addedBy },
    }).run()
    const { apiTokenEnc: _t, nonce: _n, authTag: _a, ...safe } = row
    return {
      ...safe,
      lastSeenAt: safe.lastSeenAt ?? undefined,
      lastSeenState: safe.lastSeenState ?? undefined,
      lastConfigVersion: safe.lastConfigVersion ?? undefined,
    }
  }

  /**
   * 轮换加密后的 bearer token。`workers.pair` 以外的任何 token 更新都应走这里——
   * 如 `token.rotate` 从 node 回拉新 token 后立刻重加密落库。
   */
  updateEncryptedToken(input: UpdateRegisteredTokenInput, masterKeyHex: string): boolean {
    const existing = this.db
      .select({ id: registeredWorkers.id })
      .from(registeredWorkers)
      .where(eq(registeredWorkers.id, input.workerId))
      .get()
    if (!existing)
      return false
    const sealed = encryptToken(input.newToken, masterKeyHex)
    this.db.update(registeredWorkers)
      .set({
        apiTokenEnc: sealed.ciphertext,
        nonce: sealed.nonce,
        authTag: sealed.authTag,
      })
      .where(eq(registeredWorkers.id, input.workerId))
      .run()
    return true
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

  /**
   * 单行 count——`workers.launch` 会在真正 spawn 容器前检查 fleet 大小是否到顶。
   */
  countRegisteredWorkers(): number {
    return this.db
      .select({ id: registeredWorkers.id })
      .from(registeredWorkers)
      .all()
      .length
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
