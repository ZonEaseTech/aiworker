import type { AgentTaskStatus, WorkerConfig } from '@zonease/aiworker-shared'
import type { BrainGateVerdict, BrainGateVerdictAction, BrainGateVerdictReason, BrainJournalTrace, ReadBrainJournalOptions } from '../brain/journal'

import { agentTasks, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { desc } from 'drizzle-orm'

import { BrainJournalService } from '../brain/journal'

export type WorkerReviewDecisionStatus = 'ready_to_ship' | 'needs_review' | 'needs_rerun' | 'blocked'

export interface WorkerReviewDecision {
  status: WorkerReviewDecisionStatus
  action: BrainGateVerdictAction
  mode: BrainGateVerdict['mode']
  summary: string
  reasons: BrainGateVerdictReason[]
  evidenceRefs: string[]
  nextActions: string[]
}

export interface WorkerReviewOutcome {
  taskStatus: AgentTaskStatus
  promptPreview: string
  assistantPreview?: string
  finalMessageRef?: string
  result?: Record<string, unknown>
  error?: string
}

export interface WorkerReviewEvidenceSummary {
  messageCount: number
  toolEventCount: number
  journalEventCount: number
  loadedMemoryIds: string[]
  loadedSkillIds: string[]
  keyEvidenceRefs: string[]
}

export interface WorkerReviewRiskSummary {
  authorityMode: string
  executorNote: string
  risk: 'low' | 'medium' | 'high' | 'unknown'
  enforceable: boolean
  warning?: string
  recommendation?: string
  signals: Array<{ type: string, reason: string }>
  observeOnlyReasonCount: number
}

export interface WorkerReviewLessonCandidate {
  index: number
  kind: string
  summary: string
  confidence: number
  risk: 'low' | 'medium' | 'high'
  evidenceRefs: string[]
  target?: string
  sourceEventRef?: string
}

export interface WorkerReviewLessonsSummary {
  candidateCount: number
  candidates: WorkerReviewLessonCandidate[]
  proposalIds: string[]
  sourceEventRef?: string
}

export interface WorkerReview {
  version: 1
  workerId?: string
  taskId: string
  workOrder: {
    taskId: string
    prompt: string
    status: AgentTaskStatus
    conversationId?: string
    createdAt: string
    finishedAt?: string
  }
  reviewDecision: WorkerReviewDecision
  outcome: WorkerReviewOutcome
  evidence: WorkerReviewEvidenceSummary
  risk: WorkerReviewRiskSummary
  lessons: WorkerReviewLessonsSummary
  lineage: BrainJournalTrace['lineage']
  rawJournalRef: string
}

export interface WorkerReviewListOptions extends ReadBrainJournalOptions {
  limit?: number
}

export interface WorkerReviewServiceDeps {
  workerId?: string
  config?: WorkerConfig
}

export function createWorkerReviewService(deps: WorkerReviewServiceDeps = {}): WorkerReviewService {
  return new WorkerReviewService(deps)
}

export class WorkerReviewService {
  private readonly journal: BrainJournalService

  constructor(private readonly deps: WorkerReviewServiceDeps = {}) {
    this.journal = new BrainJournalService(deps)
  }

  listReviews(options: WorkerReviewListOptions = {}): WorkerReview[] {
    const limit = normalizeLimit(options.limit)
    const rows = getWorkerDb()
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit)
      .all()

    return rows.flatMap((row) => {
      const file = this.getReview(row.id, options)
      return file === null ? [] : [file]
    })
  }

  getReview(taskId: string, options: ReadBrainJournalOptions = {}): WorkerReview | null {
    const trace = this.journal.getTaskTrace(taskId, options)
    if (trace === null) {
      return null
    }
    return this.fromTrace(trace)
  }

  private fromTrace(trace: BrainJournalTrace): WorkerReview {
    const finalAssistant = selectFinalAssistant(trace)
    const brainReview = latestEvent(trace, 'brain_engine.review')
    const lessonProposalEvent = latestEvent(trace, 'lessons.promoted')
    const lessons = buildLessonsSummary(brainReview, lessonProposalEvent)

    return {
      version: 1,
      ...(this.deps.workerId === undefined ? {} : { workerId: this.deps.workerId }),
      taskId: trace.task.id,
      workOrder: {
        taskId: trace.task.id,
        prompt: trace.task.prompt,
        status: trace.task.status,
        ...(trace.task.conversationId === undefined ? {} : { conversationId: trace.task.conversationId }),
        createdAt: trace.task.createdAt,
        ...(trace.task.finishedAt === undefined ? {} : { finishedAt: trace.task.finishedAt }),
      },
      reviewDecision: buildReviewDecision(trace.task.status, trace.gateVerdict),
      outcome: {
        taskStatus: trace.task.status,
        promptPreview: excerpt(trace.task.prompt, 500),
        ...(finalAssistant === undefined ? {} : { assistantPreview: finalAssistant.contentPreview, finalMessageRef: finalAssistant.ref }),
        ...(trace.task.result === undefined ? {} : { result: trace.task.result }),
        ...(trace.task.error === undefined ? {} : { error: trace.task.error }),
      },
      evidence: {
        messageCount: trace.messages.length,
        toolEventCount: trace.toolEvents.length,
        journalEventCount: trace.events.length,
        loadedMemoryIds: trace.brainContext.loadedMemoryIds,
        loadedSkillIds: trace.brainContext.loadedSkillIds,
        keyEvidenceRefs: trace.gateVerdict.evidenceRefs,
      },
      risk: buildRiskSummary(trace),
      lessons,
      lineage: trace.lineage,
      rawJournalRef: `brain_journal:${trace.task.id}`,
    }
  }
}

function buildReviewDecision(taskStatus: AgentTaskStatus, verdict: BrainGateVerdict): WorkerReviewDecision {
  const status = canMarkReadyToShip(taskStatus, verdict)
    ? 'ready_to_ship'
    : decisionStatus(taskStatus, verdict.action)
  return {
    status,
    action: verdict.action,
    mode: verdict.mode,
    summary: summarizeDecision(status, verdict),
    reasons: verdict.reasons,
    evidenceRefs: verdict.evidenceRefs,
    nextActions: nextActions(status, verdict.action),
  }
}

function decisionStatus(taskStatus: AgentTaskStatus, action: BrainGateVerdictAction): WorkerReviewDecisionStatus {
  if (action === 'block') {
    return 'blocked'
  }
  if (action === 'rerun' || action === 'switch-executor') {
    return 'needs_rerun'
  }
  if (taskStatus === 'failed' || taskStatus === 'cancelled') {
    return 'needs_rerun'
  }
  if (action === 'pass' && taskStatus === 'succeeded') {
    return 'needs_review'
  }
  return 'needs_review'
}

function canMarkReadyToShip(taskStatus: AgentTaskStatus, verdict: BrainGateVerdict): boolean {
  return taskStatus === 'succeeded'
    && verdict.action === 'pass'
    && verdict.reasons.some(reason => reason.source === 'brain-engine-review')
}

function selectFinalAssistant(trace: BrainJournalTrace): BrainJournalTrace['messages'][number] | undefined {
  const assistantMessageId = numberValue(trace.task.result?.assistantMessageId)
  if (assistantMessageId !== undefined) {
    const exact = trace.messages.find(message => message.id === assistantMessageId && message.role === 'assistant')
    if (exact !== undefined)
      return exact
  }
  return [...trace.messages].reverse().find(message => message.role === 'assistant')
}

function numberValue(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === 'number' ? value : undefined
}

function summarizeDecision(status: WorkerReviewDecisionStatus, verdict: BrainGateVerdict): string {
  const firstReason = verdict.reasons[0]?.reason
  const suffix = firstReason === undefined ? '' : `: ${firstReason}`
  switch (status) {
    case 'ready_to_ship':
      return `Review is ready to ship${suffix}`
    case 'needs_review':
      return `Review needs operator review${suffix}`
    case 'needs_rerun':
      return `Review needs rerun or executor change${suffix}`
    case 'blocked':
      return `Review is blocked${suffix}`
  }
}

function nextActions(status: WorkerReviewDecisionStatus, action: BrainGateVerdictAction): string[] {
  if (status === 'ready_to_ship') {
    return ['deliver outcome', 'review lessons queue if candidates exist']
  }
  if (status === 'needs_rerun') {
    return action === 'switch-executor'
      ? ['rerun with a different executor', 'compare child run evidence']
      : ['rerun with repair context', 'compare child run evidence']
  }
  if (status === 'blocked') {
    return ['resolve enforced blocker before delivery', 'keep canonical Brain unchanged']
  }
  return ['inspect evidence and risk sections', 'approve, rerun, or hold review explicitly']
}

function buildRiskSummary(trace: BrainJournalTrace): WorkerReviewRiskSummary {
  const preflight = trace.authorityPreflight
  return {
    authorityMode: preflight?.authorityMode ?? trace.executor.authorityMode,
    executorNote: trace.executor.note,
    risk: preflight?.risk === 'low' || preflight?.risk === 'medium' || preflight?.risk === 'high'
      ? preflight.risk
      : 'unknown',
    enforceable: preflight?.enforceable ?? trace.gateVerdict.mode === 'enforced',
    ...(preflight?.warning === undefined ? {} : { warning: preflight.warning }),
    ...(preflight?.recommendation === undefined ? {} : { recommendation: preflight.recommendation }),
    signals: preflight?.signals ?? [],
    observeOnlyReasonCount: trace.gateVerdict.reasons.filter(reason => reason.mode === 'observe-only').length,
  }
}

function buildLessonsSummary(
  brainReview: BrainJournalTrace['events'][number] | undefined,
  lessonProposalEvent: BrainJournalTrace['events'][number] | undefined,
): WorkerReviewLessonsSummary {
  const sourceEventRef = brainReview === undefined ? undefined : `brain_journal_events:${brainReview.id}`
  const candidates = normalizeLessonCandidates(brainReview?.payload.lessonCandidates, sourceEventRef)
  const proposalIds = stringArray(lessonProposalEvent?.payload.proposalIds)
  return {
    candidateCount: candidates.length,
    candidates,
    proposalIds,
    ...(sourceEventRef === undefined ? {} : { sourceEventRef }),
  }
}

function normalizeLessonCandidates(value: unknown, sourceEventRef: string | undefined): WorkerReviewLessonCandidate[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((raw, index): WorkerReviewLessonCandidate[] => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return []
    }
    const item = raw as Record<string, unknown>
    const summary = stringValue(item.summary)?.trim()
    if (summary === undefined || summary.length === 0) {
      return []
    }
    const risk = item.risk === 'low' || item.risk === 'medium' || item.risk === 'high' ? item.risk : 'medium'
    return [{
      index,
      kind: stringValue(item.kind)?.trim() || 'repo-fact',
      summary,
      confidence: clamp01(typeof item.confidence === 'number' ? item.confidence : 0.5),
      risk,
      evidenceRefs: stringArray(item.evidenceRefs),
      ...(typeof item.target === 'string' && item.target.trim().length > 0 ? { target: item.target.trim() } : {}),
      ...(sourceEventRef === undefined ? {} : { sourceEventRef }),
    }]
  })
}

function latestEvent(trace: BrainJournalTrace, kind: string): BrainJournalTrace['events'][number] | undefined {
  for (let index = trace.events.length - 1; index >= 0; index -= 1) {
    const event = trace.events[index]!
    if (event.kind === kind) {
      return event
    }
  }
  return undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 50
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('limit must be an integer between 1 and 200')
  }
  return limit
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5
  }
  return Math.max(0, Math.min(1, value))
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit - 3)}...`
}
