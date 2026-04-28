import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

interface ConnectCall {
  url: string
  deviceId: string
  token: string
}

const connectCalls: ConnectCall[] = []

mock.module('../client', () => {
  class AimWsError extends Error {
    constructor(message: string, public readonly code = 'aim_ws_error') {
      super(message)
      this.name = 'AimWsError'
    }
  }

  return {
    AimWsError,
    createAimClient: () => ({
      close: async () => {},
      connect: async (opts: ConnectCall) => {
        connectCalls.push(opts)
      },
      isOpen: () => true,
      onEvent: () => () => {},
      request: async () => ({}),
      requestRaw: async () => ({}),
    }),
  }
})

describe('withSession gateway URL normalization', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(async () => {
    connectCalls.length = 0
    previousHome = process.env.AIWORKER_HOME
    home = await mkdtemp(path.join(tmpdir(), 'aim-common-'))
    process.env.AIWORKER_HOME = home
  })

  afterEach(async () => {
    if (previousHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  })

  it('normalizes bare gatewayUrl overrides before connecting', async () => {
    const { withSession } = await import('./common')

    await withSession(async () => undefined, { gatewayUrl: 'ws://127.0.0.1:20400' })

    expect(connectCalls).toHaveLength(1)
    expect(connectCalls[0]!.url).toBe('ws://127.0.0.1:20400/ws')
  })
})
