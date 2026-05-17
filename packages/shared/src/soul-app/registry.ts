import type { z } from 'zod'
import type { CapabilityTemplate, VerticalSoul, VerticalSoulStatus } from '../vertical-soul'
import type { SoulAppCapability, SoulAppManifest, SoulAppManifestValidationIssue } from './manifest'

import { z as zod } from 'zod'
import { capabilityTemplateSchema, verticalSoulSchema } from '../vertical-soul'
import { soulAppManifestSchema, soulAppManifestValidationIssueSchema, soulAppShellSchema } from './manifest'

export const soulAppRegistryStatusSchema = zod.enum(['installed', 'enabled', 'disabled', 'error'])
export type SoulAppRegistryStatus = z.infer<typeof soulAppRegistryStatusSchema>

export const soulAppInstallSourceKindSchema = zod.enum(['manifest-path', 'inline'])
export type SoulAppInstallSourceKind = z.infer<typeof soulAppInstallSourceKindSchema>

export const soulAppHealthStatusSchema = zod.enum(['unknown', 'pass', 'warn', 'fail'])
export type SoulAppHealthStatus = z.infer<typeof soulAppHealthStatusSchema>

export const soulAppMountedContributionSchema = zod.object({
  apiRoutePrefix: zod.string().min(1).nullable(),
  artifactPreviewIds: zod.array(zod.string().min(1)).readonly(),
  descriptorSurfaceIds: zod.array(zod.string().min(1)).readonly(),
  frameSurfaceIds: zod.array(zod.string().min(1)).readonly(),
  panelIds: zod.array(zod.string().min(1)).readonly(),
  reviewPanelIds: zod.array(zod.string().min(1)).readonly(),
  routePaths: zod.array(zod.string().min(1)).readonly(),
  shell: soulAppShellSchema.nullable(),
  surfaceIds: zod.array(zod.string().min(1)).readonly(),
  workspaceWidgetIds: zod.array(zod.string().min(1)).readonly(),
})
export type SoulAppMountedContribution = z.infer<typeof soulAppMountedContributionSchema>

export const hostedSoulAppSchema = zod.object({
  appId: zod.string().min(1),
  healthMessage: zod.string().nullable(),
  healthStatus: soulAppHealthStatusSchema,
  manifest: soulAppManifestSchema,
  manifestDigest: zod.string().min(1),
  mountedContribution: soulAppMountedContributionSchema,
  projectedCapabilities: zod.array(capabilityTemplateSchema).readonly(),
  projectedSoul: verticalSoulSchema,
  sourceKind: soulAppInstallSourceKindSchema,
  sourceRef: zod.string().min(1),
  status: soulAppRegistryStatusSchema,
  validationIssues: zod.array(soulAppManifestValidationIssueSchema).readonly(),
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

export function projectSoulAppSoul(manifest: SoulAppManifest, status: VerticalSoulStatus = 'available'): VerticalSoul {
  return {
    defaultTemplates: projectSoulAppDefaultTemplates(manifest),
    description: manifest.description,
    domain: manifest.soul.domain,
    id: manifest.id,
    name: manifest.name,
    status,
  }
}

export function projectSoulAppDefaultTemplates(manifest: SoulAppManifest): string[] {
  const seen = new Set<string>()
  const templates: string[] = []
  for (const type of manifest.workspaceTypes) {
    for (const id of type.defaultCapabilityIds ?? []) {
      const namespacedId = namespaceSoulAppCapabilityId(manifest.id, id)
      if (seen.has(namespacedId))
        continue
      seen.add(namespacedId)
      templates.push(namespacedId)
    }
  }
  return templates
}

export function projectSoulAppCapabilityTemplate(manifest: SoulAppManifest, capability: SoulAppCapability): CapabilityTemplate {
  return {
    description: capability.description,
    id: namespaceSoulAppCapabilityId(manifest.id, capability.id),
    inputHints: [
      `Workspace types: ${capability.workspaceTypes.join(', ')}`,
      `Artifact types: ${capability.artifactTypes.join(', ')}`,
      `Prompt ref: ${capability.promptRef}`,
    ],
    name: capability.name,
    outputKind: capability.outputKind,
    prompt: [
      `Use the ${manifest.name} Soul App capability ${capability.name}.`,
      `Use prompt asset ${capability.promptRef}.`,
      `Produce a ${capability.outputKind} business artifact for the selected ${manifest.soul.name} workspace.`,
      'Keep Host runtime, connector, artifact, review, and memory ownership intact.',
    ].join(' '),
    reviewRubric: capability.reviewRubricRef
      ? [`Review rubric ref: ${capability.reviewRubricRef}`, 'Evidence, missing facts, risks, and human review notes remain explicit.']
      : ['Evidence, missing facts, risks, and human review notes remain explicit.'],
    soulId: manifest.id,
  }
}

export function projectSoulAppCapabilityTemplates(manifest: SoulAppManifest): CapabilityTemplate[] {
  return manifest.capabilities.map(capability => projectSoulAppCapabilityTemplate(manifest, capability))
}

export function mountedContributionForManifest(manifest: SoulAppManifest): SoulAppMountedContribution {
  const surfaces = [
    ...manifest.ui.routes,
    ...manifest.ui.panels,
    ...manifest.ui.artifactPreviews,
    ...manifest.ui.reviewPanels,
    ...(manifest.ui.workspaceWidgets ?? []),
  ].filter(item => item.surface)
  return {
    apiRoutePrefix: manifest.api.routePrefix ?? null,
    artifactPreviewIds: manifest.ui.artifactPreviews.map(slot => slot.id),
    descriptorSurfaceIds: surfaces.filter(item => item.surface?.renderer === 'host-descriptor').map(item => item.id),
    frameSurfaceIds: surfaces.filter(item => item.surface?.renderer === 'sandboxed-frame').map(item => item.id),
    panelIds: manifest.ui.panels.map(slot => slot.id),
    reviewPanelIds: manifest.ui.reviewPanels.map(slot => slot.id),
    routePaths: manifest.ui.routes.map(route => route.path),
    shell: manifest.ui.shell ?? null,
    surfaceIds: surfaces.map(item => item.id),
    workspaceWidgetIds: (manifest.ui.workspaceWidgets ?? []).map(slot => slot.id),
  }
}

export function buildHostedSoulApp(input: {
  healthMessage?: string | null
  healthStatus?: SoulAppHealthStatus
  manifest: SoulAppManifest
  manifestDigest: string
  sourceKind: SoulAppInstallSourceKind
  sourceRef: string
  status: SoulAppRegistryStatus
  validationIssues?: readonly SoulAppManifestValidationIssue[]
}): HostedSoulApp {
  return hostedSoulAppSchema.parse({
    appId: input.manifest.id,
    healthMessage: input.healthMessage ?? null,
    healthStatus: input.healthStatus ?? 'unknown',
    manifest: input.manifest,
    manifestDigest: input.manifestDigest,
    mountedContribution: mountedContributionForManifest(input.manifest),
    projectedCapabilities: projectSoulAppCapabilityTemplates(input.manifest),
    projectedSoul: projectSoulAppSoul(input.manifest, input.status === 'enabled' ? 'available' : 'coming_soon'),
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    status: input.status,
    validationIssues: input.validationIssues ?? [],
    version: input.manifest.version,
  })
}
