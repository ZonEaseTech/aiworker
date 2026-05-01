import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveAiworkerHome } from '@zonease/aiworker-fs-layout'

/**
 * aiworker operator 本地状态。保存在 `<AIWORKER_HOME>/aiworker.json`。
 *
 * 设计目标：
 * - gatewayUrl / deviceId / deviceToken 是 aiworker 与 gateway 建立 WS 连接的三要素。
 * - deviceId 在首次 `aiworker gateway start` 或 `aiworker pair` 时生成并持久化，之后不变。
 * - deviceToken 在 `aiworker pair` 完成后由 gateway 返回；loopback 场景（本地 stub gateway）
 *   允许空串。
 * - defaultWorkerId 作为省略 `<worker-id>` 参数时的回退，避免用户每次敲完整 id。
 */
export interface OperatorState {
  gatewayUrl: string
  deviceId: string
  deviceToken: string
  defaultWorkerId?: string
}

// FEAT-030: default gateway port 9218 (aligned with packages/gateway/src/config.ts).
export const DEFAULT_GATEWAY_URL = 'ws://localhost:9218/ws'

export function gatewayWsUrlForLocalPort(port: number): string {
  return `ws://localhost:${port}/ws`
}

export function normalizeGatewayWsUrl(value: string): string {
  try {
    const url = new URL(value)
    if ((url.protocol === 'ws:' || url.protocol === 'wss:')
      && (url.pathname === '' || url.pathname === '/')) {
      url.pathname = '/ws'
      return url.toString()
    }
  }
  catch {
    // Preserve the caller's value so WebSocket construction reports the error.
  }
  return value
}

/** state 文件路径：`<AIWORKER_HOME>/aiworker.json`。 */
export function resolveOperatorStatePath(): string {
  return path.join(resolveAiworkerHome(), 'aiworker.json')
}

/** gateway daemon 的 PID 文件路径：`<AIWORKER_HOME>/aiworker-gateway.pid`。 */
export function resolveGatewayPidPath(): string {
  return path.join(resolveAiworkerHome(), 'aiworker-gateway.pid')
}

/** gateway daemon 的日志文件路径：`<AIWORKER_HOME>/aiworker-gateway.log`。 */
export function resolveGatewayLogPath(): string {
  return path.join(resolveAiworkerHome(), 'aiworker-gateway.log')
}

function mintDeviceId(): string {
  // 使用 Web Crypto 的 randomUUID；Bun 原生支持。
  return `op-${crypto.randomUUID()}`
}

function emptyState(): OperatorState {
  return {
    gatewayUrl: DEFAULT_GATEWAY_URL,
    deviceId: mintDeviceId(),
    deviceToken: '',
  }
}

function isOperatorState(value: unknown): value is OperatorState {
  if (value === null || typeof value !== 'object')
    return false
  const v = value as Record<string, unknown>
  return typeof v.gatewayUrl === 'string'
    && typeof v.deviceId === 'string'
    && typeof v.deviceToken === 'string'
    && (v.defaultWorkerId === undefined || typeof v.defaultWorkerId === 'string')
}

/**
 * 读取 aiworker.json。不存在时返回一个带新 deviceId 的默认 state（不落盘——由调用方决定
 * 是否持久化）。格式损坏时抛错，避免静默覆盖用户数据。
 */
export async function loadOperatorState(): Promise<OperatorState> {
  const filePath = resolveOperatorStatePath()
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT')
      return emptyState()
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`aiworker.json 解析失败 (${filePath}): ${msg}`)
  }

  if (!isOperatorState(parsed))
    throw new Error(`aiworker.json 结构不符合 OperatorState (${filePath})`)

  return {
    ...parsed,
    gatewayUrl: normalizeGatewayWsUrl(parsed.gatewayUrl),
  }
}

/**
 * 把 state 原子写回磁盘（先写 tmp 再 rename）并收紧权限到 0600。
 * 0600 的原因：state 里的 `deviceToken` 是 operator 对 gateway 的 bearer credential，
 * 任何能读到 `~/.aiworker/aiworker.json` 的本机用户都能冒充 operator；收紧权限是最小自卫。
 */
export async function saveOperatorState(state: OperatorState): Promise<void> {
  const filePath = resolveOperatorStatePath()
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  // rename 在同一文件系统上是原子的，但 rename 不会改目标文件的权限；因此 tmp 上已经
  // 带好 0600，rename 后一并生效。最后再显式 chmod 兜底（幂等）。
  await rename(tmp, filePath)
  try {
    await chmod(filePath, 0o600)
  }
  catch {
    // 某些 fs（如 WSL → Windows 挂载）可能不支持 chmod；已写入的 mode 即为最终权限。
  }
}

/**
 * 合并更新：读出当前 state，应用 patch，再写回。patch 中的 undefined 字段被忽略。
 * 返回合并后的完整 state。
 */
export async function patchOperatorState(patch: Partial<OperatorState>): Promise<OperatorState> {
  const current = await loadOperatorState()
  const next: OperatorState = { ...current }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined)
      continue
    const normalized = k === 'gatewayUrl' && typeof v === 'string'
      ? normalizeGatewayWsUrl(v)
      : v
    // @ts-expect-error — 按字段名直写；上游已用 Partial<OperatorState> 约束。
    next[k] = normalized
  }
  await saveOperatorState(next)
  return next
}
