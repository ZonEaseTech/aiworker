import type { WorkerConfig, WorkerInfo } from '@aiworker/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerApiError } from '@/lib/api'
import { ConfigEditor } from '../components/config-editor'
import { renderWithProviders } from './test-utils'

/**
 * PLAN-013 S5: 数据层已从 REST 迁到 gateway WS,不再走 `fetch`。此处 mock
 * `@/lib/api` 的 getWorkerInfo / getWorkerConfig / putWorkerConfig 三个函数
 * 直接返回假数据,避免 gateway-client 真的建 WebSocket。
 */

const WORKER_ID = 'w_aaaaaaaaaaaa'

function configFixture(): WorkerConfig {
  return {
    brains: [
      {
        id: 'brain-1',
        type: 'filesystem',
        priority: 100,
        readOnly: false,
        config: { home: '/home' },
      },
    ],
    brainWriteTarget: 'brain-1',
    brainRetrieval: 'merge-by-priority',
    executor: {
      engine: 'http',
      variant: 'default',
      overrides: {
        baseUrl: 'http://localhost:9999',
        apiKey: '',
        model: 'stub',
        timeoutMs: 30_000,
      },
    },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
  }
}

function infoFixture(): WorkerInfo {
  return {
    workerId: WORKER_ID,
    runtimeVersion: '0.2.0',
    configVersion: 3,
    brains: [{ id: 'brain-1', type: 'filesystem', status: 'healthy' }],
    executor: { type: 'http', status: 'healthy', model: 'stub' },
    channels: [],
    evolutionEnabled: false,
    startedAt: new Date().toISOString(),
  }
}

type GetConfig = (id: string) => Promise<{ config: WorkerConfig, version: number }>
type PutConfig = (
  id: string,
  body: WorkerConfig,
  options?: { ifMatchVersion?: number },
) => Promise<{ config: WorkerConfig, version: number, runtimeReload: 'ok' | 'failed' }>
type GetInfo = (id: string) => Promise<WorkerInfo>

interface Handlers {
  getWorkerConfig: ReturnType<typeof vi.fn<GetConfig>>
  putWorkerConfig: ReturnType<typeof vi.fn<PutConfig>>
  getWorkerInfo: ReturnType<typeof vi.fn<GetInfo>>
}

let handlers: Handlers = createHandlers()

function createHandlers(): Handlers {
  return {
    getWorkerConfig: vi.fn<GetConfig>(async () => ({ config: configFixture(), version: 3 })),
    putWorkerConfig: vi.fn<PutConfig>(async (_id, body, options) => ({
      config: body,
      version: (options?.ifMatchVersion ?? 0) + 1,
      runtimeReload: 'ok',
    })),
    getWorkerInfo: vi.fn<GetInfo>(async () => infoFixture()),
  }
}

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getWorkerConfig: (id: string) => handlers.getWorkerConfig(id),
    putWorkerConfig: (id: string, body: WorkerConfig, options?: { ifMatchVersion?: number }) =>
      handlers.putWorkerConfig(id, body, options),
    getWorkerInfo: (id: string) => handlers.getWorkerInfo(id),
  }
})

beforeEach(() => {
  handlers = createHandlers()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('configEditor', () => {
  it('loads config + PUT round-trip on Save', async () => {
    renderWithProviders(<ConfigEditor workerId={WORKER_ID} />)

    await screen.findByText(/Configuration/)
    await screen.findByText(/Version/)

    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }))

    await waitFor(() => expect(handlers.putWorkerConfig).toHaveBeenCalled())
    await screen.findByText(/Saved \(version 4\)\./i)
  })

  it('shows 409 conflict banner and surfaces Reload button', async () => {
    handlers.putWorkerConfig.mockRejectedValueOnce(
      new WorkerApiError(
        'version-conflict',
        'config version 3 does not match current version 5',
        { expected: 3, actual: 5 },
      ),
    )
    renderWithProviders(<ConfigEditor workerId={WORKER_ID} />)
    await screen.findByText(/Configuration/)

    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }))
    await screen.findByText(/Version conflict/i)
    expect(screen.getByRole('button', { name: /Reload and re-edit/i })).toBeTruthy()
  })

  it('blocks save when brainWriteTarget is empty while brains exist', async () => {
    const brokenConfig = configFixture()
    brokenConfig.brainWriteTarget = ''
    handlers.getWorkerConfig.mockResolvedValueOnce({ config: brokenConfig, version: 1 })

    renderWithProviders(<ConfigEditor workerId={WORKER_ID} />)
    await screen.findByText(/Configuration/)

    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }))
    await screen.findByText(/Pick a brain write target/i)
  })
})
