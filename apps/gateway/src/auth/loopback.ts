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
