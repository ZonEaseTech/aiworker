import consola from 'consola'

import { getDaemonStatus, startDaemon, stopDaemon } from '../daemon'
import { patchAimState } from '../state'

export interface GatewayStartOptions {
  port?: number
  entry?: string
  /** 成功启动后把 gatewayUrl 写回 aim.json。默认 true。 */
  persistUrl?: boolean
}

/**
 * `aim gateway start` — 本地拉起 gateway daemon，PID 与日志写在 ~/.aiworker/。
 * 返回非零表示启动失败（入口不存在 / 端口非法 / 已在运行等）。
 */
export async function runGatewayStart(opts: GatewayStartOptions = {}): Promise<number> {
  try {
    const res = await startDaemon({
      ...(opts.port === undefined ? {} : { port: opts.port }),
      ...(opts.entry === undefined ? {} : { entry: opts.entry }),
    })
    if (opts.persistUrl !== false) {
      // 默认把 state.gatewayUrl 更新到 localhost:port，便于后续 aim pair 等命令直接用。
      await patchAimState({ gatewayUrl: `ws://localhost:${res.port}` })
    }
    consola.success(`gateway daemon 已启动 pid=${res.pid} port=${res.port}`)
    consola.info(`entry  : ${res.entry}`)
    consola.info(`pidFile: ${res.pidFile}`)
    consola.info(`logFile: ${res.logFile}`)
    return 0
  }
  catch (err) {
    consola.error(`gateway start 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

/** `aim gateway status` — 读 PID 文件并探活；不对 gateway 发起 WS 握手。 */
export function runGatewayStatus(): number {
  const status = getDaemonStatus()
  if (status.running) {
    consola.success(`gateway daemon 运行中 pid=${status.pid}`)
    consola.info(`pidFile: ${status.pidFile}`)
    consola.info(`logFile: ${status.logFile}`)
    return 0
  }
  consola.info('gateway daemon 未运行')
  return 1
}

/** `aim gateway stop` — 发 SIGTERM；超时后 SIGKILL 兜底。 */
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
