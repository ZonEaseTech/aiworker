import type {
  BrainProvider,
  ExecutorProvider,
  ServiceStatus,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { WorkerRuntime } from '../runtime'
import type { WorkerModeState } from './state'

import { describe, expect, it } from 'bun:test'

import { buildInfo } from './info'

const TEST_RUNTIME_VERSION = 'test-runtime-1.2.3'

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
    cron: {} as WorkerRuntime['cron'],
    workspaces: {} as WorkerRuntime['workspaces'],
    processes: {} as WorkerRuntime['processes'],
    approvals: {} as WorkerRuntime['approvals'],
    dispose: () => undefined,
  }
}

function stubState(runtime: WorkerRuntime): WorkerModeState {
  return {
    workerId: 'w_abcdefghjkmn',
    runtime,
    configVersion: 7,
    startedAt: '2026-04-21T00:00:00.000Z',
    tokenPlaintext: 'wtk_test',
  }
}

const CONFIG: WorkerConfig = {
  brains: [
    {
      id: 'fs-primary',
      type: 'filesystem',
      priority: 10,
      readOnly: false,
      config: { home: '/tmp/h' },
    },
    {
      id: 'cloud-fallback',
      type: 'cloud-gateway',
      priority: 1,
      readOnly: true,
      config: { url: 'https://cloud.example.com', token: '' },
    },
  ],
  brainWriteTarget: 'fs-primary',
  brainRetrieval: 'merge-by-priority',
  executor: {
    engine: 'http',
    variant: 'default',
    overrides: {
      baseUrl: 'http://localhost:4000',
      apiKey: '',
      model: 'gpt-4o-mini',
      timeoutMs: 30_000,
    },
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
      runtimeVersion: TEST_RUNTIME_VERSION,
      advertisedBaseUrl: 'https://worker.example.com',
    })

    expect(info.workerId).toBe('w_abcdefghjkmn')
    expect(info.configVersion).toBe(7)
    expect(info.runtimeVersion).toBe(TEST_RUNTIME_VERSION)
    expect(info.advertisedBaseUrl).toBe('https://worker.example.com')

    expect(info.brains).toEqual([
      {
        id: 'fs-primary',
        type: 'filesystem',
        status: 'healthy',
        priority: 10,
        readOnly: false,
        writeTarget: true,
        home: '/tmp/h',
      },
      {
        id: 'cloud-fallback',
        type: 'cloud-gateway',
        status: 'healthy',
        priority: 1,
        readOnly: true,
        writeTarget: false,
        url: 'https://cloud.example.com',
      },
    ])

    expect(info.executor).toEqual({ type: 'http', model: 'gpt-4o-mini', status: 'healthy' })
    expect(info.controlExecutor).toEqual({
      type: 'http',
      model: 'gpt-4o-mini',
      status: 'healthy',
      reusesTaskExecutor: true,
    })
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
    const info = await buildInfo(stubState(runtime), CONFIG, { runtimeVersion: TEST_RUNTIME_VERSION })
    expect(info.brains.every(b => b.status === 'degraded')).toBe(true)
    expect(info.executor.status).toBe('healthy')
  })

  it('falls back to unknown when health() throws', async () => {
    const runtime = stubRuntime(
      async () => { throw new Error('nope') },
      async () => { throw new Error('nope') },
    )
    const info = await buildInfo(stubState(runtime), CONFIG, { runtimeVersion: TEST_RUNTIME_VERSION })
    expect(info.brains.every(b => b.status === 'unknown')).toBe(true)
    expect(info.executor.status).toBe('unknown')
  })

  it('omits webhookUrl + advertisedBaseUrl when env is unset', async () => {
    const runtime = stubRuntime(
      async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
      async () => ({ name: 'http', status: 'healthy', lastChecked: 'x' }),
    )
    const info = await buildInfo(stubState(runtime), CONFIG, { runtimeVersion: TEST_RUNTIME_VERSION })
    expect(info.advertisedBaseUrl).toBeUndefined()
    expect(info.channels.every(c => c.webhookUrl === undefined)).toBe(true)
  })

  it('surfaces the mcp defaultModel as executor.model when set', async () => {
    const mcpConfig: WorkerConfig = {
      ...CONFIG,
      executor: {
        engine: 'mcp',
        variant: 'default',
        overrides: { url: 'https://mcp.local', token: '', defaultModel: 'sonnet' },
      },
    }
    const runtime = stubRuntime(
      async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
      async () => ({ name: 'mcp', status: 'healthy', lastChecked: 'x' }),
    )
    const info = await buildInfo(stubState(runtime), mcpConfig, { runtimeVersion: TEST_RUNTIME_VERSION })
    expect(info.executor).toEqual({ type: 'mcp', model: 'sonnet', status: 'healthy' })
  })

  it('surfaces an explicit control executor separately from the task executor', async () => {
    const controlExecutorConfig: WorkerConfig['executor'] = {
      engine: 'http',
      variant: 'default',
      overrides: {
        baseUrl: 'https://control.example.com',
        apiKey: '',
        model: 'gpt-control',
      },
    }
    const config: WorkerConfig = {
      ...CONFIG,
      orchestrator: {
        decisionPipeline: {
          executor: controlExecutorConfig,
        },
      },
    }
    const runtime = {
      ...stubRuntime(
        async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
        async () => ({ name: 'http', status: 'healthy', lastChecked: 'x' }),
      ),
      controlExecutor: {
        name: 'control-http',
        health: async () => ({ name: 'control-http', status: 'degraded' as const, lastChecked: 'x' }),
        listTools: async () => [],
        run: () => ({ async* [Symbol.asyncIterator]() {} } as AsyncIterable<never>),
      } as ExecutorProvider,
      controlExecutorConfig,
      controlExecutorReusesTaskExecutor: false,
    }

    const info = await buildInfo(stubState(runtime), config, { runtimeVersion: TEST_RUNTIME_VERSION })

    expect(info.executor).toEqual({ type: 'http', model: 'gpt-4o-mini', status: 'healthy' })
    expect(info.controlExecutor).toEqual({
      type: 'http',
      model: 'gpt-control',
      status: 'degraded',
      reusesTaskExecutor: false,
    })
  })
})
