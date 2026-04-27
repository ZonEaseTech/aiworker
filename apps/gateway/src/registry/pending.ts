import type { PendingEnrollment } from '@aiworker/gateway-proto'
import type { AnyWs } from './types'

/**
 * PLAN-019 §"Gateway state: in-memory PendingEnrollmentRegistry"
 *
 * S3 阶段创建的占位实现 —— 满足以下职责，让 S3 server.ts 路径可以编译并跑过
 * handshake 用例：
 *
 * - `submit({ workerId, apiToken, displayName, ws })` → 生成 OTP，落入内存表，
 *   返回 `{ otp, expiresAt }` 给调用方推 `enrollment.otp` 事件。
 * - `removeByWs(ws)` → ws 关闭时（pending 状态下）的反查清理；S3 的 handleClose
 *   依赖此 API。
 * - `list / approve / reject / onApprove / dispose` → 接口签名为 S2 真实现保留，
 *   逻辑细节（TTL timer、audit、collision retry）留给 S2 覆盖；本文件在 S2 合
 *   并阶段会被替换。
 *
 * 该 stub **故意**保留可工作的最小行为（in-memory Map + 单次 OTP 生成），以便
 * S3 worktree 内的 enroll-otp-handshake 测试能跑通。S2 合并时由 coordinator
 * 选 S2 版本（参见 PLAN-019.md §Annotations 合并顺序与冲突解决）。
 */
export interface PendingEnrollmentSubmitInput {
  workerId: string
  apiToken: string
  displayName?: string
  ws: AnyWs
}

export interface PendingEnrollmentSubmitResult {
  otp: string
  expiresAt: number
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

export interface PendingEnrollmentRegistryOptions {
  /** TTL（毫秒），缺省 5 分钟。S2 将在此基础上挂超时 timer。 */
  ttlMs?: number
  /** approve 回调：S3 在 createGatewayContext 注册，用于升级 ws 为 node。 */
  onApprove?: (entry: PendingEnrollmentEntry) => void
  /** expire 回调：S2 接管。 */
  onExpire?: (entry: PendingEnrollmentEntry) => void
}

/**
 * PLAN-019 §OTP encoding —— Crockford base32 去掉易混字符（O/0/I/1/L/U）。
 * 30^8 ≈ 6.5e11 的空间，碰撞率对人类规模 pending 队列无意义。
 */
const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const OTP_HALF_LEN = 4

function generateOtp(): string {
  const buf = new Uint8Array(OTP_HALF_LEN * 2)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i += 1) {
    out += OTP_ALPHABET.charAt(buf[i]! % OTP_ALPHABET.length)
    if (i === OTP_HALF_LEN - 1)
      out += '-'
  }
  return out
}

export class PendingEnrollmentRegistry {
  private readonly byOtp: Map<string, PendingEnrollmentEntry> = new Map()
  private readonly byWs: WeakMap<AnyWs, PendingEnrollmentEntry> = new WeakMap()
  /** 反向索引：ws.close 触发的清理需要在 weakmap 之外保留一份强引用列表。 */
  private readonly wsToOtp: Map<AnyWs, string> = new Map()
  private readonly ttlMs: number
  private onApproveCb?: (entry: PendingEnrollmentEntry) => void
  private onExpireCb?: (entry: PendingEnrollmentEntry) => void

  constructor(opts: PendingEnrollmentRegistryOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000
    this.onApproveCb = opts.onApprove
    this.onExpireCb = opts.onExpire
  }

  /** 注入 approve 回调（S3 阶段也支持构造之后挂；保持 API 弹性）。 */
  onApprove(cb: (entry: PendingEnrollmentEntry) => void): void {
    // 仅作语义占位 —— S2 真实现里若已通过构造函数挂回调可省略此 setter。
    this.onApproveCb = cb
  }

  submit(input: PendingEnrollmentSubmitInput): PendingEnrollmentSubmitResult {
    // 极小的 collision 退避（S2 会做更严谨的 rerolling）。
    let otp = generateOtp()
    let attempts = 0
    while (this.byOtp.has(otp) && attempts < 8) {
      otp = generateOtp()
      attempts += 1
    }
    const now = Date.now()
    const entry: PendingEnrollmentEntry = {
      otp,
      workerId: input.workerId,
      apiToken: input.apiToken,
      displayName: input.displayName,
      ws: input.ws,
      submittedAt: now,
      expiresAt: now + this.ttlMs,
    }
    this.byOtp.set(otp, entry)
    this.byWs.set(input.ws, entry)
    this.wsToOtp.set(input.ws, otp)
    return { otp, expiresAt: entry.expiresAt }
  }

  list(): PendingEnrollment[] {
    return Array.from(this.byOtp.values()).map(entry => ({
      otp: entry.otp,
      workerId: entry.workerId,
      displayName: entry.displayName,
      submittedAt: entry.submittedAt,
      expiresAt: entry.expiresAt,
    }))
  }

  approve(otp: string): PendingEnrollmentEntry | undefined {
    const entry = this.byOtp.get(otp)
    if (!entry)
      return undefined
    this.deleteEntry(entry)
    this.onApproveCb?.(entry)
    return entry
  }

  reject(otp: string): boolean {
    const entry = this.byOtp.get(otp)
    if (!entry)
      return false
    this.deleteEntry(entry)
    return true
  }

  /**
   * S3 server.ts handleClose 在 ws.data.role === 'node-pending' 且未被 approve
   * 时调用：返回被清理的 entry（含 otp），或 undefined（已被 approve / reject 走掉）。
   */
  removeByWs(ws: AnyWs): PendingEnrollmentEntry | undefined {
    const entry = this.byWs.get(ws)
    if (!entry)
      return undefined
    this.deleteEntry(entry)
    return entry
  }

  size(): number {
    return this.byOtp.size
  }

  /** 关闭进程时清理所有 timer / 引用（S2 真实现里会停 TTL timer）。 */
  dispose(): void {
    this.byOtp.clear()
    this.wsToOtp.clear()
  }

  private deleteEntry(entry: PendingEnrollmentEntry): void {
    this.byOtp.delete(entry.otp)
    this.byWs.delete(entry.ws)
    this.wsToOtp.delete(entry.ws)
    void this.onExpireCb // 暂未触发；S2 在 TTL 过期路径里调用
  }
}
