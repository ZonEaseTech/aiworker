import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

/** `aim workers list` — 打印 fleet 内所有 worker。 */
export async function runWorkersList(): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('workers.list', {})
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`workers list 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

/** `aim workers info <workerId>` — gateway 透传到目标 worker 的 info 接口。 */
export async function runWorkersInfo(workerId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('workers.info', { workerId })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`workers info 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export interface WorkersLaunchOptions {
  displayName?: string
  image?: string
  /** --force-id 透传给 gateway：用于从备份恢复、把现成 workerId 钉进新容器。 */
  forceId?: string
  env?: Record<string, string>
}

/** `aim workers launch` — 由 gateway 自身在本机拉起一个 worker 容器并完成配对。 */
export async function runWorkersLaunch(opts: WorkersLaunchOptions = {}): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      // forceId 通过 env.AIWORKER_FORCE_ID 下发到子容器（worker bootstrap 读这个 env）。
      const env: Record<string, string> = { ...(opts.env ?? {}) }
      if (opts.forceId !== undefined && opts.forceId.length > 0)
        env.AIWORKER_FORCE_ID = opts.forceId

      return await client.request('workers.launch', {
        ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
        ...(opts.image === undefined ? {} : { image: opts.image }),
        ...(Object.keys(env).length === 0 ? {} : { env }),
      })
    })

    // 新 worker 配对完成：保存 deviceToken + defaultWorkerId（与 aim pair 一致）。
    const { patchAimState } = await import('../state')
    await patchAimState({
      deviceToken: res.deviceToken,
      defaultWorkerId: res.workerId,
    })

    consola.success(`已 launch worker ${res.workerId}`)
    printJson({ workerId: res.workerId })
    return 0
  }
  catch (err) {
    consola.error(`workers launch 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export async function runWorkersStop(workerId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('workers.stop', { workerId })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`workers stop 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export async function runWorkersRemove(workerId: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('workers.remove', { workerId })
    })
    // 如果当前 defaultWorkerId 就是刚被摘除的 worker，清掉它。
    const { loadAimState, saveAimState } = await import('../state')
    const state = await loadAimState()
    if (state.defaultWorkerId === workerId) {
      const next = { ...state }
      delete next.defaultWorkerId
      await saveAimState(next)
    }
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`workers remove 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
