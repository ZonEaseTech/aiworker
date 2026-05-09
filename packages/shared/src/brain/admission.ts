import { z } from 'zod'

import { redactBodySecrets } from './scan-body'

/**
 * Brain admission MVP (PLAN-101).
 *
 * Generated brain change (memory / brain-skill / policy / artifact-status)
 * must enter `brain_admission_proposals` first; operator approval +
 * materialization happen via the core service. Brain Kernel guarantees:
 *
 *  - status machine: pending → approved | rejected
 *    approved → applied | failed (only `kind === 'memory-add'` materializes
 *    in MVP; other kinds remain approved-but-not-applied for human follow-up)
 *  - high-risk default: `risk` defaults to `high` unless caller proves otherwise
 *  - rollback text + dry-run diff preserved in payload before any filesystem
 *    write
 *  - secret-like values redacted by default in evidence + payload before
 *    being printed by CLI / surfaced via API; operator must opt in via
 *    `--show-sensitive`
 *
 * Out of scope for PLAN-101: auto-approval, fleet.db replication, executor
 * MCP / engine plugin pathway, Worker Admin UI (handled by PLAN-103).
 */

const ADMISSION_ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const ADMISSION_KIND_RE = /^[a-z][a-z0-9-]*$/
const SOUL_ID_RE = /^[a-z][a-z0-9-]*$/

export const brainAdmissionIdSchema = z.string().min(1).regex(ADMISSION_ID_RE, 'admission id must be lowercase alphanumeric with . _ -')
export const brainAdmissionKindSchema = z.string().min(1).regex(ADMISSION_KIND_RE, 'admission kind must be kebab-case')

export const brainAdmissionRiskSchema = z.enum(['low', 'medium', 'high'])
export type BrainAdmissionRisk = z.infer<typeof brainAdmissionRiskSchema>

export const brainAdmissionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'applied', 'failed'])
export type BrainAdmissionStatus = z.infer<typeof brainAdmissionStatusSchema>

export const brainAdmissionDecisionKindSchema = z.enum(['approved', 'rejected', 'applied', 'failed'])
export type BrainAdmissionDecisionKind = z.infer<typeof brainAdmissionDecisionKindSchema>

export const brainAdmissionEvidenceKindSchema = z.enum([
  'conversation',
  'message',
  'tool-call',
  'observation',
  'artifact',
  'memory',
  'log',
])
export type BrainAdmissionEvidenceKind = z.infer<typeof brainAdmissionEvidenceKindSchema>

export const brainAdmissionEvidenceSchema = z.object({
  at: z.string().min(1),
  kind: brainAdmissionEvidenceKindSchema,
  /** Short headline that helps an operator decide approve / reject. */
  summary: z.string().max(500).optional(),
  /** Longer free-form note. Same redact pass as `summary`. */
  notes: z.string().max(2000).optional(),
  ref: z.string().min(1),
})
export type BrainAdmissionEvidence = z.infer<typeof brainAdmissionEvidenceSchema>

export const brainAdmissionProposalSchema = z.object({
  confidence: z.number().min(0).max(1),
  createdAt: z.string().min(1),
  evidence: z.array(brainAdmissionEvidenceSchema).readonly(),
  id: brainAdmissionIdSchema,
  kind: brainAdmissionKindSchema,
  payload: z.record(z.string(), z.unknown()).optional(),
  risk: brainAdmissionRiskSchema,
  rollback: z.string().min(1),
  scopeId: z.string().min(1).optional(),
  soulId: z.string().min(1).regex(SOUL_ID_RE),
  status: brainAdmissionStatusSchema,
  summary: z.string().min(1).max(2000),
  /** Filesystem path or artifact id the proposal will mutate when applied. */
  target: z.string().min(1),
  updatedAt: z.string().min(1),
})
export type BrainAdmissionProposal = z.infer<typeof brainAdmissionProposalSchema>

export interface BrainAdmissionProposalInput {
  confidence: number
  evidence?: readonly BrainAdmissionEvidence[]
  id: string
  kind: string
  payload?: Record<string, unknown>
  risk?: BrainAdmissionRisk
  rollback: string
  scopeId?: string
  soulId: string
  summary: string
  target: string
}

export const brainAdmissionProposalInputSchema = z.object({
  confidence: z.number().min(0).max(1),
  evidence: z.array(brainAdmissionEvidenceSchema).readonly().optional(),
  id: brainAdmissionIdSchema,
  kind: brainAdmissionKindSchema,
  payload: z.record(z.string(), z.unknown()).optional(),
  risk: brainAdmissionRiskSchema.default('high'),
  rollback: z.string().min(1),
  scopeId: z.string().min(1).optional(),
  soulId: z.string().min(1).regex(SOUL_ID_RE),
  summary: z.string().min(1).max(2000),
  target: z.string().min(1),
}) satisfies z.ZodType<BrainAdmissionProposalInput, z.ZodTypeDef, BrainAdmissionProposalInput>

export const brainAdmissionDecisionSchema = z.object({
  appliedAt: z.string().min(1).optional(),
  decidedAt: z.string().min(1),
  decidedBy: z.string().min(1),
  decision: brainAdmissionDecisionKindSchema,
  failureReason: z.string().max(4000).optional(),
  id: z.number().int().positive(),
  proposalId: brainAdmissionIdSchema,
  reason: z.string().max(2000).optional(),
})
export type BrainAdmissionDecision = z.infer<typeof brainAdmissionDecisionSchema>

/**
 * Materialize types currently supported by the governed `apply` step. Other
 * proposalTypes from `Soul.schemaPack.proposalTypes` may be approved, but the
 * service refuses to write filesystem state for them. Dry-run apply returns an
 * unsupported outcome; commit apply records an unsupported-kind failure so
 * operators can handle follow-up out-of-band until a later materializer slice
 * explicitly expands this list.
 */
export const MATERIALIZED_PROPOSAL_KINDS = ['memory-add', 'brain-skill-add'] as const
export type MaterializedProposalKind = (typeof MATERIALIZED_PROPOSAL_KINDS)[number]

export function isMaterializedProposalKind(kind: string): kind is MaterializedProposalKind {
  return (MATERIALIZED_PROPOSAL_KINDS as readonly string[]).includes(kind)
}

const MEMORY_TOPIC_RE = /^[a-z0-9][a-z0-9._-]*$/

export const brainAdmissionMemoryAddPayloadSchema = z.object({
  /** Markdown body to append. Must end without trailing CRLF / multiple blank lines. */
  body: z.string().min(1).max(20_000),
  /** When set, write to `<brainHome>/memories/<topic>.md`; otherwise append to `<brainHome>/MEMORY.md`. */
  topic: z.string().min(1).regex(MEMORY_TOPIC_RE).optional(),
  /** When `topic` is set and this is `true`, also append `- [Title](topic.md)` to `MEMORY.md`. */
  indexEntry: z.string().min(1).max(280).optional(),
})
export type BrainAdmissionMemoryAddPayload = z.infer<typeof brainAdmissionMemoryAddPayloadSchema>

const BRAIN_SKILL_ID_RE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/

export const brainAdmissionSkillAddPayloadSchema = z.object({
  /** Full SKILL.md source, including valid YAML frontmatter. */
  body: z.string().min(1).max(20_000),
  /** Project Brain skill id; project scope materializes to executor-native skill dirs, fallback scope to `<brainHome>/skills/<skillId>/SKILL.md`. */
  skillId: z.string().min(1).regex(BRAIN_SKILL_ID_RE),
  /** Defaults false to protect operator-edited skill files. */
  overwrite: z.boolean().optional(),
})
export type BrainAdmissionSkillAddPayload = z.infer<typeof brainAdmissionSkillAddPayloadSchema>

const REDACTED = '<redacted>' as const

function isSecretKey(key: string): boolean {
  const parts = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const compact = parts.join('')

  if (parts.some(part => part === 'token' || part === 'password' || part === 'secret' || part === 'bearer' || part === 'credential' || part === 'credentials'))
    return true
  if (compact.includes('apikey'))
    return true
  if (parts.includes('authorization'))
    return true
  if (parts[0] === 'auth' && (parts.length === 1 || parts.some(part => part === 'header' || part === 'token' || part === 'secret' || part === 'password' || part === 'bearer' || part === 'credential' || part === 'credentials')))
    return true
  return false
}

export function redactSecretLikeValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(redactSecretLikeValues) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && isSecretKey(key))
        out[key] = REDACTED
      else if (typeof child === 'string')
        // BUG-061: even when the key name is benign (e.g. `body`, `summary`),
        // scan the string content for secret-shaped substrings and replace
        // each hit with `[REDACTED:<rule>]`. Reuses the same scanner that
        // admission apply runs against `payload.body` so read and write paths
        // converge on a single redaction policy.
        out[key] = redactBodySecrets(child).body
      else
        out[key] = redactSecretLikeValues(child)
    }
    return out as unknown as T
  }
  if (typeof value === 'string')
    // BUG-061: top-level string values (rare, but possible when a primitive
    // surfaces from a recursive call) also pass through the content scanner.
    return redactBodySecrets(value).body as unknown as T
  return value
}

/**
 * Default redaction for proposal evidence + payload. `summary`, `rollback`,
 * and `target` are operator-controlled fields that the Soul author owns —
 * they pass through field-name redaction but their string content is still
 * scanned for secret-shaped substrings (BUG-061). Caller can opt out via the
 * `--show-sensitive` flag in CLI / `redact: false` in core.
 */
export function redactBrainAdmissionProposal(proposal: BrainAdmissionProposal): BrainAdmissionProposal {
  const redacted: BrainAdmissionProposal = {
    ...proposal,
    summary: redactBodySecrets(proposal.summary).body,
    rollback: redactBodySecrets(proposal.rollback).body,
    target: redactBodySecrets(proposal.target).body,
    evidence: proposal.evidence.map(entry => redactSecretLikeValues(entry)),
    ...(proposal.payload === undefined ? {} : { payload: redactSecretLikeValues(proposal.payload) }),
  }
  return redacted
}
