import type { HostedSoulApp } from '@zonease/aiworker-soul-descriptor'
import type { SoulAppRegistryContext } from './registry'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { discardRetiredSoulMetadata, getSoulApp } from '@zonease/aiworker-storage-sqlite/worker'

import {
  archiveSoulApp,
  enableSoulApp,
  getHostedSoulApp,
  installSoulAppFromPath,
} from './registry'

export interface OfficialSoulAppDefinition {
  id: string
  descriptorPath: string
}

export interface OfficialSoulAppBootstrapOptions extends SoulAppRegistryContext {
  definitions?: readonly OfficialSoulAppDefinition[]
  officialAppsRoot?: string
  repoRoot?: string
}

export type OfficialSoulAppBootstrapAction = 'enabled' | 'error' | 'installed_enabled' | 'preserved_disabled' | 'refreshed'

export interface OfficialSoulAppBootstrapResult {
  action: OfficialSoulAppBootstrapAction
  app: HostedSoulApp | null
  appId: string
  errorMessage?: string
  descriptorPath: string
}

export interface OfficialRetiredMetadataDiscardResult {
  retiredAppIds: string[]
  workersDeleted: number
}

export const OFFICIAL_SOUL_APPS = [
  {
    descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    id: 'aiworker-freeform',
  },
] as const satisfies readonly OfficialSoulAppDefinition[]

const DEFAULT_OFFICIAL_DESCRIPTOR_FILENAME = 'dist/soul.descriptor.json'

export async function bootstrapOfficialSoulApps(options: OfficialSoulAppBootstrapOptions = {}): Promise<OfficialSoulAppBootstrapResult[]> {
  const definitions = options.definitions ?? OFFICIAL_SOUL_APPS
  const results: OfficialSoulAppBootstrapResult[] = []
  for (const definition of definitions) {
    const descriptorPath = resolveOfficialDescriptorPath(definition, options)
    const existingRow = getSoulApp(definition.id)
    const wasDisabled = existingRow?.status === 'disabled'
    try {
      let app = await installSoulAppFromPath(descriptorPath, options)
      if (wasDisabled) {
        app = archiveSoulApp(definition.id, options)
        results.push({
          action: 'preserved_disabled',
          app,
          appId: definition.id,
          descriptorPath,
        })
        continue
      }

      if (app.status === 'error') {
        results.push({
          action: 'error',
          app,
          appId: definition.id,
          errorMessage: app.healthMessage ?? 'Official Soul App manifest validation failed.',
          descriptorPath,
        })
        continue
      }

      app = enableSoulApp(definition.id, options)
      results.push({
        action: existingRow
          ? existingRow.status === 'enabled' ? 'refreshed' : 'enabled'
          : 'installed_enabled',
        app,
        appId: definition.id,
        descriptorPath,
      })
    }
    catch (err) {
      results.push({
        action: 'error',
        app: getHostedSoulAppSafely(definition.id),
        appId: definition.id,
        errorMessage: err instanceof Error ? err.message : String(err),
        descriptorPath,
      })
    }
  }
  return results
}

function getHostedSoulAppSafely(appId: string): HostedSoulApp | null {
  try {
    return getHostedSoulApp(appId)
  }
  catch {
    return null
  }
}

export function discardOfficialSoulAppRetiredMetadata(at?: string): OfficialRetiredMetadataDiscardResult {
  return discardRetiredSoulMetadata({
    at,
    appIds: ['hr', 'qa'],
  })
}

function resolveOfficialDescriptorPath(definition: OfficialSoulAppDefinition, options: OfficialSoulAppBootstrapOptions): string {
  if (path.isAbsolute(definition.descriptorPath))
    return definition.descriptorPath
  if (options.officialAppsRoot)
    return path.resolve(options.officialAppsRoot, definition.id, DEFAULT_OFFICIAL_DESCRIPTOR_FILENAME)
  return path.resolve(options.repoRoot ?? defaultRepoRoot(), definition.descriptorPath)
}

function defaultRepoRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDir, '..', '..', '..', '..')
}
