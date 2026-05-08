import type { BrainAdmissionProposal } from '@zonease/aiworker-shared'

import { createHash } from 'node:crypto'

import { BrainAdmissionService } from '../admission'
import { BrainJournalService, recordBrainJournalEvent } from '../journal'

export interface BrainInboxCandidate {
  kind: string
  summary: string
  rationale?: string
  evidenceRefs: string[]
  confidence: number
  risk: 'low' | 'medium' | 'high'
  target?: string
  expiresAt?: string
  rollback?: string
}

export interface ProposeBrainInboxFromTaskOptions {
  soulId?: string
  scopeId?: string
  at?: string
}

export interface BrainInboxProposalResult {
  taskId: string
  sourceEventId?: number
  candidates: BrainInboxCandidate[]
  proposals: BrainAdmissionProposal[]
  skipped: Array<{ candidateIndex: number, reason: string }>
}

export function createBrainInboxService(): BrainInboxService {
  return new BrainInboxService()
}

export class BrainInboxService {
  constructor(
    private readonly journal = new BrainJournalService(),
    private readonly admission = new BrainAdmissionService(),
  ) {}

  proposeFromTask(taskId: string, options: ProposeBrainInboxFromTaskOptions = {}): BrainInboxProposalResult {
    const trace = this.journal.getTaskTrace(taskId, { redactSensitive: false })
    if (trace === null)
      throw new Error(`task "${taskId}" not found`)

    const sourceEvent = [...trace.events].reverse().find(event => event.kind === 'brain_engine.review')
    const candidates = normalizeCandidates(sourceEvent?.payload.lessonCandidates)
    const proposals: BrainAdmissionProposal[] = []
    const skipped: Array<{ candidateIndex: number, reason: string }> = []
    const at = options.at ?? new Date().toISOString()
    const soulId = options.soulId ?? 'developer'

    candidates.forEach((candidate, index) => {
      const id = buildInboxProposalId(taskId, index, candidate)
      try {
        const proposal = this.admission.propose({
          confidence: candidate.confidence,
          evidence: [
            {
              at,
              kind: 'observation',
              ref: sourceEvent === undefined ? `agent_tasks:${taskId}` : `brain_journal_events:${sourceEvent.id}`,
              summary: 'Brain Engine lesson candidate',
            },
            ...candidate.evidenceRefs.map(ref => ({
              at,
              kind: 'observation' as const,
              ref,
              summary: 'Candidate evidence',
            })),
          ],
          id,
          kind: 'memory-add',
          payload: {
            body: renderCandidateMemory(taskId, candidate),
            indexEntry: truncate(candidate.summary, 280),
            topic: inboxTopic(candidate.kind),
          },
          risk: candidate.risk,
          rollback: candidate.rollback ?? `Remove the memory entry generated from task ${taskId} if the lesson is rejected or expires.`,
          soulId,
          summary: candidate.summary,
          target: candidate.target ?? `memories/${inboxTopic(candidate.kind)}.md`,
          ...(options.scopeId === undefined ? {} : { scopeId: options.scopeId }),
        }, at)
        proposals.push(proposal)
      }
      catch (err) {
        skipped.push({
          candidateIndex: index,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    })

    if (sourceEvent !== undefined || proposals.length > 0 || skipped.length > 0) {
      recordBrainJournalEvent({
        kind: 'inbox.candidates_proposed',
        taskId,
        payload: {
          candidateCount: candidates.length,
          proposalIds: proposals.map(proposal => proposal.id),
          skipped,
          ...(sourceEvent === undefined ? {} : { sourceEventId: sourceEvent.id }),
        },
      })
    }

    return {
      taskId,
      ...(sourceEvent === undefined ? {} : { sourceEventId: sourceEvent.id }),
      candidates,
      proposals,
      skipped,
    }
  }
}

function normalizeCandidates(value: unknown): BrainInboxCandidate[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((raw): BrainInboxCandidate[] => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
      return []
    const item = raw as Record<string, unknown>
    if (typeof item.summary !== 'string' || item.summary.trim().length === 0)
      return []
    const kind = typeof item.kind === 'string' && item.kind.trim().length > 0 ? item.kind.trim() : 'repo-fact'
    const risk = item.risk === 'low' || item.risk === 'medium' || item.risk === 'high' ? item.risk : 'medium'
    return [{
      kind,
      summary: item.summary.trim(),
      ...(typeof item.rationale === 'string' && item.rationale.trim().length > 0 ? { rationale: item.rationale.trim() } : {}),
      evidenceRefs: Array.isArray(item.evidenceRefs)
        ? item.evidenceRefs.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0).map(ref => ref.trim())
        : [],
      confidence: clamp01(typeof item.confidence === 'number' ? item.confidence : 0.5),
      risk,
      ...(typeof item.target === 'string' && item.target.trim().length > 0 ? { target: item.target.trim() } : {}),
      ...(typeof item.expiresAt === 'string' && item.expiresAt.trim().length > 0 ? { expiresAt: item.expiresAt.trim() } : {}),
      ...(typeof item.rollback === 'string' && item.rollback.trim().length > 0 ? { rollback: item.rollback.trim() } : {}),
    }]
  })
}

function buildInboxProposalId(taskId: string, index: number, candidate: BrainInboxCandidate): string {
  const hash = createHash('sha256')
    .update(taskId)
    .update(String(index))
    .update(candidate.kind)
    .update(candidate.summary)
    .digest('hex')
    .slice(0, 12)
  return `inbox-${safeIdPart(taskId).slice(0, 24)}-${index + 1}-${hash}`
}

function renderCandidateMemory(taskId: string, candidate: BrainInboxCandidate): string {
  return [
    `# ${candidate.summary}`,
    '',
    `- Source task: ${taskId}`,
    `- Kind: ${candidate.kind}`,
    `- Risk: ${candidate.risk}`,
    `- Confidence: ${candidate.confidence.toFixed(2)}`,
    ...(candidate.expiresAt === undefined ? [] : [`- Expires at: ${candidate.expiresAt}`]),
    '',
    candidate.rationale ?? candidate.summary,
    '',
    'Evidence:',
    ...(candidate.evidenceRefs.length === 0 ? ['- (none)'] : candidate.evidenceRefs.map(ref => `- ${ref}`)),
    '',
    `Rollback: ${candidate.rollback ?? `Remove this memory if task ${taskId} evidence is invalidated.`}`,
  ].join('\n')
}

function inboxTopic(kind: string): string {
  return `inbox-${safeIdPart(kind)}`
}

function safeIdPart(value: string): string {
  const out = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return out.length > 0 ? out : 'candidate'
}

function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0.5
  return Math.max(0, Math.min(1, value))
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit)
    return text
  return text.slice(0, limit)
}
