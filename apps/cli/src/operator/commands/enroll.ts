import type { OperatorSession, WithSessionOptions } from './common'

import consola from 'consola'
import { errorToExitCode, printJson, withSession } from './common'

interface EnrollDeps {
  errorToExitCode?: typeof errorToExitCode
  printJson?: typeof printJson
  withSession?: (
    fn: (ctx: OperatorSession) => Promise<unknown>,
    opts?: WithSessionOptions,
  ) => Promise<unknown>
}

/**
 * `aiworker enroll` —— PLAN-019 / FEAT-026 OTP-attended enrollment 三件套：
 *
 *   aiworker enroll list                  → enroll.list
 *   aiworker enroll approve <otp>         → enroll.approve
 *   aiworker enroll reject  <otp>         → enroll.reject
 *
 * 三个子命令都走 operator-to-gateway routing，不需要指定 workerId；OTP 是
 * gateway 在 worker 第一次 `mode='otp'` connect 时签发的 8 位人类可读码
 * （字母-数字，去掉了 0/O/I/1/L/U 这类易混字符）。
 */

export async function runEnrollList(deps: EnrollDeps = {}): Promise<number> {
  const runWithSession = deps.withSession ?? withSession
  const writeJson = deps.printJson ?? printJson
  const mapErrorToExitCode = deps.errorToExitCode ?? errorToExitCode
  try {
    const res = await runWithSession(async ({ client }) => {
      return await client.request('enroll.list', {})
    })
    writeJson(res)
    return 0
  }
  catch (err) {
    consola.error(`enroll list 失败: ${err instanceof Error ? err.message : String(err)}`)
    return mapErrorToExitCode(err)
  }
}

export async function runEnrollApprove(otp: string, deps: EnrollDeps = {}): Promise<number> {
  const runWithSession = deps.withSession ?? withSession
  const writeJson = deps.printJson ?? printJson
  const mapErrorToExitCode = deps.errorToExitCode ?? errorToExitCode
  try {
    const res = await runWithSession(async ({ client }) => {
      return await client.request('enroll.approve', { otp })
    }) as { deviceToken: string, workerId: string }
    consola.success(`已批准 OTP ${otp}，workerId=${res.workerId}`)
    writeJson({ workerId: res.workerId, deviceToken: res.deviceToken })
    return 0
  }
  catch (err) {
    consola.error(`enroll approve 失败: ${err instanceof Error ? err.message : String(err)}`)
    return mapErrorToExitCode(err)
  }
}

export async function runEnrollReject(otp: string, deps: EnrollDeps = {}): Promise<number> {
  const runWithSession = deps.withSession ?? withSession
  const writeJson = deps.printJson ?? printJson
  const mapErrorToExitCode = deps.errorToExitCode ?? errorToExitCode
  try {
    const res = await runWithSession(async ({ client }) => {
      return await client.request('enroll.reject', { otp })
    }) as { rejected: boolean }
    if (res.rejected)
      consola.info(`已拒绝 OTP ${otp}`)
    else
      consola.warn(`OTP ${otp} 不存在或已过期`)
    writeJson(res)
    return 0
  }
  catch (err) {
    consola.error(`enroll reject 失败: ${err instanceof Error ? err.message : String(err)}`)
    return mapErrorToExitCode(err)
  }
}
