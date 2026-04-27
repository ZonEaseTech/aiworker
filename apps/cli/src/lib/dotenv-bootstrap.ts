/**
 * FEAT-030: zero-env quickstart support.
 *
 * 在 CLI 入口被业务模块（含 packages/core 的 zod schema）import 之前调用一次。
 * 责任：
 *   1. 解析 `~/.aiworker/.env`（若存在）注入 `process.env`，仅填补缺失的 key（显式 export 优先）。
 *   2. 检测是否缺关键 secret（`AIWORKER_MASTER_KEY` 优先，`INTERNAL_SHARED_SECRET` 顺手 mint）。
 *      若缺：自动 mint 64-hex master key + 48-hex shared secret，写入 `~/.aiworker/.env`（chmod 0600），
 *      并把刚 mint 的值塞进 `process.env`。
 *   3. 第一次 mint 时把 master key **明文打到 stderr 一次** + 备份警告，让用户能 tee/抓取。
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
    const parsed = parseDotenv(readFileSync(envFile, 'utf8'))
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
    '# Persisted to disk so subsequent `aiworker` calls don\'t need to re-mint.',
    '# 显式 `export AIWORKER_MASTER_KEY=...` 仍然优先（覆盖本文件）。',
    `AIWORKER_MASTER_KEY=${masterKey}`,
    `INTERNAL_SHARED_SECRET=${sharedSecret}`,
    '',
  ]
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
    const line = rawLine.trim()
    if (!line || line.startsWith('#'))
      continue
    const eq = line.indexOf('=')
    if (eq <= 0)
      continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
      value = value.slice(1, -1)
    out[key] = value
  }
  return out
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
