import { EVENTS } from '@zonease/aiworker-gateway-proto'
import consola from 'consola'

import { errorToExitCode, printNdjson, withSession } from './common'

export interface LogsOptions {
  workerId: string
  follow?: boolean
  /** 订阅时请求的历史行数（上限 1000）。 */
  tail?: number
  /** --follow 模式下的总超时；非 follow 则返回首帧后立即退出。 */
  timeoutMs?: number
}

/**
 * `aiworker fleet logs <workerId> [--follow] [--tail N]` — 订阅某个 worker 的日志尾部。
 * 输出 NDJSON（每行一个 `{ stream, line, ts }`）。
 *
 * 非 follow 模式：发起 logs.tail，拿到 subscribed:true 的 ack 后等一次 grace
 * window 让 gateway 把历史行推完，然后关闭退出。
 * follow 模式：订阅直到 timeoutMs 或用户 Ctrl-C。
 */
export async function runLogs(opts: LogsOptions): Promise<number> {
  const follow = opts.follow === true
  const timeoutMs = opts.timeoutMs ?? (follow ? 3_600_000 : 5_000)

  try {
    return await withSession(async ({ client }) => {
      return await new Promise<number>((resolve) => {
        let settled = false
        const finish = (code: number): void => {
          if (settled)
            return
          settled = true
          resolve(code)
        }

        const off = client.onEvent(EVENTS.LOGS_LINE, (payload) => {
          if (payload === null || typeof payload !== 'object')
            return
          const wid = (payload as { workerId?: unknown }).workerId
          if (typeof wid !== 'string' || wid !== opts.workerId)
            return
          printNdjson(payload)
        })

        const timer = setTimeout(() => {
          off()
          finish(0)
        }, timeoutMs)

        client.request('logs.tail', {
          workerId: opts.workerId,
          follow,
          ...(opts.tail === undefined ? {} : { lines: opts.tail }),
        }).then(() => {
          // ack 已到。非 follow 模式保留 timer 触发退出；follow 模式等 timer 或 Ctrl-C。
        }).catch((err) => {
          off()
          clearTimeout(timer)
          printNdjson({ kind: 'error', payload: { code: 'request_failed', message: err instanceof Error ? err.message : String(err) } })
          finish(errorToExitCode(err))
        })
      })
    })
  }
  catch (err) {
    consola.error(`logs 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
