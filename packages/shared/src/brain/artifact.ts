import { z } from 'zod'

/**
 * Brain artifact = registry entry for a piece of business material the worker
 * scope cares about. Examples:
 *  - developer scope: a code module file, a design doc, an architecture decision record
 *  - hr-recruiting scope: a candidate resume, a screening note, an interview decision
 *  - finance-ops scope: a reconciliation report, an audit trail entry
 *
 * Brain Kernel does not parse artifact content; it stores reference + hash +
 * sensitivity + retention + status, plus opaque `metadata` the owning Soul
 * uses to encode workflow state. Soul module declares the artifact `type`
 * universe (PLAN-100); Kernel only enforces shape.
 *
 * Defaults are conservative: sensitivity defaults to `internal` and status
 * defaults to `active`. CLI inspector redacts `confidential` / `secret`
 * artifact ref unless `--show-sensitive` is passed.
 */

const ARTIFACT_ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const ARTIFACT_TYPE_RE = /^[a-z][a-z0-9-]*$/

export const brainArtifactIdSchema = z.string().min(1).regex(ARTIFACT_ID_RE, 'artifact id must be lowercase alphanumeric with . _ -')
export const brainArtifactTypeSchema = z.string().min(1).regex(ARTIFACT_TYPE_RE, 'artifact type must be kebab-case')

export const brainArtifactSensitivitySchema = z.enum(['public', 'internal', 'confidential', 'secret'])
export type BrainArtifactSensitivity = z.infer<typeof brainArtifactSensitivitySchema>

/**
 * Soul-agnostic workflow state. Soul-specific states (e.g. `screening-passed`,
 * `awaiting-cfo-signoff`) live in `metadata.workflowState` (PLAN-100).
 */
export const brainArtifactStatusSchema = z.enum(['active', 'archived', 'removed'])
export type BrainArtifactStatus = z.infer<typeof brainArtifactStatusSchema>

export const brainArtifactSourceSchema = z.enum(['operator', 'brain-runtime', 'executor', 'channel-import'])
export type BrainArtifactSource = z.infer<typeof brainArtifactSourceSchema>

export const brainArtifactSchema = z.object({
  createdAt: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).readonly(),
  /**
   * sha256 hex (64 chars). Optional — if the artifact ref is a path that may
   * move, hash is the durable handle; if it's an inline opaque id, hash may
   * be empty.
   */
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  id: brainArtifactIdSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  /**
   * Free-form ref. May be a relative path under a scope artifactRoot, an
   * absolute path, or any other URI / opaque locator the Soul understands.
   */
  ref: z.string().min(1),
  retention: z.string().min(1).optional(),
  /** ISO 8601 string. */
  scopeId: z.string().min(1).optional(),
  sensitivity: brainArtifactSensitivitySchema,
  source: brainArtifactSourceSchema,
  status: brainArtifactStatusSchema,
  /**
   * Human-readable summary that is safe to display in CLI/UI even when
   * sensitivity is high. Soul authors are responsible for not leaking PII /
   * secrets into this field.
   */
  summary: z.string().max(2000).optional(),
  type: brainArtifactTypeSchema,
  updatedAt: z.string().min(1),
})
export type BrainArtifact = z.infer<typeof brainArtifactSchema>

export interface BrainArtifactRegisterInput {
  evidenceRefs?: readonly string[]
  hash?: string
  id: string
  metadata?: Record<string, unknown>
  ref: string
  retention?: string
  scopeId?: string
  sensitivity?: BrainArtifactSensitivity
  source: BrainArtifactSource
  status?: BrainArtifactStatus
  summary?: string
  type: string
}

export const brainArtifactRegisterInputSchema = z.object({
  evidenceRefs: z.array(z.string().min(1)).readonly().optional(),
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  id: brainArtifactIdSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  ref: z.string().min(1),
  retention: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  sensitivity: brainArtifactSensitivitySchema.default('internal'),
  source: brainArtifactSourceSchema,
  status: brainArtifactStatusSchema.default('active'),
  summary: z.string().max(2000).optional(),
  type: brainArtifactTypeSchema,
}) satisfies z.ZodType<BrainArtifactRegisterInput, z.ZodTypeDef, BrainArtifactRegisterInput>

const SENSITIVE_LEVELS: ReadonlySet<BrainArtifactSensitivity> = new Set(['confidential', 'secret'])
const REDACTED_PLACEHOLDER = '<redacted>'

/**
 * Replace `ref` and `hash` with a redaction marker for any artifact at
 * `confidential` or `secret` sensitivity. `summary` is preserved (Soul authors
 * own the content of `summary`). Use this anywhere artifact records would be
 * printed without the operator explicitly opting in.
 */
export function redactBrainArtifact(artifact: BrainArtifact): BrainArtifact {
  if (!SENSITIVE_LEVELS.has(artifact.sensitivity))
    return artifact
  const next: BrainArtifact = {
    ...artifact,
    ref: REDACTED_PLACEHOLDER,
  }
  if (artifact.hash !== undefined)
    next.hash = REDACTED_PLACEHOLDER
  return next
}

export function isSensitiveBrainArtifact(artifact: BrainArtifact): boolean {
  return SENSITIVE_LEVELS.has(artifact.sensitivity)
}
