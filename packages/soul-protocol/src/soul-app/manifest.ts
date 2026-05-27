import type { z } from 'zod'

import { z as zod } from 'zod'

const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export const soulAppIdSchema = zod.string().min(1).regex(ID_RE, 'Soul App id must be kebab-case')

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

export const soulAppEngineAssetsSchema = zod.object({
  mcpClients: zod.array(soulAppMcpClientEngineAssetsSchema).readonly().optional(),
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

export const soulAppMountedSurfaceScopeSchema = zod.enum(['app', 'workspace', 'session', 'artifact'])
export type SoulAppMountedSurfaceScope = z.infer<typeof soulAppMountedSurfaceScopeSchema>

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
