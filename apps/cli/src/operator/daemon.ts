import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'

import { mkdir } from 'node:fs/promises'

import process from 'node:process'
import { resolveAiworkerHome } from '@zonease/aiworker-fs-layout'

import { resolveGatewayLogPath, resolveGatewayPidPath } from './state'

/**
 * `aiworker gateway start --detach` daemon 管理（BUG-012 重写）。
 *
 * 设计变化（in-process 重构）：
 * - **不再 spawn 外部 .ts entry**——gateway server 已迁到 `packages/gateway`，由 cli
 *   在 foreground 路径下直接 `import { startGateway }` in-process 跑（见
 *   `commands/gateway.ts::runGatewayStart`）。这样 `bun install -g @zonease/aiworker-cli`
 *   场景下 systemd `ExecStart=aiworker gateway start` 不再依赖 monorepo 布局。
 * - daemon (background) 模式继续保留，由本模块负责。机制：spawn 当前 cli binary
 *   自身（`process.execPath` + `process.argv[1]`）+ env `AIWORKER_GATEWAY_INTERNAL_FOREGROUND=1`
 *   触发子进程跑 in-process foreground；detach + unref 让父进程 exit 后子进程仍存活。
 * - PID 写 `<AIWORKER_HOME>/aiworker-gateway.pid`；启动前探活旧 PID。
 */

/** 环境变量哨兵：daemon spawn 子进程时设此 env=1，cli `gateway start` 检测到则强制 foreground。 */
export const INTERNAL_FOREGROUND_ENV = 'AIWORKER_GATEWAY_INTERNAL_FOREGROUND'

export interface DaemonStatus {
  running: boolean
  pid?: number
  /** PID 文件路径，便于排查。 */
  pidFile: string
  /** 日志文件路径（stdout + stderr 追加写入）。 */
  logFile: string
}

export interface StartDaemonOptions {
  /** 监听端口；通过 PORT env 传给子进程。 */
  port?: number
  /** 额外的环境变量。 */
  env?: Record<string, string>
}

export interface StartDaemonResult {
  pid: number
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
    try {
      unlinkSync(pidFile)
    }
    catch { /* 清理失败不影响状态返回。 */ }
    return { running: false, pidFile, logFile }
  }
  return { running: true, pid, pidFile, logFile }
}

/**
 * 启动 gateway daemon (background)。若 PID 文件存在且进程仍活着，抛错（拒绝重复启动）。
 * 成功时 PID 写入文件，stdout+stderr 追加到日志。
 *
 * 子进程 = 当前 cli binary 自己 + `--__internal-foreground` 标记，由
 * `commands/gateway.ts::runGatewayStart` 检测并走 in-process foreground 路径。
 */
export async function startDaemon(opts: StartDaemonOptions = {}): Promise<StartDaemonResult> {
  const status = getDaemonStatus()
  if (status.running)
    throw new Error(`gateway daemon 已在运行 (pid=${status.pid})，先执行 'aiworker gateway stop' 再重试。`)

  await ensureAiworkerHomeDir()

  // FEAT-030: gateway daemon 默认 9218（与 packages/gateway/src/config.ts 对齐）。
  const port = opts.port ?? Number.parseInt(process.env.PORT ?? '9218', 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65_535)
    throw new Error(`非法端口: ${port}`)

  const pidFile = resolveGatewayPidPath()
  const logFile = resolveGatewayLogPath()

  const out = openSync(logFile, 'a')
  const err = openSync(logFile, 'a')

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    PORT: String(port),
    [INTERNAL_FOREGROUND_ENV]: '1',
  }

  // self-spawn：execPath = 当前 runtime（bun），argv[1] = 当前 cli script。
  const selfScript = process.argv[1]
  if (!selfScript || selfScript.length === 0)
    throw new Error('detach 模式无法定位 cli 自身脚本路径（process.argv[1] 为空）')

  const child: ChildProcess = spawn(
    process.execPath,
    [selfScript, 'gateway', 'start', '--port', String(port)],
    {
      env,
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', out, err],
    },
  )

  try {
    closeSync(out)
  }
  catch {
    // Node 某些平台自动关；忽略。
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

  child.unref()
  writeFileSync(pidFile, `${String(child.pid)}\n`, 'utf8')

  return { pid: child.pid, port, logFile, pidFile }
}

/**
 * 停止 daemon：发 SIGTERM，超时后 SIGKILL。返回被停掉的 PID，或 null（原本就没跑）。
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
    // 兜底。
  }
  try {
    unlinkSync(status.pidFile)
  }
  catch {
    // 忽略。
  }
  return pid
}
