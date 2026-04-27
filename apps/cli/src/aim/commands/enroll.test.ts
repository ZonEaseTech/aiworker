import { beforeEach, describe, expect, it, mock } from 'bun:test'

/**
 * PLAN-019 / FEAT-026 — `aim enroll list/approve/reject` CLI 路由测试。
 *
 * 复用 `pair.test.ts` 同套 mock 策略：mock `./common` 的 withSession，捕获
 * 每次 client.request 的入参，断言 method/params 正确。不连真 WS。
 */

interface RequestCall {
  method: string
  params: unknown
}

const requestCalls: RequestCall[] = []
let nextRequestResult: unknown

mock.module('./common', () => ({
  withSession: async (fn: (ctx: { client: { request: (m: string, p: unknown) => Promise<unknown> } }) => Promise<unknown>) => {
    return fn({
      client: {
        request: async (method: string, params: unknown) => {
          requestCalls.push({ method, params })
          return nextRequestResult
        },
      },
    })
  },
  printJson: () => {},
  errorToExitCode: () => 1,
}))

beforeEach(() => {
  requestCalls.length = 0
  nextRequestResult = undefined
})

describe('aim enroll list', () => {
  it('调 enroll.list method，params 为空对象', async () => {
    nextRequestResult = { pending: [] }
    const { runEnrollList } = await import('./enroll')
    const code = await runEnrollList()
    expect(code).toBe(0)
    expect(requestCalls).toHaveLength(1)
    expect(requestCalls[0]).toEqual({ method: 'enroll.list', params: {} })
  })
})

describe('aim enroll approve', () => {
  it('调 enroll.approve method 并把 OTP 透传到 params.otp', async () => {
    nextRequestResult = { workerId: 'w_otp', deviceToken: 'wtk_xyz' }
    const { runEnrollApprove } = await import('./enroll')
    const code = await runEnrollApprove('BX7P-K39M')
    expect(code).toBe(0)
    expect(requestCalls).toHaveLength(1)
    expect(requestCalls[0]).toEqual({ method: 'enroll.approve', params: { otp: 'BX7P-K39M' } })
  })
})

describe('aim enroll reject', () => {
  it('调 enroll.reject method 并把 OTP 透传到 params.otp', async () => {
    nextRequestResult = { rejected: true }
    const { runEnrollReject } = await import('./enroll')
    const code = await runEnrollReject('BX7P-K39M')
    expect(code).toBe(0)
    expect(requestCalls).toHaveLength(1)
    expect(requestCalls[0]).toEqual({ method: 'enroll.reject', params: { otp: 'BX7P-K39M' } })
  })

  it('rejected=false 时仍以 0 退出（OTP 不存在不算错误）', async () => {
    nextRequestResult = { rejected: false }
    const { runEnrollReject } = await import('./enroll')
    const code = await runEnrollReject('NOPE-NOPE')
    expect(code).toBe(0)
  })
})
