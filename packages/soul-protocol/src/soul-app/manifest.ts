import type { z } from 'zod'

import { z as zod } from 'zod'

export const SOUL_APP_PROTOCOL = 'soul-app/v1' as const

const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const ROUTE_RE = /^\/[a-z0-9][a-z0-9/_:.-]*$/
const API_PREFIX_RE = /^\/api\/apps\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z0-9/_:.-]*)?$/
const REQUIRED_PERMISSION_RE = /^(storage|connector|ui|api|search):(read|write|create|propose|mount|serve):[^:\s].*$/

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
  artifactTypes: zod.array(soulAppIdSchema).min(1).readonly().optional(),
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
  artifactTypes: zod.array(soulAppIdSchema).min(1).readonly().optional(),
  defaultCapabilityIds: zod.array(soulAppIdSchema).readonly().optional(),
  description: zod.string().min(1),
  id: soulAppIdSchema,
  name: zod.string().min(1),
})
export type SoulAppWorkspaceType = z.infer<typeof soulAppWorkspaceTypeSchema>

export interface SoulAppArtifactType {
  description: string
  id: string
  name: string
  previewRef?: string
  reviewPolicyRef?: string
  schemaRef: string
  schemaSha256?: string
  version: string
}

export const soulAppUiContributionKindSchema = zod.enum([
  'route',
  'panel',
  'workspace-widget',
  'artifact-preview',
])
export type SoulAppUiContributionKind = z.infer<typeof soulAppUiContributionKindSchema>

export const soulAppMountedSurfaceRendererSchema = zod.enum(['host-descriptor', 'micro-app'])
export type SoulAppMountedSurfaceRenderer = z.infer<typeof soulAppMountedSurfaceRendererSchema>

export const soulAppMountedSurfaceScopeSchema = zod.enum(['app', 'workspace', 'session', 'artifact'])
export type SoulAppMountedSurfaceScope = z.infer<typeof soulAppMountedSurfaceScopeSchema>

export const soulAppRequiredPermissionSchema = zod.string().regex(REQUIRED_PERMISSION_RE, 'requiredPermissions must use kind:action:target')
export type SoulAppRequiredPermission = z.infer<typeof soulAppRequiredPermissionSchema>

export const soulAppEngineTargetSchema = zod.enum(['codex', 'claude-code'])
export type SoulAppEngineTarget = z.infer<typeof soulAppEngineTargetSchema>

export const soulAppEngineAssetSourceSchema = zod.string().min(1)
export type SoulAppEngineAssetSource = z.infer<typeof soulAppEngineAssetSourceSchema>

export const soulAppWorkspaceEngineAssetsSchema = zod.object({
  source: soulAppEngineAssetSourceSchema,
})
export type SoulAppWorkspaceEngineAssets = z.infer<typeof soulAppWorkspaceEngineAssetsSchema>

export const soulAppSkillEngineAssetsSchema = zod.object({
  source: soulAppEngineAssetSourceSchema,
  targets: zod.array(soulAppEngineTargetSchema).min(1).readonly(),
})
export type SoulAppSkillEngineAssets = z.infer<typeof soulAppSkillEngineAssetsSchema>

export const soulAppMcpClientEngineAssetsSchema = zod.object({
  source: soulAppEngineAssetSourceSchema,
  target: soulAppEngineTargetSchema,
})
export type SoulAppMcpClientEngineAssets = z.infer<typeof soulAppMcpClientEngineAssetsSchema>

export const soulAppMcpServerTransportSchema = zod.enum(['stdio', 'http'])
export type SoulAppMcpServerTransport = z.infer<typeof soulAppMcpServerTransportSchema>

export const soulAppMcpServerEngineAssetsSchema = zod.object({
  id: soulAppIdSchema,
  package: zod.string().min(1),
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
  transport: soulAppMcpServerTransportSchema,
})
export type SoulAppMcpServerEngineAssets = z.infer<typeof soulAppMcpServerEngineAssetsSchema>

export const soulAppEngineAssetsSchema = zod.object({
  mcpClients: zod.array(soulAppMcpClientEngineAssetsSchema).readonly().optional(),
  mcpServers: zod.array(soulAppMcpServerEngineAssetsSchema).readonly().optional(),
  skills: soulAppSkillEngineAssetsSchema.optional(),
  workspace: soulAppWorkspaceEngineAssetsSchema,
})
export type SoulAppEngineAssets = z.infer<typeof soulAppEngineAssetsSchema>

export const soulAppProjectionKindSchema = zod.enum(['workspace-file', 'native-skill', 'mcp-client'])
export type SoulAppProjectionKind = z.infer<typeof soulAppProjectionKindSchema>

export const soulAppProjectionReceiptEntrySchema = zod.object({
  appId: soulAppIdSchema,
  engineTarget: soulAppEngineTargetSchema.optional(),
  generatedAt: zod.string().min(1),
  kind: soulAppProjectionKindSchema,
  sha256: zod.string().regex(/^[a-f0-9]{64}$/),
  source: zod.string().min(1),
  target: zod.string().min(1),
})
export type SoulAppProjectionReceiptEntry = z.infer<typeof soulAppProjectionReceiptEntrySchema>

export const soulAppProjectionReceiptSchema = zod.object({
  appId: soulAppIdSchema,
  generatedAt: zod.string().min(1),
  projections: zod.array(soulAppProjectionReceiptEntrySchema).readonly(),
  version: zod.literal(1),
})
export type SoulAppProjectionReceipt = z.infer<typeof soulAppProjectionReceiptSchema>

export const soulAppMountedSurfaceSchema = zod.object({
  entry: zod.string().regex(ROUTE_RE, 'surface entry must be an absolute mounted service route'),
  renderer: soulAppMountedSurfaceRendererSchema,
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
  scope: soulAppMountedSurfaceScopeSchema,
})
export type SoulAppMountedSurface = z.infer<typeof soulAppMountedSurfaceSchema>

export const soulAppUiRouteSchema = zod.object({
  entry: zod.string().min(1),
  id: soulAppIdSchema,
  label: zod.string().min(1),
  path: zod.string().regex(ROUTE_RE, 'route path must be an absolute local route'),
  surface: soulAppMountedSurfaceSchema.optional(),
})
export type SoulAppUiRoute = z.infer<typeof soulAppUiRouteSchema>

export const soulAppUiSlotSchema = zod.object({
  entry: zod.string().min(1),
  id: soulAppIdSchema,
  label: zod.string().min(1),
  slot: soulAppUiContributionKindSchema.exclude(['route']),
  surface: soulAppMountedSurfaceSchema.optional(),
  target: soulAppIdSchema.optional(),
})
export type SoulAppUiSlot = z.infer<typeof soulAppUiSlotSchema>

export const soulAppWorkbenchActionRoleSchema = zod.enum(['primary', 'action', 'panel-toggle', 'refresh', 'configure'])
export type SoulAppWorkbenchActionRole = z.infer<typeof soulAppWorkbenchActionRoleSchema>

export const soulAppWorkbenchActionSchema = zod.object({
  id: soulAppIdSchema,
  label: zod.string().min(1),
  protocolAction: zod.string({ required_error: 'protocolAction is required' }).min(1),
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
  role: soulAppWorkbenchActionRoleSchema,
})
export type SoulAppWorkbenchAction = z.infer<typeof soulAppWorkbenchActionSchema>

export const soulAppWorkbenchSearchSchema = zod.object({
  id: soulAppIdSchema,
  label: zod.string().min(1),
  placeholder: zod.string().min(1),
  protocolProvider: zod.string({ required_error: 'protocolProvider is required' }).min(1),
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
})
export type SoulAppWorkbenchSearch = z.infer<typeof soulAppWorkbenchSearchSchema>

export const soulAppWorkbenchConfigurationSchema = zod.object({
  id: soulAppIdSchema,
  label: zod.string().min(1),
  protocolAction: zod.string({ required_error: 'protocolAction is required' }).min(1),
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
})
export type SoulAppWorkbenchConfiguration = z.infer<typeof soulAppWorkbenchConfigurationSchema>

export const soulAppWorkbenchSchema = zod.object({
  actions: zod.array(soulAppWorkbenchActionSchema).readonly().optional(),
  configuration: soulAppWorkbenchConfigurationSchema.optional(),
  primaryAction: soulAppWorkbenchActionSchema.optional(),
  search: soulAppWorkbenchSearchSchema.optional(),
}).strict().superRefine((workbench, ctx) => {
  if (workbench.primaryAction && workbench.primaryAction.role !== 'primary') {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'primaryAction role must be primary',
      path: ['primaryAction', 'role'],
    })
  }
})
export type SoulAppWorkbench = z.infer<typeof soulAppWorkbenchSchema>

export const soulAppWorkspaceCwdSourceSchema = zod.enum(['host-workspace-root', 'app-workspace-path', 'protocol-resolver'])
export type SoulAppWorkspaceCwdSource = z.infer<typeof soulAppWorkspaceCwdSourceSchema>

export const soulAppWorkspaceCwdDescriptorSchema = zod.object({
  protocolProvider: zod.string().min(1).optional(),
  source: soulAppWorkspaceCwdSourceSchema,
  subpath: zod.string().min(1).optional(),
}).superRefine((cwd, ctx) => {
  if (cwd.source === 'app-workspace-path' && !cwd.subpath) {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'app-workspace-path cwd must declare subpath',
      path: ['subpath'],
    })
  }
  if (cwd.source === 'protocol-resolver' && !cwd.protocolProvider) {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'protocol-resolver cwd must declare protocolProvider',
      path: ['protocolProvider'],
    })
  }
  if (cwd.source === 'host-workspace-root' && (cwd.subpath || cwd.protocolProvider)) {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'host-workspace-root cwd must not declare subpath or protocolProvider',
      path: ['source'],
    })
  }
})
export type SoulAppWorkspaceCwdDescriptor = z.infer<typeof soulAppWorkspaceCwdDescriptorSchema>

export const soulAppWorkspaceTerminalContextSchema = zod.object({
  cwd: soulAppWorkspaceCwdDescriptorSchema,
  id: soulAppIdSchema,
  label: zod.string().min(1),
  requiredPermissions: zod.array(soulAppRequiredPermissionSchema).readonly().optional(),
})
export type SoulAppWorkspaceTerminalContext = z.infer<typeof soulAppWorkspaceTerminalContextSchema>

export const soulAppWorkspaceContextSchema = zod.object({
  terminal: soulAppWorkspaceTerminalContextSchema.optional(),
})
export type SoulAppWorkspaceContext = z.infer<typeof soulAppWorkspaceContextSchema>

export const soulAppUiSchema = zod.object({
  artifactPreviews: zod.array(soulAppUiSlotSchema).readonly(),
  panels: zod.array(soulAppUiSlotSchema).readonly(),
  routes: zod.array(soulAppUiRouteSchema).readonly(),
  workbench: soulAppWorkbenchSchema.optional(),
  workspaceContext: soulAppWorkspaceContextSchema.optional(),
  workspaceWidgets: zod.array(soulAppUiSlotSchema).readonly().optional(),
}).strict()
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
  routePrefix: zod.string().regex(API_PREFIX_RE, 'API route prefix must live under /api/apps/<appId>').optional(),
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

export const soulAppPermissionKindSchema = zod.enum(['storage', 'connector', 'ui', 'api', 'search'])
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
  runtime: zod.string().min(1).optional(),
  ui: zod.string().min(1).optional(),
})
export type SoulAppExports = z.infer<typeof soulAppExportsSchema>

export const soulAppManifestSchema = zod.object({
  api: soulAppApiSchema,
  capabilities: zod.array(soulAppCapabilitySchema).min(1).readonly(),
  compatibility: soulAppCompatibilitySchema,
  connectors: soulAppConnectorsSchema,
  description: zod.string().min(1),
  engineAssets: soulAppEngineAssetsSchema,
  exports: soulAppExportsSchema,
  healthcheck: soulAppHealthcheckSchema,
  id: soulAppIdSchema,
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
  ensureUniqueIds(ctx, manifest.pack.refs, ['pack', 'refs'])
  ensureUniqueIds(ctx, [
    ...manifest.ui.routes,
    ...manifest.ui.panels,
    ...manifest.ui.artifactPreviews,
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
  'unsafe_ui_surface',
  'unsafe_engine_asset_source',
  'unsafe_mcp_server_package',
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
