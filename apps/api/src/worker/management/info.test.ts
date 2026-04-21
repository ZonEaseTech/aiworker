import type {
  BrainProvider,
  ExecutorProvider,
  ServiceStatus,
  WorkerConfig,
} from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import type { WorkerRuntime } from '../runtime'

import { describe, expect, it } from 'bun:test'

import { buildInfo } from './info'

function stubRuntime(
  brain: () => Promise<ServiceStatus>,
  executor: () => Promise<ServiceStatus>,
): WorkerRuntime {
  return {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain: { name: 'multi', health: brain } as unknown as BrainProvider,
    executor: { name: 'http', health: executor } as unknown as ExecutorProvider,
    channels: {} as WorkerRuntime['channels'],
    bus: {} as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
    dispose: () => undefined,
  }
}

function stubState(runtime: WorkerRuntime): WorkerModeState {
  return {
    workerId: 'w_abcdefghjkmn',
    runtime,
    configVersion: 7,
    startedAt: '2026-04-21T00:00:00.000Z',
  }
}

const CONFIG: WorkerConfig = {
  brains: [
    {
      id: 'hermes-primary',
      type: 'hermes',
      priority: 10,
      readOnly: false,
      config: { apiUrl: 'http://hermes.local', home: '/tmp/h' },
    },
    {
      id: 'cloud-fallback',
      type: 'cloud-gateway',
      priority: 1,
      readOnly: true,
      config: { url: 'https://cloud.example.com', token: '' },
    },
  ],
  brainWriteTarget: 'hermes-primary',
  brainRetrieval: 'merge-by-priority',
  executor: {
    type: 'http',
    baseUrl: 'http://localhost:4000',
    apiKey: '',
    model: 'gpt-4o-mini',
    timeoutMs: 30_000,
  },
  channels: [
    {
      channel: 'line',
      enabled: true,
      credentials: { channel: 'line', channelSecret: '', channelAccessToken: '' },
    },
    { channel: 'web', enabled: true, credentials: { channel: 'web' } },
  ],
  evolution: { enabled: true, observationRetentionDays: 30 },
}

describe('buildInfo', () => {
  it('maps healthy runtime probes into the shared WorkerInfo shape', async () => {
    const runtime = stubRuntime(
      async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
      async () => ({ name: 'http', status: 'healthy', lastChecked: 'x' }),
    )
    const info = await buildInfo(stubState(runtime), CONFIG, {
      advertisedBaseUrl: 'https://worker.example.com',
    })

    expect(info.workerId).toBe('w_abcdefghjkmn')
    expect(info.configVersion).toBe(7)
    expect(info.runtimeVersion).toBe('0.2.0')
    expect(info.advertisedBaseUrl).toBe('https://worker.example.com')

    expect(info.brains).toEqual([
      { id: 'hermes-primary', type: 'hermes', status: 'healthy' },
      { id: 'cloud-fallback', type: 'cloud-gateway', status: 'healthy' },
    ])

    expect(info.executor).toEqual({ type: 'http', model: 'gpt-4o-mini', status: 'healthy' })
    expect(info.evolutionEnabled).toBe(true)

    expect(info.channels).toEqual([
      {
        channel: 'line',
        enabled: true,
        webhookUrl: 'https://worker.example.com/line/webhook',
      },
      {
        channel: 'web',
        enabled: true,
        webhookUrl: 'https://worker.example.com/web/webhook',
      },
    ])
  })

  it('surfaces degraded status from the aggregate brain', async () => {
    const runtime = stubRuntime(
      async () => ({ name: 'multi', status: 'degraded', lastChecked: 'x' }),
      async () => ({ name: 'http', status: 'healthy', lastChecked: 'x' }),
    )
    const info = await buildInfo(stubState(runtime), CONFIG, {})
    expect(info.brains.every(b => b.status === 'degraded')).toBe(true)
    expect(info.executor.status).toBe('healthy')
  })

  it('falls back to unknown when health() throws', async () => {
    const runtime = stubRuntime(
      async () => { throw new Error('nope') },
      async () => { throw new Error('nope') },
    )
    const info = await buildInfo(stubState(runtime), CONFIG, {})
    expect(info.brains.every(b => b.status === 'unknown')).toBe(true)
    expect(info.executor.status).toBe('unknown')
  })

  it('omits webhookUrl + advertisedBaseUrl when env is unset', async () => {
    const runtime = stubRuntime(
      async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
      async () => ({ name: 'http', status: 'healthy', lastChecked: 'x' }),
    )
    const info = await buildInfo(stubState(runtime), CONFIG, {})
    expect(info.advertisedBaseUrl).toBeUndefined()
    expect(info.channels.every(c => c.webhookUrl === undefined)).toBe(true)
  })

  it('surfaces the mcp defaultModel as executor.model when set', async () => {
    const mcpConfig: WorkerConfig = {
      ...CONFIG,
      executor: { type: 'mcp', url: 'https://mcp.local', token: '', defaultModel: 'sonnet' },
    }
    const runtime = stubRuntime(
      async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
      async () => ({ name: 'mcp', status: 'healthy', lastChecked: 'x' }),
    )
    const info = await buildInfo(stubState(runtime), mcpConfig, {})
    expect(info.executor).toEqual({ type: 'mcp', model: 'sonnet', status: 'healthy' })
  })
})
