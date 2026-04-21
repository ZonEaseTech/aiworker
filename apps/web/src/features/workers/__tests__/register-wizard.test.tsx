import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterWizard } from '../components/register-wizard'
import { renderWithProviders } from './test-utils'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  /* eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix */
  useNavigate: () => navigateMock,
}))

interface MockResponse {
  status: number
  body: unknown
}

function fetchMock(response: MockResponse): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    })
  })
}

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

let originalFetch: typeof fetch

beforeEach(() => {
  navigateMock.mockClear()
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('registerWizard', () => {
  it('happy path shows success step + navigates on Go to worker config', async () => {
    globalThis.fetch = fetchMock({
      status: 201,
      body: {
        id: 'w_aaaaaaaaaaaa',
        baseUrl: VALID.baseUrl,
        displayName: VALID.displayName,
        addedAt: new Date().toISOString(),
        addedBy: 'manual',
        lastSeenAt: new Date().toISOString(),
        lastSeenState: 'online',
        lastConfigVersion: 1,
      },
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

  it('maps 401 auth-failed to the apiToken field', async () => {
    globalThis.fetch = fetchMock({ status: 401, body: { error: { code: 'auth-failed' } } })

    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Worker rejected this token/i)).toBeTruthy()
    })
  })

  it('maps 409 already-registered to the displayName field with the existing workerId', async () => {
    globalThis.fetch = fetchMock({
      status: 409,
      body: { error: { code: 'already-registered', workerId: 'w_existinger123' } },
    })

    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await waitFor(() => {
      expect(screen.getByText(/already registered as w_existinger123/i)).toBeTruthy()
    })
  })

  it('maps 502 worker-unreachable to the baseUrl field', async () => {
    globalThis.fetch = fetchMock({
      status: 502,
      body: { error: { code: 'worker-unreachable', message: 'connect ECONNREFUSED 127.0.0.1:9999' } },
    })

    renderWithProviders(<RegisterWizard open onOpenChange={vi.fn()} />)
    fillForm(VALID)
    fireEvent.click(screen.getByRole('button', { name: /^Register$/i }))

    await waitFor(() => {
      expect(screen.getByText(/ECONNREFUSED/i)).toBeTruthy()
    })
  })
})
