import type {
  BrainAdmissionDecision,
  BrainAdmissionDecisionKind,
  BrainAdmissionEvidence,
  BrainAdmissionProposal,
  BrainAdmissionProposalInput,
  BrainAdmissionRisk,
  BrainAdmissionStatus,
} from '@zonease/aiworker-shared'

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  brainAdmissionMemoryAddPayloadSchema,
  brainAdmissionProposalInputSchema,
  brainAdmissionProposalSchema,
  isMaterializedProposalKind,
  redactBrainAdmissionProposal,
} from '@zonease/aiworker-shared'
import { brainAdmissionDecisions, brainAdmissionProposals, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { and, desc, eq } from 'drizzle-orm'

/**
 * Brain admission service (PLAN-101).
 *
 * Single owner of the `brain_admission_proposals` + `brain_admission_decisions`
 * state machine. CLI / API call into here; the service never reaches into
 * fleet.db, never replicates payload outside the worker, and only materializes
 * `kind === 'memory-add'` in MVP.
 */

export interface ListBrainAdmissionOptions {
  status?: BrainAdmissionStatus
  kind?: string
  scopeId?: string | null
  soulId?: string
  /** Default 50, hard cap 500. */
  limit?: number
}

export interface ReadBrainAdmissionOptions {
  /** Default true — redacts secret-like values in evidence + payload. */
  redactSensitive?: boolean
}

export interface ApprovalContext {
  decidedBy: string
  reason?: string
  at?: string
}

export interface ApplyOptions {
  brainHome: string
  decidedBy: string
  /** Default `false` (dry-run). Pass `true` to actually write filesystem state. */
  commit?: boolean
  at?: string
}

export type ApplyOutcome
  = | { kind: 'dry-run', diff: string, target: string }
    | { kind: 'applied', target: string }
    | { kind: 'failed', reason: string }
    | { kind: 'unsupported', proposalKind: string, reason: string }

export interface BrainAdmissionStateError extends Error {
  code: 'invalid-transition' | 'not-found' | 'duplicate-id' | 'invalid-payload'
}

function buildStateError(code: BrainAdmissionStateError['code'], message: string): BrainAdmissionStateError {
  const err = new Error(message) as BrainAdmissionStateError
  err.code = code
  return err
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

interface ProposalRow {
  id: string
  scopeId: string | null
  soulId: string
  kind: string
  target: string
  summary: string
  evidence: readonly BrainAdmissionEvidence[]
  risk: BrainAdmissionRisk
  confidence: number
  rollback: string
  payload: Record<string, unknown> | null
  status: BrainAdmissionStatus
  createdAt: string
  updatedAt: string
}

function rowToProposal(row: ProposalRow): BrainAdmissionProposal {
  const proposal: BrainAdmissionProposal = {
    confidence: row.confidence,
    createdAt: row.createdAt,
    evidence: row.evidence ?? [],
    id: row.id,
    kind: row.kind,
    risk: row.risk,
    rollback: row.rollback,
    soulId: row.soulId,
    status: row.status,
    summary: row.summary,
    target: row.target,
    updatedAt: row.updatedAt,
  }
  if (row.scopeId !== null)
    proposal.scopeId = row.scopeId
  if (row.payload !== null)
    proposal.payload = row.payload
  return brainAdmissionProposalSchema.parse(proposal)
}

function maybeRedact(p: BrainAdmissionProposal, options?: ReadBrainAdmissionOptions): BrainAdmissionProposal {
  return options?.redactSensitive === false ? p : redactBrainAdmissionProposal(p)
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined)
    return DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error(`brain admission limit must be a positive integer, got ${String(limit)}`)
  return Math.min(limit, MAX_LIMIT)
}

interface DecisionRow {
  id: number
  proposalId: string
  decision: BrainAdmissionDecisionKind
  decidedBy: string
  decidedAt: string
  reason: string | null
  appliedAt: string | null
  failureReason: string | null
}

function rowToDecision(row: DecisionRow): BrainAdmissionDecision {
  const decision: BrainAdmissionDecision = {
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    decision: row.decision,
    id: row.id,
    proposalId: row.proposalId,
  }
  if (row.reason !== null)
    decision.reason = row.reason
  if (row.appliedAt !== null)
    decision.appliedAt = row.appliedAt
  if (row.failureReason !== null)
    decision.failureReason = row.failureReason
  return decision
}

export class BrainAdmissionService {
  propose(input: BrainAdmissionProposalInput, at: string = new Date().toISOString()): BrainAdmissionProposal {
    const parsed = brainAdmissionProposalInputSchema.parse(input)
    const db = getWorkerDb()
    const existing = db
      .select({ id: brainAdmissionProposals.id })
      .from(brainAdmissionProposals)
      .where(eq(brainAdmissionProposals.id, parsed.id))
      .get()
    if (existing !== undefined)
      throw buildStateError('duplicate-id', `brain admission proposal "${parsed.id}" already exists`)

    db.insert(brainAdmissionProposals).values({
      confidence: parsed.confidence,
      createdAt: at,
      evidence: parsed.evidence ?? [],
      id: parsed.id,
      kind: parsed.kind,
      payload: parsed.payload ?? null,
      risk: parsed.risk,
      rollback: parsed.rollback,
      scopeId: parsed.scopeId ?? null,
      soulId: parsed.soulId,
      status: 'pending',
      summary: parsed.summary,
      target: parsed.target,
      updatedAt: at,
    }).run()

    return this.requireById(parsed.id, { redactSensitive: false })
  }

  get(id: string, options?: ReadBrainAdmissionOptions): BrainAdmissionProposal | null {
    const row = getWorkerDb()
      .select()
      .from(brainAdmissionProposals)
      .where(eq(brainAdmissionProposals.id, id))
      .get()
    if (row === undefined)
      return null
    return maybeRedact(rowToProposal(row as ProposalRow), options)
  }

  requireById(id: string, options?: ReadBrainAdmissionOptions): BrainAdmissionProposal {
    const proposal = this.get(id, options)
    if (proposal === null)
      throw buildStateError('not-found', `brain admission proposal "${id}" not found`)
    return proposal
  }

  list(options?: ListBrainAdmissionOptions, readOptions?: ReadBrainAdmissionOptions): BrainAdmissionProposal[] {
    const limit = clampLimit(options?.limit)
    const filters = []
    if (options?.status !== undefined)
      filters.push(eq(brainAdmissionProposals.status, options.status))
    if (options?.kind !== undefined)
      filters.push(eq(brainAdmissionProposals.kind, options.kind))
    if (options?.scopeId !== undefined) {
      filters.push(options.scopeId === null
        ? eq(brainAdmissionProposals.scopeId, null as unknown as string)
        : eq(brainAdmissionProposals.scopeId, options.scopeId))
    }
    if (options?.soulId !== undefined)
      filters.push(eq(brainAdmissionProposals.soulId, options.soulId))

    const query = getWorkerDb()
      .select()
      .from(brainAdmissionProposals)
      .orderBy(desc(brainAdmissionProposals.createdAt))
      .limit(limit)

    const rows = (filters.length === 0 ? query : query.where(and(...filters))).all()
    return rows.map(row => maybeRedact(rowToProposal(row as ProposalRow), readOptions))
  }

  count(options?: Pick<ListBrainAdmissionOptions, 'status' | 'kind' | 'scopeId' | 'soulId'>): number {
    const filters = []
    if (options?.status !== undefined)
      filters.push(eq(brainAdmissionProposals.status, options.status))
    if (options?.kind !== undefined)
      filters.push(eq(brainAdmissionProposals.kind, options.kind))
    if (options?.scopeId !== undefined) {
      filters.push(options.scopeId === null
        ? eq(brainAdmissionProposals.scopeId, null as unknown as string)
        : eq(brainAdmissionProposals.scopeId, options.scopeId))
    }
    if (options?.soulId !== undefined)
      filters.push(eq(brainAdmissionProposals.soulId, options.soulId))

    const baseRows = filters.length === 0
      ? getWorkerDb().select({ id: brainAdmissionProposals.id }).from(brainAdmissionProposals).all()
      : getWorkerDb().select({ id: brainAdmissionProposals.id }).from(brainAdmissionProposals).where(and(...filters)).all()
    return baseRows.length
  }

  approve(id: string, ctx: ApprovalContext): BrainAdmissionProposal {
    const proposal = this.requireById(id, { redactSensitive: false })
    if (proposal.status !== 'pending') {
      throw buildStateError(
        'invalid-transition',
        `cannot approve proposal "${id}" with status "${proposal.status}" (only "pending" is approvable)`,
      )
    }
    const at = ctx.at ?? new Date().toISOString()
    const db = getWorkerDb()
    db.update(brainAdmissionProposals)
      .set({ status: 'approved', updatedAt: at })
      .where(eq(brainAdmissionProposals.id, id))
      .run()
    db.insert(brainAdmissionDecisions).values({
      decidedAt: at,
      decidedBy: ctx.decidedBy,
      decision: 'approved',
      proposalId: id,
      reason: ctx.reason ?? null,
    }).run()
    return this.requireById(id)
  }

  reject(id: string, ctx: ApprovalContext): BrainAdmissionProposal {
    const proposal = this.requireById(id, { redactSensitive: false })
    if (proposal.status !== 'pending') {
      throw buildStateError(
        'invalid-transition',
        `cannot reject proposal "${id}" with status "${proposal.status}" (only "pending" is rejectable)`,
      )
    }
    const at = ctx.at ?? new Date().toISOString()
    const db = getWorkerDb()
    db.update(brainAdmissionProposals)
      .set({ status: 'rejected', updatedAt: at })
      .where(eq(brainAdmissionProposals.id, id))
      .run()
    db.insert(brainAdmissionDecisions).values({
      decidedAt: at,
      decidedBy: ctx.decidedBy,
      decision: 'rejected',
      proposalId: id,
      reason: ctx.reason ?? null,
    }).run()
    return this.requireById(id)
  }

  /**
   * Materialize an approved proposal. MVP only supports `memory-add`; other
   * kinds resolve to `unsupported` without changing state.
   *
   * `commit` defaults to `false` (dry-run). Dry-run never writes filesystem;
   * `commit: true` writes file + records `applied` decision + flips status.
   */
  async apply(id: string, options: ApplyOptions): Promise<ApplyOutcome> {
    const proposal = this.requireById(id, { redactSensitive: false })
    if (proposal.status !== 'approved') {
      throw buildStateError(
        'invalid-transition',
        `cannot apply proposal "${id}" with status "${proposal.status}" (must be "approved")`,
      )
    }
    if (!isMaterializedProposalKind(proposal.kind)) {
      return {
        kind: 'unsupported',
        proposalKind: proposal.kind,
        reason: `MVP materializer only supports memory-add; kind "${proposal.kind}" requires manual follow-up`,
      }
    }

    const payloadResult = brainAdmissionMemoryAddPayloadSchema.safeParse(proposal.payload)
    if (!payloadResult.success) {
      return {
        kind: 'failed',
        reason: `payload does not match memory-add schema: ${payloadResult.error.issues
          .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; ')}`,
      }
    }

    const payload = payloadResult.data
    const targetPath = payload.topic === undefined
      ? path.join(options.brainHome, 'MEMORY.md')
      : path.join(options.brainHome, 'memories', `${payload.topic}.md`)

    const diff = formatMemoryAddDiff(targetPath, payload.body, payload.indexEntry)

    if (options.commit !== true)
      return { diff, kind: 'dry-run', target: targetPath }

    const at = options.at ?? new Date().toISOString()
    try {
      await mkdir(path.dirname(targetPath), { recursive: true })
      const body = ensureTrailingNewline(payload.body)
      await writeFile(targetPath, body, { encoding: 'utf8', flag: 'a' })
      if (payload.topic !== undefined && payload.indexEntry !== undefined) {
        const indexPath = path.join(options.brainHome, 'MEMORY.md')
        const entry = `${payload.indexEntry.replace(/\n+$/u, '')}\n`
        await writeFile(indexPath, entry, { encoding: 'utf8', flag: 'a' })
      }
    }
    catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const db = getWorkerDb()
      db.update(brainAdmissionProposals)
        .set({ status: 'failed', updatedAt: at })
        .where(eq(brainAdmissionProposals.id, id))
        .run()
      db.insert(brainAdmissionDecisions).values({
        decidedAt: at,
        decidedBy: options.decidedBy,
        decision: 'failed',
        failureReason: reason,
        proposalId: id,
      }).run()
      return { kind: 'failed', reason }
    }

    const db = getWorkerDb()
    db.update(brainAdmissionProposals)
      .set({ status: 'applied', updatedAt: at })
      .where(eq(brainAdmissionProposals.id, id))
      .run()
    db.insert(brainAdmissionDecisions).values({
      appliedAt: at,
      decidedAt: at,
      decidedBy: options.decidedBy,
      decision: 'applied',
      proposalId: id,
    }).run()
    return { kind: 'applied', target: targetPath }
  }

  listDecisions(proposalId: string): BrainAdmissionDecision[] {
    const rows = getWorkerDb()
      .select()
      .from(brainAdmissionDecisions)
      .where(eq(brainAdmissionDecisions.proposalId, proposalId))
      .orderBy(desc(brainAdmissionDecisions.decidedAt))
      .all()
    return rows.map(row => rowToDecision(row as DecisionRow))
  }
}

export function createBrainAdmissionService(): BrainAdmissionService {
  return new BrainAdmissionService()
}

function ensureTrailingNewline(body: string): string {
  if (body.endsWith('\n\n'))
    return body
  if (body.endsWith('\n'))
    return `${body}\n`
  return `${body}\n\n`
}

function formatMemoryAddDiff(targetPath: string, body: string, indexEntry: string | undefined): string {
  const lines = body.split('\n')
  const preview = lines.slice(0, 12).join('\n')
  const truncated = lines.length > 12 ? `\n  ... (+${lines.length - 12} more lines)` : ''
  const indexHint = indexEntry === undefined
    ? ''
    : `\n  index entry → MEMORY.md:\n    ${indexEntry}`
  return [
    `dry-run: would append memory body to ${targetPath}`,
    `  body preview:\n    ${preview.split('\n').join('\n    ')}${truncated}`,
    indexHint,
  ].filter(line => line !== '').join('\n')
}
