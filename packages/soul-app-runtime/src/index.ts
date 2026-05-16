import type {
  HostSoulCatalog,
  LocalExecutor,
  LocalWorkerRuntime,
} from '@zonease/aiworker-core'
import type {
  CapabilityTemplate,
  HostedSoulApp,
  SoulAppManifest,
  VerticalSoul,
} from '@zonease/aiworker-shared'
import type { SoulAppDefinition } from '@zonease/aiworker-soul-app-sdk'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  createLocalWorkerRuntime,
  enableSoulApp,
  installSoulAppManifest,
  listHostSoulCatalog,
} from '@zonease/aiworker-core'
import {
  namespaceSoulAppCapabilityId,
  projectSoulAppCapabilityTemplates,
  projectSoulAppSoul,
} from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'

export type {
  LocalExecutor,
  LocalExecutorArtifact,
  LocalExecutorInput,
  LocalExecutorResult,
  LocalExecutorReview,
  LocalWorkerRuntime,
} from '@zonease/aiworker-core'

export interface StandaloneSoulAppRuntimeOptions {
  appHome: string
  appSourceRoot?: string
  availableConnectorIds?: readonly string[]
  enabledConnectorIds?: readonly string[]
  executor?: LocalExecutor
  hostVersion?: string
  migrationsFolder?: string
  now?: () => string
  workerId?: string
  workerName?: string
}

export interface MountedSoulAppTestRuntimeOptions {
  appSourceRoot?: string
  availableConnectorIds?: readonly string[]
  dbPath: string
  enabledConnectorIds?: readonly string[]
  executor?: LocalExecutor
  hostVersion?: string
  migrationsFolder?: string
  now?: () => string
  workerId?: string
  workerName?: string
  workersRoot: string
}

export interface SoulAppRuntimeHarness {
  app: SoulAppDefinition
  catalog: HostSoulCatalog
  dispose: () => void
  hostedApp: HostedSoulApp
  runtime: LocalWorkerRuntime
  sessionMetadata: (capabilityTemplateId: string) => Record<string, unknown>
  snapshot: LocalWorkerRuntime['snapshot']
  worker: SoulAppRuntimeWorkerSnapshot
}

export interface SoulAppRuntimeWorkerSnapshot {
  defaultEngineId: string | null
  id: string
  metadata: Record<string, unknown>
  name: string
  soulId: string
}

export async function createStandaloneSoulAppRuntime(
  app: SoulAppDefinition,
  options: StandaloneSoulAppRuntimeOptions,
): Promise<SoulAppRuntimeHarness> {
  const dbPath = path.join(options.appHome, 'worker.db')
  const workersRoot = path.join(options.appHome, 'workers')
  bootstrapDb(dbPath, options.migrationsFolder)
  const hostedApp = installAndEnable(app.manifest, {
    availableConnectorIds: options.availableConnectorIds,
    enabledConnectorIds: options.enabledConnectorIds,
    hostVersion: options.hostVersion,
    now: options.now,
    sourceRef: 'standalone:inline',
  })
  const { runtime, worker } = await createRuntimeForApp({
    app,
    appSourceRoot: options.appSourceRoot,
    executor: options.executor,
    now: options.now,
    workerId: options.workerId ?? `${app.manifest.id}-worker`,
    workerName: options.workerName ?? app.manifest.name,
    workersRoot,
  })
  return harness({
    app,
    catalog: scopedCatalog(hostedApp),
    hostedApp,
    runtime,
    worker,
  })
}

export async function createMountedSoulAppTestRuntime(
  app: SoulAppDefinition,
  options: MountedSoulAppTestRuntimeOptions,
): Promise<SoulAppRuntimeHarness> {
  bootstrapDb(options.dbPath, options.migrationsFolder)
  const hostedApp = installAndEnable(app.manifest, {
    availableConnectorIds: options.availableConnectorIds,
    enabledConnectorIds: options.enabledConnectorIds,
    hostVersion: options.hostVersion,
    now: options.now,
    sourceRef: 'mounted-test:inline',
  })
  const { runtime, worker } = await createRuntimeForApp({
    app,
    appSourceRoot: options.appSourceRoot,
    executor: options.executor,
    now: options.now,
    workerId: options.workerId ?? `${app.manifest.id}-worker`,
    workerName: options.workerName ?? app.manifest.name,
    workersRoot: options.workersRoot,
  })
  return harness({
    app,
    catalog: listHostSoulCatalog(),
    hostedApp,
    runtime,
    worker,
  })
}

function bootstrapDb(dbPath: string, migrationsFolder?: string): void {
  closeWorkerDb()
  mkdirSync(path.dirname(dbPath), { recursive: true })
  initWorkerDb(dbPath)
  runWorkerMigrations(migrationsFolder)
}

function installAndEnable(
  manifest: SoulAppManifest,
  options: {
    availableConnectorIds?: readonly string[]
    enabledConnectorIds?: readonly string[]
    hostVersion?: string
    now?: () => string
    sourceRef: string
  },
): HostedSoulApp {
  installSoulAppManifest({
    manifest,
    sourceKind: 'inline',
    sourceRef: options.sourceRef,
  }, {
    availableConnectorIds: options.availableConnectorIds,
    enabledConnectorIds: options.enabledConnectorIds,
    hostVersion: options.hostVersion,
    now: options.now,
  })
  return enableSoulApp(manifest.id, {
    availableConnectorIds: options.availableConnectorIds,
    enabledConnectorIds: options.enabledConnectorIds,
    hostVersion: options.hostVersion,
    now: options.now,
  })
}

async function createRuntimeForApp(input: {
  app: SoulAppDefinition
  appSourceRoot?: string
  executor?: LocalExecutor
  now?: () => string
  workerId: string
  workerName: string
  workersRoot: string
}): Promise<{ runtime: LocalWorkerRuntime, worker: SoulAppRuntimeWorkerSnapshot }> {
  const worker = upsertWorker({
    id: input.workerId,
    soulId: input.app.manifest.id,
    name: input.workerName,
    defaultEngineId: 'codex',
    metadataJson: {
      defaultTemplates: input.app.manifest.workspaceTypes.flatMap(type =>
        (type.defaultCapabilityIds ?? []).map(id => namespaceSoulAppCapabilityId(input.app.manifest.id, id)),
      ),
      description: input.app.manifest.description,
      domainSoulId: input.app.manifest.soul.id,
      domain: input.app.manifest.soul.domain,
      soulAppId: input.app.manifest.id,
    },
    at: input.now?.(),
  })
  const runtime = createLocalWorkerRuntime({
    engineAssetSource: input.appSourceRoot
      ? {
          appId: input.app.manifest.id,
          sourceRoot: input.appSourceRoot,
        }
      : null,
    executor: input.executor,
    now: input.now,
    worker: {
      defaultEngineId: worker.defaultEngineId,
      id: worker.id,
      metadata: worker.metadataJson,
      name: worker.name,
      soulId: worker.soulId,
    },
    workspacesRoot: path.join(input.workersRoot, worker.id, 'workspaces'),
  })
  await runtime.init()
  return {
    runtime,
    worker: publicWorkerSnapshot(worker),
  }
}

function harness(input: {
  app: SoulAppDefinition
  catalog: HostSoulCatalog
  hostedApp: HostedSoulApp
  runtime: LocalWorkerRuntime
  worker: SoulAppRuntimeWorkerSnapshot
}): SoulAppRuntimeHarness {
  return {
    ...input,
    dispose: closeWorkerDb,
    sessionMetadata: capabilityTemplateId => sessionMetadata(input.app, input.catalog.templates, capabilityTemplateId),
    snapshot: () => input.runtime.snapshot(),
  }
}

function publicWorkerSnapshot(worker: WorkerRow): SoulAppRuntimeWorkerSnapshot {
  return {
    defaultEngineId: worker.defaultEngineId,
    id: worker.id,
    metadata: worker.metadataJson,
    name: worker.name,
    soulId: worker.soulId,
  }
}

function scopedCatalog(app: HostedSoulApp): HostSoulCatalog {
  return {
    apps: [app],
    souls: [projectSoulAppSoul(app.manifest, 'available') as VerticalSoul],
    templates: projectSoulAppCapabilityTemplates(app.manifest) as CapabilityTemplate[],
  }
}

function sessionMetadata(
  app: SoulAppDefinition,
  templates: readonly CapabilityTemplate[],
  capabilityTemplateId: string,
): Record<string, unknown> {
  const template = templates.find(item => item.id === capabilityTemplateId)
  return {
    capabilityTemplateId,
    inputHints: template?.inputHints ?? [],
    outputKind: template?.outputKind ?? 'business-artifact',
    reviewRubric: template?.reviewRubric ?? [],
    skillName: template?.name ?? capabilityTemplateId,
    soulAppId: app.manifest.id,
    soulName: app.manifest.soul.name,
  }
}
