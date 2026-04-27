import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

/**
 * `aim enroll` —— PLAN-019 / FEAT-026 OTP-attended enrollment 三件套：
 *
 *   aim enroll list                  → enroll.list
 *   aim enroll approve <otp>         → enroll.approve
 *   aim enroll reject  <otp>         → enroll.reject
 *
 * 三个子命令都走 operator-to-gateway routing，不需要指定 workerId；OTP 是
 * gateway 在 worker 第一次 `mode='otp'` connect 时签发的 8 位人类可读码
 * （字母-数字，去掉了 0/O/I/1/L/U 这类易混字符）。
 */

export async function runEnrollList(): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('enroll.list', {})
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`enroll list 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export async function runEnrollApprove(otp: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('enroll.approve', { otp })
    })
    consola.success(`已批准 OTP ${otp}，workerId=${res.workerId}`)
    printJson({ workerId: res.workerId, deviceToken: res.deviceToken })
    return 0
  }
  catch (err) {
    consola.error(`enroll approve 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

export async function runEnrollReject(otp: string): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('enroll.reject', { otp })
    })
    if (res.rejected)
      consola.info(`已拒绝 OTP ${otp}`)
    else
      consola.warn(`OTP ${otp} 不存在或已过期`)
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`enroll reject 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
