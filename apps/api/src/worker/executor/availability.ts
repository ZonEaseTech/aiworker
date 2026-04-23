import type { EngineAvailability, EngineKind } from '@aiworker/shared'
import type { AvailabilityInfo as AcpAvailabilityInfo } from './engines/acp/agents/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * FEAT-018 — 统一引擎可达性探测。
 *
 * 归一后向前端暴露三种状态：
 *   - `ready`          PATH 命中二进制 + 可识别的 auth 文件存在
 *   - `login-required` PATH 命中二进制，但无 auth 文件
 *   - `not-found`      PATH 无二进制（或 http/mcp/cli 恒为 ready，无需 CLI）
 *
 * 探测规则严格限定在 PATH 查找 + auth 文件存在性检查，不调用 `--version` 与
 * `npx`，避免冷启动期被网络或安装下载拖住；这同时也是 PLAN-008 的风险缓解策略。
 *
 * ACP 两个 agent (gemini / qwen) 各输出一条结果，因此 `EngineAvailability` 上
 * 附带可选 `agent` 字段。Wire 形态定义在
 * `packages/shared/src/providers/availability.ts` —— 所有调用方都读同一份类型。
 */
export type { EngineAvailability, EngineAvailabilityResponse, EngineAvailabilityStatus } from '@aiworker/shared'

export const AVAILABILITY_CACHE_TTL_MS = 10 * 60 * 1000

export interface AvailabilityDeps {
  /** 在 PATH 中查找二进制并返回绝对路径，找不到返回 null。 */
  resolveBinary: (name: string) => Promise<string | null>
  /** 判断给定路径是否存在（文件或目录均可）。 */
  pathExists: (p: string) => Promise<boolean>
  homedir: () => string
  now: () => number
}

export const defaultAvailabilityDeps: AvailabilityDeps = {
  resolveBinary: resolveOnPath,
  pathExists: statExists,
  homedir: () => os.homedir(),
  now: () => Date.now(),
}

/** 不需要 CLI 的引擎 —— 总是 ready。 */
const CLI_LESS_ENGINES: readonly EngineKind[] = ['http', 'mcp', 'cli']

interface EngineTarget {
  /** 缓存 key：engine kind + 可选 agent 拼接而成。 */
  key: string
  kind: EngineKind
  agent?: string
  binaryName: string
  authPaths: (home: string) => string[]
}

const ENGINE_TARGETS: readonly EngineTarget[] = [
  {
    key: 'claude-code',
    kind: 'claude-code',
    binaryName: 'claude',
    authPaths: home => [
      path.join(home, '.claude.json'),
      path.join(home, '.claude', 'config.json'),
    ],
  },
  {
    key: 'acp:gemini',
    kind: 'acp',
    agent: 'gemini',
    binaryName: 'gemini',
    authPaths: home => [
      path.join(home, '.gemini', 'oauth_creds.json'),
    ],
  },
  {
    key: 'acp:qwen',
    kind: 'acp',
    agent: 'qwen',
    // ACP qwen agent 的 npm 包 `@qwen-code/qwen-code` 实际安装出的二进制叫 `qwen`。
    binaryName: 'qwen',
    authPaths: home => [
      path.join(home, '.qwen', 'oauth_creds.json'),
      path.join(home, '.qwen', 'settings.json'),
    ],
  },
  {
    key: 'codex',
    kind: 'codex',
    binaryName: 'codex',
    authPaths: home => [path.join(home, '.codex', 'auth.json')],
  },
  {
    key: 'cursor',
    kind: 'cursor',
    binaryName: 'cursor-agent',
    // Cursor CLI 版本差异较大；这里覆盖目前 observed 的三条常见路径。
    authPaths: home => [
      path.join(home, '.cursor', 'cli-config.json'),
      path.join(home, '.cursor-agent', 'auth.json'),
      path.join(home, '.cursor', 'auth.json'),
    ],
  },
]

export interface AvailabilityProbe {
  /** 按 EngineKind 探测；10 分钟 in-memory 缓存。refresh=true 忽略缓存。 */
  probe: (
    kind: EngineKind,
    options?: { agent?: string, refresh?: boolean },
  ) => Promise<EngineAvailability>
  /** 每个 EngineKind 至少一条（acp 展开为 gemini/qwen 两条）。 */
  probeAll: (options?: { refresh?: boolean }) => Promise<EngineAvailability[]>
  clearCache: () => void
}

export function createAvailabilityProbe(
  deps: AvailabilityDeps = defaultAvailabilityDeps,
): AvailabilityProbe {
  const cache = new Map<string, { expiresAt: number, value: EngineAvailability }>()

  async function evaluate(target: EngineTarget): Promise<EngineAvailability> {
    const checkedAt = new Date(deps.now()).toISOString()
    const binaryPath = await deps.resolveBinary(target.binaryName)
    const base: EngineAvailability = {
      kind: target.kind,
      status: 'not-found',
      checkedAt,
    }
    if (target.agent)
      base.agent = target.agent
    if (!binaryPath)
      return { ...base, authHint: 'binary-not-on-path' }

    const home = deps.homedir()
    for (const p of target.authPaths(home)) {
      if (await deps.pathExists(p)) {
        return {
          ...base,
          status: 'ready',
          binaryPath,
          authHint: 'auth-file-present',
        }
      }
    }
    return {
      ...base,
      status: 'login-required',
      binaryPath,
      authHint: 'auth-file-missing',
    }
  }

  async function probeTarget(
    target: EngineTarget,
    refresh: boolean,
  ): Promise<EngineAvailability> {
    const hit = cache.get(target.key)
    if (!refresh && hit && hit.expiresAt > deps.now())
      return hit.value
    const value = await evaluate(target)
    cache.set(target.key, { value, expiresAt: deps.now() + AVAILABILITY_CACHE_TTL_MS })
    return value
  }

  function noCliRequired(kind: EngineKind): EngineAvailability {
    return {
      kind,
      status: 'ready',
      checkedAt: new Date(deps.now()).toISOString(),
      authHint: 'no-cli-required',
    }
  }

  async function probeAll(
    options: { refresh?: boolean } = {},
  ): Promise<EngineAvailability[]> {
    const refresh = options.refresh ?? false
    const out: EngineAvailability[] = []
    for (const kind of CLI_LESS_ENGINES)
      out.push(noCliRequired(kind))
    for (const target of ENGINE_TARGETS)
      out.push(await probeTarget(target, refresh))
    return out
  }

  async function probe(
    kind: EngineKind,
    options: { agent?: string, refresh?: boolean } = {},
  ): Promise<EngineAvailability> {
    const refresh = options.refresh ?? false
    if (CLI_LESS_ENGINES.includes(kind))
      return noCliRequired(kind)

    const candidates = ENGINE_TARGETS.filter(t => t.kind === kind)
    if (candidates.length === 0) {
      return {
        kind,
        status: 'not-found',
        checkedAt: new Date(deps.now()).toISOString(),
        authHint: 'unknown-engine',
      }
    }

    // ACP 有多个 agent；调用方未指定时返回第一个。完整列表请用 probeAll。
    const target = options.agent
      ? candidates.find(t => t.agent === options.agent) ?? candidates[0]!
      : candidates[0]!
    return probeTarget(target, refresh)
  }

  function clearCache(): void {
    cache.clear()
  }

  return { probe, probeAll, clearCache }
}

// -- 模块级 singleton ------------------------------------------------------

let singleton: AvailabilityProbe | null = null

export function getAvailabilityProbe(): AvailabilityProbe {
  if (!singleton)
    singleton = createAvailabilityProbe()
  return singleton
}

/** 测试钩子：清空缓存并重新实例化 singleton。 */
export function resetAvailabilityProbeForTests(
  deps?: AvailabilityDeps,
): AvailabilityProbe {
  singleton = createAvailabilityProbe(deps)
  return singleton
}

// -- ACP 兼容层 -------------------------------------------------------------
//
// FEAT-018 之前 ACP harness 的 per-agent probe 定义在
// `engines/acp/agents/{gemini,qwen}.ts`；现在统一由 availability.ts 托管，agent
// 文件仅负责绑定。对外 API 保持不变：harness 继续消费
// `AvailabilityInfo { status: 'LoginDetected' | 'InstallationFound' | 'NotFound' }`
// 形态，因此我们这里把共享 probe 的三态映射回旧形态。

/** 将新版 EngineAvailabilityStatus 反向映射为 ACP harness 的三态。 */
function toAcpAvailability(
  found: 'login' | 'install' | 'none',
  detail: string,
): AcpAvailabilityInfo {
  const checkedAt = new Date().toISOString()
  if (found === 'login')
    return { status: 'LoginDetected', checkedAt, detail }
  if (found === 'install')
    return { status: 'InstallationFound', checkedAt, detail }
  return { status: 'NotFound', checkedAt, detail }
}

async function probeAcpAgentAuth(
  agent: 'gemini' | 'qwen',
  deps: AvailabilityDeps = defaultAvailabilityDeps,
): Promise<AcpAvailabilityInfo> {
  const home = deps.homedir()
  const dir = agent === 'gemini' ? '.gemini' : '.qwen'
  const credsPath = path.join(home, dir, 'oauth_creds.json')
  const settingsPath = path.join(home, dir, 'settings.json')
  if (await deps.pathExists(credsPath))
    return toAcpAvailability('login', 'oauth_creds.json present')
  if (await deps.pathExists(settingsPath))
    return toAcpAvailability('install', 'settings.json present, login pending')
  return toAcpAvailability('none', `~/${dir} not present`)
}

export function probeAcpGeminiAuth(): Promise<AcpAvailabilityInfo> {
  return probeAcpAgentAuth('gemini')
}

export function probeAcpQwenAuth(): Promise<AcpAvailabilityInfo> {
  return probeAcpAgentAuth('qwen')
}

// -- 默认 FS / PATH helpers ------------------------------------------------

async function resolveOnPath(name: string): Promise<string | null> {
  const pathEnv = process.env.PATH ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE').split(';')
    : ['']
  for (const dir of pathEnv.split(sep)) {
    if (!dir)
      continue
    for (const ext of exts) {
      const candidate = path.join(dir, `${name}${ext.toLowerCase()}`)
      try {
        const st = await fs.stat(candidate)
        if (st.isFile())
          return candidate
      }
      catch {
        // keep walking
      }
    }
  }
  return null
}

async function statExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  }
  catch {
    return false
  }
}
