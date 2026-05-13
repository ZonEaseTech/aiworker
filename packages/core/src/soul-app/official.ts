import type { HostedSoulApp } from '@zonease/aiworker-shared'
import type { SoulAppRegistryContext } from './registry'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { repairLegacySoulMetadata } from '@zonease/aiworker-storage-sqlite/worker'

import {
  disableSoulApp,
  enableSoulApp,
  getHostedSoulApp,
  installSoulAppFromPath,
} from './registry'

export interface OfficialSoulAppDefinition {
  id: string
  manifestPath: string
}

export interface OfficialSoulAppBootstrapOptions extends SoulAppRegistryContext {
  definitions?: readonly OfficialSoulAppDefinition[]
  repoRoot?: string
}

export type OfficialSoulAppBootstrapAction = 'enabled' | 'error' | 'installed_enabled' | 'preserved_disabled' | 'refreshed'

export interface OfficialSoulAppBootstrapResult {
  action: OfficialSoulAppBootstrapAction
  app: HostedSoulApp | null
  appId: string
  errorMessage?: string
  manifestPath: string
}

export interface OfficialLegacyMetadataRepairResult {
  skippedSessions: string[]
  sessionsUpdated: number
  workersUpdated: number
}

export const OFFICIAL_SOUL_APPS = [
  {
    id: 'aiworker-hr',
    manifestPath: 'apps/aiworker-hr/soul-app.manifest.json',
  },
  {
    id: 'aiworker-qa',
    manifestPath: 'apps/aiworker-qa/soul-app.manifest.json',
  },
] as const satisfies readonly OfficialSoulAppDefinition[]

export async function bootstrapOfficialSoulApps(options: OfficialSoulAppBootstrapOptions = {}): Promise<OfficialSoulAppBootstrapResult[]> {
  const definitions = options.definitions ?? OFFICIAL_SOUL_APPS
  const results: OfficialSoulAppBootstrapResult[] = []
  for (const definition of definitions) {
    const manifestPath = resolveOfficialManifestPath(definition, options)
    const existing = getHostedSoulApp(definition.id)
    const wasDisabled = existing?.status === 'disabled'
    try {
      let app = await installSoulAppFromPath(manifestPath, options)
      if (wasDisabled) {
        app = disableSoulApp(definition.id, options)
        results.push({
          action: 'preserved_disabled',
          app,
          appId: definition.id,
          manifestPath,
        })
        continue
      }

      if (app.status === 'error') {
        results.push({
          action: 'error',
          app,
          appId: definition.id,
          errorMessage: app.healthMessage ?? 'Official Soul App manifest validation failed.',
          manifestPath,
        })
        continue
      }

      app = enableSoulApp(definition.id, options)
      results.push({
        action: existing
          ? existing.status === 'enabled' ? 'refreshed' : 'enabled'
          : 'installed_enabled',
        app,
        appId: definition.id,
        manifestPath,
      })
    }
    catch (err) {
      results.push({
        action: 'error',
        app: getHostedSoulApp(definition.id),
        appId: definition.id,
        errorMessage: err instanceof Error ? err.message : String(err),
        manifestPath,
      })
    }
  }
  return results
}

export function repairOfficialSoulAppLegacyMetadata(at?: string): OfficialLegacyMetadataRepairResult {
  return repairLegacySoulMetadata({
    at,
    mappings: [
      {
        capabilityTemplateIds: {
          'candidate-screen': 'aiworker-hr.candidate-screen',
          'person-profile': 'aiworker-hr.person-profile',
        },
        fromSoulId: 'hr',
        soulName: 'AIWorker HR',
        toSoulId: 'aiworker-hr',
      },
      {
        capabilityTemplateIds: {
          'regression-matrix': 'aiworker-qa.regression-matrix',
          'release-gate': 'aiworker-qa.release-gate',
        },
        fromSoulId: 'qa',
        soulName: 'AIWorker QA',
        toSoulId: 'aiworker-qa',
      },
    ],
  })
}

function resolveOfficialManifestPath(definition: OfficialSoulAppDefinition, options: OfficialSoulAppBootstrapOptions): string {
  if (path.isAbsolute(definition.manifestPath))
    return definition.manifestPath
  return path.resolve(options.repoRoot ?? defaultRepoRoot(), definition.manifestPath)
}

function defaultRepoRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDir, '..', '..', '..', '..')
}
