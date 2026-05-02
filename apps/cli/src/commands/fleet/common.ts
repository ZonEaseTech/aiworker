import type { OperatorClient } from '../../operator/client'
import type { OperatorState } from '../../operator/state'

import process from 'node:process'

import { createOperatorClient, OperatorWsError } from '../../operator/client'
import { loadOperatorState, normalizeGatewayWsUrl, patchOperatorState, saveOperatorState } from '../../operator/state'

/**
 * 命令公共上下文：加载 state、创建 WS 连接、在回调跑完后干净关闭。
 *
 * 使用方：
 *   await withSession(async ({ client, state }) => {
 *     const res = await client.request('system.presence', {})
 *     ...
 *   })
 *
 * 失败时会抛出。调用方（aiworker.ts）统一在外层 catch 里打印并 exit(1)。
 */
export interface OperatorSession {
  client: OperatorClient
  state: OperatorState
}

export interface WithSessionOptions {
  /** override state.gatewayUrl，主要用于 `aiworker gateway start` 后立刻连接自举场景。 */
  gatewayUrl?: string
  /** override state.deviceToken，用于 pair 前先以空 token 连 loopback。 */
  token?: string
  /** 建立连接的超时。 */
  connectTimeoutMs?: number
  /** 测试注入：避免命令单元测试依赖全局 module mock。 */
  createClient?: () => OperatorClient
}

export async function withSession<T>(
  fn: (ctx: OperatorSession) => Promise<T>,
  opts: WithSessionOptions = {},
): Promise<T> {
  const state = await loadOperatorState()
  const client = (opts.createClient ?? createOperatorClient)()
  try {
    await client.connect({
      url: normalizeGatewayWsUrl(opts.gatewayUrl ?? state.gatewayUrl),
      deviceId: state.deviceId,
      token: opts.token ?? state.deviceToken,
      ...(opts.connectTimeoutMs === undefined ? {} : { timeoutMs: opts.connectTimeoutMs }),
    })
    const res = await fn({ client, state })
    await client.close(1000, 'aiworker session done')
    return res
  }
  catch (err) {
    // 连接失败或命令执行失败都要确保 socket 被关掉，避免挂起事件循环。
    try {
      await client.close(1011, 'aiworker session error')
    }
    catch {
      // 忽略关闭阶段的异常。
    }
    throw err
  }
}

/** 标准化输出：成功时 stdout 打印 JSON（带换行），给 shell pipe 用。 */
export function printJson(value: unknown): void {
  const text = JSON.stringify(value, null, 2)
  process.stdout.write(`${text}\n`)
}

/** NDJSON：每个对象一行，适合 aiworker fleet chat / aiworker fleet logs 实时输出。 */
export function printNdjson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

/**
 * 把 OperatorWsError 映射成非零退出码：
 *   - NOT_FOUND / unknown_method → 2
 *   - request_timeout / connect_timeout → 3
 *   - ws_closed / not_connected → 4
 *   - 其它（包括 gateway 返回的业务 error code）→ 1
 */
export function errorToExitCode(err: unknown): number {
  if (!(err instanceof OperatorWsError))
    return 1
  switch (err.code) {
    case 'NOT_FOUND':
    case 'unknown_method':
      return 2
    case 'request_timeout':
    case 'connect_timeout':
      return 3
    case 'ws_closed':
    case 'ws_closed_early':
    case 'not_connected':
      return 4
    default:
      return 1
  }
}

export { loadOperatorState, patchOperatorState, saveOperatorState }
