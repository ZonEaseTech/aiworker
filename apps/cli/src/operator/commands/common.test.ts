import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

describe('withSession gateway URL normalization', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(async () => {
    mock.restore()
    previousHome = process.env.AIWORKER_HOME
    home = await mkdtemp(path.join(tmpdir(), 'aiworker-common-'))
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
    const connectCalls: Array<{ url: string }> = []
    const commonUrl = new URL(`./common.ts?test=${crypto.randomUUID()}`, import.meta.url).href
    const { withSession } = await import(commonUrl) as typeof import('./common')

    await withSession(async () => undefined, {
      createClient: () => ({
        close: async () => {},
        connect: async (opts) => {
          connectCalls.push({ url: opts.url })
        },
        isOpen: () => true,
        onEvent: () => () => {},
        request: async () => ({} as never),
        requestRaw: async () => ({}),
      }),
      gatewayUrl: 'ws://127.0.0.1:20400',
    })

    expect(connectCalls).toHaveLength(1)
    expect(connectCalls[0]!.url).toBe('ws://127.0.0.1:20400/ws')
  })
})
