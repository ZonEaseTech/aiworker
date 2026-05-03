/* eslint-disable react-hooks-extra/no-unnecessary-use-prefix */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestPanel } from './test-panel'

const mocks = vi.hoisted(() => ({
  brainMutate: vi.fn(),
  channelMutate: vi.fn(),
  executorMutate: vi.fn(),
  executorState: {
    data: undefined as unknown,
    error: undefined as unknown,
    isError: false,
    isPending: false,
  },
}))

vi.mock('@/worker/lib/hooks', () => ({
  useTestWorkerBrain: () => ({
    data: undefined,
    error: undefined,
    isError: false,
    isPending: false,
    mutate: mocks.brainMutate,
  }),
  useTestWorkerChannel: () => ({
    data: undefined,
    error: undefined,
    isError: false,
    isPending: false,
    mutate: mocks.channelMutate,
  }),
  useTestWorkerExecutor: () => ({
    mutate: mocks.executorMutate,
    ...mocks.executorState,
  }),
  useWorkerInfo: () => ({ data: { channels: [] } }),
}))

describe('worker test panel', () => {
  beforeEach(() => {
    mocks.brainMutate.mockReset()
    mocks.channelMutate.mockReset()
    mocks.executorMutate.mockReset()
    mocks.executorState = {
      data: undefined,
      error: undefined,
      isError: false,
      isPending: false,
    }
  })

  it('recovers the executor button and explains request timeouts', () => {
    mocks.executorState = {
      data: undefined,
      error: new Error('executor test timed out after 12000ms'),
      isError: true,
      isPending: false,
    }

    render(<TestPanel />)

    const button = screen.getByRole('button', { name: /Test executor/ }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(screen.getByText(/Tiny probe 请求已超时/)).toBeTruthy()
  })

  it('shows a timeout hint for degraded tiny probe results', () => {
    mocks.executorState = {
      data: {
        executor: {
          probeError: 'executor tiny probe timed out after 5000ms',
          status: 'degraded',
          tinyProbe: { latencyMs: 5001, ok: false },
          type: 'codex',
        },
      },
      error: undefined,
      isError: false,
      isPending: false,
    }

    render(<TestPanel />)

    const button = screen.getByRole('button', { name: /Test executor/ }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(screen.getByText(/Tiny probe:/)).toBeTruthy()
    expect(screen.getByText(/Tiny probe 请求已超时/)).toBeTruthy()
  })
})
