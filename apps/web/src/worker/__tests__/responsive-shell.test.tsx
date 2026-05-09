import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWebRouterBasepath } from '@/shared/lib/router-basepath'
import { __resetBearerForTests, setBearerToken } from '@/worker/lib/auth'
import { routeTree } from '@/worker/routeTree.gen'

vi.mock('@/worker/api', () => {
  class WorkerApiError extends Error {}

  return {
    WorkerApiError,
    addCron: vi.fn(),
    deleteCron: vi.fn(),
    deleteSecret: vi.fn(),
    getConfig: vi.fn(),
    getEngines: vi.fn(async () => ({ engines: [] })),
    getCaseFile: vi.fn(async () => ({ case: null })),
    getInfo: vi.fn(async () => ({
      brains: [],
      channels: [],
      configVersion: 7,
      executor: { type: 'codex', status: 'healthy', model: 'gpt-5' },
      startedAt: '2026-04-28T20:00:00.000Z',
      workerId: 'w_mobile_responsive_worker_with_long_id',
    })),
    getWorkerHealth: vi.fn(async () => ({
      brain: { status: 'healthy' },
      checkedAt: '2026-04-28T20:00:00.000Z',
      configVersion: 7,
      executor: { status: 'healthy' },
      mode: 'worker',
      startedAt: '2026-04-28T20:00:00.000Z',
      status: 'healthy',
      workerId: 'w_mobile_responsive_worker_with_long_id',
    })),
    grantApproval: vi.fn(),
    listApprovals: vi.fn(async () => ({ approvals: [] })),
    listCases: vi.fn(async () => ({ cases: [] })),
    listConversations: vi.fn(async () => ({ conversations: [] })),
    listCron: vi.fn(async () => ({ jobs: [] })),
    listMessages: vi.fn(async () => ({ messages: [] })),
    listRuns: vi.fn(async () => ({ runs: [] })),
    listSecrets: vi.fn(async () => ({ keys: [] })),
    listTasks: vi.fn(async () => ({ tasks: [] })),
    listWorkerArtifacts: vi.fn(async () => ({ artifacts: [] })),
    patchCron: vi.fn(),
    proposeCaseLessons: vi.fn(async () => ({ proposals: [] })),
    putConfig: vi.fn(),
    putSecret: vi.fn(),
    rerunCase: vi.fn(async () => ({
      createdAt: '2026-05-09T06:40:00.000Z',
      id: 'task-rerun',
      prompt: 'rerun',
      status: 'queued',
    })),
    submitTask: vi.fn(async () => ({
      createdAt: '2026-04-28T20:00:00.000Z',
      id: 'task-1',
      prompt: 'hello',
      status: 'queued',
    })),
    subscribeEvents: vi.fn(),
    testBrain: vi.fn(),
    testChannel: vi.fn(),
    testExecutor: vi.fn(),
  }
})

function classListOf(element: HTMLElement): string[] {
  return String(element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
}

async function renderWorkerRoute(initialEntry: string, width: number, height: number) {
  setBearerToken('wtk_responsive_test_token')

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))

  const router = createRouter({
    routeTree,
    basepath: resolveWebRouterBasepath('worker', '/admin/'),
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

describe('worker responsive shell', () => {
  afterEach(() => {
    __resetBearerForTests()
  })

  it('uses a top navigation shell at 390 px for the overview route', async () => {
    await renderWorkerRoute('/admin/', 390, 844)

    const shell = await screen.findByTestId('worker-shell')
    const header = screen.getByTestId('worker-shell-header')
    const nav = screen.getByTestId('worker-shell-nav')

    expect(classListOf(shell)).toEqual(expect.arrayContaining(['h-dvh', 'overflow-hidden', 'flex-col']))
    expect(classListOf(header)).toEqual(expect.arrayContaining(['grid', 'shrink-0']))
    expect(classListOf(nav)).toEqual(expect.arrayContaining([
      'grid-cols-2',
      'sm:grid-cols-4',
      'md:flex',
    ]))
  })

  it('keeps worker chat single-column at 430 px with desktop columns gated to lg', async () => {
    await renderWorkerRoute('/admin/chat', 430, 932)

    const chatPanel = await screen.findByTestId('worker-chat-panel')
    const sendButton = screen.getByRole('button', { name: /发送/ })

    expect(classListOf(chatPanel)).toEqual(expect.arrayContaining([
      'grid-cols-1',
      'lg:grid-cols-[280px_1fr]',
    ]))
    expect(classListOf(chatPanel)).not.toContain('grid-cols-[280px_1fr]')
    expect(classListOf(sendButton)).toEqual(expect.arrayContaining(['w-full', 'sm:w-auto']))
  })
})
