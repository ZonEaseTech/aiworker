import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

/**
 * 常量时间字符串比较。
 *
 * 与 `apps/api/src/worker/secrets/crypto.ts` 的实现语义一致:长度不等直接
 * false(长度本身并非秘密,且是公开观察到的 token 形状),否则走
 * `node:crypto.timingSafeEqual`。
 *
 * 按 CLAUDE.md §"加密与认证" 的要求:bearer token 比较必须常量时间。gateway
 * 与 worker 是独立进程,为了避免跨 app 耦合,这段三行代码**有意复制**,与
 * CLAUDE.md §Architecture Constraints 关于 crypto 副本的取舍一致(worker /
 * gateway 各持一份,不抽取为共享模块)。
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * 判定远程连接是否应被接受。
 *
 * 四条互斥路径（PLAN-018 + PLAN-019）：
 *
 * 0. PLAN-019 path-aware 守门（最先判定）：
 *    - `/enroll-ws` path 仅接受 `enroll.mode='otp'` 的 node connect；其它一律
 *      `wrong_path`，不再进入下面的 token 比较。OTP submit 不需要任何 bearer，
 *      gateway 立即给 worker 派 OTP 后等 operator 决断 —— 见 PLAN-019.md
 *      §"Path-aware authN matrix"。
 *    - `/ws` path 拒绝 `enroll.mode='otp'`。OTP 通道独占 `/enroll-ws`，避免
 *      在 operator basic-auth 通道里出现"无 token 即放行"的歧义。
 * 1. self-enroll（PLAN-018，`enrollToken` 非 undefined 且 mode≠'otp'）：worker
 *    在首帧 `connect.enroll` 带了 join token。需 gateway 已配置
 *    `gatewayJoinToken`，且二者常量时间恒等。`auth.token` 字段在该路径上无
 *    意义（worker 还未拿到 fleet 侧的 bearer），因此无视 loopback / sharedSecret。
 *    这条分支独立于下面两条，不会回退去看 sharedSecret。
 * 2. loopback：无条件放行。原因：loopback 带宽内已经是信任边界；aim CLI
 *    本机调用不想被强制给 token。
 * 3. remote bearer：必须配置 `sharedSecret` 且 `presentedToken` 与之恒等。
 *    原因：一旦 gateway 绑定 `0.0.0.0` 暴露出去，必须要求鉴权。
 *
 * `enrollToken` 仅由调用方在 `frame.role === 'node' && frame.enroll &&
 * frame.enroll.mode!=='otp'` 时传入；`isOtpEnrollSubmit` 由调用方根据
 * `frame.enroll?.mode === 'otp'` 推导。本函数不替你做角色与 enroll mode 的
 * 联立判定，只做"门"的常量时间比较 + path 守门。
 */
export function authorizeConnection(args: {
  loopback: boolean
  sharedSecret: string | undefined
  presentedToken: string
  enrollToken?: string
  gatewayJoinToken?: string
  /** PLAN-019：fetch handler 升级时记下的 URL pathname。 */
  path?: '/ws' | '/enroll-ws'
  /** PLAN-019：连接帧带了 `enroll.mode === 'otp'`？由调用方推导。 */
  isOtpEnrollSubmit?: boolean
}):
  | { ok: true, via: 'loopback' | 'shared-secret' | 'self-enroll' | 'enroll-otp' }
  | { ok: false, reason: string } {
  // path 缺省视为 `/ws`，与既有 server.ts 行为兼容。
  const path = args.path ?? '/ws'
  const isOtp = args.isOtpEnrollSubmit === true

  if (path === '/enroll-ws') {
    if (!isOtp)
      return { ok: false, reason: 'wrong_path:expected_enroll_otp' }
    // OTP submit 不需要任何 token —— operator 后续 approve 才升级为 node。
    return { ok: true, via: 'enroll-otp' }
  }

  // path === '/ws' 路径：禁止 OTP 通过 operator/worker 共用通道入场。
  if (isOtp)
    return { ok: false, reason: 'wrong_path:otp_must_use_enroll_ws' }

  if (args.enrollToken !== undefined) {
    if (!args.gatewayJoinToken)
      return { ok: false, reason: 'join_token_disabled' }
    if (!timingSafeEqualStrings(args.enrollToken, args.gatewayJoinToken))
      return { ok: false, reason: 'join_token_mismatch' }
    return { ok: true, via: 'self-enroll' }
  }
  if (args.loopback)
    return { ok: true, via: 'loopback' }
  if (!args.sharedSecret)
    return { ok: false, reason: 'remote_requires_secret_but_unset' }
  if (args.presentedToken.length === 0)
    return { ok: false, reason: 'missing_token' }
  if (!timingSafeEqualStrings(args.presentedToken, args.sharedSecret))
    return { ok: false, reason: 'invalid_token' }
  return { ok: true, via: 'shared-secret' }
}
