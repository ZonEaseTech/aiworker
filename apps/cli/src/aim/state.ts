import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveAiworkerHome } from '@zonease/aiworker-fs-layout'

/**
 * aim operator 本地状态。保存在 `<AIWORKER_HOME>/aim.json`。
 *
 * 设计目标：
 * - gatewayUrl / deviceId / deviceToken 是 aim 与 gateway 建立 WS 连接的三要素。
 * - deviceId 在首次 `aim gateway start` 或 `aim pair` 时生成并持久化，之后不变。
 * - deviceToken 在 `aim pair` 完成后由 gateway 返回；loopback 场景（本地 stub gateway）
 *   允许空串。
 * - defaultWorkerId 作为省略 `<worker-id>` 参数时的回退，避免用户每次敲完整 id。
 */
export interface AimState {
  gatewayUrl: string
  deviceId: string
  deviceToken: string
  defaultWorkerId?: string
}

const DEFAULT_GATEWAY_URL = 'ws://localhost:3000'

/** state 文件路径：`<AIWORKER_HOME>/aim.json`。 */
export function resolveAimStatePath(): string {
  return path.join(resolveAiworkerHome(), 'aim.json')
}

/** gateway daemon 的 PID 文件路径：`<AIWORKER_HOME>/aim-gateway.pid`。 */
export function resolveGatewayPidPath(): string {
  return path.join(resolveAiworkerHome(), 'aim-gateway.pid')
}

/** gateway daemon 的日志文件路径：`<AIWORKER_HOME>/aim-gateway.log`。 */
export function resolveGatewayLogPath(): string {
  return path.join(resolveAiworkerHome(), 'aim-gateway.log')
}

function mintDeviceId(): string {
  // 使用 Web Crypto 的 randomUUID；Bun 原生支持。
  return `op-${crypto.randomUUID()}`
}

function emptyState(): AimState {
  return {
    gatewayUrl: DEFAULT_GATEWAY_URL,
    deviceId: mintDeviceId(),
    deviceToken: '',
  }
}

function isAimState(value: unknown): value is AimState {
  if (value === null || typeof value !== 'object')
    return false
  const v = value as Record<string, unknown>
  return typeof v.gatewayUrl === 'string'
    && typeof v.deviceId === 'string'
    && typeof v.deviceToken === 'string'
    && (v.defaultWorkerId === undefined || typeof v.defaultWorkerId === 'string')
}

/**
 * 读取 aim.json。不存在时返回一个带新 deviceId 的默认 state（不落盘——由调用方决定
 * 是否持久化）。格式损坏时抛错，避免静默覆盖用户数据。
 */
export async function loadAimState(): Promise<AimState> {
  const filePath = resolveAimStatePath()
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
    throw new Error(`aim.json 解析失败 (${filePath}): ${msg}`)
  }

  if (!isAimState(parsed))
    throw new Error(`aim.json 结构不符合 AimState (${filePath})`)

  return parsed
}

/**
 * 把 state 原子写回磁盘（先写 tmp 再 rename）并收紧权限到 0600。
 * 0600 的原因：state 里的 `deviceToken` 是 operator 对 gateway 的 bearer credential，
 * 任何能读到 `~/.aiworker/aim.json` 的本机用户都能冒充 operator；收紧权限是最小自卫。
 */
export async function saveAimState(state: AimState): Promise<void> {
  const filePath = resolveAimStatePath()
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
export async function patchAimState(patch: Partial<AimState>): Promise<AimState> {
  const current = await loadAimState()
  const next: AimState = { ...current }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined)
      continue
    // @ts-expect-error — 按字段名直写；上游已用 Partial<AimState> 约束。
    next[k] = v
  }
  await saveAimState(next)
  return next
}
