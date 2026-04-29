import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { listAuditEvents } from '@/fleet/api'
import { routeTree } from '@/fleet/routeTree.gen'
import { resolveWebRouterBasepath } from '@/shared/lib/router-basepath'

vi.mock('@/fleet/api', () => {
  class WorkerApiError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
      super(message)
      this.name = 'WorkerApiError'
      this.code = code
    }
  }

  return {
    WorkerApiError,
    approveEnrollment: vi.fn(async () => ({ deviceToken: 'token', workerId: 'w_test' })),
    getPresence: vi.fn(async () => ({ now: Date.now(), online: [] })),
    getWorker: vi.fn(async () => {
      throw new WorkerApiError('not-found', 'worker not found')
    }),
    launchWorker: vi.fn(async () => ({
      deviceToken: 'token',
      worker: {
        addedAt: '',
        addedBy: 'launch-local',
        baseUrl: '',
        displayName: 'Test worker',
        id: 'w_test',
        lastSeenState: 'online',
      },
    })),
    listAuditEvents: vi.fn(async () => ({ events: [], hasMore: false })),
    listPendingEnrollments: vi.fn(async () => []),
    listWorkers: vi.fn(async () => []),
    pairWorker: vi.fn(async () => ({
      deviceToken: 'token',
      worker: {
        addedAt: '',
        addedBy: 'manual',
        baseUrl: 'http://127.0.0.1:9217',
        displayName: 'Test worker',
        id: 'w_test',
        lastSeenState: 'online',
      },
    })),
    rejectEnrollment: vi.fn(async () => ({ rejected: true })),
    removeWorker: vi.fn(async () => undefined),
    rotateWorkerToken: vi.fn(async () => ({
      deviceToken: 'token',
      rotatedAt: new Date().toISOString(),
    })),
    stopWorker: vi.fn(async () => ({ stopped: true })),
  }
})

function classListOf(element: HTMLElement): string[] {
  return String(element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
}

async function renderFleetRoute(initialEntry: string, width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))

  const router = createRouter({
    routeTree,
    basepath: resolveWebRouterBasepath('fleet', '/admin/'),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    defaultPreload: false,
  })
  await router.load()

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('fleet responsive shell', () => {
  it.each([
    { height: 844, path: '/admin/workers', width: 390 },
    { height: 932, path: '/admin/audit', width: 430 },
  ])('uses a top navigation shell at $width px for $path', async ({ height, path, width }) => {
    await renderFleetRoute(path, width, height)

    const shell = await screen.findByTestId('fleet-shell')
    const sidebar = screen.getByTestId('fleet-shell-sidebar')
    const nav = screen.getByTestId('fleet-shell-nav')

    expect(classListOf(shell)).toEqual(expect.arrayContaining(['flex-col', 'md:flex-row']))
    expect(classListOf(sidebar)).toEqual(expect.arrayContaining(['w-full', 'md:w-60']))
    expect(classListOf(sidebar)).not.toContain('w-60')
    expect(classListOf(nav)).toEqual(expect.arrayContaining([
      'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
      'md:flex-col',
    ]))
  })

  it('keeps audit rows inside an internal scroll panel', async () => {
    vi.mocked(listAuditEvents).mockResolvedValueOnce({
      events: Array.from({ length: 60 }, (_, index) => ({
        action: 'gateway.connect.accepted',
        actor: 'gateway',
        at: new Date(Date.UTC(2026, 3, 29, 18, index)).toISOString(),
        detail: { index },
        id: 60 - index,
        workerId: `w_test_${index}`,
      })),
      hasMore: true,
    })

    await renderFleetRoute('/admin/audit', 430, 932)

    const auditTable = await screen.findByTestId('audit-table-scroll')
    expect(classListOf(auditTable.parentElement as HTMLElement)).toEqual(expect.arrayContaining([
      'min-h-0',
      'flex-1',
      'overflow-auto',
    ]))

    const shell = screen.getByTestId('fleet-shell')
    const main = auditTable.closest('main')

    expect(classListOf(shell)).toEqual(expect.arrayContaining(['h-dvh', 'overflow-hidden']))
    expect(classListOf(main as HTMLElement)).toEqual(expect.arrayContaining(['min-h-0', 'overflow-auto']))
  })
})
