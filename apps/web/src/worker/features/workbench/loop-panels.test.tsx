/* eslint-disable react-hooks-extra/no-unnecessary-use-prefix */
import type { WorkerCaseFile } from '@/worker/api'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonsPanel, ReviewsPanel } from './loop-panels'

const mocks = vi.hoisted(() => ({
  promoteLessons: vi.fn(),
  rerunReview: vi.fn(),
  review: null as WorkerCaseFile | null,
}))

vi.mock('@/worker/lib/hooks', () => ({
  usePromoteReviewLessons: () => ({
    data: undefined,
    error: null,
    isPending: false,
    mutate: mocks.promoteLessons,
  }),
  useReview: () => ({
    data: mocks.review === null ? undefined : { review: mocks.review },
    error: null,
    isLoading: false,
  }),
  useReviews: () => ({
    data: { reviews: mocks.review === null ? [] : [mocks.review] },
    error: null,
    isLoading: false,
  }),
  useRerunReview: () => ({
    data: undefined,
    error: null,
    isPending: false,
    mutate: mocks.rerunReview,
  }),
}))

describe('worker loop review and lesson panels', () => {
  beforeEach(() => {
    mocks.review = makeReview()
    mocks.promoteLessons.mockReset()
    mocks.rerunReview.mockReset()
  })

  it('renders review decision, risk, evidence, and actions', () => {
    render(<ReviewsPanel />)

    expect(screen.getByTestId('worker-reviews-panel')).toBeTruthy()
    expect(screen.getAllByText('ready_to_ship').length).toBeGreaterThan(0)
    expect(screen.getByText('Review is ready to ship: evidence is sufficient')).toBeTruthy()
    expect(screen.getByText('Review evidence should stay tied to run metadata.')).toBeTruthy()
    expect(screen.getAllByText('brain_journal_events:2').length).toBeGreaterThan(0)
    expect(screen.getByText('unmanaged_ambient')).toBeTruthy()
  })

  it('exposes rerun and lesson promotion from the review page', () => {
    render(<ReviewsPanel />)

    fireEvent.click(screen.getByRole('button', { name: /Rerun/ }))
    fireEvent.click(screen.getByRole('button', { name: /Promote lessons/ }))

    expect(mocks.rerunReview).toHaveBeenCalledWith({ taskId: 'run-review-web' })
    expect(mocks.promoteLessons).toHaveBeenCalledWith('run-review-web')
  })

  it('lists lesson candidates without exposing the old cases route', () => {
    render(<LessonsPanel />)

    expect(screen.getByTestId('worker-lessons-panel')).toBeTruthy()
    expect(screen.getByText('Review evidence should stay tied to run metadata.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Promote/ }))
    expect(mocks.promoteLessons).toHaveBeenCalledWith('run-review-web')
  })
})

function makeReview(): WorkerCaseFile {
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
        summary: 'Review evidence should stay tied to run metadata.',
      }],
      proposalIds: [],
      sourceEventRef: 'brain_journal_events:2',
    },
    lineage: {
      childTaskIds: [],
      rerunCount: 0,
      rootTaskId: 'run-review-web',
    },
    outcome: {
      assistantPreview: 'Implemented and verified the review surface.',
      promptPreview: 'ship the worker review surface',
      taskStatus: 'succeeded',
    },
    rawJournalRef: 'brain_journal:run-review-web',
    reviewDecision: {
      action: 'pass',
      evidenceRefs: ['brain_journal_events:2'],
      mode: 'observe-only',
      nextActions: ['deliver outcome'],
      reasons: [{
        evidenceRefs: ['brain_journal_events:2'],
        mode: 'observe-only',
        reason: 'evidence is sufficient',
        source: 'review-engine',
      }],
      status: 'ready_to_ship',
      summary: 'Review is ready to ship: evidence is sufficient',
    },
    risk: {
      authorityMode: 'unmanaged_ambient',
      enforceable: false,
      executorNote: 'External executor runs with operator-provided ambient authority.',
      observeOnlyReasonCount: 1,
      risk: 'low',
      signals: [],
    },
    taskId: 'run-review-web',
    version: 1,
    workOrder: {
      createdAt: '2026-05-09T06:40:00.000Z',
      finishedAt: '2026-05-09T06:41:00.000Z',
      prompt: 'ship the worker review surface',
      status: 'succeeded',
      taskId: 'run-review-web',
    },
    workerId: 'w_review_web',
  }
}
