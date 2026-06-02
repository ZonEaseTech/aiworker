import type { HostedSoulApp } from '@zonease/aiworker-soul-descriptor'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type { OfficialRetiredMetadataDiscardResult, OfficialSoulAppBootstrapResult } from '../soul-app/official'
import type { SoulAppRegistryContext, SoulCatalog, SoulDescriptorInstallInput } from '../soul-app/registry'
import type { LocalExecutor } from '../worker/executor'
import type { LocalWorkerRuntime, LocalWorkerRuntimeOptions, LocalWorkerSnapshot } from '../worker/runtime'

import path from 'node:path'
import {
  AppError,
  mintWorkerId,
} from '@zonease/aiworker-soul-descriptor'
import {
  getWorker,
  listWorkers,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'

import {
  bootstrapOfficialSoulApps as bootstrapOfficialSoulAppRegistry,
  discardOfficialSoulAppRetiredMetadata,
} from '../soul-app/official'
import {
  archiveSoulApp,
  deleteSoulApp,
  enableSoulApp,
  findCatalogSoul,
  getHostedSoulApp,
  installSoulAppFromPath,
  installSoulDescriptor,
  listHostedSoulApps,
  listSoulCatalog,
  runSoulAppHealthcheck,
} from '../soul-app/registry'
import { createLocalWorkerRuntime } from '../worker/runtime'
import { AsyncLock } from './async-lock'

// -- inlined from deleted shared types --
interface VerticalSoul {
  description: string
  id: string
  name: string
  status: 'available' | 'coming_soon'
}

export interface WorkerOrchestratorOptions {
  engineBridge?: LocalWorkerRuntimeOptions['engineBridge']
  executor?: LocalExecutor
  now?: () => string
  officialAppsRoot?: string
  registryContext?: () => SoulAppRegistryContext
  workersRoot: string
}

export interface OfficialSoulAppBootstrap {
  catalog: SoulCatalog
  retiredMetadataDiscard: OfficialRetiredMetadataDiscardResult
  results: OfficialSoulAppBootstrapResult[]
  scope: 'official'
  status: 'fail' | 'pass'
}

export interface CreateSoulWorkerInput {
  appId: string
  defaultEngineId?: string | null
  id?: string
  metadata?: Record<string, unknown>
  name: string
}

export interface CreateSoulWorkerResult {
  runtime: LocalWorkerRuntime
  snapshot: LocalWorkerSnapshot
  worker: WorkerRow
}

export function createWorkerOrchestrator(options: WorkerOrchestratorOptions): WorkerOrchestrator {
  return new WorkerOrchestrator(options)
}

export class WorkerOrchestrator {
  constructor(private readonly options: WorkerOrchestratorOptions) {}

  private readonly createWorkerLock = new AsyncLock()

  listCatalog(): SoulCatalog {
    return listSoulCatalog()
  }

  listApps(): HostedSoulApp[] {
    return listHostedSoulApps()
  }

  getApp(appId: string): HostedSoulApp | null {
    return getHostedSoulApp(appId)
  }

  async installAppFromPath(descriptorPath: string): Promise<HostedSoulApp> {
    return installSoulAppFromPath(descriptorPath, this.registryContext())
  }

  installAppDescriptor(input: SoulDescriptorInstallInput): HostedSoulApp {
    return installSoulDescriptor(input, this.registryContext())
  }

  enableApp(appId: string): HostedSoulApp {
    return enableSoulApp(appId, this.registryContext())
  }

  archiveApp(appId: string): HostedSoulApp {
    return archiveSoulApp(appId, this.registryContext())
  }

  deleteApp(appId: string): HostedSoulApp {
    return deleteSoulApp(appId)
  }

  healthcheckApp(appId: string): HostedSoulApp {
    return runSoulAppHealthcheck(appId, this.registryContext())
  }

  async bootstrapOfficialSoulApps(): Promise<OfficialSoulAppBootstrap> {
    const results = await bootstrapOfficialSoulAppRegistry({
      ...this.registryContext(),
      officialAppsRoot: this.options.officialAppsRoot,
    })
    const retiredMetadataDiscard = discardOfficialSoulAppRetiredMetadata(this.options.now?.())
    return {
      catalog: this.listCatalog(),
      retiredMetadataDiscard,
      results,
      scope: 'official',
      status: results.some(result => result.action === 'error') ? 'fail' : 'pass',
    }
  }

  listSouls(): VerticalSoul[] {
    return this.listCatalog().souls
  }

  findSoul(appId: string): VerticalSoul | undefined {
    return findCatalogSoul(appId)
  }

  requireAvailableSoul(appId: unknown): VerticalSoul {
    const id = requireText(appId, 'appId')
    const soul = findCatalogSoul(id)
    if (!soul || soul.status !== 'available')
      throw AppError.badRequest(`Available Soul not found: ${id}`, 'SOUL_NOT_AVAILABLE')
    return soul
  }

  requireEnabledAppForWorker(workerId: string): HostedSoulApp {
    const worker = getWorker(workerId)
    if (!worker)
      throw AppError.notFound(`Worker not found: ${workerId}`)
    const app = getHostedSoulApp(worker.appId)
    if (!app)
      throw AppError.notFound(`Soul App not found: ${worker.appId}`)
    if (app.status !== 'enabled')
      throw new AppError('SOUL_APP_DISABLED', 409, `Soul App is not enabled: ${app.appId}`)
    return app
  }

  async createSoulWorker(input: CreateSoulWorkerInput): Promise<CreateSoulWorkerResult> {
    // C1:进程内锁串行化 check-active → insert 临界区(daemon-per-worker 单写者世界,
    // 完整串行化即 TOCTOU 防护,无需存储 schema 全局索引)。
    return this.createWorkerLock.run(async () => {
      const soul = this.requireAvailableSoul(input.appId)
      const name = requireText(input.name, 'name')
      const workerId = input.id ? requireText(input.id, 'id') : mintWorkerId()
      if (getWorker(workerId))
        throw new AppError('CONFLICT', 409, `Worker already exists: ${workerId}`)
      // C2:每个 daemon 至多一个 active worker(archived 不计)。
      if (listWorkers().some(existing => existing.status === 'active'))
        throw new AppError('WORKER_ALREADY_ACTIVE', 409, 'A daemon hosts at most one active worker.')

      const worker = upsertWorker({
        id: workerId,
        appId: soul.id,
        name,
        defaultEngineId: input.defaultEngineId ?? 'codex',
        metadataJson: {
          description: soul.description,
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
    })
  }

  createRuntimeForWorker(worker: WorkerRow): LocalWorkerRuntime {
    return createLocalWorkerRuntime({
      worker: {
        id: worker.id,
        appId: worker.appId,
        name: worker.name,
        defaultEngineId: worker.defaultEngineId,
        metadata: worker.metadataJson,
      },
      executor: this.options.executor,
      engineBridge: this.options.engineBridge,
      engineAssetSource: this.engineAssetSourceForWorker(worker),
      now: this.options.now,
      workspacesRoot: path.join(this.options.workersRoot, worker.id, 'workspaces'),
      overlaysRoot: path.join(this.options.workersRoot, worker.id, 'overlays'),
    })
  }

  private registryContext(): SoulAppRegistryContext {
    return {
      now: this.options.now,
      ...(this.options.registryContext?.() ?? {}),
    }
  }

  engineAssetSourceForWorker(worker: WorkerRow): LocalWorkerRuntimeOptions['engineAssetSource'] {
    const app = getHostedSoulApp(worker.appId)
    if (!app || app.status !== 'enabled' || app.sourceKind !== 'descriptor-path')
      return null
    return {
      appId: app.appId,
      engineAssets: app.engineAssets,
      sourceRoot: path.dirname(app.sourceRef),
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
