import type { z } from 'zod'
import type { SoulDescriptorV1 } from '..'
import type {
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulAppPermission,
} from './manifest'

import path from 'node:path'
import { z as zod } from 'zod'

const verticalSoulStatusSchema = zod.enum(['available', 'coming_soon'])
type VerticalSoulStatus = zod.infer<typeof verticalSoulStatusSchema>

const projectedCapabilitySchema = zod.object({
  description: zod.string().min(1),
  id: zod.string().min(1),
  inputHints: zod.array(zod.string().min(1)).readonly(),
  name: zod.string().min(1),
  outputKind: zod.string().min(1),
  promptRef: zod.string().min(1),
  soulId: zod.string().min(1),
})
type ProjectedCapability = zod.infer<typeof projectedCapabilitySchema>

const verticalSoulSchema = zod.object({
  defaultCapabilities: zod.array(zod.string().min(1)).readonly(),
  description: zod.string().min(1),
  id: zod.string().min(1),
  name: zod.string().min(1),
  status: verticalSoulStatusSchema,
})
type VerticalSoul = zod.infer<typeof verticalSoulSchema>

export const soulAppRegistryStatusSchema = zod.enum(['installed', 'enabled', 'disabled', 'error'])
export type SoulAppRegistryStatus = z.infer<typeof soulAppRegistryStatusSchema>

export const soulAppInstallSourceKindSchema = zod.enum(['descriptor-path', 'inline'])
export type SoulAppInstallSourceKind = z.infer<typeof soulAppInstallSourceKindSchema>

export const soulAppHealthStatusSchema = zod.enum(['unknown', 'pass', 'warn', 'fail'])
export type SoulAppHealthStatus = z.infer<typeof soulAppHealthStatusSchema>

export const soulDescriptorValidationIssueCodeSchema = zod.enum([
  'invalid_descriptor',
  'unsupported_protocol',
  'incompatible_host_version',
  'unsafe_local_service_url',
  'unsafe_engine_asset_source',
  'missing_ui_api_entry',
  'namespace_collision',
])
export type SoulDescriptorValidationIssueCode = z.infer<typeof soulDescriptorValidationIssueCodeSchema>

export const soulDescriptorValidationIssueSeveritySchema = zod.enum(['warning', 'error'])
export type SoulDescriptorValidationIssueSeverity = z.infer<typeof soulDescriptorValidationIssueSeveritySchema>

export const soulDescriptorValidationIssueSchema = zod.object({
  code: soulDescriptorValidationIssueCodeSchema,
  message: zod.string().min(1),
  path: zod.string().min(1).optional(),
  severity: soulDescriptorValidationIssueSeveritySchema,
})
export type SoulDescriptorValidationIssue = z.infer<typeof soulDescriptorValidationIssueSchema>

const soulAppPermissionSchema = zod.object({
  action: zod.enum(['read', 'write', 'create', 'propose', 'mount', 'serve']),
  kind: zod.enum(['storage', 'connector', 'ui', 'api', 'search']),
  reason: zod.string().min(1),
  target: zod.string().min(1),
})

const hostedSoulAppApiSchema = zod.object({
  localService: zod.object({
    command: zod.array(zod.string().min(1)).min(1).readonly(),
    healthPath: zod.string().min(1),
  }).nullable(),
  routePrefix: zod.string().min(1).nullable(),
})
export type HostedSoulAppApi = z.infer<typeof hostedSoulAppApiSchema>

export const mountedWorkbenchSchema = zod.object({
  entry: zod.literal('/micro-app/workbench'),
  id: zod.literal('workbench'),
  path: zod.literal('/workbench'),
  renderer: zod.literal('micro-app'),
  scope: zod.literal('app'),
})
export type MountedWorkbench = z.infer<typeof mountedWorkbenchSchema>

export const hostedSoulAppSchema = zod.object({
  api: hostedSoulAppApiSchema,
  appId: zod.string().min(1),
  description: zod.string().min(1),
  descriptor: zod.custom<SoulDescriptorV1>(),
  descriptorDigest: zod.string().min(1),
  engineAssets: zod.custom<SoulAppEngineAssets>(),
  healthMessage: zod.string().nullable(),
  healthStatus: soulAppHealthStatusSchema,
  mountedWorkbench: mountedWorkbenchSchema,
  name: zod.string().min(1),
  permissions: zod.array(soulAppPermissionSchema).readonly(),
  projectedCapabilities: zod.array(projectedCapabilitySchema).readonly(),
  projectedSoul: verticalSoulSchema,
  soulId: zod.string().min(1),
  sourceKind: soulAppInstallSourceKindSchema,
  sourceRef: zod.string().min(1),
  status: soulAppRegistryStatusSchema,
  validationIssues: zod.array(soulDescriptorValidationIssueSchema).readonly(),
  version: zod.string().min(1),
})
export type HostedSoulApp = z.infer<typeof hostedSoulAppSchema>

export function namespaceSoulAppCapabilityId(appId: string, capabilityId: string): string {
  return `${appId}.${capabilityId}`
}

export function parseNamespacedSoulAppCapabilityId(id: string): { appId: string, capabilityId: string } | null {
  const index = id.indexOf('.')
  if (index <= 0 || index >= id.length - 1)
    return null
  return { appId: id.slice(0, index), capabilityId: id.slice(index + 1) }
}

export function projectSoulAppSoul(descriptor: SoulDescriptorV1, status: VerticalSoulStatus = 'available'): VerticalSoul {
  const identity = descriptorIdentity(descriptor)
  return {
    defaultCapabilities: projectSoulAppDefaultCapabilities(descriptor),
    description: identity.description,
    id: identity.appId,
    name: identity.name,
    status,
  }
}

export function projectSoulAppDefaultCapabilities(descriptor: SoulDescriptorV1): string[] {
  const identity = descriptorIdentity(descriptor)
  return descriptor.capabilities
    .map(capability => capabilityRecord(capability))
    .map(capability => namespaceSoulAppCapabilityId(identity.appId, capability.id))
}

export function projectSoulAppCapability(descriptor: SoulDescriptorV1, capability: unknown): ProjectedCapability {
  const identity = descriptorIdentity(descriptor)
  const record = capabilityRecord(capability)
  return {
    description: record.description,
    id: namespaceSoulAppCapabilityId(identity.appId, record.id),
    inputHints: ['Workspace locator is owned by the Soul App.'],
    name: record.name,
    outputKind: 'session',
    promptRef: record.promptRef,
    soulId: identity.appId,
  }
}

export function projectSoulAppCapabilities(descriptor: SoulDescriptorV1): ProjectedCapability[] {
  return descriptor.capabilities.map(capability => projectSoulAppCapability(descriptor, capability))
}

export function buildHostedSoulApp(input: {
  descriptor: SoulDescriptorV1
  descriptorDigest: string
  healthMessage?: string | null
  healthStatus?: SoulAppHealthStatus
  sourceKind: SoulAppInstallSourceKind
  sourceRef: string
  status: SoulAppRegistryStatus
  validationIssues?: readonly SoulDescriptorValidationIssue[]
}): HostedSoulApp {
  const identity = descriptorIdentity(input.descriptor)
  return hostedSoulAppSchema.parse({
    api: apiForDescriptor(input.descriptor),
    appId: identity.appId,
    description: identity.description,
    descriptor: input.descriptor,
    descriptorDigest: input.descriptorDigest,
    engineAssets: engineAssetsForDescriptor(input.descriptor),
    healthMessage: input.healthMessage ?? null,
    healthStatus: input.healthStatus ?? 'unknown',
    mountedWorkbench: {
      entry: '/micro-app/workbench',
      id: 'workbench',
      path: '/workbench',
      renderer: 'micro-app',
      scope: 'app',
    },
    name: identity.name,
    permissions: permissionsForDescriptor(input.descriptor),
    projectedCapabilities: projectSoulAppCapabilities(input.descriptor),
    projectedSoul: projectSoulAppSoul(input.descriptor, input.status === 'enabled' ? 'available' : 'coming_soon'),
    soulId: identity.soulId,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    status: input.status,
    validationIssues: input.validationIssues ?? [],
    version: identity.version,
  })
}

function descriptorIdentity(descriptor: SoulDescriptorV1): {
  appId: string
  description: string
  name: string
  soulId: string
  version: string
} {
  return {
    appId: String(descriptor.identity.appId),
    description: String(descriptor.identity.description ?? descriptor.identity.name),
    name: String(descriptor.identity.name),
    soulId: String(descriptor.identity.soulId),
    version: String(descriptor.identity.version),
  }
}

function capabilityRecord(capability: unknown): {
  description: string
  id: string
  name: string
  promptRef: string
} {
  const record = capability && typeof capability === 'object' ? capability as Record<string, unknown> : {}
  const id = typeof record.id === 'string' && record.id.trim().length > 0 ? record.id : 'default'
  const name = typeof record.name === 'string' && record.name.trim().length > 0 ? record.name : id
  const prompt = record.prompt && typeof record.prompt === 'object' ? record.prompt as Record<string, unknown> : {}
  return {
    description: typeof record.purpose === 'string' && record.purpose.trim().length > 0 ? record.purpose : name,
    id,
    name,
    promptRef: typeof prompt.ref === 'string' && prompt.ref.trim().length > 0 ? prompt.ref : `dist/product/capabilities/${id}/prompt.md`,
  }
}

function apiForDescriptor(descriptor: SoulDescriptorV1): HostedSoulAppApi {
  const identity = descriptorIdentity(descriptor)
  if (!descriptor.api) {
    return {
      localService: null,
      routePrefix: null,
    }
  }
  return {
    localService: {
      command: ['bun', descriptor.api.entry.replace(/^dist\//, '')],
      healthPath: '/health',
    },
    routePrefix: descriptor.api.mount ?? `/api/apps/${identity.appId}`,
  }
}

function permissionsForDescriptor(descriptor: SoulDescriptorV1): SoulAppPermission[] {
  const identity = descriptorIdentity(descriptor)
  const permissions: SoulAppPermission[] = [{
    action: 'mount',
    kind: 'ui',
    reason: 'Mount the descriptor-declared Soul workbench.',
    target: `${identity.appId}-workbench`,
  }]
  if (descriptor.api) {
    permissions.push({
      action: 'serve',
      kind: 'api',
      reason: 'Serve the descriptor-declared app-owned API.',
      target: descriptor.api.mount ?? `/api/apps/${identity.appId}`,
    })
  }
  return permissions
}

function engineAssetsForDescriptor(descriptor: SoulDescriptorV1): SoulAppEngineAssets {
  const mcpClients = Object.entries(descriptor.engine.mcp?.targets ?? {})
    .flatMap(([target, entry]) => {
      if (!isSoulAppEngineTarget(target))
        return []
      return [{
        source: path.posix.dirname(entry.file.replace(/^dist\//, '')),
        target,
      }]
    })
  return {
    workspace: {
      source: descriptor.engine.workspaceAssets?.source.replace(/^dist\//, '') ?? 'engine-assets/workspace',
    },
    ...(descriptor.engine.skills
      ? {
          skills: {
            source: descriptor.engine.skills.source.replace(/^dist\//, ''),
            targets: ['codex', 'claude-code'],
          },
        }
      : {}),
    ...(mcpClients.length > 0 ? { mcpClients } : {}),
  }
}

function isSoulAppEngineTarget(value: string): value is SoulAppEngineTarget {
  return value === 'codex' || value === 'claude-code'
}
