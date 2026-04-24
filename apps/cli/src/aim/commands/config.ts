import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

/** `aim config get <workerId>` — 透传到 worker 的 config.get。 */
export async function runConfigGet(workerId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('config.get', { workerId })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`config get 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export interface ConfigSetOptions {
  workerId: string
  /** 以 JSON 字符串形式传入的新 config。 */
  configJson: string
  /** If-Match 乐观锁版本。必须给，防止误覆盖。 */
  ifMatch: number
}

/**
 * `aim config set <workerId> <json> --if-match <version>` — 更新 worker 配置。
 * 必须显式提供 --if-match（worker 侧乐观锁依赖）。
 */
export async function runConfigSet(opts: ConfigSetOptions): Promise<number> {
  let parsed: unknown
  try {
    parsed = JSON.parse(opts.configJson)
  }
  catch (err) {
    consola.error(`config-set 参数不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }

  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('config.put', {
        workerId: opts.workerId,
        ifMatch: opts.ifMatch,
        config: parsed,
      })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`config set 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
