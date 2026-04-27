import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerApiError } from '@/fleet/api'
import { RegisterWizard } from '../components/register-wizard'
import { renderWithProviders } from './test-utils'

/**
 * PLAN-013 S5: 注册流程现在走 gateway `workers.pair`。这里 mock `@/lib/api`
 * 的 `registerWorker` 与 `listWorkers` 直接返回假数据,测试 UI 映射逻辑。
 */

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  /* eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix */
  useNavigate: () => navigateMock,
}))

const registerMock = vi.fn<
  (input: { baseUrl: string, apiToken: string, displayName: string }) => Promise<SafeRegisteredWorker>
>()
const listMock = vi.fn<() => Promise<SafeRegisteredWorker[]>>()

vi.mock('@/fleet/api', async () => {
  const actual = await vi.importActual<typeof import('@/fleet/api')>('@/fleet/api')
  return {
    ...actual,
    registerWorker: (input: Parameters<typeof registerMock>[0]) => registerMock(input),
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
  registerMock.mockReset()
  listMock.mockReset()
  listMock.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('registerWizard', () => {
  it('happy path shows success step + navigates on Go to worker config', async () => {
    registerMock.mockResolvedValueOnce({
      id: 'w_aaaaaaaaaaaa',
      baseUrl: VALID.baseUrl,
      displayName: VALID.displayName,
      addedAt: new Date().toISOString(),
      addedBy: 'manual',
      lastSeenAt: new Date().toISOString(),
      lastSeenState: 'online',
      lastConfigVersion: 1,
    })

    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)

    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await screen.findByText(/Worker registered/i)
    expect(screen.getByText('w_aaaaaaaaaaaa')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Go to worker config/i }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workers/$workerId',
      params: { workerId: 'w_aaaaaaaaaaaa' },
    })
  })

  it('maps auth-failed error to the apiToken field', async () => {
    registerMock.mockRejectedValueOnce(new WorkerApiError('auth-failed', 'worker 拒绝 bootstrap token'))
    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Worker rejected this token/i)).toBeTruthy()
    })
  })

  it('maps already-registered error to the displayName field with the existing workerId', async () => {
    registerMock.mockRejectedValueOnce(
      new WorkerApiError('already-registered', 'already registered', { workerId: 'w_existinger123' }),
    )
    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await waitFor(() => {
      expect(screen.getByText(/already registered as w_existinger123/i)).toBeTruthy()
    })
  })

  it('maps worker-unreachable error to the baseUrl field', async () => {
    registerMock.mockRejectedValueOnce(
      new WorkerApiError('worker-unreachable', 'connect ECONNREFUSED 127.0.0.1:9999'),
    )
    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await waitFor(() => {
      expect(screen.getByText(/ECONNREFUSED/i)).toBeTruthy()
    })
  })
})
