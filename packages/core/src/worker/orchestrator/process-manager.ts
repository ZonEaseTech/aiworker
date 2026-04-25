import type { EngineKind as SharedEngineKind } from '@aiworker/shared'

import consola from 'consola'

/**
 * Engine 标识。复用 shared 的 `EngineKind` 字面量联合（http / mcp / cli /
 * claude-code / acp / codex / cursor），但保留 string fallback 以便 PLAN-007
 * 之后扩展新 engine 时不必改 ProcessManager 类型签名。slot 计账走 string
 * key，外部 perEngineLimits 也用 string，所以新 engine 仅需在 factory + env
 * 注册即可。
 */
export type EngineKind = SharedEngineKind | (string & {})

export type ProcessClass = 'default' | 'background' | 'interactive'

export type ProcessState
  = | 'queued'
    | 'spawning'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'

export interface ProcessHandle<TMeta = unknown> {
  id: string
  class: ProcessClass
  group: string
  engine: EngineKind
  state: ProcessState
  meta: TMeta
  startedAt: string | null
  updatedAt: string
  lastActivityAt: string
  cancel: () => Promise<void>
}

/**
 * 单次 spawn 回调返回的句柄。ProcessManager 通过它实现统一的 cancel +
 * stall 检测。
 *
 * 对真正 spawn 子进程的 engine（claude-code / acp / codex / cursor）：
 * `cancel` 应当通过 AbortController.abort() 触发 engine 内部已挂的 abort
 * handler（→ SIGTERM/SIGKILL 子进程）。
 *
 * 对纯 in-process 的 engine（http / mcp）：cancel 走 controller.abort() 让
 * fetch / RPC 抛出，仍可中断当前请求。
 *
 * `onActivity` 在 orchestrator 消费 AgentEvent 流时手动触发——每个 event
 * 视作一次 stdout 心跳，重置 stall timer。这样 engine 文件无需改动也能
 * 享受 stall 检测。
 */
export interface SpawnedProcess {
  cancel: () => Promise<void>
  /** 注册 stdout / 状态更新 callback。返回 unsubscribe。 */
  onActivity: (cb: () => void) => () => void
}

export interface ProcessRunRequest<TMeta = unknown> {
  group: string
  engine: EngineKind
  class?: ProcessClass
  meta?: TMeta
  /**
   * spawn 阶段：拿到 slot 后才会被调用。返回 cancel + onActivity；
   * 内部失败抛错会让 run() reject 且 handle 进入 failed 态。
   */
  onSpawn: () => Promise<SpawnedProcess>
  /** spawn 成功后真正跑业务的 Promise；resolve / reject 决定终态。 */
  job: () => Promise<void>
  /** 调用方传入的 abort signal；abort 时 ProcessManager 会触发 cancel。 */
  signal?: AbortSignal
}

export interface ProcessManagerOptions {
  maxConcurrentTotal: number
  perEngineLimits: Partial<Record<EngineKind, number>>
  /** 没有 onActivity 也没有终态的最长等待时间。 */
  stallTimeoutMs: number
  /** stall → cancel 之后再等多久强制硬 kill。 */
  killTimeoutMs: number
  /** 终态 handle 在内存中保留的时间。 */
  autoCleanupDelayMs: number
  /** 后台 GC 扫描的间隔。<=0 关闭后台 GC（测试用）。 */
  gcIntervalMs: number
}

export interface CapacityPerEngine {
  limit: number
  active: number
  queued: number
  available: number
}

export interface RecentTerminal {
  id: string
  engine: EngineKind
  group: string
  state: ProcessState
  terminatedAt: string
}

export interface CapacitySnapshot {
  maxConcurrentTotal: number
  totalActive: number
  totalQueued: number
  availableSlots: number
  /**
   * Per-engine capacity. Keys are runtime-discovered engine ids — not every
   * known `EngineKind` will be present (only those with explicit limits or
   * any active/queued traffic), hence `Partial`.
   */
  perEngine: Partial<Record<EngineKind, CapacityPerEngine>>
  byState: Record<ProcessState, number>
  recentTerminal: RecentTerminal[]
}

const TERMINAL_STATES: ReadonlySet<ProcessState> = new Set([
  'completed',
  'failed',
  'cancelled',
])

const PRIORITY_RANK: Record<ProcessClass, number> = {
  interactive: 3,
  default: 2,
  background: 1,
}

type Resolver<T> = (value: T | PromiseLike<T>) => void
type Rejecter = (reason: unknown) => void

interface PendingJob<TMeta = unknown> {
  handle: ProcessHandle<TMeta>
  req: ProcessRunRequest<TMeta>
  enqueuedAt: number
  enqueueSeq: number
  resolve: Resolver<void>
  reject: Rejecter
  cancelledBeforeStart: boolean
}

class GroupQueue {
  private items: PendingJob[] = []

  enqueue(p: PendingJob): void {
    this.items.push(p)
  }

  head(): PendingJob | undefined {
    return this.items[0]
  }

  shift(): PendingJob | undefined {
    return this.items.shift()
  }

  drain(): PendingJob[] {
    const out = this.items
    this.items = []
    return out
  }

  isEmpty(): boolean {
    return this.items.length === 0
  }

  remove(id: string): PendingJob | undefined {
    const idx = this.items.findIndex(p => p.handle.id === id)
    if (idx < 0)
      return undefined
    const [removed] = this.items.splice(idx, 1)
    return removed
  }

  values(): readonly PendingJob[] {
    return this.items
  }
}

interface RunningEntry {
  handle: ProcessHandle
  /** 最近一次 spawn 返回的 cancel；stall 升级时复用。 */
  spawned: SpawnedProcess | null
  stallTimer: ReturnType<typeof setTimeout> | null
  killTimer: ReturnType<typeof setTimeout> | null
  /** 标记本 handle 已被外部 cancel；终态归 'cancelled' 而非 'completed'/'failed'。 */
  cancelRequested: boolean
  /** 触发 interrupt 后开启 killTimer；killTimer 触发又调 cancel。 */
  killEscalated: boolean
}

interface TerminalRecord {
  handle: ProcessHandle
  recordedAt: number
}

function nowMs(): number {
  return Date.now()
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Bun / Node 的 setTimeout 都返回带 `unref` 的对象；浏览器 lib 类型只看到 number。
 * 安全降级：拿不到 unref 就静默跳过——不阻塞 event loop 是 nice-to-have，缺
 * 失也不影响功能。
 */
function tryUnref(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null): void {
  if (timer === null || typeof timer !== 'object' || !('unref' in timer))
    return
  try {
    (timer as { unref: () => void }).unref()
  }
  catch {
    // 部分宿主没有 unref，忽略
  }
}

/**
 * 进程级集中管控（PLAN-007 §架构承诺 5 / FEAT-015）：
 *   - slot 计账：全局 `maxConcurrentTotal` + per-engine `perEngineLimits`
 *   - group FIFO：同 conversationId 严格按入队顺序串行（哪怕 slot 空闲也
 *     不并发，保持单会话消息顺序不变）
 *   - priority：interactive > default > background；**无抢占**（已 running
 *     的 job 不会被高优先级 job 打断）
 *   - stall 检测 + kill 升级：spawn 成功后开始计 stall timer，每次
 *     `onActivity()` 重置；超时调 spawned.cancel()，再过 killTimeout 再次
 *     cancel（升级为硬 kill）
 *   - 终态 handle 按 `autoCleanupDelayMs` GC 滚动清理
 *   - `setLimits()` 热更新容量；提高后被阻塞的 job 立即起
 *
 * **跨 hot-reload 持久化**：reloadRuntime 不重建 ProcessManager，只调
 * `setLimits()`；旧 runtime.dispose() 不会 dispose ProcessManager。
 */
export class ProcessManager {
  private readonly handles = new Map<string, ProcessHandle>()
  private readonly groups = new Map<string, GroupQueue>()
  private readonly running = new Map<string, RunningEntry>()
  private readonly runningGroups = new Set<string>()
  private readonly runningByEngine = new Map<EngineKind, number>()
  private terminalLog: TerminalRecord[] = []
  private gcTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false
  private enqueueSeq = 0

  constructor(private opts: ProcessManagerOptions) {
    this.startGcLoop()
  }

  setLimits(next: {
    maxConcurrentTotal?: number
    perEngineLimits?: Partial<Record<EngineKind, number>>
  }): void {
    if (next.maxConcurrentTotal !== undefined && next.maxConcurrentTotal > 0)
      this.opts.maxConcurrentTotal = next.maxConcurrentTotal

    if (next.perEngineLimits !== undefined) {
      for (const [k, v] of Object.entries(next.perEngineLimits)) {
        if (v === undefined)
          delete this.opts.perEngineLimits[k]
        else if (v > 0)
          this.opts.perEngineLimits[k] = v
      }
    }
    this.kick()
  }

  /** 提交一个 job。Promise 在 job 完成（或 cancel/失败）时 settle。 */
  run<TMeta = unknown>(req: ProcessRunRequest<TMeta>): Promise<void> {
    if (this.disposed)
      return Promise.reject(new Error('ProcessManager disposed'))

    return new Promise<void>((resolve, reject) => {
      const id = `proc_${crypto.randomUUID()}`
      const handle: ProcessHandle<TMeta> = {
        id,
        class: req.class ?? 'default',
        group: req.group,
        engine: req.engine,
        state: 'queued',
        meta: (req.meta ?? null) as TMeta,
        startedAt: null,
        updatedAt: nowIso(),
        lastActivityAt: nowIso(),
        cancel: async () => this.cancelHandle(id),
      }
      this.handles.set(id, handle)
      const pending: PendingJob<TMeta> = {
        handle,
        req,
        enqueuedAt: nowMs(),
        enqueueSeq: ++this.enqueueSeq,
        resolve,
        reject,
        cancelledBeforeStart: false,
      }

      let queue = this.groups.get(req.group)
      if (!queue) {
        queue = new GroupQueue()
        this.groups.set(req.group, queue)
      }
      queue.enqueue(pending as PendingJob)

      if (req.signal) {
        if (req.signal.aborted) {
          this.cancelHandle(id).catch(() => undefined)
        }
        else {
          const onAbort = (): void => {
            req.signal?.removeEventListener('abort', onAbort)
            this.cancelHandle(id).catch(() => undefined)
          }
          req.signal.addEventListener('abort', onAbort, { once: true })
        }
      }

      this.kick()
    })
  }

  /** 取消同 group 所有 queued + running 任务。 */
  async cancelGroup(group: string): Promise<void> {
    const queue = this.groups.get(group)
    if (queue) {
      for (const p of queue.drain())
        this.markCancelledBeforeStart(p)
    }
    const targets: Promise<void>[] = []
    for (const [, entry] of this.running.entries()) {
      if (entry.handle.group === group)
        targets.push(this.cancelRunning(entry))
    }
    await Promise.allSettled(targets)
    this.kick()
  }

  /** 取消所有 queued + running 任务。dispose 前调用。 */
  async cancelAll(): Promise<void> {
    for (const queue of this.groups.values()) {
      for (const p of queue.drain())
        this.markCancelledBeforeStart(p)
    }
    const targets: Promise<void>[] = []
    for (const entry of this.running.values())
      targets.push(this.cancelRunning(entry))
    await Promise.allSettled(targets)
    this.kick()
  }

  snapshot(): CapacitySnapshot {
    const byState: Record<ProcessState, number> = {
      queued: 0,
      spawning: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    }
    for (const h of this.handles.values())
      byState[h.state] += 1

    const queuedPerEngine = new Map<EngineKind, number>()
    let totalQueued = 0
    for (const queue of this.groups.values()) {
      for (const p of queue.values()) {
        totalQueued += 1
        queuedPerEngine.set(p.handle.engine, (queuedPerEngine.get(p.handle.engine) ?? 0) + 1)
      }
    }

    const engines = new Set<EngineKind>([
      ...Object.keys(this.opts.perEngineLimits),
      ...this.runningByEngine.keys(),
      ...queuedPerEngine.keys(),
    ])
    const perEngine: Partial<Record<EngineKind, CapacityPerEngine>> = {}
    for (const e of engines) {
      const limit = this.opts.perEngineLimits[e] ?? this.opts.maxConcurrentTotal
      const active = this.runningByEngine.get(e) ?? 0
      const queued = queuedPerEngine.get(e) ?? 0
      const remaining = Math.max(0, limit - active)
      const totalRemaining = Math.max(0, this.opts.maxConcurrentTotal - this.totalActive())
      perEngine[e] = {
        limit,
        active,
        queued,
        available: Math.min(remaining, totalRemaining),
      }
    }

    const recentTerminal = this.terminalLog
      .slice(-10)
      .map<RecentTerminal>(rec => ({
        id: rec.handle.id,
        engine: rec.handle.engine,
        group: rec.handle.group,
        state: rec.handle.state,
        terminatedAt: rec.handle.updatedAt,
      }))
      .reverse()

    return {
      maxConcurrentTotal: this.opts.maxConcurrentTotal,
      totalActive: this.totalActive(),
      totalQueued,
      availableSlots: Math.max(0, this.opts.maxConcurrentTotal - this.totalActive()),
      perEngine,
      byState,
      recentTerminal,
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
    for (const entry of this.running.values()) {
      if (entry.stallTimer)
        clearTimeout(entry.stallTimer)
      if (entry.killTimer)
        clearTimeout(entry.killTimer)
    }
  }

  private totalActive(): number {
    return this.running.size
  }

  private startGcLoop(): void {
    if (this.opts.gcIntervalMs <= 0)
      return
    this.gcTimer = setInterval(() => this.gcTerminal(), this.opts.gcIntervalMs)
    tryUnref(this.gcTimer)
  }

  private gcTerminal(): void {
    const cutoff = nowMs() - this.opts.autoCleanupDelayMs
    const next: TerminalRecord[] = []
    for (const rec of this.terminalLog) {
      if (rec.recordedAt >= cutoff)
        next.push(rec)
      else
        this.handles.delete(rec.handle.id)
    }
    this.terminalLog = next
  }

  private async cancelHandle(id: string): Promise<void> {
    const handle = this.handles.get(id)
    if (!handle)
      return
    // queued？从 group 队列里摘掉。
    const queue = this.groups.get(handle.group)
    const removed = queue?.remove(id)
    if (removed) {
      this.markCancelledBeforeStart(removed)
      this.kick()
      return
    }
    // running？走 cancelRunning。
    const entry = this.running.get(id)
    if (entry)
      await this.cancelRunning(entry)
  }

  private markCancelledBeforeStart(p: PendingJob): void {
    if (p.cancelledBeforeStart)
      return
    p.cancelledBeforeStart = true
    p.handle.state = 'cancelled'
    p.handle.updatedAt = nowIso()
    this.terminalLog.push({ handle: p.handle, recordedAt: nowMs() })
    p.reject(new Error('cancelled'))
  }

  private async cancelRunning(entry: RunningEntry): Promise<void> {
    if (entry.cancelRequested && !entry.killEscalated) {
      // 二次 cancel：直接升级硬 kill
      this.escalateKill(entry)
      return
    }
    entry.cancelRequested = true
    if (entry.spawned) {
      try {
        await entry.spawned.cancel()
      }
      catch (err) {
        consola.warn(`[process-manager] cancel for ${entry.handle.id} failed: ${String(err)}`)
      }
    }
    // 硬 kill 计时
    if (!entry.killTimer && this.opts.killTimeoutMs > 0) {
      entry.killTimer = setTimeout(() => this.escalateKill(entry), this.opts.killTimeoutMs)
      tryUnref(entry.killTimer)
    }
  }

  private escalateKill(entry: RunningEntry): void {
    if (entry.killEscalated)
      return
    entry.killEscalated = true
    if (entry.killTimer) {
      clearTimeout(entry.killTimer)
      entry.killTimer = null
    }
    if (entry.spawned)
      void entry.spawned.cancel().catch(err => consola.warn(`[process-manager] hard kill for ${entry.handle.id} failed: ${String(err)}`))
  }

  private kick(): void {
    if (this.disposed)
      return
    // 反复挑下一个可起的 candidate，直到没有为止。
    while (true) {
      const next = this.pickNext()
      if (!next)
        return
      this.startCandidate(next)
    }
  }

  private pickNext(): PendingJob | null {
    let best: PendingJob | null = null
    let bestPriority = -1
    let bestSeq = Number.POSITIVE_INFINITY
    for (const [group, queue] of this.groups.entries()) {
      if (queue.isEmpty())
        continue
      if (this.runningGroups.has(group))
        continue
      const head = queue.head()!
      if (!this.canStart(head.handle))
        continue
      const pr = PRIORITY_RANK[head.handle.class]
      if (pr > bestPriority || (pr === bestPriority && head.enqueueSeq < bestSeq)) {
        best = head
        bestPriority = pr
        bestSeq = head.enqueueSeq
      }
    }
    return best
  }

  private canStart(handle: ProcessHandle): boolean {
    if (this.totalActive() >= this.opts.maxConcurrentTotal)
      return false
    const limit = this.opts.perEngineLimits[handle.engine] ?? this.opts.maxConcurrentTotal
    if ((this.runningByEngine.get(handle.engine) ?? 0) >= limit)
      return false
    return true
  }

  private startCandidate(pending: PendingJob): void {
    const queue = this.groups.get(pending.handle.group)
    queue?.shift()
    if (queue && queue.isEmpty())
      this.groups.delete(pending.handle.group)

    const entry: RunningEntry = {
      handle: pending.handle,
      spawned: null,
      stallTimer: null,
      killTimer: null,
      cancelRequested: false,
      killEscalated: false,
    }
    this.running.set(pending.handle.id, entry)
    this.runningGroups.add(pending.handle.group)
    this.runningByEngine.set(pending.handle.engine, (this.runningByEngine.get(pending.handle.engine) ?? 0) + 1)
    pending.handle.state = 'spawning'
    pending.handle.startedAt = nowIso()
    pending.handle.lastActivityAt = pending.handle.startedAt
    pending.handle.updatedAt = pending.handle.startedAt

    void this.driveJob(entry, pending)
  }

  private async driveJob(entry: RunningEntry, pending: PendingJob): Promise<void> {
    const { handle, req, resolve, reject } = pending
    let unsubActivity: (() => void) | null = null
    try {
      const spawned = await req.onSpawn()
      entry.spawned = spawned

      // spawn 完成后已被 cancel 的话，直接把 spawn 出来的句柄关掉
      if (entry.cancelRequested) {
        try {
          await spawned.cancel()
        }
        catch {
          // 已是 cancel 路径，二次失败忽略
        }
        throw new Error('cancelled')
      }

      handle.state = 'running'
      handle.updatedAt = nowIso()
      this.armStallTimer(entry)
      unsubActivity = spawned.onActivity(() => this.onActivity(entry))

      await req.job()

      if (entry.cancelRequested) {
        handle.state = 'cancelled'
        reject(new Error('cancelled'))
      }
      else {
        handle.state = 'completed'
        resolve()
      }
    }
    catch (err) {
      handle.state = entry.cancelRequested ? 'cancelled' : 'failed'
      reject(err)
    }
    finally {
      handle.updatedAt = nowIso()
      if (entry.stallTimer) {
        clearTimeout(entry.stallTimer)
        entry.stallTimer = null
      }
      if (entry.killTimer) {
        clearTimeout(entry.killTimer)
        entry.killTimer = null
      }
      if (unsubActivity) {
        try {
          unsubActivity()
        }
        catch {
          // unsubscribe 失败不影响终态
        }
      }
      this.terminalLog.push({ handle, recordedAt: nowMs() })
      this.running.delete(handle.id)
      this.runningGroups.delete(handle.group)
      const cur = this.runningByEngine.get(handle.engine) ?? 0
      if (cur <= 1)
        this.runningByEngine.delete(handle.engine)
      else
        this.runningByEngine.set(handle.engine, cur - 1)
      if (!this.disposed)
        this.kick()
    }
  }

  private armStallTimer(entry: RunningEntry): void {
    if (this.opts.stallTimeoutMs <= 0)
      return
    if (entry.stallTimer)
      clearTimeout(entry.stallTimer)
    entry.stallTimer = setTimeout(() => this.onStall(entry), this.opts.stallTimeoutMs)
    tryUnref(entry.stallTimer)
  }

  private onActivity(entry: RunningEntry): void {
    if (TERMINAL_STATES.has(entry.handle.state))
      return
    entry.handle.lastActivityAt = nowIso()
    this.armStallTimer(entry)
  }

  private onStall(entry: RunningEntry): void {
    if (TERMINAL_STATES.has(entry.handle.state))
      return
    if (entry.cancelRequested)
      return
    consola.warn(`[process-manager] stall detected for ${entry.handle.id} (engine=${entry.handle.engine}, group=${entry.handle.group})`)
    void this.cancelRunning(entry)
  }
}
