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

const verticalSoulSchema = zod.object({
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

export const hostedSoulAppSchema = zod.object({
  api: hostedSoulAppApiSchema,
  appId: zod.string().min(1),
  description: zod.string().min(1),
  descriptor: zod.custom<SoulDescriptorV1>(),
  descriptorDigest: zod.string().min(1),
  engineAssets: zod.custom<SoulAppEngineAssets>(),
  healthMessage: zod.string().nullable(),
  healthStatus: soulAppHealthStatusSchema,
  name: zod.string().min(1),
  permissions: zod.array(soulAppPermissionSchema).readonly(),
  projectedSoul: verticalSoulSchema,
  sourceKind: soulAppInstallSourceKindSchema,
  sourceRef: zod.string().min(1),
  status: soulAppRegistryStatusSchema,
  validationIssues: zod.array(soulDescriptorValidationIssueSchema).readonly(),
})
export type HostedSoulApp = z.infer<typeof hostedSoulAppSchema>

export function projectSoulAppSoul(descriptor: SoulDescriptorV1, status: VerticalSoulStatus = 'available'): VerticalSoul {
  const identity = descriptorIdentity(descriptor)
  return {
    description: identity.description,
    id: identity.id,
    name: identity.name,
    status,
  }
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
    appId: identity.id,
    description: identity.description,
    descriptor: input.descriptor,
    descriptorDigest: input.descriptorDigest,
    engineAssets: engineAssetsForDescriptor(input.descriptor),
    healthMessage: input.healthMessage ?? null,
    healthStatus: input.healthStatus ?? 'unknown',
    name: identity.name,
    permissions: permissionsForDescriptor(input.descriptor),
    projectedSoul: projectSoulAppSoul(input.descriptor, input.status === 'enabled' ? 'available' : 'coming_soon'),
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    status: input.status,
    validationIssues: input.validationIssues ?? [],
  })
}

function descriptorIdentity(descriptor: SoulDescriptorV1): {
  description: string
  id: string
  name: string
} {
  return {
    description: String(descriptor.identity.description ?? descriptor.identity.name),
    id: String(descriptor.identity.id),
    name: String(descriptor.identity.name),
  }
}

function apiForDescriptor(_descriptor: SoulDescriptorV1): HostedSoulAppApi {
  // Soul 是 descriptor-only 的 engine-asset 模板：没有 app-owned API，也没有 local
  // service，因此 localService 与 routePrefix 都为 null。
  return {
    localService: null,
    routePrefix: null,
  }
}

function permissionsForDescriptor(_descriptor: SoulDescriptorV1): SoulAppPermission[] {
  // v1 = worker-owns-workbench：Soul 是 descriptor-only 模板，没有 mounted workbench，
  // 因此不投影任何 mount 权限，permissions 恒为空。
  return []
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
