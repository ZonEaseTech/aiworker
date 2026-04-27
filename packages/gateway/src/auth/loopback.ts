/**
 * 判断 `Bun.serve` `server.requestIP(...).address` 返回的字符串是否是本机回环。
 *
 * Bun 可能返回：
 * - IPv4：`127.0.0.1`
 * - IPv6：`::1`
 * - IPv4-mapped IPv6：`::ffff:127.0.0.1`
 * - 某些环境下会返回主机名：`localhost`
 *
 * gateway 在 loopback 场景下放行空 token 连接（aim 本机 CLI / worker 同机
 * docker network 的 sidecar 调用）；远程连接必须携带 `INTERNAL_SHARED_SECRET`。
 */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address)
    return false
  if (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === 'localhost')
    return true
  if (address.startsWith('127.'))
    return true
  return false
}

/**
 * BUG-019：启动期 fail-closed 断言。
 *
 * 当 gateway 绑定到非 loopback 地址（`0.0.0.0` / `::` / 公网 IP / 任意非
 * `127.x` `::1` `localhost` 主机名）且未配置 `INTERNAL_SHARED_SECRET` 时，
 * 直接抛错拒绝起 server。
 *
 * 背景：`isLoopbackAddress` 只看 TCP 远端地址，反代后所有流量都看起来像
 * loopback（BUG-007）。如果再叠"远端 bind + 没 token"，那就连一线 wire-level
 * 鉴权都没了——任何能 reach 该端口的人都能 `workers.list` / `enroll.approve` /
 * `token.rotate`。
 *
 * 注意：本断言**不能**修复"反代后 loopback 流量被无条件放行"这个根因——那需要
 * `X-Forwarded-For` 或 unix socket 等更深的改造。这里只兜底"绑公网 + 没密钥"
 * 这种最明显的 misconfig。
 */
export function assertGatewayBindIsSafe(args: {
  host: string
  internalSharedSecret: string | undefined
}): void {
  if (isLoopbackAddress(args.host))
    return
  if (args.internalSharedSecret && args.internalSharedSecret.length > 0)
    return
  throw new Error(
    `[gateway] 拒绝启动：host="${args.host}" 非 loopback，但未配置 INTERNAL_SHARED_SECRET。\n`
    + '\n'
    + '远程连接会被 token 校验拦下，但反代后的 loopback 流量会被无条件放行（参见 BUG-007 / BUG-019），\n'
    + '没有 INTERNAL_SHARED_SECRET 这一道兜底意味着只要能 reach 端口就能 operator-grade 操作 fleet。\n'
    + '\n'
    + '修复方式二选一：\n'
    + '  1. AIWORKER_GATEWAY_HOST=127.0.0.1（默认）+ 在前置反代（如 Caddy）上叠 basic-auth；\n'
    + '  2. 设置 INTERNAL_SHARED_SECRET（>= 16 字符；推荐 `openssl rand -hex 24`），让 gateway 强制 token 校验。',
  )
}
