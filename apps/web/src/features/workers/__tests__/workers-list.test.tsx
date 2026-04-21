import type { SafeRegisteredWorker } from '@aiworker/shared'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkersList } from '../components/workers-list'
import { renderWithProviders } from './test-utils'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  /* eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix */
  useNavigate: () => navigateMock,
  Link: ({ to, children, ...props }: { to: string, children?: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

function makeWorker(overrides: Partial<SafeRegisteredWorker> = {}): SafeRegisteredWorker {
  return {
    id: 'w_aaaaaaaaaaaa',
    baseUrl: 'https://worker.example.com',
    displayName: 'edge-1',
    addedAt: new Date(Date.now() - 60_000).toISOString(),
    addedBy: 'manual',
    lastSeenAt: new Date(Date.now() - 5_000).toISOString(),
    lastSeenState: 'online',
    lastConfigVersion: 7,
    ...overrides,
  }
}

describe('workersList', () => {
  it('renders one row per worker', () => {
    renderWithProviders(
      <WorkersList
        workers={[
          makeWorker({ id: 'w_aaaaaaaaaaaa', displayName: 'edge-1' }),
          makeWorker({ id: 'w_bbbbbbbbbbbb', displayName: 'edge-2', lastSeenState: 'offline' }),
        ]}
      />,
    )

    expect(screen.getByText('edge-1')).toBeTruthy()
    expect(screen.getByText('edge-2')).toBeTruthy()
    expect(screen.getByText('online')).toBeTruthy()
    expect(screen.getByText('offline')).toBeTruthy()
  })

  it('shows empty state when no workers are registered', () => {
    renderWithProviders(<WorkersList workers={[]} />)
    expect(screen.getByText(/No workers registered yet/i)).toBeTruthy()
    // The empty-state CTA is the only "Register a worker" button rendered.
    expect(screen.getByRole('button', { name: /Register a worker/i })).toBeTruthy()
  })

  it('navigates to the worker detail route when a row is clicked', () => {
    navigateMock.mockClear()
    renderWithProviders(
      <WorkersList workers={[makeWorker({ id: 'w_aaaaaaaaaaaa', displayName: 'edge-1' })]} />,
    )

    fireEvent.click(screen.getByText('edge-1'))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workers/$workerId',
      params: { workerId: 'w_aaaaaaaaaaaa' },
    })
  })
})
