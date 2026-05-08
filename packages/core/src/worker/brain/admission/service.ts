import type {
  BrainAdmissionDecision,
  BrainAdmissionDecisionKind,
  BrainAdmissionEvidence,
  BrainAdmissionProposal,
  BrainAdmissionProposalInput,
  BrainAdmissionRisk,
  BrainAdmissionStatus,
  SecretHit,
} from '@zonease/aiworker-shared'

import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  hashNativeSkillContent,
  NATIVE_PROJECT_SKILL_TARGETS,
  nativeProjectSkillSlug,
  readNativeSkillProjectionManifest,
  relativeNativeSkillProjectionTargetPath,
  resolveAllProjectNativeSkillPaths,
  writeNativeSkillProjectionManifest,
} from '@zonease/aiworker-fs-layout'
import {
  brainAdmissionMemoryAddPayloadSchema,
  brainAdmissionProposalInputSchema,
  brainAdmissionProposalSchema,
  brainAdmissionSkillAddPayloadSchema,
  isMaterializedProposalKind,
  redactBodySecrets,
  redactBrainAdmissionProposal,
  scanBodyForSecrets,
  skillMetadataSchema,
} from '@zonease/aiworker-shared'
import { brainAdmissionDecisions, brainAdmissionProposals, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { and, desc, eq } from 'drizzle-orm'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

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

/**
 * BUG-055: gate on secret-like substrings inside `payload.body` before any
 * filesystem write.
 *  - `block` (default): refuse to materialize when any hit is found.
 *  - `redact`: replace each hit with `[REDACTED:<rule>]` and persist that.
 *  - `raw`: write the body verbatim (escape hatch for ops); decision row
 *    records the override so audit shows operator intent.
 */
export type SecretBodyPolicy = 'block' | 'redact' | 'raw'

export interface ApplyOptions {
  brainHome: string
  decidedBy: string
  /** Default `false` (dry-run). Pass `true` to actually write filesystem state. */
  commit?: boolean
  at?: string
  /** BUG-055 secret-body policy. Default `'block'`. */
  allowSecretBody?: SecretBodyPolicy
}

export interface SecretScanReport {
  hits: SecretHit[]
  action: 'allow-clean' | 'block' | 'redact' | 'allow-raw'
  policy: SecretBodyPolicy
}

export type ApplyOutcome
  = | { kind: 'dry-run', diff: string, target: string, secretScan: SecretScanReport }
    | { kind: 'applied', target: string, secretScan: SecretScanReport }
    | { kind: 'blocked-by-secret-scan', secretScan: SecretScanReport }
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
const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const skillAddMetadataSchema = skillMetadataSchema.extend({
  id: z.string().min(1),
})

export interface BrainAdmissionListResult {
  proposals: BrainAdmissionProposal[]
  /** BUG-058: rows that failed schema parse — surfaced in CLI / REST footers. */
  skipped: { count: number, ids: string[], reasons: string[] }
}

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

/**
 * BUG-058: per-row safeParse so a single schema-drift row no longer blackholes
 * the whole admission view. Returns either a parsed proposal or a structured
 * skip reason that the caller surfaces as a footer warning.
 */
function safeRowToProposal(row: ProposalRow): { ok: true, proposal: BrainAdmissionProposal } | { ok: false, id: string, reason: string } {
  const candidate: BrainAdmissionProposal = {
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
    candidate.scopeId = row.scopeId
  if (row.payload !== null)
    candidate.payload = row.payload
  const parsed = brainAdmissionProposalSchema.safeParse(candidate)
  if (parsed.success)
    return { ok: true, proposal: parsed.data }
  const summary = parsed.error.issues
    .slice(0, 4)
    .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
  return { ok: false, id: row.id, reason: `schema-drift: ${summary}` }
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
    // BUG-058: schema-drift rows return null instead of throwing so the
    // operator-facing CLI / REST surface stays usable. Strict callers use
    // `getSafe` to inspect the skipped reason; `requireById` still throws.
    const result = safeRowToProposal(row as ProposalRow)
    if (!result.ok)
      return null
    return maybeRedact(result.proposal, options)
  }

  /**
   * BUG-058: safe variant of `get` — returns either the proposal or a
   * skipped reason instead of throwing on schema drift.
   */
  getSafe(id: string, options?: ReadBrainAdmissionOptions): { ok: true, proposal: BrainAdmissionProposal } | { ok: false, reason: string } | null {
    const row = getWorkerDb()
      .select()
      .from(brainAdmissionProposals)
      .where(eq(brainAdmissionProposals.id, id))
      .get()
    if (row === undefined)
      return null
    const result = safeRowToProposal(row as ProposalRow)
    if (!result.ok)
      return { ok: false, reason: result.reason }
    return { ok: true, proposal: maybeRedact(result.proposal, options) }
  }

  requireById(id: string, options?: ReadBrainAdmissionOptions): BrainAdmissionProposal {
    const proposal = this.get(id, options)
    if (proposal === null)
      throw buildStateError('not-found', `brain admission proposal "${id}" not found`)
    return proposal
  }

  list(options?: ListBrainAdmissionOptions, readOptions?: ReadBrainAdmissionOptions): BrainAdmissionListResult {
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
    const proposals: BrainAdmissionProposal[] = []
    const skippedIds: string[] = []
    const skipReasons: string[] = []
    for (const raw of rows) {
      const row = raw as ProposalRow
      const result = safeRowToProposal(row)
      if (result.ok) {
        proposals.push(maybeRedact(result.proposal, readOptions))
      }
      else {
        skippedIds.push(result.id)
        skipReasons.push(result.reason)
      }
    }
    return {
      proposals,
      skipped: { count: skippedIds.length, ids: skippedIds, reasons: skipReasons },
    }
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
   * kinds (BUG-059) record an `unsupported-skip` decision row and flip the
   * proposal to `failed` so the operator no longer sees them under
   * `--status approved`.
   *
   * `commit` defaults to `false` (dry-run). Dry-run never writes filesystem;
   * `commit: true` writes the file + records an `applied` decision + flips
   * status.
   *
   * BUG-055: `payload.body` is scanned for secret-like substrings before any
   * filesystem write. Default policy is `'block'` — operator must opt into
   * `'redact'` (replace hits with `[REDACTED:<rule>]`) or `'raw'` (write the
   * body verbatim) to proceed.
   */
  async apply(id: string, options: ApplyOptions): Promise<ApplyOutcome> {
    const proposal = this.requireById(id, { redactSensitive: false })
    if (proposal.status !== 'approved') {
      throw buildStateError(
        'invalid-transition',
        `cannot apply proposal "${id}" with status "${proposal.status}" (must be "approved")`,
      )
    }
    if (!isMaterializedProposalKind(proposal.kind))
      return this.handleUnsupportedKind(id, proposal.kind, options)
    if (proposal.kind === 'brain-skill-add')
      return this.applyBrainSkillAdd(id, proposal, options)

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
    const policy: SecretBodyPolicy = options.allowSecretBody ?? 'block'
    const scan = scanBodyForSecrets(payload.body)
    const hasHits = scan.hits.length > 0
    let bodyToWrite = payload.body
    let scanReport: SecretScanReport
    if (!hasHits) {
      scanReport = { hits: [], action: 'allow-clean', policy }
    }
    else if (policy === 'block') {
      scanReport = { hits: scan.hits, action: 'block', policy }
      // BUG-055: refuse to materialize. Operator can opt into redact / raw
      // explicitly by re-running with `--allow-secret-body`.
      return { kind: 'blocked-by-secret-scan', secretScan: scanReport }
    }
    else if (policy === 'redact') {
      const redacted = redactBodySecrets(payload.body)
      bodyToWrite = redacted.body
      scanReport = { hits: scan.hits, action: 'redact', policy }
    }
    else {
      scanReport = { hits: scan.hits, action: 'allow-raw', policy }
    }

    const targetPath = payload.topic === undefined
      ? path.join(options.brainHome, 'MEMORY.md')
      : path.join(options.brainHome, 'memories', `${payload.topic}.md`)

    const diff = formatMemoryAddDiff(targetPath, bodyToWrite, payload.indexEntry, scanReport)

    if (options.commit !== true)
      return { diff, kind: 'dry-run', target: targetPath, secretScan: scanReport }

    const at = options.at ?? new Date().toISOString()
    try {
      await mkdir(path.dirname(targetPath), { recursive: true })
      const body = ensureTrailingNewline(bodyToWrite)
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
      reason: secretScanReason(scanReport),
    }).run()
    return { kind: 'applied', target: targetPath, secretScan: scanReport }
  }

  private async applyBrainSkillAdd(id: string, proposal: BrainAdmissionProposal, options: ApplyOptions): Promise<ApplyOutcome> {
    const payloadResult = brainAdmissionSkillAddPayloadSchema.safeParse(proposal.payload)
    if (!payloadResult.success) {
      return {
        kind: 'failed',
        reason: `payload does not match brain-skill-add schema: ${payloadResult.error.issues
          .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; ')}`,
      }
    }

    const payload = payloadResult.data
    const bodyValidation = validateBrainSkillAddBody(payload.body, payload.skillId)
    if (bodyValidation !== null)
      return { kind: 'failed', reason: bodyValidation }

    const policy: SecretBodyPolicy = options.allowSecretBody ?? 'block'
    const scan = scanBodyForSecrets(payload.body)
    const hasHits = scan.hits.length > 0
    let bodyToWrite = payload.body
    let scanReport: SecretScanReport
    if (!hasHits) {
      scanReport = { hits: [], action: 'allow-clean', policy }
    }
    else if (policy === 'block') {
      scanReport = { hits: scan.hits, action: 'block', policy }
      return { kind: 'blocked-by-secret-scan', secretScan: scanReport }
    }
    else if (policy === 'redact') {
      const redacted = redactBodySecrets(payload.body)
      bodyToWrite = redacted.body
      scanReport = { hits: scan.hits, action: 'redact', policy }
    }
    else {
      scanReport = { hits: scan.hits, action: 'allow-raw', policy }
    }

    const targetPaths = resolveBrainSkillAddTargetPaths(options.brainHome, payload.skillId)
    const existingTargets: string[] = []
    if (payload.overwrite !== true) {
      for (const targetPath of targetPaths) {
        if (await fileExists(targetPath))
          existingTargets.push(targetPath)
      }
    }
    if (existingTargets.length > 0) {
      return {
        kind: 'failed',
        reason: `target skill already exists: ${existingTargets.join(', ')}; set payload.overwrite=true to replace it`,
      }
    }

    const diff = formatBrainSkillAddDiff(targetPaths, bodyToWrite, payload.overwrite === true, scanReport)
    if (options.commit !== true)
      return { diff, kind: 'dry-run', target: formatTargetPaths(targetPaths), secretScan: scanReport }

    const at = options.at ?? new Date().toISOString()
    try {
      const body = ensureSingleTrailingNewline(bodyToWrite)
      for (const targetPath of targetPaths) {
        await mkdir(path.dirname(targetPath), { recursive: true })
        await writeFile(targetPath, body, {
          encoding: 'utf8',
          flag: payload.overwrite === true ? 'w' : 'wx',
        })
      }
      await recordBrainSkillAddNativeProjection(options.brainHome, payload.skillId, body, at)
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
      reason: secretScanReason(scanReport),
    }).run()
    return { kind: 'applied', target: formatTargetPaths(targetPaths), secretScan: scanReport }
  }

  /**
   * BUG-059: unsupported `kind` no longer leaves the proposal stuck in
   * `approved`. We emit a `failed` decision row carrying
   * `failureReason='unsupported-kind:<kind>'` and flip the proposal status
   * to `failed` so subsequent `list --status approved` queries don't surface
   * orphaned proposals.
   */
  private handleUnsupportedKind(id: string, proposalKind: string, options: ApplyOptions): ApplyOutcome {
    const reason = `Materializer supports memory-add and brain-skill-add; kind "${proposalKind}" requires manual follow-up`
    if (options.commit !== true)
      return { kind: 'unsupported', proposalKind, reason }
    const at = options.at ?? new Date().toISOString()
    const failureReason = `unsupported-kind:${proposalKind}`
    const db = getWorkerDb()
    db.update(brainAdmissionProposals)
      .set({ status: 'failed', updatedAt: at })
      .where(eq(brainAdmissionProposals.id, id))
      .run()
    db.insert(brainAdmissionDecisions).values({
      decidedAt: at,
      decidedBy: options.decidedBy,
      decision: 'failed',
      failureReason,
      proposalId: id,
      reason,
    }).run()
    return { kind: 'unsupported', proposalKind, reason }
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

function ensureSingleTrailingNewline(body: string): string {
  return `${body.replace(/\n+$/u, '')}\n`
}

function formatMemoryAddDiff(targetPath: string, body: string, indexEntry: string | undefined, scan: SecretScanReport): string {
  const lines = body.split('\n')
  const preview = lines.slice(0, 12).join('\n')
  const truncated = lines.length > 12 ? `\n  ... (+${lines.length - 12} more lines)` : ''
  const indexHint = indexEntry === undefined
    ? ''
    : `\n  index entry → MEMORY.md:\n    ${indexEntry}`
  const scanLine = scan.hits.length === 0
    ? '  secret scan: clean'
    : `  secret scan: ${scan.action} (${scan.hits.length} hit${scan.hits.length === 1 ? '' : 's'} — ${scan.hits.map(h => `${h.rule}:${h.preview}`).join(', ')})`
  return [
    `dry-run: would append memory body to ${targetPath}`,
    `  body preview:\n    ${preview.split('\n').join('\n    ')}${truncated}`,
    indexHint,
    scanLine,
  ].filter(line => line !== '').join('\n')
}

function resolveBrainSkillAddTargetPaths(brainHome: string, skillId: string): string[] {
  const normalizedBrainHome = path.resolve(brainHome)
  if (path.basename(normalizedBrainHome) === '.aiworker')
    return resolveAllProjectNativeSkillPaths(path.dirname(normalizedBrainHome), skillId).map(target => target.path)
  return [path.join(normalizedBrainHome, 'skills', skillId, 'SKILL.md')]
}

async function recordBrainSkillAddNativeProjection(brainHome: string, skillId: string, body: string, updatedAt: string): Promise<void> {
  const normalizedBrainHome = path.resolve(brainHome)
  if (path.basename(normalizedBrainHome) !== '.aiworker')
    return

  const projectRoot = path.dirname(normalizedBrainHome)
  const existing = await readNativeSkillProjectionManifest(projectRoot)
  const sourceHash = hashNativeSkillContent(body)
  const next = new Map((existing?.projections ?? []).map(record => [`${record.engine}:${record.logicalId}`, record]))
  for (const target of resolveAllProjectNativeSkillPaths(projectRoot, skillId)) {
    const targetMeta = NATIVE_PROJECT_SKILL_TARGETS.find(item => item.engine === target.engine)
    if (!targetMeta)
      continue
    next.set(`${target.engine}:${skillId}`, {
      actualHash: sourceHash,
      directory: targetMeta.directory,
      engine: target.engine,
      lastAppliedHash: sourceHash,
      logicalId: skillId,
      slug: nativeProjectSkillSlug(skillId),
      sourceHash,
      sourceKind: 'admission',
      status: 'active',
      targetPath: relativeNativeSkillProjectionTargetPath(projectRoot, target.path),
      updatedAt,
    })
  }
  await writeNativeSkillProjectionManifest(projectRoot, {
    projections: [...next.values()].sort((left, right) => `${left.engine}:${left.logicalId}`.localeCompare(`${right.engine}:${right.logicalId}`)),
    schemaVersion: 1,
    tombstones: existing?.tombstones ?? [],
    updatedAt,
  })
}

function formatTargetPaths(targetPaths: string[]): string {
  return targetPaths.join(', ')
}

function formatBrainSkillAddDiff(targetPaths: string[], body: string, overwrite: boolean, scan: SecretScanReport): string {
  const lines = body.split('\n')
  const preview = lines.slice(0, 16).join('\n')
  const truncated = lines.length > 16 ? `\n  ... (+${lines.length - 16} more lines)` : ''
  const scanLine = scan.hits.length === 0
    ? '  secret scan: clean'
    : `  secret scan: ${scan.action} (${scan.hits.length} hit${scan.hits.length === 1 ? '' : 's'} — ${scan.hits.map(h => `${h.rule}:${h.preview}`).join(', ')})`
  const targetBlock = targetPaths.length === 1
    ? targetPaths[0]!
    : `\n  - ${targetPaths.join('\n  - ')}`
  return [
    `dry-run: would ${overwrite ? 'overwrite' : 'write'} brain skill to ${targetBlock}`,
    `  body preview:\n    ${preview.split('\n').join('\n    ')}${truncated}`,
    scanLine,
  ].join('\n')
}

function validateBrainSkillAddBody(body: string, skillId: string): string | null {
  const match = SKILL_FRONTMATTER_RE.exec(body)
  if (!match)
    return 'brain-skill-add body must include YAML frontmatter'

  let metadata: unknown
  try {
    metadata = parseYaml(match[1] ?? '')
  }
  catch (err) {
    return `brain-skill-add frontmatter is invalid YAML: ${err instanceof Error ? err.message : String(err)}`
  }

  const result = skillAddMetadataSchema.safeParse(metadata)
  if (!result.success) {
    return `brain-skill-add frontmatter does not satisfy SkillMetadata: ${result.error.issues
      .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ')}`
  }
  if (result.data.id !== skillId)
    return `brain-skill-add frontmatter id "${result.data.id}" does not match payload.skillId "${skillId}"`
  return null
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  }
  catch {
    return false
  }
}

function secretScanReason(scan: SecretScanReport): string | null {
  if (scan.hits.length === 0)
    return null
  if (scan.action === 'redact')
    return `operator-redacted-secret-scan: ${scan.hits.length} hit${scan.hits.length === 1 ? '' : 's'}`
  if (scan.action === 'allow-raw')
    return `operator-overrode-secret-scan-raw: ${scan.hits.length} hit${scan.hits.length === 1 ? '' : 's'}`
  return null
}
