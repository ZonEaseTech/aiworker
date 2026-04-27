import process from 'node:process'
import { startGateway } from '@zonease/aiworker-gateway'
import { closeFleetDb } from '@zonease/aiworker-storage-sqlite/fleet'
import consola from 'consola'

import { resolveWebStaticDir } from '../../lib/web-static'
import { getDaemonStatus, startDaemon, stopDaemon } from '../daemon'
import { patchAimState } from '../state'

export interface GatewayStartOptions {
  port?: number
  /** 启动后写回 aim.json gatewayUrl。默认 true。 */
  persistUrl?: boolean
  /** background detach（spawn cli 自身 + foreground flag）。默认 false（systemd-friendly）。 */
  detach?: boolean
  /**
   * PLAN-022 / FEAT-033：默认挂载 fleet bundle 至 `/admin/*`。`--no-serve-web`
   * 关掉。资源缺失会 warn 但不阻塞启动。
   */
  serveWeb?: boolean
}

/**
 * `aiworker gateway start` — 默认 **foreground** in-process 启动 gateway server
 * （systemd Type=simple 友好，BUG-012 修复）。
 *
 * 模式分流：
 * - `--detach` 显式：spawn cli 自身 background，写 PID/log 到 ~/.aiworker/。
 * - 默认 / `--__internal-foreground`（daemon spawn 子进程内部）：
 *     in-process import startGateway() → SIGTERM/SIGINT 优雅停止。
 *     进程一直 blocking 等 signal，systemd 视为长跑 service。
 */
export async function runGatewayStart(opts: GatewayStartOptions = {}): Promise<number> {
  if (opts.detach === true)
    return runGatewayStartDetached(opts)
  return runGatewayStartForeground(opts)
}

async function runGatewayStartDetached(opts: GatewayStartOptions): Promise<number> {
  try {
    const res = await startDaemon({
      ...(opts.port === undefined ? {} : { port: opts.port }),
      // 透传 --no-serve-web 到 spawn 子进程：env 在 foreground 路径里解释。
      ...(opts.serveWeb === false ? { env: { AIWORKER_GATEWAY_NO_SERVE_WEB: '1' } } : {}),
    })
    if (opts.persistUrl !== false)
      await patchAimState({ gatewayUrl: `ws://localhost:${res.port}` })
    consola.success(`gateway daemon 已启动 pid=${res.pid} port=${res.port}`)
    consola.info(`pidFile: ${res.pidFile}`)
    consola.info(`logFile: ${res.logFile}`)
    return 0
  }
  catch (err) {
    consola.error(`gateway start --detach 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

async function runGatewayStartForeground(opts: GatewayStartOptions): Promise<number> {
  try {
    // detach 路径会通过 env 把 --no-serve-web 透传到 spawn 子进程；同时也允许
    // 运维直接 export AIWORKER_GATEWAY_NO_SERVE_WEB=1 关掉。
    const envOff = process.env.AIWORKER_GATEWAY_NO_SERVE_WEB === '1'
    const serveWeb = opts.serveWeb !== false && !envOff
    const webStaticDir = serveWeb ? resolveWebStaticDir('fleet') : undefined
    if (serveWeb && !webStaticDir)
      consola.warn('[gateway] web 静态资源未找到（apps/web/dist/fleet 缺失？），/admin/* 将返回 404')
    const started = await startGateway(
      opts.port === undefined ? {} : { port: opts.port },
      { ...(webStaticDir ? { webStaticDir } : {}) },
    )
    if (webStaticDir)
      consola.info(`[gateway] /admin/* serving fleet bundle from ${webStaticDir}`)
    if (opts.persistUrl !== false) {
      try {
        await patchAimState({ gatewayUrl: `ws://localhost:${started.port}` })
      }
      catch (err) {
        // 写 aim.json 失败不影响 server 跑（systemd / 容器场景常见无写权限）。
        consola.warn(`无法持久化 gatewayUrl 到 aim.json: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    consola.success(`gateway 已启动 (foreground) port=${started.port}`)

    let shuttingDown = false
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shuttingDown)
        return
      shuttingDown = true
      consola.info(`[gateway] received ${signal}, shutting down`)
      try {
        await started.stop()
        closeFleetDb()
      }
      catch (err) {
        consola.error('[gateway] shutdown failed', err)
      }
      process.exit(0)
    }
    process.once('SIGTERM', () => void shutdown('SIGTERM'))
    process.once('SIGINT', () => void shutdown('SIGINT'))

    // 阻塞直到 signal handler 调 process.exit；避免 cli main flow 退出。
    await new Promise<never>(() => {})
    return 0 // unreachable
  }
  catch (err) {
    consola.error(`gateway start 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

/** `aiworker gateway status` — 读 PID 文件并探活；不对 gateway 发起 WS 握手。 */
export function runGatewayStatus(): number {
  const status = getDaemonStatus()
  if (status.running) {
    consola.success(`gateway daemon 运行中 pid=${status.pid}`)
    consola.info(`pidFile: ${status.pidFile}`)
    consola.info(`logFile: ${status.logFile}`)
    return 0
  }
  consola.info('gateway daemon 未运行（或在 foreground 模式下由 systemd 直接管）')
  return 1
}

/** `aiworker gateway stop` — 发 SIGTERM；超时后 SIGKILL 兜底。 */
export async function runGatewayStop(options: { timeoutMs?: number } = {}): Promise<number> {
  try {
    const stopped = await stopDaemon(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    if (stopped === null) {
      consola.info('gateway daemon 当前未运行')
      return 0
    }
    consola.success(`gateway daemon 已停止 pid=${stopped}`)
    return 0
  }
  catch (err) {
    consola.error(`gateway stop 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
