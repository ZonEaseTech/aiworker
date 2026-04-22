import type { ChannelBinding, ChannelType, WorkerConfig } from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import type { WorkerRuntime } from '../runtime'

import { describe, expect, it } from 'bun:test'

import { ChannelRegistry } from '../channels/registry'
import { handleChannelTest } from './channel-test'

function stubState(bindings: ChannelBinding[]): WorkerModeState {
  const channels = new ChannelRegistry(bindings)
  const runtime: WorkerRuntime = {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain: {} as WorkerRuntime['brain'],
    executor: {} as WorkerRuntime['executor'],
    channels,
    bus: {} as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
    workspaces: {} as WorkerRuntime['workspaces'],
    dispose: () => undefined,
  }
  return {
    workerId: 'w_abcdefghjkmn',
    runtime,
    configVersion: 1,
    startedAt: '2026-04-21T00:00:00.000Z',
    tokenPlaintext: 'wtk_test',
  }
}

const WEB_BINDING: ChannelBinding = {
  channel: 'web',
  enabled: true,
  credentials: { channel: 'web' },
}

describe('handleChannelTest', () => {
  it('returns 404 AppError for an unbound channel', async () => {
    const state = stubState([WEB_BINDING])
    await expect(handleChannelTest(state, 'telegram')).rejects.toMatchObject({ status: 404 })
  })

  it('returns 404 AppError for an unknown channel name', async () => {
    const state = stubState([WEB_BINDING])
    await expect(handleChannelTest(state, 'not-a-channel' as ChannelType)).rejects.toMatchObject({ status: 404 })
  })

  it('dry-runs when chatId + text are absent (web binding)', async () => {
    const state = stubState([WEB_BINDING])
    const res = await handleChannelTest(state, 'web', {})
    expect(res.sent).toBe(false)
    expect((res.platformResponse as { dryRun: boolean }).dryRun).toBe(true)
  })

  it('sends + returns platformResponse.ok when adapter.send succeeds (web no-op)', async () => {
    const state = stubState([WEB_BINDING])
    const res = await handleChannelTest(state, 'web', { chatId: 'c1', text: 'hi' })
    expect(res.sent).toBe(true)
    expect(res.platformResponse).toEqual({ ok: true })
  })

  it('returns { sent: false, error } when the adapter throws', async () => {
    const state = stubState([{
      channel: 'telegram',
      enabled: true,
      credentials: { channel: 'telegram', botToken: 't' },
    }])
    const res = await handleChannelTest(state, 'telegram', { chatId: 'c1', text: 'hi' })
    expect(res.sent).toBe(false)
    expect(res.error).toContain('telegram')
  })
})
