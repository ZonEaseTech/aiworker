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
    getReviewFile: vi.fn(async () => ({ review: makeReview() })),
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
    listConversations: vi.fn(async () => ({ conversations: [] })),
    listCron: vi.fn(async () => ({ jobs: [] })),
    listMessages: vi.fn(async () => ({ messages: [] })),
    listReviews: vi.fn(async () => ({ reviews: [makeReview()] })),
    listRuns: vi.fn(async () => ({ runs: [] })),
    listSecrets: vi.fn(async () => ({ keys: [] })),
    listTasks: vi.fn(async () => ({ tasks: [] })),
    listWorkerArtifacts: vi.fn(async () => ({ artifacts: [] })),
    patchCron: vi.fn(),
    promoteReviewLessons: vi.fn(async () => ({ promotion: { proposals: [] } })),
    putConfig: vi.fn(),
    putSecret: vi.fn(),
    rerunReview: vi.fn(async () => ({
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
      'sm:grid-cols-3',
      'lg:flex',
    ]))
  })

  it('keeps worker reviews single-column at 430 px with desktop columns gated to lg', async () => {
    await renderWorkerRoute('/admin/reviews', 430, 932)

    const reviewsPanel = await screen.findByTestId('worker-reviews-panel')

    expect(classListOf(reviewsPanel.querySelector('div.grid') as HTMLElement)).toEqual(expect.arrayContaining([
      'grid-cols-1',
      'lg:grid-cols-3',
    ]))
  })
})

function makeReview() {
  return {
    evidence: {
      journalEventCount: 1,
      keyEvidenceRefs: ['journal:1'],
      loadedMemoryIds: [],
      loadedSkillIds: [],
      messageCount: 1,
      toolEventCount: 0,
    },
    lessons: {
      candidateCount: 1,
      candidates: [{
        confidence: 0.8,
        evidenceRefs: ['journal:1'],
        index: 0,
        kind: 'pattern',
        risk: 'low',
        summary: 'Keep review evidence visible.',
      }],
      proposalIds: [],
    },
    lineage: {
      childTaskIds: [],
      rerunCount: 0,
      rootTaskId: 'run-1',
    },
    outcome: {
      taskStatus: 'succeeded',
      promptPreview: 'review',
    },
    rawJournalRef: 'journal:1',
    reviewDecision: {
      action: 'ship',
      evidenceRefs: ['journal:1'],
      mode: 'observe-only',
      nextActions: [],
      reasons: [{ mode: 'observe-only', reason: 'ok', source: 'review' }],
      status: 'ready_to_ship',
      summary: 'Ready',
    },
    risk: {
      authorityMode: 'ambient',
      enforceable: false,
      executorNote: 'External executor',
      observeOnlyReasonCount: 0,
      risk: 'low',
      signals: [],
    },
    taskId: 'run-1',
    version: 1,
    workOrder: {
      createdAt: '2026-05-09T06:40:00.000Z',
      prompt: 'review',
      status: 'succeeded',
      taskId: 'run-1',
    },
  }
}
