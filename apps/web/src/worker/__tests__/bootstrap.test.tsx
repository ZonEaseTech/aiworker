import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWebRouterBasepath } from '@/shared/lib/router-basepath'
import { __resetBearerForTests, setBearerToken } from '@/worker/lib/auth'
import { routeTree } from '@/worker/routeTree.gen'

async function renderWorkerRoute(initialEntry = '/admin/') {
  window.history.pushState(null, '', initialEntry)
  const router = createRouter({
    routeTree,
    basepath: resolveWebRouterBasepath('worker', initialEntry),
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

function mockWorkerApiFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/health')) {
      return new Response(JSON.stringify({
        brain: { status: 'healthy' },
        checkedAt: '2026-05-03T00:00:00.000Z',
        configVersion: 7,
        executor: { status: 'healthy' },
        mode: 'worker',
        startedAt: '2026-05-03T00:00:00.000Z',
        status: 'healthy',
        workerId: 'w_bootstrap_test',
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    }
    if (url.endsWith('/api/worker/info')) {
      return new Response(JSON.stringify({
        brains: [],
        channels: [],
        configVersion: 7,
        executor: { type: 'codex', status: 'healthy' },
        startedAt: '2026-05-03T00:00:00.000Z',
        workerId: 'w_bootstrap_test',
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    }
    if (url.endsWith('/api/worker/cron'))
      return new Response(JSON.stringify({ jobs: [] }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    if (url.endsWith('/api/worker/approvals'))
      return new Response(JSON.stringify({ approvals: [] }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    return new Response('{}', { headers: { 'Content-Type': 'application/json' }, status: 200 })
  })
}

describe('worker bundle bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    __resetBearerForTests()
    window.history.pushState(null, '', '/')
  })

  it('imports the worker routeTree without throwing', () => {
    // routeTree 是 TanStack Router plugin 在构建期生成的产物；能 import 通过即
    // 证明：1) `apps/web/src/worker/routes/*` 全部 transpile OK；2) shared 资源
    //       链路完整；3) Phase 3 worker UI MVP 闭环。
    expect(routeTree).toBeDefined()
  })

  it('renders a locked state without polling worker APIs when no bearer token is present', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await renderWorkerRoute()

    expect(await screen.findByRole('heading', { name: '需要 bearer token' })).toBeTruthy()
    expect(screen.queryByText(/AIWorker · Worker/)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps fleet-hosted worker shell locked without a bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await renderWorkerRoute('/w/w_bootstrap_test/')

    expect(await screen.findByRole('heading', { name: '需要 bearer token' })).toBeTruthy()
    expect(screen.queryByText(/AIWorker · Worker/)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores a pasted bearer token for the current tab', async () => {
    mockWorkerApiFetch()
    await renderWorkerRoute()

    fireEvent.change(await screen.findByLabelText('Bearer token'), {
      target: { value: '  wtk_manual_token  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /解锁/ }))

    expect(window.sessionStorage.getItem('aiworker.worker.bearer')).toBe('wtk_manual_token')
  })

  it('mounts the worker RouterProvider with the workbench shell', async () => {
    setBearerToken('wtk_test_token')
    mockWorkerApiFetch()

    await renderWorkerRoute()

    // 顶栏标注 worker 视角；"Worker Workbench" 为 index 路由的 h1 文案，
    // 命中即说明 root layout + outlet 子节点都成功 mount。
    const header = await screen.findByTestId('worker-shell-header')
    expect(header.textContent).toContain('AIWorker')
    expect(header.textContent).toContain('Worker')
    expect(await screen.findByRole('heading', { name: 'Worker Workbench' })).toBeTruthy()
  })

  it('matches the dev chooser mount path', async () => {
    setBearerToken('wtk_test_token')
    const router = createRouter({
      routeTree,
      basepath: resolveWebRouterBasepath('worker', '/worker/'),
      history: createMemoryHistory({ initialEntries: ['/worker/config'] }),
      defaultPreload: false,
    })

    await router.load()

    expect(router.state.matches.map(m => m.routeId)).toContain('/config')
  })
})
