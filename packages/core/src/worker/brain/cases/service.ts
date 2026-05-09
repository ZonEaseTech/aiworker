import type { AgentTaskStatus, WorkerConfig } from '@zonease/aiworker-shared'
import type { BrainGateVerdict, BrainGateVerdictAction, BrainGateVerdictReason, BrainJournalTrace, ReadBrainJournalOptions } from '../journal'

import { agentTasks, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { desc } from 'drizzle-orm'

import { BrainJournalService } from '../journal'

export type BrainCaseDecisionStatus = 'ready_to_ship' | 'needs_review' | 'needs_rerun' | 'blocked'

export interface BrainCaseReviewDecision {
  status: BrainCaseDecisionStatus
  action: BrainGateVerdictAction
  mode: BrainGateVerdict['mode']
  summary: string
  reasons: BrainGateVerdictReason[]
  evidenceRefs: string[]
  nextActions: string[]
}

export interface BrainCaseOutcome {
  taskStatus: AgentTaskStatus
  promptPreview: string
  assistantPreview?: string
  finalMessageRef?: string
  result?: Record<string, unknown>
  error?: string
}

export interface BrainCaseEvidenceSummary {
  messageCount: number
  toolEventCount: number
  journalEventCount: number
  loadedMemoryIds: string[]
  loadedSkillIds: string[]
  keyEvidenceRefs: string[]
}

export interface BrainCaseRiskSummary {
  authorityMode: string
  executorNote: string
  risk: 'low' | 'medium' | 'high' | 'unknown'
  enforceable: boolean
  warning?: string
  recommendation?: string
  signals: Array<{ type: string, reason: string }>
  observeOnlyReasonCount: number
}

export interface BrainCaseLessonCandidate {
  index: number
  kind: string
  summary: string
  confidence: number
  risk: 'low' | 'medium' | 'high'
  evidenceRefs: string[]
  target?: string
  sourceEventRef?: string
}

export interface BrainCaseLessonsSummary {
  candidateCount: number
  candidates: BrainCaseLessonCandidate[]
  proposalIds: string[]
  sourceEventRef?: string
}

export interface BrainCaseFile {
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
  reviewDecision: BrainCaseReviewDecision
  outcome: BrainCaseOutcome
  evidence: BrainCaseEvidenceSummary
  risk: BrainCaseRiskSummary
  lessons: BrainCaseLessonsSummary
  lineage: BrainJournalTrace['lineage']
  rawJournalRef: string
}

export interface BrainCaseListOptions extends ReadBrainJournalOptions {
  limit?: number
}

export interface BrainCaseServiceDeps {
  workerId?: string
  config?: WorkerConfig
}

export function createBrainCaseService(deps: BrainCaseServiceDeps = {}): BrainCaseService {
  return new BrainCaseService(deps)
}

export class BrainCaseService {
  private readonly journal: BrainJournalService

  constructor(private readonly deps: BrainCaseServiceDeps = {}) {
    this.journal = new BrainJournalService(deps)
  }

  listCases(options: BrainCaseListOptions = {}): BrainCaseFile[] {
    const limit = normalizeLimit(options.limit)
    const rows = getWorkerDb()
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit)
      .all()

    return rows.flatMap((row) => {
      const file = this.getCaseFile(row.id, options)
      return file === null ? [] : [file]
    })
  }

  getCaseFile(taskId: string, options: ReadBrainJournalOptions = {}): BrainCaseFile | null {
    const trace = this.journal.getTaskTrace(taskId, options)
    if (trace === null) {
      return null
    }
    return this.fromTrace(trace)
  }

  private fromTrace(trace: BrainJournalTrace): BrainCaseFile {
    const finalAssistant = [...trace.messages].reverse().find(message => message.role === 'assistant')
    const brainReview = latestEvent(trace, 'brain_engine.review')
    const lessonProposalEvent = latestEvent(trace, 'inbox.candidates_proposed')
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

function buildReviewDecision(taskStatus: AgentTaskStatus, verdict: BrainGateVerdict): BrainCaseReviewDecision {
  const status = decisionStatus(taskStatus, verdict.action)
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

function decisionStatus(taskStatus: AgentTaskStatus, action: BrainGateVerdictAction): BrainCaseDecisionStatus {
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
    return 'ready_to_ship'
  }
  return 'needs_review'
}

function summarizeDecision(status: BrainCaseDecisionStatus, verdict: BrainGateVerdict): string {
  const firstReason = verdict.reasons[0]?.reason
  const suffix = firstReason === undefined ? '' : `: ${firstReason}`
  switch (status) {
    case 'ready_to_ship':
      return `Case is ready to ship${suffix}`
    case 'needs_review':
      return `Case needs operator review${suffix}`
    case 'needs_rerun':
      return `Case needs rerun or executor change${suffix}`
    case 'blocked':
      return `Case is blocked${suffix}`
  }
}

function nextActions(status: BrainCaseDecisionStatus, action: BrainGateVerdictAction): string[] {
  if (status === 'ready_to_ship') {
    return ['deliver outcome', 'review lessons queue if candidates exist']
  }
  if (status === 'needs_rerun') {
    return action === 'switch-executor'
      ? ['rerun with a different executor', 'compare child case evidence']
      : ['rerun case with repair context', 'compare child case evidence']
  }
  if (status === 'blocked') {
    return ['resolve enforced blocker before delivery', 'keep canonical Brain unchanged']
  }
  return ['inspect evidence and risk sections', 'approve, rerun, or hold case explicitly']
}

function buildRiskSummary(trace: BrainJournalTrace): BrainCaseRiskSummary {
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
): BrainCaseLessonsSummary {
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

function normalizeLessonCandidates(value: unknown, sourceEventRef: string | undefined): BrainCaseLessonCandidate[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((raw, index): BrainCaseLessonCandidate[] => {
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
