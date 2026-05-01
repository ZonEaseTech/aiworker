import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  DEFAULT_GATEWAY_URL,
  loadOperatorState,
  normalizeGatewayWsUrl,
  patchOperatorState,
  resolveOperatorStatePath,
} from './state'

describe('aiworker operator state gateway URL normalization', () => {
  let home: string
  let previousHome: string | undefined

  beforeEach(async () => {
    previousHome = process.env.AIWORKER_HOME
    home = await mkdtemp(path.join(tmpdir(), 'aiworker-state-'))
    process.env.AIWORKER_HOME = home
  })

  afterEach(async () => {
    if (previousHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  })

  it('uses /ws in the default operator state', async () => {
    const state = await loadOperatorState()
    expect(state.gatewayUrl).toBe(DEFAULT_GATEWAY_URL)
  })

  it('normalizes bare ws origins but preserves explicit paths', () => {
    expect(normalizeGatewayWsUrl('ws://localhost:9218')).toBe('ws://localhost:9218/ws')
    expect(normalizeGatewayWsUrl('wss://operator:pw@example.test:9443/')).toBe('wss://operator:pw@example.test:9443/ws')
    expect(normalizeGatewayWsUrl('ws://localhost:9218/ws')).toBe('ws://localhost:9218/ws')
    expect(normalizeGatewayWsUrl('ws://localhost:9218/enroll-ws')).toBe('ws://localhost:9218/enroll-ws')
  })

  it('normalizes persisted historical bare gatewayUrl on load', async () => {
    const statePath = resolveOperatorStatePath()
    await mkdir(path.dirname(statePath), { recursive: true })
    await writeFile(statePath, JSON.stringify({
      gatewayUrl: 'ws://127.0.0.1:20300',
      deviceId: 'op-test',
      deviceToken: '',
    }), 'utf8')

    const state = await loadOperatorState()
    expect(state.gatewayUrl).toBe('ws://127.0.0.1:20300/ws')
  })

  it('normalizes bare gatewayUrl patches before saving aiworker.json', async () => {
    await patchOperatorState({ gatewayUrl: 'ws://127.0.0.1:20301' })

    const raw = await readFile(resolveOperatorStatePath(), 'utf8')
    const state = JSON.parse(raw) as { gatewayUrl: string }
    expect(state.gatewayUrl).toBe('ws://127.0.0.1:20301/ws')
  })
})
