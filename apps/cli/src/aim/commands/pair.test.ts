import { beforeEach, describe, expect, it } from 'bun:test'

/**
 * BUG-002 回归覆盖：pair 成功后必须把本次使用的 `--url` 持久化为 `gatewayUrl`，
 * 否则后续 aim 命令会回落到 default 的 ws://localhost:9218，造成"pair 后立刻断"的体验。
 *
 * 实现策略：通过 `runPair` 的 deps 注入 fake `withSession` 与 `patchAimState`，
 * 避免 module mock 污染其它命令测试。
 */

interface PatchPayload {
  gatewayUrl?: string
  deviceToken?: string
  defaultWorkerId?: string
}

const patchCalls: PatchPayload[] = []
let withSessionResult = { deviceToken: 'dt', workerId: 'w-1' }

beforeEach(() => {
  patchCalls.length = 0
  withSessionResult = { deviceToken: 'dt', workerId: 'w-1' }
})

const testDeps = {
  errorToExitCode: () => 1,
  patchAimState: async (patch: PatchPayload) => {
    patchCalls.push(patch)
    return { gatewayUrl: 'ws://localhost:9218', deviceId: 'op-test', deviceToken: '', ...patch }
  },
  printJson: () => {},
  withSession: async () => withSessionResult,
}

describe('runPair gatewayUrl 持久化', () => {
  it('传 --url 时把 gatewayUrl 一并写入 patch', async () => {
    const { runPair } = await import('./pair')
    const code = await runPair({
      url: 'ws://127.0.0.1:20300/ws',
      workerUrl: 'http://worker.local',
      bootstrapToken: 'bt',
    }, testDeps)
    expect(code).toBe(0)
    expect(patchCalls).toHaveLength(1)
    expect(patchCalls[0]).toEqual({
      gatewayUrl: 'ws://127.0.0.1:20300/ws',
      deviceToken: 'dt',
      defaultWorkerId: 'w-1',
    })
  })

  it('未传 --url 时不写 gatewayUrl 字段，避免覆盖既有值', async () => {
    const { runPair } = await import('./pair')
    const code = await runPair({
      workerUrl: 'http://worker.local',
      bootstrapToken: 'bt',
    }, testDeps)
    expect(code).toBe(0)
    expect(patchCalls).toHaveLength(1)
    const patch = patchCalls[0]!
    expect(Object.keys(patch)).not.toContain('gatewayUrl')
    expect(patch).toEqual({
      deviceToken: 'dt',
      defaultWorkerId: 'w-1',
    })
  })
})
