import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

/**
 * `aiworker fleet token rotate <workerId>` — 为目标 worker 轮换 deviceToken。旧 token 立即失效。
 *
 * 注意：这里轮换的是 worker 连 gateway 用的 deviceToken（node 端），**不是** aiworker operator 自身
 * 的 operator token。两者不同命名、不同密钥空间，不要混淆。
 */
export async function runTokenRotate(workerId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('token.rotate', { workerId })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`fleet token rotate 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
