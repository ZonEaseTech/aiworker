import { z } from 'zod'

import { brainAdmissionRiskSchema } from './admission'

/**
 * Brain brief compiler request / response types (PLAN-102).
 *
 * A brief is the **projection** of canonical brain state into a task-specific
 * context window. Canonical brain artifacts live under `<brainHome>/`
 * (`AGENT.md`, `SOUL.md`, `MEMORY.md`, `memories/`, `skills/`, scope manifest,
 * `policy.json`, `toolsets.json`, `capability-packs.json`) and are git-tracked
 * for review; `AGENTS.md`, `CLAUDE.md`, Copilot instructions, executor-engine
 * hints are downstream projections, not source of truth.
 *
 * PLAN-102 keeps the brief preview-only — orchestrator stays on the existing
 * coarse persona prompt; CLI / API operators inspect briefs via
 * `aiworker brain brief --task ...`. PLAN-103 may surface this in Worker
 * Admin; future plans may opt into using briefs as the orchestrator system
 * prompt.
 */

const SECTION_ID_RE = /^[a-z][a-z0-9-]*$/

export const brainBriefSectionIdSchema = z.string().min(1).regex(SECTION_ID_RE, 'brief section id must be kebab-case')

export const brainBriefSectionSourceSchema = z.enum([
  'agent-doc',
  'soul-doc',
  'memory-doc',
  'rollup-doc',
  'risk-policy',
  'admission-summary',
  'artifact-summary',
  'scope-manifest',
  'soul-skeleton',
])
export type BrainBriefSectionSource = z.infer<typeof brainBriefSectionSourceSchema>

export const brainBriefSectionSchema = z.object({
  body: z.string().min(1),
  id: brainBriefSectionIdSchema,
  /** Whether the section was forcibly retained even when token budget was tight. */
  protected: z.boolean(),
  source: brainBriefSectionSourceSchema,
  tokens: z.number().int().nonnegative(),
})
export type BrainBriefSection = z.infer<typeof brainBriefSectionSchema>

export const brainBriefDroppedSectionSchema = z.object({
  estimatedTokens: z.number().int().nonnegative(),
  id: brainBriefSectionIdSchema,
  reason: z.string().min(1),
})
export type BrainBriefDroppedSection = z.infer<typeof brainBriefDroppedSectionSchema>

export const brainBriefRequestSchema = z.object({
  // BUG-054: pre-filter the array so callers that accidentally pass
  // `[undefined]` / blanks (e.g. cac normalizing missing repeat options)
  // don't surface as `- undefined: not found in brain artifact registry`
  // lines downstream. After transform we re-assert min length on each entry.
  artifactRefs: z
    .array(z.unknown())
    .transform(arr => arr
      .filter((entry): entry is string => typeof entry === 'string')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0))
    .pipe(z.array(z.string().min(1)).readonly())
    .optional(),
  executor: z.string().min(1).optional(),
  risk: brainAdmissionRiskSchema.optional(),
  scopeId: z.string().min(1).optional(),
  soulId: z.string().min(1).optional(),
  task: z.string().min(1).max(4000),
  tokenBudget: z.number().int().min(200).max(50_000).optional(),
})
export type BrainBriefRequest = z.infer<typeof brainBriefRequestSchema>

export const brainBriefSchema = z.object({
  compiledAt: z.string().min(1),
  droppedSections: z.array(brainBriefDroppedSectionSchema).readonly(),
  executor: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  sections: z.array(brainBriefSectionSchema).readonly(),
  soulId: z.string().min(1),
  task: z.string().min(1),
  tokensBudget: z.number().int().positive(),
  tokensUsed: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1)).readonly(),
})
export type BrainBrief = z.infer<typeof brainBriefSchema>

export const DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET = 4000

/**
 * Cheap heuristic estimator. Brain Kernel does not depend on a tokenizer
 * library — operators who need precise counts can swap in their own
 * estimator via `BrainBriefCompilerDeps.estimateTokens`.
 *
 * Roughly approximates GPT-style BPE: 4 chars per token, with whitespace
 * counting as boundaries. Good enough to make budget decisions, not for
 * billing.
 */
export function estimateBrainBriefTokens(text: string): number {
  if (text.length === 0)
    return 0
  return Math.max(1, Math.ceil(text.length / 4))
}
