/* eslint-disable react-hooks-extra/no-unnecessary-use-prefix */
import type { WorkerArtifact, WorkerCaseFile, WorkerRun } from '@/worker/api'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchPanel } from './workbench-panel'

const mocks = vi.hoisted(() => ({
  artifacts: [] as WorkerArtifact[],
  cases: [] as WorkerCaseFile[],
  runs: [] as WorkerRun[],
  submitTask: vi.fn(),
}))

vi.mock('@/worker/lib/hooks', () => ({
  useReviews: () => ({
    data: { reviews: mocks.cases },
    error: null,
    isLoading: false,
  }),
  useRuns: () => ({
    data: { runs: mocks.runs },
    error: null,
    isLoading: false,
  }),
  useSubmitTask: () => ({
    isPending: false,
    mutateAsync: mocks.submitTask,
  }),
  useWorkerArtifacts: () => ({
    data: { artifacts: mocks.artifacts },
    error: null,
    isLoading: false,
  }),
  useWorkerHealth: () => ({
    data: {
      configVersion: 3,
      status: 'healthy',
      workerId: 'w_workbench',
    },
    error: null,
    isLoading: false,
  }),
  useWorkerInfo: () => ({
    data: {
      brainSummary: {
        scopeManifest: {
          primarySoul: 'developer',
          status: 'ok',
        },
      },
      configVersion: 3,
      executor: {
        status: 'healthy',
        type: 'codex',
      },
    },
    error: null,
    isLoading: false,
  }),
}))

describe('worker workbench panel', () => {
  beforeEach(() => {
    mocks.runs = [makeRun()]
    mocks.artifacts = [makeArtifact()]
    mocks.cases = [makeCaseFile()]
    mocks.submitTask.mockReset()
    mocks.submitTask.mockResolvedValue(makeRun({ id: 'run-created', prompt: 'created prompt' }))
  })

  it('renders packs, run timeline, artifact metadata, and case review', () => {
    render(<WorkbenchPanel />)

    expect(screen.getByTestId('worker-workbench-panel')).toBeTruthy()
    expect(screen.getByText('Worker Workbench')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Developer/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Review current change/ })).toBeTruthy()
    expect(screen.getAllByText('run-1').length).toBeGreaterThan(0)
    expect(screen.getByText('reports/summary.md')).toBeTruthy()
    expect(screen.getByText('Case is ready to ship')).toBeTruthy()
  })

  it('updates the composer from template selection and submits through the run contract', async () => {
    render(<WorkbenchPanel />)

    fireEvent.click(screen.getByRole('button', { name: /Project Manager/ }))
    fireEvent.click(screen.getByRole('button', { name: /Draft PRD/ }))

    const textarea = screen.getByLabelText('Work order') as HTMLTextAreaElement
    expect(textarea.value).toContain('Draft a PRD')

    fireEvent.click(screen.getByRole('button', { name: /运行 work order/ }))

    await waitFor(() => expect(mocks.submitTask).toHaveBeenCalledWith(textarea.value.trim()))
  })
})

function makeRun(overrides: Partial<WorkerRun> = {}): WorkerRun {
  return {
    createdAt: '2026-05-09T10:00:00.000Z',
    error: null,
    finishedAt: null,
    id: 'run-1',
    prompt: 'Review the current change.',
    result: null,
    status: 'succeeded',
    ...overrides,
  }
}

function makeArtifact(): WorkerArtifact {
  return {
    conversationId: 'conv-1',
    createdAt: '2026-05-09T10:01:00.000Z',
    hash: null,
    id: 'artifact-1',
    kind: 'markdown',
    metadata: {},
    mimeType: 'text/markdown',
    relativePath: 'reports/summary.md',
    runId: 'run-1',
    sizeBytes: 42,
    source: 'executor',
    status: 'available',
    title: 'Summary',
    updatedAt: '2026-05-09T10:01:00.000Z',
  }
}

function makeCaseFile(): WorkerCaseFile {
  return {
    evidence: {
      journalEventCount: 2,
      keyEvidenceRefs: ['brain_journal_events:1'],
      loadedMemoryIds: [],
      loadedSkillIds: [],
      messageCount: 2,
      toolEventCount: 1,
    },
    lessons: {
      candidateCount: 1,
      candidates: [{
        confidence: 0.8,
        evidenceRefs: ['brain_journal_events:1'],
        index: 0,
        kind: 'verification-pattern',
        risk: 'low',
        summary: 'Keep workbench evidence tied to run metadata.',
      }],
      proposalIds: [],
    },
    lineage: {
      childTaskIds: [],
      rerunCount: 0,
      rootTaskId: 'run-1',
    },
    outcome: {
      assistantPreview: 'Workbench is ready.',
      promptPreview: 'Review the current change.',
      taskStatus: 'succeeded',
    },
    rawJournalRef: 'brain_journal:run-1',
    reviewDecision: {
      action: 'deliver',
      evidenceRefs: ['brain_journal_events:1'],
      mode: 'observe-only',
      nextActions: [],
      reasons: [{
        evidenceRefs: ['brain_journal_events:1'],
        mode: 'observe-only',
        reason: 'evidence is sufficient',
        source: 'case-review',
      }],
      status: 'ready_to_ship',
      summary: 'Case is ready to ship',
    },
    risk: {
      authorityMode: 'unmanaged_ambient',
      enforceable: false,
      executorNote: 'External executor runs with operator-provided ambient authority.',
      observeOnlyReasonCount: 1,
      risk: 'low',
      signals: [],
    },
    taskId: 'run-1',
    version: 1,
    workOrder: {
      createdAt: '2026-05-09T10:00:00.000Z',
      finishedAt: '2026-05-09T10:01:00.000Z',
      prompt: 'Review the current change.',
      status: 'succeeded',
      taskId: 'run-1',
    },
    workerId: 'w_workbench',
  }
}
