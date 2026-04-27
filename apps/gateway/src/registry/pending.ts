import type { AnyWs } from './types'
import { randomBytes } from 'node:crypto'

/**
 * PLAN-019：OTP-attended enrollment 的待批队列。
 *
 * 一个 worker 通过 `connect.enroll.mode='otp'` 接入后，server.ts（S3 路径感知
 * 分支）会把它的 ws + 自报 apiToken 塞进这里挂起；gateway 同时给它分配一个 8
 * 字符 OTP（`XXXX-YYYY`）回推给 worker。operator 通过 `enroll.list` 查待批
 * 列表，调用 `enroll.approve <otp>` / `enroll.reject <otp>` 决定去留。
 *
 * 设计要点：
 * - **完全在内存**：gateway 重启即丢；UX 上 worker 会自动重发 connect 帧，
 *   重新拿一个新 OTP。所有真实持久化（fleet.db row + audit）都在 approve
 *   触发时才发生。
 * - **TTL GC**：每条 entry 一个 setTimeout，过期触发 `onExpire`。回调由
 *   gateway 注入，在那里执行 `ws.close(4408, 'enroll:expired')` + 写
 *   `gateway.enrollment.expired` audit——这里只做"队列"职责，不依赖 fleet。
 * - **OTP 编码**：去歧义 30 字符 alphabet（Crockford 减 0/O/I/1/L/U），8 位
 *   随机 + 中划线。30^8 ≈ 6.5 × 10^11 远超人类并发量级；碰撞时 in-band
 *   重 roll，最多 5 次。
 * - **单线程并发安全**：Bun WS handler 单线程事件循环，所有 Map.{get,set,
 *   delete} 天然原子；submit / approve / reject 之间不会撕裂。
 */

export interface PendingEnrollmentSubmit {
  workerId: string
  apiToken: string
  displayName?: string
  ws: AnyWs
}

export interface PendingEnrollmentEntry {
  otp: string
  workerId: string
  apiToken: string
  displayName?: string
  ws: AnyWs
  submittedAt: number
  expiresAt: number
}

/** 暴露给 `enroll.list` 的快照——刻意去掉 `apiToken` / `ws`，operator 不该看见。 */
export interface PendingEnrollmentSnapshot {
  otp: string
  workerId: string
  displayName?: string
  submittedAt: number
  expiresAt: number
}

export interface PendingEnrollmentRegistryOptions {
  /** OTP 有效期（毫秒）。 */
  ttlMs: number
  /** 过期回调；gateway 在这里 close ws + 写 audit。注册期内可缺省（测试用）。 */
  onExpire?: (entry: PendingEnrollmentEntry) => void
  /** 测试钩子：覆盖默认 OTP 生成，便于制造碰撞。 */
  generateOtp?: () => string
}

/**
 * 30 字符去歧义 alphabet：Crockford base32 减去 0/O/I/1/L/U。
 * 数字与字母在 OCR / 手抄 / 视频会议念读时最容易混淆的几个全部踢掉。
 */
export const PENDING_OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const OTP_HALF_LEN = 4
const OTP_MAX_RETRY = 5

interface InternalEntry extends PendingEnrollmentEntry {
  timer: ReturnType<typeof setTimeout>
}

export class PendingEnrollmentRegistry {
  private readonly ttlMs: number
  private readonly onExpire?: (entry: PendingEnrollmentEntry) => void
  private readonly generator: () => string
  private readonly entries = new Map<string, InternalEntry>()
  private disposed = false

  constructor(opts: PendingEnrollmentRegistryOptions) {
    if (!Number.isFinite(opts.ttlMs) || opts.ttlMs <= 0)
      throw new Error('PendingEnrollmentRegistry: ttlMs 必须为正数')
    this.ttlMs = opts.ttlMs
    this.onExpire = opts.onExpire
    this.generator = opts.generateOtp ?? defaultOtpGenerator
  }

  /**
   * 接受一条 connect.enroll.mode='otp' 帧，分配 OTP 并把 ws 挂起等待 operator 决策。
   */
  submit(req: PendingEnrollmentSubmit): { otp: string, expiresAt: number } {
    if (this.disposed)
      throw new Error('PendingEnrollmentRegistry: already disposed')
    const otp = this.allocateUniqueOtp()
    const submittedAt = Date.now()
    const expiresAt = submittedAt + this.ttlMs
    const entry: InternalEntry = {
      otp,
      workerId: req.workerId,
      apiToken: req.apiToken,
      displayName: req.displayName,
      ws: req.ws,
      submittedAt,
      expiresAt,
      timer: setTimeout(() => this.handleExpire(otp), this.ttlMs),
    }
    this.entries.set(otp, entry)
    return { otp, expiresAt }
  }

  /** 列出所有待批项；仅暴露 operator 可见字段（不含 apiToken / ws）。 */
  list(): PendingEnrollmentSnapshot[] {
    return Array.from(this.entries.values()).map(e => ({
      otp: e.otp,
      workerId: e.workerId,
      displayName: e.displayName,
      submittedAt: e.submittedAt,
      expiresAt: e.expiresAt,
    }))
  }

  /** 批准——pop 出 entry 给调用方处理 fleet.db 落库 + 推 enrollment.approved。 */
  approve(otp: string): PendingEnrollmentEntry | undefined {
    return this.popInternal(otp)
  }

  /** 拒绝——pop 出 entry 给调用方 close ws + 写 audit。 */
  reject(otp: string): PendingEnrollmentEntry | undefined {
    return this.popInternal(otp)
  }

  has(otp: string): boolean {
    return this.entries.has(otp)
  }

  size(): number {
    return this.entries.size
  }

  /** 进程关停时清空所有 timer；防止泄漏 setTimeout 句柄。 */
  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    for (const e of this.entries.values())
      clearTimeout(e.timer)
    this.entries.clear()
  }

  private popInternal(otp: string): PendingEnrollmentEntry | undefined {
    const e = this.entries.get(otp)
    if (!e)
      return undefined
    clearTimeout(e.timer)
    this.entries.delete(otp)
    const { timer: _t, ...snapshot } = e
    return snapshot
  }

  private handleExpire(otp: string): void {
    const e = this.entries.get(otp)
    if (!e)
      return
    this.entries.delete(otp)
    if (!this.onExpire)
      return
    try {
      const { timer: _t, ...snapshot } = e
      this.onExpire(snapshot)
    }
    catch {
      // onExpire 是运维侧回调，异常不应该带翻 setTimeout 内的循环。
    }
  }

  private allocateUniqueOtp(): string {
    for (let i = 0; i < OTP_MAX_RETRY; i++) {
      const otp = this.generator()
      if (!this.entries.has(otp))
        return otp
    }
    // 30^8 entropy 下连续 5 次撞同一个值 ≈ 不可能；走到这里说明注入的 generator
    // 故意一直返回固定值——直接抛，让上游知道队列不可用。
    throw new Error('PendingEnrollmentRegistry: failed to allocate unique OTP after retries')
  }
}

function defaultOtpGenerator(): string {
  return `${pickChars(OTP_HALF_LEN)}-${pickChars(OTP_HALF_LEN)}`
}

function pickChars(n: number): string {
  // 256 % 30 = 16 != 0,严格说 randomBytes 单字节模 30 会有 ~6% 偏置;
  // 对 OTP 而言不构成密码学问题(40-bit entropy 远超暴力枚举所需冗余),
  // 实现保留单字节简化。若以后要消除偏置,改用拒绝采样即可。
  const buf = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++)
    out += PENDING_OTP_ALPHABET[buf[i]! % PENDING_OTP_ALPHABET.length]
  return out
}
