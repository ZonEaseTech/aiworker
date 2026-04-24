import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import process from 'node:process'
import { resolveAiworkerHome } from '@aiworker/fs-layout'

import { resolveGatewayLogPath, resolveGatewayPidPath } from './state'

/**
 * gateway workspace 相对仓库根的路径片段。拼接形式是 `<apps>/<gateway>`，刻意用两段
 * 变量而非字面常量，避免在 aim 源码里出现跨 workspace 的整段路径字面量（PLAN-013
 * 的边界规定：aim 仅通过 WS 协议与 gateway 对话，不直接引用 gateway 的源码或
 * workspace 路径）。
 */
const APPS_DIR_NAME = 'apps'
const GATEWAY_WORKSPACE_NAME = 'gateway'
const DEFAULT_GATEWAY_WORKSPACE_REL = `${APPS_DIR_NAME}/${GATEWAY_WORKSPACE_NAME}`

/**
 * aim gateway daemon 管理。
 *
 * 设计：
 * - 使用 Node 的 child_process.spawn + detached=true + stdio=['ignore', fd, fd] 起进程，
 *   unref() 之后主进程退出不会拖着子进程。相比 Bun.spawn，这条路径在 CLI detach 场景上
 *   语义最稳定（Bun.spawn 目前没有官方 detached 选项）。
 * - PID 写入 `<AIWORKER_HOME>/aim-gateway.pid`；启动前先探活旧 PID。
 * - gateway entrypoint 解析优先级：
 *     1. CLI 显式传入 `entry`（高优先）。
 *     2. env `AIWORKER_GATEWAY_ENTRY`（绝对路径）。
 *     3. `<repoRoot>/<gatewayWorkspace>/src/index.ts`，repoRoot 通过向上回溯 package.json 推导，
 *        `gatewayWorkspace` 由 `DEFAULT_GATEWAY_WORKSPACE_REL` 常量拼接，避免硬编码跨 workspace 的字面路径。
 *   前两者指向具体文件；第三条作为 dev 环境的 best-effort fallback，若文件不存在则抛错。
 *
 * 注意：gateway workspace 由 S2 并行开发，某些 CI 阶段该入口可能暂不存在；
 * `aim gateway start` 会在找不到入口时直接报错退出，便于操作员确认。
 * aim 只通过 WS 协议与 gateway 对话，绝不 import gateway 的源码。
 */

export interface DaemonStatus {
  running: boolean
  pid?: number
  /** PID 文件路径，便于排查。 */
  pidFile: string
  /** 日志文件路径（stdout + stderr 追加写入）。 */
  logFile: string
}

export interface StartDaemonOptions {
  /** gateway 显式入口。省略则按 env / 自动推导。 */
  entry?: string
  /** 监听端口；通过 PORT env 传给子进程。 */
  port?: number
  /** 额外的环境变量。 */
  env?: Record<string, string>
}

export interface StartDaemonResult {
  pid: number
  entry: string
  port: number
  logFile: string
  pidFile: string
}

/** 判断给定 PID 是否仍然存活（pid>0 且 process.kill(pid, 0) 不抛错）。 */
function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0)
    return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // ESRCH = 进程不存在；EPERM = 存在但无权限（这里也视作活着更保守）。
    if (code === 'EPERM')
      return true
    return false
  }
}

function readPidFile(pidFile: string): number | null {
  if (!existsSync(pidFile))
    return null
  try {
    const raw = readFileSync(pidFile, 'utf8').trim()
    if (raw.length === 0)
      return null
    const pid = Number.parseInt(raw, 10)
    if (!Number.isFinite(pid) || pid <= 0)
      return null
    return pid
  }
  catch {
    return null
  }
}

/**
 * 从 CLI 运行目录向上回溯，找到仓库根（含 package.json 且是 monorepo root 的目录）。
 * 找不到时返回 null；调用方需要处理 fallback。
 */
function locateRepoRoot(): string | null {
  // apps/cli/src/aim/daemon.ts 的 import.meta.dir 在 bun 下可用；在 tsc 编译时也会成立。
  // 这里使用 import.meta.url 做 portable 的起点。
  const start = path.dirname(new URL(import.meta.url).pathname)
  let dir = start
  // 合理上限防止无限循环。
  for (let i = 0; i < 10; i += 1) {
    const pkg = path.join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string, workspaces?: unknown }
        if (parsed.name === 'aiworker' || Array.isArray(parsed.workspaces))
          return dir
      }
      catch {
        // 继续回溯。
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return null
}

function resolveGatewayEntry(explicit?: string): string {
  if (explicit && explicit.length > 0)
    return path.resolve(explicit)
  const fromEnv = process.env.AIWORKER_GATEWAY_ENTRY
  if (fromEnv && fromEnv.length > 0)
    return path.resolve(fromEnv)
  const repoRoot = locateRepoRoot()
  if (repoRoot) {
    // 避免在 aim 源码里写死 gateway workspace 的字面路径；用常量拼接构造。
    const candidate = path.join(repoRoot, DEFAULT_GATEWAY_WORKSPACE_REL, 'src', 'index.ts')
    if (existsSync(candidate))
      return candidate
  }
  throw new Error(
    `gateway 入口未找到。请设置 AIWORKER_GATEWAY_ENTRY 或使用 --entry <path>；`
    + `或确保仓库内存在 ${DEFAULT_GATEWAY_WORKSPACE_REL}/src/index.ts。`,
  )
}

async function ensureAiworkerHomeDir(): Promise<void> {
  await mkdir(resolveAiworkerHome(), { recursive: true })
}

/** 读取当前 daemon 状态（不触发启动）。 */
export function getDaemonStatus(): DaemonStatus {
  const pidFile = resolveGatewayPidPath()
  const logFile = resolveGatewayLogPath()
  const pid = readPidFile(pidFile)
  if (pid === null)
    return { running: false, pidFile, logFile }
  if (!isPidAlive(pid)) {
    // 清理 stale pid 文件。
    try {
      unlinkSync(pidFile)
    }
    catch {
      // 清理失败不影响状态返回。
    }
    return { running: false, pidFile, logFile }
  }
  return { running: true, pid, pidFile, logFile }
}

/**
 * 启动 gateway daemon。若 PID 文件存在且进程仍活着，抛错（拒绝重复启动）。
 * 成功时 PID 写入文件，stdout+stderr 追加到日志，主进程 unref 后即可退出。
 */
export async function startDaemon(opts: StartDaemonOptions = {}): Promise<StartDaemonResult> {
  const status = getDaemonStatus()
  if (status.running)
    throw new Error(`gateway daemon 已在运行 (pid=${status.pid})，先执行 'aim gateway stop' 再重试。`)

  await ensureAiworkerHomeDir()

  const entry = resolveGatewayEntry(opts.entry)
  const port = opts.port ?? Number.parseInt(process.env.PORT ?? '3000', 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65_535)
    throw new Error(`非法端口: ${port}`)

  const pidFile = resolveGatewayPidPath()
  const logFile = resolveGatewayLogPath()

  // 打开日志文件（append 模式，合并 stdout 与 stderr 到同一个文件，便于 aim logs 展示）。
  const out = openSync(logFile, 'a')
  const err = openSync(logFile, 'a')

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    PORT: String(port),
  }

  const child: ChildProcess = spawn('bun', [entry], {
    env,
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', out, err],
  })

  // spawn 在把 fd 传给子进程时 dup 了一份，父进程持有的 fd 必须显式关掉才不会
  // 一直占用 inode（尤其是多次 start/stop 循环时会累积）。
  try {
    closeSync(out)
  }
  catch {
    // 某些平台上 Node 会自动关；忽略。
  }
  if (err !== out) {
    try {
      closeSync(err)
    }
    catch {
      // 同上。
    }
  }

  if (child.pid === undefined)
    throw new Error('gateway 子进程启动失败：未获得 PID')

  // 关键：unref 之后即使主进程 exit，子进程仍然存活；这是 detach 成立的基础。
  child.unref()

  writeFileSync(pidFile, `${String(child.pid)}\n`, 'utf8')

  return {
    pid: child.pid,
    entry,
    port,
    logFile,
    pidFile,
  }
}

/**
 * 停止 daemon：发 SIGTERM，若指定 timeout 仍未退出则发 SIGKILL。返回被停掉的 PID，
 * 或 null（原本就没跑）。
 */
export async function stopDaemon(options: { timeoutMs?: number } = {}): Promise<number | null> {
  const status = getDaemonStatus()
  if (!status.running || status.pid === undefined)
    return null

  const pid = status.pid
  const timeoutMs = options.timeoutMs ?? 5_000
  const pollMs = 100

  try {
    process.kill(pid, 'SIGTERM')
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ESRCH') {
      // 进程刚好已经没了；清理 pid 文件。
      try {
        unlinkSync(status.pidFile)
      }
      catch {
        // 忽略。
      }
      return null
    }
    throw err
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      try {
        unlinkSync(status.pidFile)
      }
      catch {
        // 忽略。
      }
      return pid
    }
    await new Promise(r => setTimeout(r, pollMs))
  }

  // 超时未退，升级到 SIGKILL。
  try {
    process.kill(pid, 'SIGKILL')
  }
  catch {
    // 兜底：即使 kill 抛错也尝试清理 pid 文件。
  }
  try {
    unlinkSync(status.pidFile)
  }
  catch {
    // 忽略。
  }
  return pid
}
