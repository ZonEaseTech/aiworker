/**
 * FEAT-030: zero-env quickstart support.
 *
 * 在 CLI 入口被业务模块（含 packages/core 的 zod schema）import 之前调用一次。
 * 责任：
 *   1. 解析 worker-local `.env`（若存在）注入 `process.env`，仅填补缺失的 key（显式 export 优先）。
 *   2. 检测是否缺关键 secret（`AIWORKER_MASTER_KEY` 优先，`INTERNAL_SHARED_SECRET` 顺手 mint）。
 *      若缺：自动 mint 64-hex master key + 48-hex shared secret，写入 `.env`（chmod 0600），
 *      并把刚 mint 的值塞进 `process.env`。
 *   3. 将显式进程 env 中的 worker 入网启动项合并回 `.env`，让下一次启动仍命中同一 worker 配置。
 *   4. 第一次 mint 时把 master key **明文打到 stderr 一次** + 备份警告，让用户能 tee/抓取。
 *
 * 故意写得 zero-dependency（只用 `node:fs` / `node:os` / `node:path` / `node:crypto`），
 * 这样在 cli 入口顶部 import 不会拖慢 bundle 启动。
 *
 * 安全约束：
 *   - 文件 mode 必须 0600。
 *   - 已存在 key 不会被覆盖（idempotent）。
 *   - master key 只在 freshly minted 时打到 stderr；后续启动 silent。
 *   - parse 不容忍 inline comment / 复杂 quoting：dotenv 文件由本工具创建，格式可控。
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_HOME = path.join(homedir(), '.aiworker')
const PERSISTED_WORKER_STARTUP_ENV_KEYS = [
  'AIWORKER_GATEWAY_URL',
  'AIWORKER_JOIN_TOKEN',
  'AIWORKER_DISPLAY_NAME',
  'AIWORKER_ENROLL_MODE',
] as const

export interface DotenvBootstrapResult {
  /** 是否 mint 了新 secret（首次启动） */
  minted: boolean
  /** 加载或新建的 .env 文件绝对路径 */
  envFile: string
  /** master key 明文——仅 minted=true 时非 null，调用方负责打到 stderr */
  freshMasterKey: string | null
}

interface BootstrapOptions {
  /** 覆盖 `~/.aiworker` 根目录（测试用）。 */
  home?: string
  /** 是否在 minted 时打到 stderr。默认 true。测试可关。 */
  printOnMint?: boolean
}

export function bootstrapDotenv(options: BootstrapOptions = {}): DotenvBootstrapResult {
  const home = options.home ?? process.env.AIWORKER_HOME ?? DEFAULT_HOME
  const envFile = path.join(home, '.env')

  // 1) 已存在 → load + return
  if (existsSync(envFile)) {
    const currentText = readFileSync(envFile, 'utf8')
    const merged = mergeProcessStartupEnv(currentText)
    if (merged.changed) {
      writeFileSync(envFile, merged.text, { mode: 0o600 })
      chmodSync(envFile, 0o600)
    }

    const parsed = parseDotenv(merged.text)
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined)
        process.env[key] = value
    }
    return { minted: false, envFile, freshMasterKey: null }
  }

  // 2) 不存在 → mint 缺失的关键 secret，写入文件
  if (!existsSync(home))
    mkdirSync(home, { recursive: true, mode: 0o700 })

  const masterKey = process.env.AIWORKER_MASTER_KEY ?? randomBytes(32).toString('hex')
  const sharedSecret = process.env.INTERNAL_SHARED_SECRET ?? randomBytes(24).toString('hex')

  const lines = [
    '# FEAT-030 first-run minted env. chmod 0600.',
    '# Persisted to disk so subsequent `aiworker` calls keep the same worker-local startup env.',
    '# 显式 `export KEY=...` 仍然优先（并会回写本文件中的 worker 入网启动项）。',
    `AIWORKER_MASTER_KEY=${masterKey}`,
    `INTERNAL_SHARED_SECRET=${sharedSecret}`,
  ]
  appendProcessStartupEnv(lines)
  lines.push('')
  writeFileSync(envFile, lines.join('\n'), { mode: 0o600 })
  // chmod 防御写入路径上 umask 把 mode 收紧没生效的情况
  chmodSync(envFile, 0o600)

  // 注入 process.env
  if (process.env.AIWORKER_MASTER_KEY === undefined)
    process.env.AIWORKER_MASTER_KEY = masterKey
  if (process.env.INTERNAL_SHARED_SECRET === undefined)
    process.env.INTERNAL_SHARED_SECRET = sharedSecret

  // 仅当本次确实新 mint 了 master key（用户没 export 老的）才打到 stderr
  const freshMasterKey = process.env.AIWORKER_MASTER_KEY === masterKey ? masterKey : null
  if (freshMasterKey && options.printOnMint !== false)
    printMintBanner(freshMasterKey, envFile)

  return { minted: true, envFile, freshMasterKey }
}

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const assignment = parseDotenvAssignment(rawLine)
    if (!assignment)
      continue
    out[assignment.key] = assignment.value
  }
  return out
}

function parseDotenvAssignment(rawLine: string): { key: string, value: string } | null {
  const line = rawLine.trim()
  if (!line || line.startsWith('#'))
    return null
  const eq = line.indexOf('=')
  if (eq <= 0)
    return null
  const key = line.slice(0, eq).trim()
  let value = line.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
    value = value.slice(1, -1)
  return { key, value }
}

function collectProcessStartupEnv(): Partial<Record<typeof PERSISTED_WORKER_STARTUP_ENV_KEYS[number], string>> {
  const out: Partial<Record<typeof PERSISTED_WORKER_STARTUP_ENV_KEYS[number], string>> = {}
  for (const key of PERSISTED_WORKER_STARTUP_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined)
      out[key] = value
  }
  return out
}

function appendProcessStartupEnv(lines: string[]): void {
  const updates = collectProcessStartupEnv()
  const keys = PERSISTED_WORKER_STARTUP_ENV_KEYS.filter(key => updates[key] !== undefined)
  if (keys.length === 0)
    return

  lines.push('')
  lines.push('# Worker-local gateway enrollment startup env.')
  for (const key of keys)
    lines.push(formatDotenvAssignment(key, updates[key]!))
}

function mergeProcessStartupEnv(text: string): { changed: boolean, text: string } {
  const updates = collectProcessStartupEnv()
  const keys = PERSISTED_WORKER_STARTUP_ENV_KEYS.filter(key => updates[key] !== undefined)
  if (keys.length === 0)
    return { changed: false, text }

  const remaining = new Set<string>(keys)
  const lines = text.split('\n')
  let changed = false

  for (let index = 0; index < lines.length; index += 1) {
    const assignment = parseDotenvAssignment(lines[index]!)
    if (!assignment || updates[assignment.key as typeof PERSISTED_WORKER_STARTUP_ENV_KEYS[number]] === undefined)
      continue

    remaining.delete(assignment.key)
    const nextValue = updates[assignment.key as typeof PERSISTED_WORKER_STARTUP_ENV_KEYS[number]]!
    if (assignment.value === nextValue)
      continue

    lines[index] = formatDotenvAssignment(assignment.key, nextValue)
    changed = true
  }

  if (remaining.size > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== '')
      lines.push('')
    lines.push('# Worker-local gateway enrollment startup env.')
    for (const key of PERSISTED_WORKER_STARTUP_ENV_KEYS) {
      if (remaining.has(key))
        lines.push(formatDotenvAssignment(key, updates[key]!))
    }
    lines.push('')
    changed = true
  }

  const mergedText = lines.join('\n')
  return {
    changed,
    text: changed && !mergedText.endsWith('\n') ? `${mergedText}\n` : mergedText,
  }
}

function formatDotenvAssignment(key: string, value: string): string {
  return `${key}=${value}`
}

function printMintBanner(masterKey: string, envFile: string): void {
  // 写到 stderr——stdout 留给 cli 命令自身的结构化输出（NDJSON 等）。
  const lines = [
    '',
    '┌────────────────────────────────────────────────────────────────────────────┐',
    '│  ⚠️  AIWORKER first-run setup                                              │',
    '│                                                                            │',
    `│  AIWORKER_MASTER_KEY (写入 ${truncatePath(envFile, 40)})  │`,
    `│      ${masterKey}  │`,
    '│                                                                            │',
    '│  请离线备份此密钥。丢失 = fleet.db / worker.db 加密数据全部解不开，         │',
    '│  所有已注册 worker 必须重 enroll。                                          │',
    '└────────────────────────────────────────────────────────────────────────────┘',
    '',
  ]
  process.stderr.write(`${lines.join('\n')}\n`)
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen)
    return p.padEnd(maxLen)
  return `…${p.slice(-(maxLen - 1))}`.padEnd(maxLen)
}
