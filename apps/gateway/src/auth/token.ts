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
 * 三条互斥路径（PLAN-018）：
 *
 * 1. self-enroll（`enrollToken` 非 undefined）：worker 在首帧 `connect.enroll`
 *    带了 join token。需 gateway 已配置 `gatewayJoinToken`，且二者常量时间
 *    恒等。`auth.token` 字段在该路径上无意义（worker 还未拿到 fleet 侧的
 *    bearer），因此无视 loopback / sharedSecret。这条分支独立于下面两条，
 *    不会回退去看 sharedSecret。
 * 2. loopback：无条件放行。原因：loopback 带宽内已经是信任边界；aim CLI
 *    本机调用不想被强制给 token。
 * 3. remote bearer：必须配置 `sharedSecret` 且 `presentedToken` 与之恒等。
 *    原因：一旦 gateway 绑定 `0.0.0.0` 暴露出去，必须要求鉴权。
 *
 * `enrollToken` 仅由调用方在 `frame.role === 'node' && frame.enroll` 时传入，
 * 防止 operator 帧误走 self-enroll 路径——本函数只做"门"的常量时间比较，
 * 不替你做角色判定。
 */
export function authorizeConnection(args: {
  loopback: boolean
  sharedSecret: string | undefined
  presentedToken: string
  enrollToken?: string
  gatewayJoinToken?: string
}): { ok: true, via: 'loopback' | 'shared-secret' | 'self-enroll' } | { ok: false, reason: string } {
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
