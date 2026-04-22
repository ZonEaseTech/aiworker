import type {
  AgentEvent,
  AgentRunInput,
  ExecutorConfig,
  ExecutorProvider,
  WorkerConfig,
} from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import type { WorkerRuntime } from '../runtime'

import { describe, expect, it } from 'bun:test'

import { handleExecutorTest } from './executor-test'

function stubExecutor(
  health: () => Promise<{ status: 'healthy' | 'degraded' | 'down' }>,
  chat?: (input: AgentRunInput) => AsyncIterable<AgentEvent>,
): ExecutorProvider {
  return {
    name: 'http',
    health: async () => ({ name: 'http', lastChecked: 'x', ...(await health()) }),
    listTools: async () => [],
    run: chat ?? (() => ({ async* [Symbol.asyncIterator]() { /* empty */ } } as AsyncIterable<AgentEvent>)),
  }
}

function stubState(executor: ExecutorProvider): WorkerModeState {
  const runtime: WorkerRuntime = {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain: {} as WorkerRuntime['brain'],
    executor,
    channels: {} as WorkerRuntime['channels'],
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

const STORED: { executor: ExecutorConfig } = {
  executor: {
    engine: 'http',
    variant: 'default',
    overrides: { baseUrl: 'http://x', apiKey: 'k', model: 'm', timeoutMs: 1000 },
  },
}

describe('handleExecutorTest', () => {
  it('reports the executor health without probing when probe=false', async () => {
    const state = stubState(stubExecutor(async () => ({ status: 'healthy' })))
    const res = await handleExecutorTest(state, STORED, {})
    expect(res.executor).toEqual({ type: 'http', status: 'healthy' })
  })

  it('reports unknown when health() throws', async () => {
    const state = stubState(stubExecutor(async () => {
      throw new Error('down')
    }))
    const res = await handleExecutorTest(state, STORED, {})
    expect(res.executor.status).toBe('unknown')
  })

  it('runs the tiny probe and returns output when probe=true', async () => {
    const chat = (): AsyncIterable<AgentEvent> => ({
      async* [Symbol.asyncIterator]() {
        yield { type: 'assistant_message_delta', delta: 'pong' }
        yield { type: 'finish', reason: 'stop' }
      },
    })
    const state = stubState(stubExecutor(async () => ({ status: 'healthy' }), chat))
    const res = await handleExecutorTest(state, STORED, { probe: true })
    expect(res.executor.tinyProbe?.ok).toBe(true)
    expect(res.executor.tinyProbe?.output).toBe('pong')
    expect(res.executor.status).toBe('healthy')
  })

  it('marks the response degraded + records probeError when run throws', async () => {
    const chat = (): AsyncIterable<AgentEvent> => ({
      async* [Symbol.asyncIterator]() {
        throw new Error('chat exploded')
      },
    })
    const state = stubState(stubExecutor(async () => ({ status: 'healthy' }), chat))
    const res = await handleExecutorTest(state, STORED, { probe: true })
    expect(res.executor.status).toBe('degraded')
    expect(res.executor.tinyProbe?.ok).toBe(false)
    expect(res.executor.probeError).toContain('chat exploded')
  })

  it('marks the response degraded when the stream emits an error event', async () => {
    const chat = (): AsyncIterable<AgentEvent> => ({
      async* [Symbol.asyncIterator]() {
        yield { type: 'error', error: 'upstream 500' }
      },
    })
    const state = stubState(stubExecutor(async () => ({ status: 'healthy' }), chat))
    const res = await handleExecutorTest(state, STORED, { probe: true })
    expect(res.executor.status).toBe('degraded')
    expect(res.executor.probeError).toBe('upstream 500')
  })

  it('truncates probe output to 100 chars', async () => {
    const long = 'x'.repeat(500)
    const chat = (): AsyncIterable<AgentEvent> => ({
      async* [Symbol.asyncIterator]() {
        yield { type: 'assistant_message_delta', delta: long }
        yield { type: 'finish', reason: 'stop' }
      },
    })
    const state = stubState(stubExecutor(async () => ({ status: 'healthy' }), chat))
    const res = await handleExecutorTest(state, STORED, { probe: true })
    expect(res.executor.tinyProbe?.output?.length).toBe(100)
  })
})
