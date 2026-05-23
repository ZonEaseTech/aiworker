import type {
  HostSoulCatalog,
  LocalExecutor,
  LocalWorkerRuntime,
} from '@zonease/aiworker-core'
import type {
  HostedSoulApp,
  SoulAppManifest,
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
  projectSoulAppCapabilityTemplates,
  projectSoulAppDefaultTemplates,
  projectSoulAppSoul,
} from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'

// -- inlined from deleted shared types --
interface CapabilityTemplate {
  description: string
  id: string
  inputHints: readonly string[]
  name: string
  outputKind: string
  prompt: string
  reviewRubric: readonly string[]
  soulId: string
}

interface VerticalSoul {
  defaultTemplates: readonly string[]
  description: string
  domain: string
  id: string
  name: string
  status: 'available' | 'coming_soon'
}

export { renderUniversalWorkbenchHtml } from './universal-workbench-html'

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
      defaultTemplates: projectSoulAppDefaultTemplates(input.app.manifest),
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
          engineAssets: input.app.manifest.engineAssets,
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

export type {
  LocalExecutor,
  LocalExecutorInput,
  LocalExecutorResult,
  LocalWorkerRuntime,
} from '@zonease/aiworker-core'

export function mountSessionApiProxy(request: Request, options: {
  hostApiBaseUrl: string
  workerId: string
  workspaceId?: string | null
}): Promise<Response> | null {
  const url = new URL(request.url)
  const hostApi = options.hostApiBaseUrl.replace(/\/$/, '')
  const workerId = url.searchParams.get('workerId') ?? options.workerId
  const workspaceId = url.searchParams.get('workspaceId') ?? options.workspaceId ?? null

  if (url.pathname === '/api/templates' && request.method === 'GET') {
    const target = `${hostApi}/api/local/workers/${workerId}/templates`
    return proxyJsonRequest(request, target)
  }

  if (url.pathname === '/api/workspaces' && request.method === 'GET') {
    const target = `${hostApi}/api/local/workers/${workerId}/workspaces`
    return proxyJsonRequest(request, target)
  }

  if (url.pathname === '/api/workspaces' && request.method === 'POST') {
    const target = `${hostApi}/api/local/workers/${workerId}/workspaces`
    return proxyJsonRequest(request, target)
  }

  if (url.pathname === '/api/sessions' && request.method === 'GET') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ sessions: [] }))
    const target = `${hostApi}/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions`
    return proxyJsonRequest(request, target).catch(() => Response.json({ sessions: [] }))
  }

  if (url.pathname === '/api/sessions' && request.method === 'POST') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ error: { code: 'WORKSPACE_REQUIRED', message: 'workspaceId is required.' } }, { status: 400 }))
    const target = `${hostApi}/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions`
    return proxyJsonRequest(request, target).catch(() => new Response(null, { status: 502 }))
  }

  if (url.pathname === '/api/sessions/stream' && request.method === 'POST') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ error: { code: 'WORKSPACE_REQUIRED', message: 'workspaceId is required.' } }, { status: 400 }))
    const target = `${hostApi}/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions/stream`
    return proxyJsonRequest(request, target).catch(() => new Response(null, { status: 502 }))
  }

  const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)
  if (sessionMatch && request.method === 'GET') {
    const target = `${hostApi}/api/local/workers/${workerId}/sessions/${sessionMatch[1]}`
    return proxyJsonRequest(request, target)
  }

  const sessionTurnsMatch = /^\/api\/sessions\/([^/]+)\/turns$/.exec(url.pathname)
  if (sessionTurnsMatch && request.method === 'POST') {
    const target = `${hostApi}/api/local/workers/${workerId}/sessions/${sessionTurnsMatch[1]}/messages`
    return proxyJsonRequest(request, target).catch(() => new Response(null, { status: 502 }))
  }

  const sessionTurnStreamMatch = /^\/api\/sessions\/([^/]+)\/turns\/stream$/.exec(url.pathname)
  if (sessionTurnStreamMatch && request.method === 'POST') {
    const target = `${hostApi}/api/local/workers/${workerId}/sessions/${sessionTurnStreamMatch[1]}/messages/stream`
    return proxyJsonRequest(request, target).catch(() => new Response(null, { status: 502 }))
  }

  return null
}

function proxyJsonRequest(request: Request, target: string): Promise<Response> {
  return fetch(target, {
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    headers: request.headers,
    method: request.method,
  }).then(r => new Response(r.body, { status: r.status, headers: r.headers }))
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
