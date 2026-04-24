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
 * - loopback 为真：无条件放行，`presentedToken` 可为任何字符串（含空字符串）。
 *   原因：loopback 带宽内已经是信任边界；aim CLI 本机调用不想被强制给 token。
 * - loopback 为假：必须配置 `sharedSecret` 且 `presentedToken` 与之恒等。
 *   原因：一旦 gateway 绑定 `0.0.0.0` 暴露出去，必须要求鉴权。
 */
export function authorizeConnection(args: {
  loopback: boolean
  sharedSecret: string | undefined
  presentedToken: string
}): { ok: true } | { ok: false, reason: string } {
  if (args.loopback)
    return { ok: true }
  if (!args.sharedSecret)
    return { ok: false, reason: 'remote_requires_secret_but_unset' }
  if (args.presentedToken.length === 0)
    return { ok: false, reason: 'missing_token' }
  if (!timingSafeEqualStrings(args.presentedToken, args.sharedSecret))
    return { ok: false, reason: 'invalid_token' }
  return { ok: true }
}
