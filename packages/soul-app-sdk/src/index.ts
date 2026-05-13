import type {
  HostSoulCatalog,
  LocalExecutor,
  LocalWorkerRuntime,
} from '@zonease/aiworker-core'
import type {
  CapabilityTemplate,
  HostedSoulApp,
  SoulAppManifest,
  SoulAppManifestValidationOptions,
  SoulAppProtocolHandlers,
  VerticalSoul,
} from '@zonease/aiworker-shared'
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
  soulAppManifestSchema,
  validateSoulAppManifest,
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
export {
  namespaceSoulAppCapabilityId,
  parseNamespacedSoulAppCapabilityId,
} from '@zonease/aiworker-shared'
export type {
  CapabilityTemplate,
  HostedSoulApp,
  SoulAppArtifactValidationResult,
  SoulAppCapability,
  SoulAppManifest,
  SoulAppProtocolHandlers,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
  VerticalSoul,
} from '@zonease/aiworker-shared'

export interface SoulAppDefinition extends SoulAppProtocolHandlers {
  manifest: SoulAppManifest
}

export interface StandaloneSoulAppRuntimeOptions {
  appHome: string
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
  worker: WorkerRow
}

export interface SoulAppClientOptions {
  appId: string
  baseUrl?: string
  fetch?: SoulAppFetch
  token?: string
}

export type SoulAppFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface SoulAppCreateWorkerInput {
  defaultEngineId?: string | null
  id?: string
  metadata?: Record<string, unknown>
  name: string
}

export interface SoulAppCreateWorkspaceInput {
  metadata?: Record<string, unknown>
  name: string
  sourcePointers?: Record<string, unknown>[]
  type?: string
}

export interface SoulAppCreateSessionTurnInput {
  capabilityTemplateId: string
  context?: string
  input?: string
  metadata?: Record<string, unknown>
  title: string
}

export interface SoulAppBrokerContextQuery {
  operatorId?: string
  sessionId?: string
  workerId?: string
  workspaceId?: string
}

export function defineSoulApp(input: SoulAppProtocolHandlers): SoulAppDefinition {
  const manifest = soulAppManifestSchema.parse(input.manifest)
  return {
    ...input,
    manifest,
  }
}

export function createSoulAppManifest(input: unknown, options: SoulAppManifestValidationOptions = {}): SoulAppManifest {
  const result = validateSoulAppManifest(input, options)
  if (result.status !== 'valid' || !result.manifest)
    throw new Error(result.issues.map(issue => `${issue.path ?? '<root>'}: ${issue.message}`).join('; ') || 'Invalid Soul App manifest.')
  return result.manifest
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
  const runtime = await createRuntimeForApp({
    app,
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
    worker: runtime.snapshot().worker,
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
  const runtime = await createRuntimeForApp({
    app,
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
    worker: runtime.snapshot().worker,
  })
}

export function createSoulAppClient(options: SoulAppClientOptions) {
  const fetcher = options.fetch ?? fetch
  const prefix = options.baseUrl?.replace(/\/$/, '') ?? ''
  const headers = options.token ? { authorization: `Bearer ${options.token}` } : undefined

  async function json<T>(route: string, init?: RequestInit): Promise<T> {
    const res = await fetcher(`${prefix}${route}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...headers,
        ...init?.headers,
      },
    })
    if (!res.ok)
      throw new Error(`Soul App client request failed ${res.status}: ${route}`)
    return await res.json() as T
  }

  return {
    broker: {
      audit: {
        list(context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/audit${queryString(context)}`)
        },
      },
      connectors: {
        readEvidence(connectorId: string, query: Record<string, unknown>, context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/connectors/${connectorId}/evidence${queryString(context)}`, {
            body: JSON.stringify({ query }),
            method: 'POST',
          })
        },
      },
      engine: {
        createInvocation(input: { prompt: string }, context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/engine/invocations${queryString(context)}`, {
            body: JSON.stringify(input),
            method: 'POST',
          })
        },
      },
      permissions: {
        list(context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/permissions${queryString(context)}`)
        },
      },
      storage: {
        get(key: string, context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/storage/${encodeBrokerPath(key)}${queryString(context)}`)
        },
        list(context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/storage${queryString(context)}`)
        },
        put(key: string, valueJson: Record<string, unknown>, context?: SoulAppBrokerContextQuery & { namespace?: string }) {
          const { namespace, ...ctx } = context ?? {}
          return json(`/api/local/apps/${options.appId}/broker/storage/${encodeBrokerPath(key)}${queryString(ctx)}`, {
            body: JSON.stringify({ namespace, valueJson }),
            method: 'PUT',
          })
        },
      },
    },
    createSessionTurn(workerId: string, workspaceId: string, input: SoulAppCreateSessionTurnInput) {
      return json(`/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions`, {
        body: JSON.stringify(input),
        method: 'POST',
      })
    },
    createWorker(input: SoulAppCreateWorkerInput) {
      return json('/api/local/workers', {
        body: JSON.stringify({
          ...input,
          soulId: options.appId,
        }),
        method: 'POST',
      })
    },
    createWorkspace(workerId: string, input: SoulAppCreateWorkspaceInput) {
      return json(`/api/local/workers/${workerId}/workspaces`, {
        body: JSON.stringify(input),
        method: 'POST',
      })
    },
    getApp() {
      return json(`/api/local/apps/${options.appId}`)
    },
  }
}

function encodeBrokerPath(value: string): string {
  return value.split('/').map(part => encodeURIComponent(part)).join('/')
}

function queryString(input?: SoulAppBrokerContextQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input ?? {})) {
    if (typeof value === 'string' && value.length > 0)
      params.set(key, value)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
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
  executor?: LocalExecutor
  now?: () => string
  workerId: string
  workerName: string
  workersRoot: string
}): Promise<LocalWorkerRuntime> {
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
  return runtime
}

function harness(input: {
  app: SoulAppDefinition
  catalog: HostSoulCatalog
  hostedApp: HostedSoulApp
  runtime: LocalWorkerRuntime
  worker: WorkerRow
}): SoulAppRuntimeHarness {
  return {
    ...input,
    dispose: closeWorkerDb,
    sessionMetadata: capabilityTemplateId => sessionMetadata(input.app, input.catalog.templates, capabilityTemplateId),
    snapshot: () => input.runtime.snapshot(),
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
