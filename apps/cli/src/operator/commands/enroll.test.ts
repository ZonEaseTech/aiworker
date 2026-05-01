import type { OperatorSession } from './common'
import { beforeEach, describe, expect, it } from 'bun:test'

/**
 * PLAN-019 / FEAT-026 — `aiworker enroll list/approve/reject` CLI 路由测试。
 *
 * 通过命令 deps 注入 fake `withSession`，捕获每次 client.request 的入参，
 * 断言 method/params 正确。不连真 WS，也不污染其它测试文件的 module cache。
 */

interface RequestCall {
  method: string
  params: unknown
}

const requestCalls: RequestCall[] = []
let nextRequestResult: unknown

const testDeps = {
  errorToExitCode: () => 1,
  printJson: () => {},
  withSession: async (fn: (ctx: OperatorSession) => Promise<unknown>) => {
    const client = {
      close: async () => {},
      connect: async () => {},
      isOpen: () => true,
      onEvent: () => () => {},
      request: (async (method: string, params: unknown) => {
        requestCalls.push({ method, params })
        return nextRequestResult
      }) as OperatorSession['client']['request'],
      requestRaw: async () => ({}),
    } satisfies OperatorSession['client']
    return fn({
      client,
      state: { deviceId: 'op-test', deviceToken: '', gatewayUrl: 'ws://localhost:9218/ws' },
    })
  },
}

beforeEach(() => {
  requestCalls.length = 0
  nextRequestResult = undefined
})

describe('aiworker enroll list', () => {
  it('调 enroll.list method，params 为空对象', async () => {
    nextRequestResult = { pending: [] }
    const { runEnrollList } = await import('./enroll')
    const code = await runEnrollList(testDeps)
    expect(code).toBe(0)
    expect(requestCalls).toHaveLength(1)
    expect(requestCalls[0]).toEqual({ method: 'enroll.list', params: {} })
  })
})

describe('aiworker enroll approve', () => {
  it('调 enroll.approve method 并把 OTP 透传到 params.otp', async () => {
    nextRequestResult = { workerId: 'w_otp', deviceToken: 'wtk_xyz' }
    const { runEnrollApprove } = await import('./enroll')
    const code = await runEnrollApprove('BX7P-K39M', testDeps)
    expect(code).toBe(0)
    expect(requestCalls).toHaveLength(1)
    expect(requestCalls[0]).toEqual({ method: 'enroll.approve', params: { otp: 'BX7P-K39M' } })
  })
})

describe('aiworker enroll reject', () => {
  it('调 enroll.reject method 并把 OTP 透传到 params.otp', async () => {
    nextRequestResult = { rejected: true }
    const { runEnrollReject } = await import('./enroll')
    const code = await runEnrollReject('BX7P-K39M', testDeps)
    expect(code).toBe(0)
    expect(requestCalls).toHaveLength(1)
    expect(requestCalls[0]).toEqual({ method: 'enroll.reject', params: { otp: 'BX7P-K39M' } })
  })

  it('rejected=false 时仍以 0 退出（OTP 不存在不算错误）', async () => {
    nextRequestResult = { rejected: false }
    const { runEnrollReject } = await import('./enroll')
    const code = await runEnrollReject('NOPE-NOPE', testDeps)
    expect(code).toBe(0)
  })
})
