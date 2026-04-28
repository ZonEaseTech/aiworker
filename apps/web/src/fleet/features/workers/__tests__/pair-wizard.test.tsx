import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerApiError } from '@/fleet/api'
import { RegisterWizard } from '../components/register-wizard'
import { renderWithProviders } from './test-utils'

/**
 * FEAT-034 Phase 2 — pair wizard 通过 gateway `workers.pair` 注册 worker，
 * 成功后展示 fleet 颁发的一次性 deviceToken（关闭 dialog 立刻从 React state 清掉）。
 *
 * 这里 mock `@/fleet/api` 的 `pairWorker` / `listWorkers`，专测 UI 映射。
 */

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  /* eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix */
  useNavigate: () => navigateMock,
}))

const pairMock = vi.fn<
  (input: { baseUrl: string, bootstrapToken: string, displayName: string }) => Promise<{
    worker: SafeRegisteredWorker
    deviceToken: string
  }>
>()
const listMock = vi.fn<() => Promise<SafeRegisteredWorker[]>>()

vi.mock('@/fleet/api', async () => {
  const actual = await vi.importActual<typeof import('@/fleet/api')>('@/fleet/api')
  return {
    ...actual,
    pairWorker: (input: Parameters<typeof pairMock>[0]) => pairMock(input),
    listWorkers: () => listMock(),
  }
})

function fillForm({ baseUrl, apiToken, displayName }: {
  baseUrl: string
  apiToken: string
  displayName: string
}) {
  fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: baseUrl } })
  fireEvent.change(screen.getByLabelText('Bootstrap API token'), { target: { value: apiToken } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: displayName } })
}

const VALID = {
  baseUrl: 'https://worker.example.com',
  apiToken: 'wtk_abcdef0123456789',
  displayName: 'edge-1',
}

beforeEach(() => {
  navigateMock.mockClear()
  pairMock.mockReset()
  listMock.mockReset()
  listMock.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('pair wizard', () => {
  it('happy path: 成功后展示 deviceToken + 跳转到 worker detail', async () => {
    pairMock.mockResolvedValueOnce({
      worker: {
        id: 'w_aaaaaaaaaaaa',
        baseUrl: VALID.baseUrl,
        displayName: VALID.displayName,
        addedAt: new Date().toISOString(),
        addedBy: 'manual',
        lastSeenAt: new Date().toISOString(),
        lastSeenState: 'online',
        lastConfigVersion: 1,
      },
      deviceToken: 'wtk_freshtoken123456',
    })

    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)

    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Pair worker$/i }))

    await screen.findByText(/Worker paired/i)
    expect(screen.getByText('w_aaaaaaaaaaaa')).toBeTruthy()
    // deviceToken 默认掩码展示，需点 Show 才能看到明文。
    expect(screen.queryByText('wtk_freshtoken123456')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Go to worker/i }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workers/$workerId',
      params: { workerId: 'w_aaaaaaaaaaaa' },
    })
  })

  it('maps auth-failed error to the apiToken field', async () => {
    pairMock.mockRejectedValueOnce(new WorkerApiError('auth-failed', 'worker 拒绝 bootstrap token'))
    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Pair worker$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Worker rejected this token/i)).toBeTruthy()
    })
  })

  it('maps already-registered error to the displayName field with the existing workerId', async () => {
    pairMock.mockRejectedValueOnce(
      new WorkerApiError('already-registered', 'already registered', { workerId: 'w_existinger123' }),
    )
    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Pair worker$/i }))

    await waitFor(() => {
      expect(screen.getByText(/already registered as w_existinger123/i)).toBeTruthy()
    })
  })

  it('maps worker-unreachable error to the baseUrl field', async () => {
    pairMock.mockRejectedValueOnce(
      new WorkerApiError('worker-unreachable', 'connect ECONNREFUSED 127.0.0.1:9999'),
    )
    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Pair worker$/i }))

    await waitFor(() => {
      expect(screen.getByText(/ECONNREFUSED/i)).toBeTruthy()
    })
  })
})
