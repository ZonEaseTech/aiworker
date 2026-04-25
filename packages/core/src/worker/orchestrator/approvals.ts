/**
 * Per-tool approval 内存 store（PLAN-014 F2）。
 *
 * 当 toolPolicy 命中 `ask` 时，orchestrator 把 promise 挂在这里，等待
 * operator 通过 gateway `approval.grant` 解锁。runtime hot-reload /
 * dispose 必须 reject 所有挂起项防泄漏（CLAUDE.md hot-reload 不变量）。
 *
 * **不持久化**：worker 重启后挂起请求自动失效；operator 会在 timeout 时
 * 看到 deny 结果，是合理行为——审批语义本身就要求"实时"。
 */

export type ApprovalDecision = 'allow' | 'deny'

export interface ApprovalRequestPayload {
  taskId: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
}

export interface PendingApproval {
  taskId: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  /** 毫秒时间戳；到了仍未 grant 视作 deny。 */
  expiresAt: number
}

interface PendingEntry extends PendingApproval {
  resolve: (decision: ApprovalDecision) => void
  timer: ReturnType<typeof setTimeout>
}

/** dispose 时挂起 promise 抛出的错误。 */
export class ApprovalDisposedError extends Error {
  override readonly name = 'ApprovalDisposedError'
  constructor() { super('approval store disposed') }
}

export interface WaitInput {
  taskId: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  /** 超时毫秒；默认 60000。timeout 视同 deny。 */
  timeoutMs?: number
}

export const DEFAULT_APPROVAL_TIMEOUT_MS = 60_000

export class ApprovalStore {
  private readonly pending = new Map<string, PendingEntry>()
  private disposed = false

  /**
   * 挂起一条审批请求，返回 promise；调用方负责在挂起前先发出
   * `approval.requested` 事件让 operator 看到。已 dispose 的 store 立即抛
   * `ApprovalDisposedError`。
   */
  wait(input: WaitInput): Promise<ApprovalDecision> {
    if (this.disposed)
      return Promise.reject(new ApprovalDisposedError())
    const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
    const expiresAt = Date.now() + timeoutMs
    const key = ApprovalStore.key(input.taskId, input.toolCallId)
    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        // 超时后清理：第一个 timeout 触发就 settle，再有 grant 进来会被 has() 滤掉。
        const entry = this.pending.get(key)
        if (!entry)
          return
        this.pending.delete(key)
        entry.resolve('deny')
      }, timeoutMs)
      // node 上 `setTimeout` 返回的句柄默认会 ref 进程；这里 unref 让 worker
      // 退出阶段不被一个还没到期的审批挡住事件循环。
      const handle = timer as unknown as { unref?: () => void }
      handle.unref?.()
      this.pending.set(key, {
        taskId: input.taskId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        params: input.params,
        expiresAt,
        resolve,
        timer,
      })
    })
  }

  /**
   * operator 通过 gateway 解锁某条挂起项。
   * 返回 `true` 表示命中并完成；`false` 表示找不到（早已超时 / 不存在）。
   */
  grant(taskId: string, toolCallId: string, decision: ApprovalDecision): boolean {
    const key = ApprovalStore.key(taskId, toolCallId)
    const entry = this.pending.get(key)
    if (!entry)
      return false
    clearTimeout(entry.timer)
    this.pending.delete(key)
    entry.resolve(decision)
    return true
  }

  /** 列出所有当前挂起的审批请求（不含 resolve / timer 句柄）。 */
  list(): PendingApproval[] {
    const out: PendingApproval[] = []
    for (const e of this.pending.values()) {
      out.push({
        taskId: e.taskId,
        toolCallId: e.toolCallId,
        toolName: e.toolName,
        params: e.params,
        expiresAt: e.expiresAt,
      })
    }
    return out
  }

  /** 当前挂起数量（测试用）。 */
  size(): number {
    return this.pending.size
  }

  /**
   * Hot-reload / shutdown 时调用：所有挂起项以 deny 解锁，
   * 之后再 wait() 立刻拒绝。
   */
  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.resolve('deny')
    }
    this.pending.clear()
  }

  private static key(taskId: string, toolCallId: string): string {
    return `${taskId}:${toolCallId}`
  }
}
