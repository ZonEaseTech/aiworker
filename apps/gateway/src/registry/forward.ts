import type { AnyWs } from './types'

/**
 * 一条 operator → node 转发请求的在途记录。
 *
 * operator 发过来的 request 有它自己的 `id`，gateway 不能把这个 id 直接丢给
 * node——两个 operator 可能用同一个 id。转发时 gateway **重写** id 为自己分配
 * 的 uuid；node 响应回来时，根据 uuid 反查 pending，再按 operator 原始 id
 * 发 response 给对应 operator。
 */
export interface PendingForward {
  /** 转发后 gateway 自己塞给 node 的 request id。 */
  gatewayRequestId: string
  /** operator 最初的 request id；回包时要用这个。 */
  operatorRequestId: string
  operatorWs: AnyWs
  workerId: string
  method: string
  createdAt: number
}

export interface ForwardTableOptions {
  /** 默认 60 秒后自动取消（返回 timeout 响应并清理）。 */
  timeoutMs?: number
  /** 用于生成 gateway 侧 request id；测试可注入确定性函数。 */
  idFactory?: () => string
  /** 超时或取消回调；调用方据此向 operator 发错误响应。 */
  onExpire?: (entry: PendingForward, reason: 'timeout' | 'operator_gone' | 'node_gone') => void
  now?: () => number
}

export class ForwardTable {
  private readonly map: Map<string, PendingForward> = new Map()
  private readonly timeoutMs: number
  private readonly now: () => number
  private readonly idFactory: () => string
  private readonly onExpire?: (entry: PendingForward, reason: 'timeout' | 'operator_gone' | 'node_gone') => void
  private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(options: ForwardTableOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.now = options.now ?? (() => Date.now())
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID())
    this.onExpire = options.onExpire
  }

  allocate(input: Omit<PendingForward, 'gatewayRequestId' | 'createdAt'>): PendingForward {
    const gatewayRequestId = this.idFactory()
    const entry: PendingForward = {
      ...input,
      gatewayRequestId,
      createdAt: this.now(),
    }
    this.map.set(gatewayRequestId, entry)
    if (this.timeoutMs > 0) {
      const timer = setTimeout(() => {
        const still = this.map.get(gatewayRequestId)
        if (!still)
          return
        this.map.delete(gatewayRequestId)
        this.timers.delete(gatewayRequestId)
        this.onExpire?.(still, 'timeout')
      }, this.timeoutMs)
      // unref 以避免 Bun 进程因等待定时器而不退出。
      if (typeof (timer as unknown as { unref?: () => void }).unref === 'function')
        (timer as unknown as { unref: () => void }).unref()
      this.timers.set(gatewayRequestId, timer)
    }
    return entry
  }

  /**
   * 取出并移除一条 pending，对应 node 回来的 response 的常规路径。
   */
  consume(gatewayRequestId: string): PendingForward | undefined {
    const entry = this.map.get(gatewayRequestId)
    if (!entry)
      return undefined
    this.map.delete(gatewayRequestId)
    this.clearTimer(gatewayRequestId)
    return entry
  }

  /** operator 断线：该 operator 的所有 pending 一次性回调清理。 */
  cancelByOperator(ws: AnyWs): PendingForward[] {
    const dead: PendingForward[] = []
    for (const entry of this.map.values()) {
      if (entry.operatorWs === ws)
        dead.push(entry)
    }
    for (const entry of dead) {
      this.map.delete(entry.gatewayRequestId)
      this.clearTimer(entry.gatewayRequestId)
      this.onExpire?.(entry, 'operator_gone')
    }
    return dead
  }

  /** node 断线：该 workerId 的所有 pending 一次性取消。 */
  cancelByWorker(workerId: string): PendingForward[] {
    const dead: PendingForward[] = []
    for (const entry of this.map.values()) {
      if (entry.workerId === workerId)
        dead.push(entry)
    }
    for (const entry of dead) {
      this.map.delete(entry.gatewayRequestId)
      this.clearTimer(entry.gatewayRequestId)
      this.onExpire?.(entry, 'node_gone')
    }
    return dead
  }

  size(): number {
    return this.map.size
  }

  /** 停掉所有定时器——gateway 进程关闭时调用，避免 Bun 不退出。 */
  dispose(): void {
    for (const timer of this.timers.values())
      clearTimeout(timer)
    this.timers.clear()
    this.map.clear()
  }

  private clearTimer(gatewayRequestId: string): void {
    const timer = this.timers.get(gatewayRequestId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(gatewayRequestId)
    }
  }
}
