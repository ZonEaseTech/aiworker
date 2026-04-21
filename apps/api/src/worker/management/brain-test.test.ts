import type { BrainProvider, BrainSourceConfig, WorkerConfig } from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'
import type { WorkerRuntime } from '../runtime'

import { describe, expect, it } from 'bun:test'

import { handleBrainTest } from './brain-test'

function stubBrain(health: () => Promise<{ status: 'healthy' | 'degraded' | 'down' }>): BrainProvider {
  return {
    name: 'multi',
    health: async () => ({ name: 'multi', lastChecked: 'x', ...(await health()) }),
    listSkills: async () => [],
    listMemories: async () => [],
    searchMemories: async () => [],
    writeMemory: async () => { throw new Error('unused') },
  }
}

function stubState(brain: BrainProvider): WorkerModeState {
  const runtime: WorkerRuntime = {
    workerId: 'w_abcdefghjkmn',
    config: {} as WorkerConfig,
    brain,
    executor: {} as WorkerRuntime['executor'],
    channels: {} as WorkerRuntime['channels'],
    bus: {} as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
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

const ONE_SOURCE: BrainSourceConfig[] = [
  { id: 'hermes-primary', type: 'hermes', priority: 10, readOnly: false, config: { apiUrl: 'http://h', home: '/tmp' } },
]

const TWO_SOURCES: BrainSourceConfig[] = [
  { id: 'hermes-primary', type: 'hermes', priority: 10, readOnly: false, config: { apiUrl: 'http://h', home: '/tmp' } },
  { id: 'cloud', type: 'cloud-gateway', priority: 1, readOnly: true, config: { url: 'https://c', token: '' } },
]

describe('handleBrainTest', () => {
  it('reports single-source row when config has exactly one brain', async () => {
    const state = stubState(stubBrain(async () => ({ status: 'healthy' })))
    const res = await handleBrainTest(state, { brains: ONE_SOURCE })
    expect(res.brains).toEqual([
      { id: 'hermes-primary', type: 'hermes', status: 'healthy' },
    ])
  })

  it('reports an aggregate row when config has multiple brains', async () => {
    const state = stubState(stubBrain(async () => ({ status: 'degraded' })))
    const res = await handleBrainTest(state, { brains: TWO_SOURCES })
    expect(res.brains).toEqual([
      { id: 'aggregate', type: 'multi', status: 'degraded' },
    ])
  })

  it('surfaces a thrown error as a down row with errorMessage', async () => {
    const state = stubState({
      name: 'multi',
      health: async () => { throw new Error('brain boom') },
      listSkills: async () => [],
      listMemories: async () => [],
      searchMemories: async () => [],
      writeMemory: async () => { throw new Error('unused') },
    })
    const res = await handleBrainTest(state, { brains: ONE_SOURCE })
    expect(res.brains[0]?.status).toBe('down')
    expect(res.brains[0]?.errorMessage).toBe('brain boom')
  })
})
