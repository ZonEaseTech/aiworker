/* eslint-disable react-hooks-extra/no-unnecessary-use-prefix */
import type { WorkerCaseFile } from '@/worker/api'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CasesPanel } from './cases-panel'

const mocks = vi.hoisted(() => ({
  caseFile: null as WorkerCaseFile | null,
  proposeLessons: vi.fn(),
  rerunCase: vi.fn(),
}))

vi.mock('@/worker/lib/hooks', () => ({
  useCase: () => ({
    data: mocks.caseFile === null ? undefined : { case: mocks.caseFile },
    error: null,
    isLoading: false,
  }),
  useCases: () => ({
    data: { cases: mocks.caseFile === null ? [] : [mocks.caseFile] },
    error: null,
    isLoading: false,
  }),
  useProposeCaseLessons: () => ({
    data: undefined,
    error: null,
    isPending: false,
    mutate: mocks.proposeLessons,
  }),
  useRerunCase: () => ({
    data: undefined,
    error: null,
    isPending: false,
    mutate: mocks.rerunCase,
  }),
}))

describe('worker cases panel', () => {
  beforeEach(() => {
    mocks.caseFile = makeCaseFile()
    mocks.proposeLessons.mockReset()
    mocks.rerunCase.mockReset()
  })

  it('renders Case File review decision, risk, evidence, and lessons queue', () => {
    render(<CasesPanel />)

    expect(screen.getByTestId('worker-cases-panel')).toBeTruthy()
    expect(screen.getAllByText('ready_to_ship').length).toBeGreaterThan(0)
    expect(screen.getByText('Case is ready to ship: evidence is sufficient')).toBeTruthy()
    expect(screen.getByText('Case File should remain a projection over Brain Journal.')).toBeTruthy()
    expect(screen.getAllByText('brain_journal_events:2').length).toBeGreaterThan(0)
    expect(screen.getByText('unmanaged_ambient')).toBeTruthy()
  })

  it('exposes operator actions for rerun and lesson proposal', () => {
    render(<CasesPanel />)

    fireEvent.click(screen.getByRole('button', { name: /Rerun/ }))
    fireEvent.click(screen.getByRole('button', { name: /Propose lessons/ }))

    expect(mocks.rerunCase).toHaveBeenCalledWith({ taskId: 'task-case-web' })
    expect(mocks.proposeLessons).toHaveBeenCalledWith('task-case-web')
  })
})

function makeCaseFile(): WorkerCaseFile {
  return {
    evidence: {
      journalEventCount: 3,
      keyEvidenceRefs: ['brain_journal_events:2'],
      loadedMemoryIds: ['mem-release'],
      loadedSkillIds: ['skill-review'],
      messageCount: 1,
      toolEventCount: 0,
    },
    lessons: {
      candidateCount: 1,
      candidates: [{
        confidence: 0.8,
        evidenceRefs: ['brain_journal_events:2'],
        index: 0,
        kind: 'architecture-decision',
        risk: 'low',
        summary: 'Case File should remain a projection over Brain Journal.',
      }],
      proposalIds: [],
      sourceEventRef: 'brain_journal_events:2',
    },
    lineage: {
      childTaskIds: [],
      rerunCount: 0,
      rootTaskId: 'task-case-web',
    },
    outcome: {
      assistantPreview: 'Implemented and verified the case surface.',
      promptPreview: 'ship the worker case surface',
      taskStatus: 'succeeded',
    },
    rawJournalRef: 'brain_journal:task-case-web',
    reviewDecision: {
      action: 'pass',
      evidenceRefs: ['brain_journal_events:2'],
      mode: 'observe-only',
      nextActions: ['deliver outcome'],
      reasons: [{
        evidenceRefs: ['brain_journal_events:2'],
        mode: 'observe-only',
        reason: 'evidence is sufficient',
        source: 'brain-engine-review',
      }],
      status: 'ready_to_ship',
      summary: 'Case is ready to ship: evidence is sufficient',
    },
    risk: {
      authorityMode: 'unmanaged_ambient',
      enforceable: false,
      executorNote: 'External executor runs with operator-provided ambient authority.',
      observeOnlyReasonCount: 1,
      risk: 'low',
      signals: [],
    },
    taskId: 'task-case-web',
    version: 1,
    workOrder: {
      createdAt: '2026-05-09T06:40:00.000Z',
      finishedAt: '2026-05-09T06:41:00.000Z',
      prompt: 'ship the worker case surface',
      status: 'succeeded',
      taskId: 'task-case-web',
    },
    workerId: 'w_case_web',
  }
}
