import type { CapabilityTemplate, HostedSoulApp, VerticalSoul } from '@zonease/aiworker-shared'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { OfficialLegacyMetadataDiscardResult, OfficialSoulAppBootstrapResult } from '../soul-app/official'
import type { HostSoulCatalog, SoulAppInstallInput, SoulAppRegistryContext } from '../soul-app/registry'
import type { SoulAppSecurityReview } from '../soul-app/security-review'
import type { LocalExecutor } from '../worker/executor'
import type { LocalWorkerRuntime, LocalWorkerSnapshot } from '../worker/runtime'

import path from 'node:path'
import {
  AppError,
  mintWorkerId,
} from '@zonease/aiworker-shared'
import {
  getWorker,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'

import {
  bootstrapOfficialSoulApps as bootstrapOfficialSoulAppRegistry,
  discardOfficialSoulAppLegacyMetadata,
} from '../soul-app/official'
import {
  disableSoulApp,
  enableSoulApp,
  findHostCapabilityTemplate,
  findHostSoul,
  getHostedSoulApp,
  installSoulAppFromPath,
  installSoulAppManifest,
  listHostCapabilityTemplatesForSoul,
  listHostedSoulApps,
  listHostSoulCatalog,
  runSoulAppHealthcheck,
} from '../soul-app/registry'
import { reviewSoulAppSecurity } from '../soul-app/security-review'
import { createLocalWorkerRuntime } from '../worker/runtime'

export interface HostRuntimeOptions {
  executor?: LocalExecutor
  now?: () => string
  registryContext?: () => SoulAppRegistryContext
  workersRoot: string
}

export interface HostOfficialSoulAppBootstrap {
  catalog: HostSoulCatalog
  legacyMetadataDiscard: OfficialLegacyMetadataDiscardResult
  results: OfficialSoulAppBootstrapResult[]
  scope: 'official'
  status: 'fail' | 'pass'
}

export interface CreateHostSoulWorkerInput {
  defaultEngineId?: string | null
  id?: string
  metadata?: Record<string, unknown>
  name: string
  soulId: string
}

export interface CreateHostSoulWorkerResult {
  runtime: LocalWorkerRuntime
  snapshot: LocalWorkerSnapshot
  worker: WorkerRow
}

export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  return new HostRuntime(options)
}

export class HostRuntime {
  constructor(private readonly options: HostRuntimeOptions) {}

  listCatalog(): HostSoulCatalog {
    return listHostSoulCatalog()
  }

  listApps(): HostedSoulApp[] {
    return listHostedSoulApps()
  }

  getApp(appId: string): HostedSoulApp | null {
    return getHostedSoulApp(appId)
  }

  reviewAppSecurity(appId: string): SoulAppSecurityReview {
    const app = getHostedSoulApp(appId)
    if (!app)
      throw new Error(`Soul App not found: ${appId}`)
    return reviewSoulAppSecurity(app, this.registryContext())
  }

  async installAppFromPath(manifestPath: string): Promise<HostedSoulApp> {
    return installSoulAppFromPath(manifestPath, this.registryContext())
  }

  installAppManifest(input: SoulAppInstallInput): HostedSoulApp {
    return installSoulAppManifest(input, this.registryContext())
  }

  enableApp(appId: string): HostedSoulApp {
    return enableSoulApp(appId, this.registryContext())
  }

  disableApp(appId: string): HostedSoulApp {
    return disableSoulApp(appId, this.registryContext())
  }

  healthcheckApp(appId: string): HostedSoulApp {
    return runSoulAppHealthcheck(appId, this.registryContext())
  }

  async bootstrapOfficialSoulApps(): Promise<HostOfficialSoulAppBootstrap> {
    const results = await bootstrapOfficialSoulAppRegistry(this.registryContext())
    const legacyMetadataDiscard = discardOfficialSoulAppLegacyMetadata(this.options.now?.())
    return {
      catalog: this.listCatalog(),
      legacyMetadataDiscard,
      results,
      scope: 'official',
      status: results.some(result => result.action === 'error') ? 'fail' : 'pass',
    }
  }

  listSouls(): VerticalSoul[] {
    return this.listCatalog().souls
  }

  findSoul(soulId: string): VerticalSoul | undefined {
    return findHostSoul(soulId)
  }

  requireAvailableSoul(soulId: unknown): VerticalSoul {
    const id = requireText(soulId, 'soulId')
    const soul = findHostSoul(id)
    if (!soul || soul.status !== 'available')
      throw AppError.badRequest(`Available Soul not found: ${id}`, 'SOUL_NOT_AVAILABLE')
    return soul
  }

  listCapabilityTemplates(soulId?: string): CapabilityTemplate[] {
    return soulId ? listHostCapabilityTemplatesForSoul(soulId) : this.listCatalog().templates
  }

  listCapabilityTemplatesForWorker(workerId: string): CapabilityTemplate[] {
    const worker = this.requireWorker(workerId)
    return listHostCapabilityTemplatesForSoul(worker.soulId)
  }

  requireCapabilityTemplateForWorker(workerId: string, templateId: unknown): CapabilityTemplate {
    const worker = this.requireWorker(workerId)
    const id = requireText(templateId, 'capabilityTemplateId')
    const template = findHostCapabilityTemplate(id)
    if (!template || template.soulId !== worker.soulId)
      throw AppError.badRequest(`Template ${id} does not belong to worker ${workerId}.`, 'TEMPLATE_NOT_AVAILABLE')
    return template
  }

  async createSoulWorker(input: CreateHostSoulWorkerInput): Promise<CreateHostSoulWorkerResult> {
    const soul = this.requireAvailableSoul(input.soulId)
    const name = requireText(input.name, 'name')
    const workerId = input.id ? requireText(input.id, 'id') : mintWorkerId()
    if (getWorker(workerId))
      throw new AppError('CONFLICT', 409, `Worker already exists: ${workerId}`)

    const worker = upsertWorker({
      id: workerId,
      soulId: soul.id,
      name,
      defaultEngineId: input.defaultEngineId ?? 'codex',
      metadataJson: {
        defaultTemplates: [...soul.defaultTemplates],
        description: soul.description,
        domain: soul.domain,
        soulAppId: getHostedSoulApp(soul.id)?.appId ?? null,
        ...(input.metadata ?? {}),
      },
    })
    const runtime = this.createRuntimeForWorker(worker)
    await runtime.init()
    return {
      runtime,
      snapshot: runtime.snapshot(),
      worker,
    }
  }

  createRuntimeForWorker(worker: WorkerRow): LocalWorkerRuntime {
    return createLocalWorkerRuntime({
      worker: {
        id: worker.id,
        soulId: worker.soulId,
        name: worker.name,
        defaultEngineId: worker.defaultEngineId,
        metadata: worker.metadataJson,
      },
      executor: this.options.executor,
      now: this.options.now,
      workspacesRoot: path.join(this.options.workersRoot, worker.id, 'workspaces'),
    })
  }

  enrichTemplateMetadata(workerId: string, templateId: string, metadata: Record<string, unknown>): Record<string, unknown> {
    const worker = getWorker(workerId)
    const soul = worker ? findHostSoul(worker.soulId) : null
    const template = findHostCapabilityTemplate(templateId)
    if (!worker || !soul || !template)
      return metadata
    return {
      ...metadata,
      capabilityTemplateId: template.id,
      inputHints: template.inputHints,
      outputKind: template.outputKind,
      reviewRubric: template.reviewRubric,
      skillName: template.name,
      soulAppId: getHostedSoulApp(soul.id)?.appId ?? null,
      soulName: soul.name,
      workerId: worker.id,
    }
  }

  private registryContext(): SoulAppRegistryContext {
    return {
      now: this.options.now,
      ...(this.options.registryContext?.() ?? {}),
    }
  }

  private requireWorker(workerId: string): WorkerRow {
    const worker = getWorker(workerId)
    if (!worker)
      throw new Error(`Worker not found: ${workerId}`)
    return worker
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`Missing required field: ${field}`)
  return value.trim()
}
