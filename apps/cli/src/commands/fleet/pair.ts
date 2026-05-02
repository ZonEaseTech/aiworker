import type { OperatorSession, WithSessionOptions } from './common'

import consola from 'consola'
import { patchOperatorState } from '../../operator/state'
import { errorToExitCode, printJson, withSession } from './common'

export interface PairOptions {
  /** gateway WS URL，默认用 state.gatewayUrl。 */
  url?: string
  workerUrl: string
  bootstrapToken: string
  displayName?: string
}

interface PairDeps {
  errorToExitCode?: typeof errorToExitCode
  patchOperatorState?: typeof patchOperatorState
  printJson?: typeof printJson
  withSession?: (
    fn: (ctx: OperatorSession) => Promise<{ deviceToken: string, workerId: string }>,
    opts?: WithSessionOptions,
  ) => Promise<{ deviceToken: string, workerId: string }>
}

/**
 * `aiworker fleet pair` — 把一个已经启动的 worker 通过 bootstrap token 注册到 gateway。
 * 成功后把 `deviceToken` 回写到 aiworker.json（operator 身份凭据），以及把新 workerId
 * 记到 defaultWorkerId，方便后续命令省略。
 */
export async function runPair(opts: PairOptions, deps: PairDeps = {}): Promise<number> {
  const runWithSession = deps.withSession ?? withSession
  const writeOperatorState = deps.patchOperatorState ?? patchOperatorState
  const writeJson = deps.printJson ?? printJson
  const mapErrorToExitCode = deps.errorToExitCode ?? errorToExitCode
  try {
    const result = await runWithSession(async ({ client }) => {
      return await client.request('workers.pair', {
        workerBaseUrl: opts.workerUrl,
        bootstrapToken: opts.bootstrapToken,
        ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
      })
    }, opts.url === undefined ? {} : { gatewayUrl: opts.url })

    // 写回 state：deviceToken 是 gateway 颁发给 operator 的，之后所有 aiworker operator 命令都要用。
    // 同时把本次 pair 用到的 --url 持久化为 gatewayUrl，否则后续命令会回落到 default。
    await writeOperatorState({
      ...(opts.url === undefined ? {} : { gatewayUrl: opts.url }),
      deviceToken: result.deviceToken,
      defaultWorkerId: result.workerId,
    })

    consola.success(`已配对 worker ${result.workerId}`)
    writeJson({ workerId: result.workerId })
    return 0
  }
  catch (err) {
    consola.error(`fleet pair 失败: ${err instanceof Error ? err.message : String(err)}`)
    return mapErrorToExitCode(err)
  }
}
