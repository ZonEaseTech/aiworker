import { z } from 'zod'

/**
 * Soul module contract.
 *
 * Soul 是 worker scope 的领域人格 + 业务对象 + 风险/留存策略的拥有者。
 * Brain Kernel 不内建 developer / HR / finance 等业务语义；它只读取 Soul module
 * 暴露的 metadata（artifact types、proposal types、retention defaults 等），并
 * 据此组织 scope manifest（PLAN-098）、artifact registry（PLAN-099）、admission
 * proposal（PLAN-101）和 brain brief（PLAN-102）。
 *
 * 第一版只保留下游 plan 必需的 slot；schemaPack 与 briefHooks 的具体内容由后续
 * plan（PLAN-100 / PLAN-102）填充。
 */

const SOUL_ID_RE = /^[a-z][a-z0-9-]*$/
const SOUL_VERSION_RE = /^\d+\.\d+\.\d+$/
const SOUL_SCOPE_KIND_RE = /^[a-z][a-z0-9-]*$/
const SOUL_SECTION_ID_RE = /^[a-z][a-z0-9-]*$/

export const soulIdSchema = z.string().min(1).regex(SOUL_ID_RE, 'soul id must be kebab-case')
export const soulVersionSchema = z.string().regex(SOUL_VERSION_RE, 'soul version must be major.minor.patch')
export const soulScopeKindSchema = z.string().min(1).regex(SOUL_SCOPE_KIND_RE, 'scope kind must be kebab-case')

export const soulManifestSchema = z.object({
  description: z.string().min(1),
  id: soulIdSchema,
  label: z.string().min(1),
  version: soulVersionSchema,
})
export type SoulManifest = z.infer<typeof soulManifestSchema>

export const soulRiskPolicySchema = z.object({
  communicationStyle: z.string().min(1),
  highRiskRequiresApproval: z.boolean(),
  outOfScopeStrategy: z.string().min(1),
  riskNotes: z.string().min(1),
  /**
   * BUG-063: per-Soul guidance for vague / underspecified prompts. Used to
   * produce the "模糊或缺失上下文" section in the materialized SOUL.md so the
   * LLM knows to ask back instead of brute-forcing tool calls. Optional with
   * a sensible default at render time, but every shipped preset declares one
   * tuned to its domain (developer asks for stack traces, hr asks for role
   * context, etc.).
   */
  vagueContextStrategy: z.string().min(1).optional(),
})
export type SoulRiskPolicy = z.infer<typeof soulRiskPolicySchema>

export const soulRetentionDefaultSchema = z.object({
  /** Free-form retention hint, e.g. `session`, `30d`, `90d`, `permanent`. */
  retention: z.string().min(1),
  /** Artifact type id or proposal kind that this retention applies to. */
  target: z.string().min(1),
})
export type SoulRetentionDefault = z.infer<typeof soulRetentionDefaultSchema>

/**
 * Slot for PLAN-100. Each Soul declares its own domain object names; Kernel
 * does not parse business semantics — only verifies shape.
 */
export const soulSchemaPackSchema = z.object({
  artifactTypes: z.array(z.string().min(1)).readonly(),
  entityTypes: z.array(z.string().min(1)).readonly(),
  proposalTypes: z.array(z.string().min(1)).readonly(),
  workflowStates: z.array(z.string().min(1)).readonly(),
})
export type SoulSchemaPack = z.infer<typeof soulSchemaPackSchema>

/**
 * Slot for PLAN-102. Section ids are opaque strings the brief compiler will
 * resolve at runtime; Kernel only enforces protectedSections ⊆ defaultSections.
 */
export const soulBriefHooksSchema = z.object({
  defaultSections: z.array(z.string().min(1).regex(SOUL_SECTION_ID_RE)).readonly(),
  protectedSections: z.array(z.string().min(1).regex(SOUL_SECTION_ID_RE)).readonly(),
}).superRefine((value, ctx) => {
  const defaults = new Set(value.defaultSections)
  for (const id of value.protectedSections) {
    if (!defaults.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `protected section "${id}" must also appear in defaultSections`,
        path: ['protectedSections'],
      })
    }
  }
})
export type SoulBriefHooks = z.infer<typeof soulBriefHooksSchema>

/**
 * Data the CLI projection (`aiworker init`, `aiworker soul list/show`) prints.
 * Pack and toolset ids are validated against the CLI capability catalog —
 * Kernel does not enforce that here to avoid pulling CLI-only data into shared.
 */
export const soulInitProjectionSchema = z.object({
  boundaries: z.array(z.string().min(1)).min(1).readonly(),
  packs: z.array(z.string().min(1)).min(1).readonly(),
  responsibilities: z.array(z.string().min(1)).min(1).readonly(),
  toolsets: z.array(z.string().min(1)).min(1).readonly(),
})
export type SoulInitProjection = z.infer<typeof soulInitProjectionSchema>

export const soulModuleSchema = z.object({
  briefHooks: soulBriefHooksSchema,
  initProjection: soulInitProjectionSchema,
  manifest: soulManifestSchema,
  primaryScopeKind: soulScopeKindSchema,
  retentionDefaults: z.array(soulRetentionDefaultSchema).readonly(),
  riskPolicy: soulRiskPolicySchema,
  schemaPack: soulSchemaPackSchema,
  supportedScopeKinds: z.array(soulScopeKindSchema).min(1).readonly(),
}).superRefine((value, ctx) => {
  if (!value.supportedScopeKinds.includes(value.primaryScopeKind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'primaryScopeKind must appear in supportedScopeKinds',
      path: ['primaryScopeKind'],
    })
  }
})
export type SoulModule = z.infer<typeof soulModuleSchema>

export function isSoulModule(value: unknown): value is SoulModule {
  return soulModuleSchema.safeParse(value).success
}

export function assertSoulModule(value: unknown): SoulModule {
  return soulModuleSchema.parse(value)
}
