/**
 * BUG-020：基于来源 IP 的 connect 失败计数 / 阻断器。
 *
 * 威胁模型（root issue: nnid9urk）：
 * - 攻击者向 `/ws` 或 `/enroll-ws` 盲扫 `INTERNAL_SHARED_SECRET` /
 *   `AIWORKER_JOIN_TOKEN`。`timingSafeEqual` 防侧信道，但扛不住穷举：32 字节
 *   随机 token 仍可被脚本以每秒数千次尝试扫描，且没有任何窗口约束。
 * - 同一来源连接频繁握手失败也可能是脚本误用，反复重连消耗 fd / 内存。
 *
 * 设计：
 * - 内存 `Map<remoteAddress, Entry>`：进程重启即丢；gateway 单进程模式下足够。
 *   多副本部署需要外部协调（Redis / 反代层 fail2ban），不在本 BUG 范围内。
 * - 滚动窗口：默认 60s 内累计 ≥ 5 次握手失败 → blockMs=10min。Block 期内 IP
 *   再来连接，fetch handler 阶段直接 429，不消耗 ws 升级开销。
 * - Block 解除后计数会延续到下一个窗口的 firstFailAt 起点；为避免长尾误伤，
 *   `prune()` 在 block 结束后回收 entry。
 * - 调用方（server.ts）写 audit `gateway.connect.brute_force_blocked`，参数由
 *   `recordFailure` 的返回值携带。
 *
 * 不在范围内：
 * - bad-frame / 协议错误：`parseFrame` 失败的客户端通常是版本错配，不是恶意
 *   扫描；不计入失败计数，避免误伤 worker 升级期。
 * - loopback：`127.0.0.0/8` / `::1` 视为信任域，调用方可在 fetch 阶段先判断
 *   再决定要不要走限频。
 */

export interface ConnectRateLimiterOptions {
  /** 失败累计窗口长度（毫秒）。默认 60_000。 */
  windowMs?: number
  /** 同一窗口内累计失败数达到此值后进入 block。默认 5。 */
  threshold?: number
  /** 进入 block 后阻断时长（毫秒）。默认 10 * 60 * 1000。 */
  blockMs?: number
  /** 测试钩子：覆盖时间源。 */
  now?: () => number
}

interface Entry {
  fails: number
  firstFailAt: number
  blockUntil: number
}

export interface RecordFailureResult {
  /** 本次失败是否触发了从未阻断 → 阻断的状态切换。仅这次返回 true，后续叠加返回 false。 */
  blockedNow: boolean
  fails: number
  blockUntil: number
}

export interface BlockedSnapshot {
  blocked: boolean
  /** 还需多久（毫秒）才解除阻断。仅在 blocked=true 时有意义。 */
  retryAfterMs: number
  /** 阻断结束时间戳（ms epoch）。仅在 blocked=true 时有意义。 */
  blockUntil: number
}

export class ConnectRateLimiter {
  private readonly windowMs: number
  private readonly threshold: number
  private readonly blockMs: number
  private readonly now: () => number
  private readonly entries = new Map<string, Entry>()

  constructor(opts: ConnectRateLimiterOptions = {}) {
    this.windowMs = opts.windowMs ?? 60_000
    this.threshold = opts.threshold ?? 5
    this.blockMs = opts.blockMs ?? 10 * 60_000
    this.now = opts.now ?? (() => Date.now())
  }

  /** 当前 IP 是否处于 block 状态。fetch handler 在 upgrade 之前调用一次。 */
  isBlocked(remoteAddress: string | undefined): BlockedSnapshot {
    if (!remoteAddress)
      return { blocked: false, retryAfterMs: 0, blockUntil: 0 }
    const e = this.entries.get(remoteAddress)
    if (!e)
      return { blocked: false, retryAfterMs: 0, blockUntil: 0 }
    const now = this.now()
    if (e.blockUntil > now)
      return { blocked: true, retryAfterMs: e.blockUntil - now, blockUntil: e.blockUntil }
    return { blocked: false, retryAfterMs: 0, blockUntil: 0 }
  }

  /**
   * 记一次握手失败（auth / quota / master_key_missing 等）。
   * - 已 block 的 IP：直接返回当前状态，不叠加（block 内的连接尝试会在 fetch
   *   阶段被挡掉，理论上走不到这里；保守起见保持幂等）。
   * - 窗口外或新 IP：重置 firstFailAt，fails=1。
   * - 窗口内：fails+=1；如达阈值，置 blockUntil=now+blockMs，返回 blockedNow=true。
   */
  recordFailure(remoteAddress: string | undefined): RecordFailureResult {
    if (!remoteAddress)
      return { blockedNow: false, fails: 0, blockUntil: 0 }
    const now = this.now()
    let e = this.entries.get(remoteAddress)
    if (e && e.blockUntil > now)
      return { blockedNow: false, fails: e.fails, blockUntil: e.blockUntil }
    if (!e || (now - e.firstFailAt) > this.windowMs)
      e = { fails: 1, firstFailAt: now, blockUntil: 0 }
    else
      e.fails += 1
    let blockedNow = false
    if (e.fails >= this.threshold && e.blockUntil === 0) {
      e.blockUntil = now + this.blockMs
      blockedNow = true
    }
    this.entries.set(remoteAddress, e)
    return { blockedNow, fails: e.fails, blockUntil: e.blockUntil }
  }

  /** 握手成功 → 清掉该 IP 的失败计数。 */
  recordSuccess(remoteAddress: string | undefined): void {
    if (!remoteAddress)
      return
    this.entries.delete(remoteAddress)
  }

  /** 回收已过期 entry（窗口结束 + block 已结束）。可在低频定时任务里调用。 */
  prune(): number {
    const now = this.now()
    let removed = 0
    for (const [ip, e] of this.entries) {
      if (e.blockUntil > now)
        continue
      if ((now - e.firstFailAt) > this.windowMs) {
        this.entries.delete(ip)
        removed += 1
      }
    }
    return removed
  }

  /** 测试用：读快照。 */
  snapshot(remoteAddress: string): Readonly<Entry> | undefined {
    return this.entries.get(remoteAddress)
  }

  size(): number {
    return this.entries.size
  }

  /** 清空所有计数（运维接口 / 测试钩子）。 */
  clear(): void {
    this.entries.clear()
  }
}
