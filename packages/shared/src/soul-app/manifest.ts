import type { z } from 'zod'

import { z as zod } from 'zod'

export const SOUL_APP_PROTOCOL = 'soul-app/v1' as const

const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const ROUTE_RE = /^\/[a-z0-9][a-z0-9/_:.-]*$/
const API_PREFIX_RE = /^\/api\/local\/apps\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z0-9/_:.-]*)?$/

export const soulAppIdSchema = zod.string().min(1).regex(ID_RE, 'Soul App id must be kebab-case')
export const soulAppVersionSchema = zod.string().regex(SEMVER_RE, 'version must be major.minor.patch')
export type SoulAppVersion = z.infer<typeof soulAppVersionSchema>
export const soulAppProtocolSchema = zod.literal(SOUL_APP_PROTOCOL)
export type SoulAppProtocol = z.infer<typeof soulAppProtocolSchema>

export const soulAppModeSchema = zod.object({
  entry: zod.string().min(1).optional(),
  supported: zod.boolean(),
})
export type SoulAppMode = z.infer<typeof soulAppModeSchema>

export const soulAppCompatibilitySchema = zod.object({
  host: zod.object({
    maxVersion: soulAppVersionSchema.optional(),
    minVersion: soulAppVersionSchema,
  }),
  sdk: zod.object({
    maxVersion: soulAppVersionSchema.optional(),
    minVersion: soulAppVersionSchema,
  }).optional(),
})
export type SoulAppCompatibility = z.infer<typeof soulAppCompatibilitySchema>

export const soulAppSoulSchema = zod.object({
  description: zod.string().min(1),
  domain: zod.string().min(1),
  id: soulAppIdSchema,
  name: zod.string().min(1),
  version: soulAppVersionSchema,
})
export type SoulAppSoul = z.infer<typeof soulAppSoulSchema>

export const soulAppPackSourceSchema = zod.enum(['embedded', 'path', 'package'])
export type SoulAppPackSource = z.infer<typeof soulAppPackSourceSchema>

export const soulAppPackRefSchema = zod.object({
  id: soulAppIdSchema,
  ref: zod.string().min(1),
  source: soulAppPackSourceSchema,
  version: soulAppVersionSchema.optional(),
})
export type SoulAppPackRef = z.infer<typeof soulAppPackRefSchema>

export const soulAppCapabilitySchema = zod.object({
  artifactTypes: zod.array(soulAppIdSchema).min(1).readonly(),
  description: zod.string().min(1),
  id: soulAppIdSchema,
  name: zod.string().min(1),
  outputKind: soulAppIdSchema,
  packRefs: zod.array(soulAppIdSchema).readonly().optional(),
  promptRef: zod.string().min(1),
  reviewRubricRef: zod.string().min(1).optional(),
  version: soulAppVersionSchema,
  workspaceTypes: zod.array(soulAppIdSchema).min(1).readonly(),
})
export type SoulAppCapability = z.infer<typeof soulAppCapabilitySchema>

export const soulAppWorkspaceTypeSchema = zod.object({
  artifactTypes: zod.array(soulAppIdSchema).min(1).readonly(),
  defaultCapabilityIds: zod.array(soulAppIdSchema).readonly().optional(),
  description: zod.string().min(1),
  id: soulAppIdSchema,
  name: zod.string().min(1),
})
export type SoulAppWorkspaceType = z.infer<typeof soulAppWorkspaceTypeSchema>

export const soulAppArtifactTypeSchema = zod.object({
  description: zod.string().min(1),
  id: soulAppIdSchema,
  name: zod.string().min(1),
  previewRef: zod.string().min(1).optional(),
  reviewPolicyRef: zod.string().min(1).optional(),
  schemaRef: zod.string().min(1),
  schemaSha256: zod.string().regex(/^[a-f0-9]{64}$/).optional(),
  version: soulAppVersionSchema,
})
export type SoulAppArtifactType = z.infer<typeof soulAppArtifactTypeSchema>

export const soulAppUiContributionKindSchema = zod.enum([
  'route',
  'panel',
  'workspace-widget',
  'artifact-preview',
  'review-panel',
])
export type SoulAppUiContributionKind = z.infer<typeof soulAppUiContributionKindSchema>

export const soulAppUiRouteSchema = zod.object({
  entry: zod.string().min(1),
  id: soulAppIdSchema,
  label: zod.string().min(1),
  path: zod.string().regex(ROUTE_RE, 'route path must be an absolute local route'),
})
export type SoulAppUiRoute = z.infer<typeof soulAppUiRouteSchema>

export const soulAppUiSlotSchema = zod.object({
  entry: zod.string().min(1),
  id: soulAppIdSchema,
  label: zod.string().min(1),
  slot: soulAppUiContributionKindSchema.exclude(['route']),
  target: soulAppIdSchema.optional(),
})
export type SoulAppUiSlot = z.infer<typeof soulAppUiSlotSchema>

export const soulAppUiSchema = zod.object({
  artifactPreviews: zod.array(soulAppUiSlotSchema).readonly(),
  panels: zod.array(soulAppUiSlotSchema).readonly(),
  reviewPanels: zod.array(soulAppUiSlotSchema).readonly(),
  routes: zod.array(soulAppUiRouteSchema).readonly(),
  workspaceWidgets: zod.array(soulAppUiSlotSchema).readonly().optional(),
})
export type SoulAppUi = z.infer<typeof soulAppUiSchema>

export const soulAppApiSchema = zod.object({
  entry: zod.string().min(1).optional(),
  localService: zod.object({
    baseUrl: zod.string().url().optional(),
    command: zod.array(zod.string().min(1)).min(1).readonly().optional(),
    cwd: zod.string().min(1).optional(),
    healthPath: zod.string().regex(ROUTE_RE, 'health path must be an absolute local route'),
  }).refine(service => service.baseUrl || service.command, {
    message: 'localService must declare baseUrl or command',
  }).optional(),
  routePrefix: zod.string().regex(API_PREFIX_RE, 'API route prefix must live under /api/local/apps/<appId>').optional(),
})
export type SoulAppApi = z.infer<typeof soulAppApiSchema>

export const soulAppStorageMigrationSchema = zod.object({
  id: soulAppIdSchema,
  path: zod.string().min(1),
  sha256: zod.string().regex(/^[a-f0-9]{64}$/).optional(),
})
export type SoulAppStorageMigration = z.infer<typeof soulAppStorageMigrationSchema>

export const soulAppStorageSchema = zod.object({
  migrations: zod.array(soulAppStorageMigrationSchema).readonly(),
  namespace: soulAppIdSchema,
})
export type SoulAppStorage = z.infer<typeof soulAppStorageSchema>

export const soulAppConnectorAccessSchema = zod.enum(['read', 'write'])
export type SoulAppConnectorAccess = z.infer<typeof soulAppConnectorAccessSchema>

export const soulAppConnectorNeedSchema = zod.object({
  access: zod.array(soulAppConnectorAccessSchema).min(1).readonly(),
  id: soulAppIdSchema,
  reason: zod.string().min(1),
  scopes: zod.array(zod.string().min(1)).readonly(),
})
export type SoulAppConnectorNeed = z.infer<typeof soulAppConnectorNeedSchema>

export const soulAppConnectorsSchema = zod.object({
  optional: zod.array(soulAppConnectorNeedSchema).readonly(),
  required: zod.array(soulAppConnectorNeedSchema).readonly(),
})
export type SoulAppConnectors = z.infer<typeof soulAppConnectorsSchema>

export const soulAppMemoryAdmissionPolicySchema = zod.enum(['manual-review', 'host-policy', 'disabled'])
export type SoulAppMemoryAdmissionPolicy = z.infer<typeof soulAppMemoryAdmissionPolicySchema>

export const soulAppMemorySchema = zod.object({
  admissionPolicy: soulAppMemoryAdmissionPolicySchema,
  namespace: soulAppIdSchema,
})
export type SoulAppMemory = z.infer<typeof soulAppMemorySchema>

export const soulAppPermissionKindSchema = zod.enum(['storage', 'connector', 'artifact', 'review', 'memory', 'ui', 'api'])
export type SoulAppPermissionKind = z.infer<typeof soulAppPermissionKindSchema>

export const soulAppPermissionActionSchema = zod.enum(['read', 'write', 'create', 'propose', 'mount', 'serve'])
export type SoulAppPermissionAction = z.infer<typeof soulAppPermissionActionSchema>

export const soulAppPermissionSchema = zod.object({
  action: soulAppPermissionActionSchema,
  kind: soulAppPermissionKindSchema,
  reason: zod.string().min(1),
  target: zod.string().min(1),
})
export type SoulAppPermission = z.infer<typeof soulAppPermissionSchema>

export const soulAppHealthcheckKindSchema = zod.enum(['protocol-handler', 'http'])
export type SoulAppHealthcheckKind = z.infer<typeof soulAppHealthcheckKindSchema>

export const soulAppHealthcheckSchema = zod.object({
  kind: soulAppHealthcheckKindSchema,
  ref: zod.string().min(1),
  timeoutMs: zod.number().int().positive().max(60_000),
})
export type SoulAppHealthcheck = z.infer<typeof soulAppHealthcheckSchema>

export const soulAppExportsSchema = zod.object({
  artifact: zod.string().min(1).optional(),
  connector: zod.string().min(1).optional(),
  event: zod.string().min(1).optional(),
  lifecycle: zod.string().min(1).optional(),
  review: zod.string().min(1).optional(),
  runtime: zod.string().min(1).optional(),
  ui: zod.string().min(1).optional(),
})
export type SoulAppExports = z.infer<typeof soulAppExportsSchema>

export const soulAppManifestSchema = zod.object({
  api: soulAppApiSchema,
  artifactTypes: zod.array(soulAppArtifactTypeSchema).min(1).readonly(),
  capabilities: zod.array(soulAppCapabilitySchema).min(1).readonly(),
  compatibility: soulAppCompatibilitySchema,
  connectors: soulAppConnectorsSchema,
  description: zod.string().min(1),
  exports: soulAppExportsSchema,
  healthcheck: soulAppHealthcheckSchema,
  id: soulAppIdSchema,
  memory: soulAppMemorySchema,
  modes: zod.object({
    hostMounted: soulAppModeSchema,
    standalone: soulAppModeSchema,
  }),
  name: zod.string().min(1),
  pack: zod.object({
    refs: zod.array(soulAppPackRefSchema).min(1).readonly(),
  }),
  permissions: zod.array(soulAppPermissionSchema).min(1).readonly(),
  protocol: soulAppProtocolSchema,
  soul: soulAppSoulSchema,
  storage: soulAppStorageSchema,
  ui: soulAppUiSchema,
  version: soulAppVersionSchema,
  workspaceTypes: zod.array(soulAppWorkspaceTypeSchema).min(1).readonly(),
}).superRefine((manifest, ctx) => {
  if (!manifest.modes.standalone.supported && !manifest.modes.hostMounted.supported) {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'at least one mode must be supported',
      path: ['modes'],
    })
  }

  ensureUniqueIds(ctx, manifest.capabilities, ['capabilities'])
  ensureUniqueIds(ctx, manifest.workspaceTypes, ['workspaceTypes'])
  ensureUniqueIds(ctx, manifest.artifactTypes, ['artifactTypes'])
  ensureUniqueIds(ctx, manifest.pack.refs, ['pack', 'refs'])
  ensureUniqueIds(ctx, [
    ...manifest.ui.routes,
    ...manifest.ui.panels,
    ...manifest.ui.artifactPreviews,
    ...manifest.ui.reviewPanels,
    ...(manifest.ui.workspaceWidgets ?? []),
  ], ['ui'])
})
export type SoulAppManifest = z.infer<typeof soulAppManifestSchema>

export const soulAppManifestIssueCodeSchema = zod.enum([
  'invalid_manifest',
  'unsupported_protocol',
  'incompatible_host_version',
  'missing_required_connector',
  'invalid_storage_namespace',
  'unsafe_local_service_url',
  'unsafe_permission_request',
  'missing_ui_api_entry',
  'invalid_artifact_schema',
  'namespace_collision',
])
export type SoulAppManifestIssueCode = z.infer<typeof soulAppManifestIssueCodeSchema>

export const soulAppManifestIssueSeveritySchema = zod.enum(['warning', 'error'])
export type SoulAppManifestIssueSeverity = z.infer<typeof soulAppManifestIssueSeveritySchema>

export const soulAppManifestValidationIssueSchema = zod.object({
  code: soulAppManifestIssueCodeSchema,
  message: zod.string().min(1),
  path: zod.string().min(1).optional(),
  severity: soulAppManifestIssueSeveritySchema,
})
export type SoulAppManifestValidationIssue = z.infer<typeof soulAppManifestValidationIssueSchema>

export const soulAppManifestValidationStatusSchema = zod.enum(['valid', 'invalid'])
export type SoulAppManifestValidationStatus = z.infer<typeof soulAppManifestValidationStatusSchema>

export interface SoulAppManifestValidationResult {
  issues: SoulAppManifestValidationIssue[]
  manifest?: SoulAppManifest
  status: SoulAppManifestValidationStatus
}

export interface SoulAppManifestValidationOptions {
  availableConnectorIds?: readonly string[]
  existingStorageNamespaces?: readonly string[]
  hostVersion?: string
  supportedProtocols?: readonly string[]
}

export interface SoulAppManifestParseOk {
  manifest: SoulAppManifest
  status: 'ok'
}

export interface SoulAppManifestParseMalformed {
  error: string
  issues: SoulAppManifestValidationIssue[]
  status: 'malformed'
}

export type SoulAppManifestParseResult = SoulAppManifestParseOk | SoulAppManifestParseMalformed

export function validateSoulAppManifest(
  input: unknown,
  options: SoulAppManifestValidationOptions = {},
): SoulAppManifestValidationResult {
  const protocolIssue = unsupportedProtocolIssue(input, options.supportedProtocols ?? [SOUL_APP_PROTOCOL])
  if (protocolIssue) {
    return { issues: [protocolIssue], status: 'invalid' }
  }

  const parsed = soulAppManifestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map(issue => ({
        code: codeForZodIssue(issue),
        message: issue.message,
        path: issue.path.map(String).join('.') || '<root>',
        severity: 'error',
      })),
      status: 'invalid',
    }
  }

  const manifest = parsed.data
  const issues: SoulAppManifestValidationIssue[] = []

  if (options.hostVersion && !hostVersionSatisfies(options.hostVersion, manifest.compatibility.host)) {
    issues.push({
      code: 'incompatible_host_version',
      message: `Host ${options.hostVersion} does not satisfy ${manifest.compatibility.host.minVersion}${manifest.compatibility.host.maxVersion ? `..${manifest.compatibility.host.maxVersion}` : '+'}.`,
      path: 'compatibility.host',
      severity: 'error',
    })
  }

  if (manifest.storage.namespace !== manifest.id) {
    issues.push({
      code: 'invalid_storage_namespace',
      message: 'storage.namespace must match the Soul App id for v1 discovery.',
      path: 'storage.namespace',
      severity: 'error',
    })
  }

  if ((options.existingStorageNamespaces ?? []).includes(manifest.storage.namespace)) {
    issues.push({
      code: 'namespace_collision',
      message: `storage namespace already exists: ${manifest.storage.namespace}`,
      path: 'storage.namespace',
      severity: 'error',
    })
  }

  const availableConnectors = new Set(options.availableConnectorIds ?? [])
  if (availableConnectors.size > 0) {
    for (const connector of manifest.connectors.required) {
      if (!availableConnectors.has(connector.id)) {
        issues.push({
          code: 'missing_required_connector',
          message: `required connector is not available: ${connector.id}`,
          path: `connectors.required.${connector.id}`,
          severity: 'error',
        })
      }
    }
  }

  if (manifest.modes.hostMounted.supported && !hasUiOrApiEntry(manifest)) {
    issues.push({
      code: 'missing_ui_api_entry',
      message: 'host-mounted Soul Apps must declare at least one UI contribution or API entry.',
      path: 'ui',
      severity: 'error',
    })
  }

  if (manifest.api.entry && manifest.api.routePrefix !== `/api/local/apps/${manifest.id}`) {
    issues.push({
      code: 'missing_ui_api_entry',
      message: `api.routePrefix must equal /api/local/apps/${manifest.id}.`,
      path: 'api.routePrefix',
      severity: 'error',
    })
  }

  if (manifest.api.localService?.baseUrl && !isLoopbackMountedServiceUrl(manifest.api.localService.baseUrl)) {
    issues.push({
      code: 'unsafe_local_service_url',
      message: 'api.localService.baseUrl must use loopback HTTP for mounted local services.',
      path: 'api.localService.baseUrl',
      severity: 'error',
    })
  }

  for (const permission of manifest.permissions) {
    const message = unsafePermissionMessage(permission, manifest)
    if (message) {
      issues.push({
        code: 'unsafe_permission_request',
        message,
        path: `permissions.${permission.kind}.${permission.target}`,
        severity: 'error',
      })
    }
  }

  return {
    issues,
    manifest,
    status: issues.some(issue => issue.severity === 'error') ? 'invalid' : 'valid',
  }
}

export function parseSoulAppManifestJson(
  content: string,
  options: SoulAppManifestValidationOptions = {},
): SoulAppManifestParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  }
  catch (err) {
    return {
      error: `Soul App manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      issues: [{
        code: 'invalid_manifest',
        message: 'Soul App manifest is not valid JSON.',
        severity: 'error',
      }],
      status: 'malformed',
    }
  }

  const result = validateSoulAppManifest(raw, options)
  if (result.status === 'valid' && result.manifest)
    return { manifest: result.manifest, status: 'ok' }

  return {
    error: result.issues.map(issue => `${issue.path ?? '<root>'}: ${issue.message}`).join('; '),
    issues: result.issues,
    status: 'malformed',
  }
}

export function isLoopbackMountedServiceUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return false
  }
  if (url.protocol !== 'http:')
    return false
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]')
    return true
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts[0] !== '127')
    return false
  return parts.slice(1).every(part => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
}

function ensureUniqueIds(
  ctx: zod.RefinementCtx,
  items: readonly { id: string }[],
  path: (number | string)[],
): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        message: `duplicate id "${item.id}"`,
        path,
      })
    }
    seen.add(item.id)
  }
}

function unsupportedProtocolIssue(input: unknown, supportedProtocols: readonly string[]): SoulAppManifestValidationIssue | null {
  if (typeof input !== 'object' || input === null)
    return null
  const value = (input as Record<string, unknown>).protocol
  if (typeof value !== 'string' || supportedProtocols.includes(value))
    return null
  return {
    code: 'unsupported_protocol',
    message: `unsupported Soul App protocol: ${value}`,
    path: 'protocol',
    severity: 'error',
  }
}

function codeForZodIssue(issue: z.ZodIssue): SoulAppManifestIssueCode {
  const [root] = issue.path
  if (root === 'artifactTypes')
    return 'invalid_artifact_schema'
  if (root === 'storage')
    return 'invalid_storage_namespace'
  if (root === 'permissions')
    return 'unsafe_permission_request'
  if (root === 'api' || root === 'ui')
    return 'missing_ui_api_entry'
  return 'invalid_manifest'
}

function hostVersionSatisfies(hostVersion: string, host: SoulAppCompatibility['host']): boolean {
  if (!isSemver(hostVersion))
    return false
  if (compareSemver(hostVersion, host.minVersion) < 0)
    return false
  return host.maxVersion ? compareSemver(hostVersion, host.maxVersion) <= 0 : true
}

function isSemver(value: string): boolean {
  return SEMVER_RE.test(value)
}

function compareSemver(left: string, right: string): number {
  const a = semverParts(left)
  const b = semverParts(right)
  for (let i = 0; i < 3; i++) {
    const diff = a[i]! - b[i]!
    if (diff !== 0)
      return diff
  }
  return 0
}

function semverParts(value: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = value.split('.')
  return [Number(major), Number(minor), Number(patch)]
}

function hasUiOrApiEntry(manifest: SoulAppManifest): boolean {
  return Boolean(
    manifest.api.entry
    || manifest.ui.routes.length > 0
    || manifest.ui.panels.length > 0
    || manifest.ui.artifactPreviews.length > 0
    || manifest.ui.reviewPanels.length > 0
    || (manifest.ui.workspaceWidgets?.length ?? 0) > 0,
  )
}

function unsafePermissionMessage(permission: SoulAppPermission, manifest: SoulAppManifest): string | null {
  const target = permission.target.toLowerCase()
  if (target === '*' || target === 'global' || target.includes('secret') || target.includes('vault') || target.includes('host-db'))
    return `unsafe permission target: ${permission.target}`
  if (permission.kind === 'storage' && permission.target !== manifest.storage.namespace)
    return `storage permission target must match namespace ${manifest.storage.namespace}`
  if (permission.kind === 'api' && manifest.api.routePrefix && permission.target !== manifest.api.routePrefix)
    return `api permission target must match route prefix ${manifest.api.routePrefix}`
  return null
}
