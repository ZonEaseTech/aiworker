import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

export interface PairOptions {
  /** gateway WS URL，默认用 state.gatewayUrl。 */
  url?: string
  workerUrl: string
  bootstrapToken: string
  displayName?: string
}

/**
 * `aim pair` — 把一个已经启动的 worker 通过 bootstrap token 注册到 gateway。
 * 成功后把 `deviceToken` 回写到 aim.json（operator 身份凭据），以及把新 workerId
 * 记到 defaultWorkerId，方便后续命令省略。
 */
export async function runPair(opts: PairOptions): Promise<number> {
  try {
    const result = await withSession(async ({ client }) => {
      return await client.request('workers.pair', {
        workerBaseUrl: opts.workerUrl,
        bootstrapToken: opts.bootstrapToken,
        ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
      })
    }, opts.url === undefined ? {} : { gatewayUrl: opts.url })

    // 写回 state：deviceToken 是 gateway 颁发给 operator 的，之后所有 aim 命令都要用。
    const { patchAimState } = await import('../state')
    await patchAimState({
      deviceToken: result.deviceToken,
      defaultWorkerId: result.workerId,
    })

    consola.success(`已配对 worker ${result.workerId}`)
    printJson({ workerId: result.workerId })
    return 0
  }
  catch (err) {
    consola.error(`pair 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
