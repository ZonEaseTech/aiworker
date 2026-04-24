import { EVENTS } from '@aiworker/gateway-proto'
import consola from 'consola'

import { errorToExitCode, printNdjson, withSession } from './common'

export interface ChatOptions {
  workerId: string
  content: string
  conversationId?: string
  /** 总体超时（等 agent.done 的上限）。默认 120s。 */
  timeoutMs?: number
}

/**
 * `aim chat <workerId> <text>` — 往目标 worker 发一条用户消息并阻塞到 agent.done。
 *
 * 输出协议：NDJSON，每行一个 `{ kind, payload }` 记录：
 *   - kind=accepted：首次 request 返回（含 conversationId / taskId）
 *   - kind=<event.name>：转发 gateway 推送的 agent.* / chat.message 事件
 *   - kind=done：agent.done 事件（也会作为退出信号）
 *   - kind=error：超时或协议错误
 */
export async function runChat(opts: ChatOptions): Promise<number> {
  const timeoutMs = opts.timeoutMs ?? 120_000
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

        const timer = setTimeout(() => {
          printNdjson({ kind: 'error', payload: { code: 'timeout', message: `chat 等待 agent.done 超时 (>${timeoutMs}ms)` } })
          finish(3)
        }, timeoutMs)

        // 订阅关键事件。agent.done 出现即视为完成。
        const targetWorker = opts.workerId
        const relevant = (payload: unknown): boolean => {
          if (payload === null || typeof payload !== 'object')
            return false
          const wid = (payload as { workerId?: unknown }).workerId
          return typeof wid === 'string' && wid === targetWorker
        }

        const offs: Array<() => void> = []
        offs.push(client.onEvent(EVENTS.CHAT_MESSAGE, (payload) => {
          if (!relevant(payload))
            return
          printNdjson({ kind: EVENTS.CHAT_MESSAGE, payload })
        }))
        offs.push(client.onEvent(EVENTS.AGENT_THINKING, (payload) => {
          if (!relevant(payload))
            return
          printNdjson({ kind: EVENTS.AGENT_THINKING, payload })
        }))
        offs.push(client.onEvent(EVENTS.AGENT_TOOL_CALL, (payload) => {
          if (!relevant(payload))
            return
          printNdjson({ kind: EVENTS.AGENT_TOOL_CALL, payload })
        }))
        offs.push(client.onEvent(EVENTS.AGENT_DONE, (payload) => {
          if (!relevant(payload))
            return
          printNdjson({ kind: 'done', payload })
          clearTimeout(timer)
          for (const off of offs) off()
          finish(0)
        }))

        client.request('chat.send', {
          workerId: opts.workerId,
          content: opts.content,
          ...(opts.conversationId === undefined ? {} : { conversationId: opts.conversationId }),
        }, { timeoutMs: Math.min(timeoutMs, 30_000) }).then((accepted) => {
          printNdjson({ kind: 'accepted', payload: accepted })
        }).catch((err) => {
          printNdjson({ kind: 'error', payload: { code: 'request_failed', message: err instanceof Error ? err.message : String(err) } })
          clearTimeout(timer)
          for (const off of offs) off()
          finish(errorToExitCode(err))
        })
      })
    })
  }
  catch (err) {
    consola.error(`chat 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
