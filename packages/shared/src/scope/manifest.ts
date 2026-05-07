import { z } from 'zod'

/**
 * Scope manifest = explicit declaration of a worker-bound business scope.
 *
 * Lives at `<project>/.aiworker/scope.json`. Sister file to `policy.json` and
 * `brain-capabilities.json`; same JSON shape so existing tooling
 * (`aiworker doctor`) reads it with no new dependency.
 *
 * First-version minimum (PLAN-098): only `kind` + `primarySoul` are required.
 * `id`, `subject`, `artifactRoots`, `privacy`, `retention`, `approval`,
 * `labels` are optional and grow with PLAN-099 / PLAN-101 / PLAN-103.
 *
 * PLAN-098 does not enforce that `primarySoul` resolves to a real Soul module
 * here — that check happens in CLI doctor where the registry is available.
 */

const SCOPE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const SCOPE_KIND_RE = /^[a-z][a-z0-9-]*$/
const SCOPE_SOUL_ID_RE = /^[a-z][a-z0-9-]*$/

export const scopePrivacySchema = z.enum(['private', 'team', 'public'])
export type ScopePrivacy = z.infer<typeof scopePrivacySchema>

export const scopeApprovalSchema = z.enum(['manual-approval', 'auto-low-risk'])
export type ScopeApproval = z.infer<typeof scopeApprovalSchema>

export const scopeIdSchema = z.string().min(1).regex(SCOPE_ID_RE, 'scope id must be lowercase alphanumeric with . _ -')
export const scopeKindSchema = z.string().min(1).regex(SCOPE_KIND_RE, 'scope kind must be kebab-case')
export const scopeSoulIdSchema = z.string().min(1).regex(SCOPE_SOUL_ID_RE, 'primary soul id must be kebab-case')

export const scopeArtifactRootSchema = z.object({
  description: z.string().min(1).optional(),
  path: z.string().min(1),
})
export type ScopeArtifactRoot = z.infer<typeof scopeArtifactRootSchema>

export const scopeManifestSchema = z.object({
  approval: scopeApprovalSchema.optional(),
  artifactRoots: z.array(scopeArtifactRootSchema).readonly().optional(),
  id: scopeIdSchema.optional(),
  kind: scopeKindSchema,
  labels: z.array(z.string().min(1)).readonly().optional(),
  primarySoul: scopeSoulIdSchema,
  privacy: scopePrivacySchema.optional(),
  retention: z.string().min(1).optional(),
  schemaVersion: z.literal(1),
  subject: z.string().min(1).optional(),
})
export type ScopeManifest = z.infer<typeof scopeManifestSchema>

export interface ScopeManifestReadOk {
  manifest: ScopeManifest
  status: 'ok'
}
export interface ScopeManifestReadMissing {
  status: 'missing'
}
export interface ScopeManifestReadMalformed {
  error: string
  status: 'malformed'
}
export type ScopeManifestReadResult
  = | ScopeManifestReadOk
    | ScopeManifestReadMissing
    | ScopeManifestReadMalformed

/**
 * Parse a JSON string into a `ScopeManifest`. Pure function — caller owns the
 * file read so this works in any environment (CLI, API, web).
 *
 * Returns `missing` only when called via `parseOptionalScopeManifestJson`
 * with `null`/`undefined`; `parseScopeManifestJson` itself never returns
 * `missing`.
 */
export function parseScopeManifestJson(content: string): ScopeManifestReadOk | ScopeManifestReadMalformed {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  }
  catch (err) {
    return {
      error: `scope.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      status: 'malformed',
    }
  }
  const result = scopeManifestSchema.safeParse(raw)
  if (!result.success) {
    return {
      error: result.error.issues
        .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; '),
      status: 'malformed',
    }
  }
  return { manifest: result.data, status: 'ok' }
}

export function parseOptionalScopeManifestJson(content: string | null | undefined): ScopeManifestReadResult {
  if (content === null || content === undefined)
    return { status: 'missing' }
  return parseScopeManifestJson(content)
}

/**
 * Build a minimal scope manifest skeleton suitable for `aiworker init` to
 * write. Caller fills `kind` + `primarySoul`; everything else stays unset
 * until the operator edits the file by hand or PLAN-101 / PLAN-103 fills it.
 */
export interface BuildScopeManifestInput {
  kind: string
  primarySoul: string
  id?: string
  subject?: string
  privacy?: ScopePrivacy
  approval?: ScopeApproval
  retention?: string
  labels?: readonly string[]
  artifactRoots?: readonly ScopeArtifactRoot[]
}

export function buildScopeManifest(input: BuildScopeManifestInput): ScopeManifest {
  const manifest: ScopeManifest = {
    kind: input.kind,
    primarySoul: input.primarySoul,
    schemaVersion: 1,
  }
  if (input.id !== undefined)
    manifest.id = input.id
  if (input.subject !== undefined)
    manifest.subject = input.subject
  if (input.privacy !== undefined)
    manifest.privacy = input.privacy
  if (input.approval !== undefined)
    manifest.approval = input.approval
  if (input.retention !== undefined)
    manifest.retention = input.retention
  if (input.labels !== undefined && input.labels.length > 0)
    manifest.labels = [...input.labels]
  if (input.artifactRoots !== undefined && input.artifactRoots.length > 0)
    manifest.artifactRoots = [...input.artifactRoots]
  return scopeManifestSchema.parse(manifest)
}
