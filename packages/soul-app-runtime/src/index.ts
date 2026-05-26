import type {
  HostSoulCatalog,
  LocalExecutor,
  LocalWorkerRuntime,
} from '@zonease/aiworker-host-runtime'
import type {
  HostedSoulApp,
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulDescriptorV1,
} from '@zonease/aiworker-soul-protocol'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  createLocalWorkerRuntime,
  enableSoulApp,
  installSoulDescriptor,
  listHostSoulCatalog,
} from '@zonease/aiworker-host-runtime'
import { namespaceSoulAppCapabilityId } from '@zonease/aiworker-soul-protocol'
import {
  closeWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'

export { renderUniversalWorkbenchHtml } from './universal-workbench-html'

interface CapabilityTemplate {
  description: string
  id: string
  inputHints: readonly string[]
  name: string
  outputKind: string
  promptRef: string
  reviewRubricRef: string | null
  soulId: string
}

export interface StandaloneSoulAppRuntimeOptions {
  appDistRoot?: string
  appHome: string
  executor?: LocalExecutor
  hostVersion?: string
  migrationsFolder?: string
  now?: () => string
  workerId?: string
  workerName?: string
}

export interface MountedSoulAppTestRuntimeOptions {
  appDistRoot?: string
  dbPath: string
  executor?: LocalExecutor
  hostVersion?: string
  migrationsFolder?: string
  now?: () => string
  workerId?: string
  workerName?: string
  workersRoot: string
}

export interface SoulAppRuntimeHarness {
  catalog: HostSoulCatalog
  descriptor: SoulDescriptorV1
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
  descriptor: SoulDescriptorV1,
  options: StandaloneSoulAppRuntimeOptions,
): Promise<SoulAppRuntimeHarness> {
  const dbPath = path.join(options.appHome, 'worker.db')
  const workersRoot = path.join(options.appHome, 'workers')
  const identity = descriptorIdentity(descriptor)
  bootstrapDb(dbPath, options.migrationsFolder)
  const hostedApp = installAndEnable(descriptor, {
    hostVersion: options.hostVersion,
    now: options.now,
    sourceRef: 'standalone:inline-descriptor',
  })
  const { runtime, worker } = await createRuntimeForDescriptor({
    descriptor,
    appDistRoot: options.appDistRoot,
    executor: options.executor,
    now: options.now,
    workerId: options.workerId ?? `${identity.appId}-worker`,
    workerName: options.workerName ?? identity.name,
    workersRoot,
  })
  return harness({
    catalog: scopedCatalog(hostedApp),
    descriptor,
    hostedApp,
    runtime,
    worker,
  })
}

export async function createMountedSoulAppTestRuntime(
  descriptor: SoulDescriptorV1,
  options: MountedSoulAppTestRuntimeOptions,
): Promise<SoulAppRuntimeHarness> {
  const identity = descriptorIdentity(descriptor)
  bootstrapDb(options.dbPath, options.migrationsFolder)
  const hostedApp = installAndEnable(descriptor, {
    hostVersion: options.hostVersion,
    now: options.now,
    sourceRef: 'mounted-test:inline-descriptor',
  })
  const { runtime, worker } = await createRuntimeForDescriptor({
    descriptor,
    appDistRoot: options.appDistRoot,
    executor: options.executor,
    now: options.now,
    workerId: options.workerId ?? `${identity.appId}-worker`,
    workerName: options.workerName ?? identity.name,
    workersRoot: options.workersRoot,
  })
  return harness({
    catalog: listHostSoulCatalog(),
    descriptor,
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
  descriptor: SoulDescriptorV1,
  options: {
    hostVersion?: string
    now?: () => string
    sourceRef: string
  },
): HostedSoulApp {
  installSoulDescriptor({
    descriptor,
    sourceKind: 'inline',
    sourceRef: options.sourceRef,
  }, {
    hostVersion: options.hostVersion,
    now: options.now,
  })
  return enableSoulApp(descriptorIdentity(descriptor).appId, {
    hostVersion: options.hostVersion,
    now: options.now,
  })
}

async function createRuntimeForDescriptor(input: {
  appDistRoot?: string
  descriptor: SoulDescriptorV1
  executor?: LocalExecutor
  now?: () => string
  workerId: string
  workerName: string
  workersRoot: string
}): Promise<{ runtime: LocalWorkerRuntime, worker: SoulAppRuntimeWorkerSnapshot }> {
  const descriptor = input.descriptor
  const identity = descriptorIdentity(descriptor)
  const capabilities = descriptorCapabilities(descriptor)
  const worker = upsertWorker({
    id: input.workerId,
    soulId: identity.appId,
    name: input.workerName,
    defaultEngineId: descriptorDefaultEngine(descriptor),
    metadataJson: {
      defaultTemplates: capabilities.map(capability => namespaceSoulAppCapabilityId(identity.appId, capability.id)),
      description: identity.description,
      domainSoulId: identity.soulId,
      soulAppId: identity.appId,
    },
    at: input.now?.(),
  })
  const runtime = createLocalWorkerRuntime({
    engineAssetSource: input.appDistRoot
      ? {
          appId: identity.appId,
          engineAssets: engineAssetsForDescriptor(descriptor),
          sourceRoot: input.appDistRoot,
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

function engineAssetsForDescriptor(descriptor: SoulDescriptorV1): SoulAppEngineAssets {
  const mcpClients = Object.entries(descriptor.engine.mcp?.targets ?? {})
    .flatMap(([target, entry]) => {
      if (!isSoulAppEngineTarget(target))
        return []
      return [{
        source: stripDistPrefix(path.posix.dirname(entry.file)),
        target,
      }]
    })
  return {
    workspace: {
      source: stripDistPrefix(descriptor.engine.workspaceAssets?.source ?? 'dist/engine-assets/workspace'),
    },
    ...(descriptor.engine.skills
      ? {
          skills: {
            source: stripDistPrefix(descriptor.engine.skills.source),
            targets: ['codex', 'claude-code'],
          },
        }
      : {}),
    ...(mcpClients.length > 0 ? { mcpClients } : {}),
  }
}

function stripDistPrefix(value: string): string {
  return value.replace(/^dist\//, '')
}

function descriptorIdentity(descriptor: SoulDescriptorV1): { appId: string, description: string, name: string, soulId: string } {
  const identity = descriptor.identity as Record<string, unknown>
  const appId = requireDescriptorString(identity.appId, 'identity.appId')
  const name = requireDescriptorString(identity.name, 'identity.name')
  const soulId = requireDescriptorString(identity.soulId, 'identity.soulId')
  return {
    appId,
    description: typeof identity.description === 'string' ? identity.description : name,
    name,
    soulId,
  }
}

function descriptorDefaultEngine(descriptor: SoulDescriptorV1): string {
  const configuration = descriptor.configuration as { defaults?: { engine?: unknown } }
  return typeof configuration.defaults?.engine === 'string' ? configuration.defaults.engine : 'codex'
}

function descriptorCapabilities(descriptor: SoulDescriptorV1): Array<{ id: string }> {
  return descriptor.capabilities.map((capability, index) => {
    if (!capability || typeof capability !== 'object')
      throw new Error(`descriptor capability must be an object: capabilities.${index}`)
    const id = (capability as { id?: unknown }).id
    return { id: requireDescriptorString(id, `capabilities.${index}.id`) }
  })
}

function requireDescriptorString(value: unknown, pathLabel: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`descriptor ${pathLabel} must be a non-empty string`)
  return value
}

function isSoulAppEngineTarget(value: string): value is SoulAppEngineTarget {
  return value === 'codex' || value === 'claude-code'
}

function harness(input: {
  catalog: HostSoulCatalog
  descriptor: SoulDescriptorV1
  hostedApp: HostedSoulApp
  runtime: LocalWorkerRuntime
  worker: SoulAppRuntimeWorkerSnapshot
}): SoulAppRuntimeHarness {
  return {
    ...input,
    dispose: closeWorkerDb,
    sessionMetadata: capabilityTemplateId => sessionMetadata(input.descriptor, input.catalog.templates, capabilityTemplateId),
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
    souls: [app.projectedSoul],
    templates: [...app.projectedCapabilities],
  }
}

export type {
  LocalExecutor,
  LocalExecutorInput,
  LocalExecutorResult,
  LocalWorkerRuntime,
} from '@zonease/aiworker-host-runtime'

export function mountSessionApiProxy(request: Request, options: {
  hostApiBaseUrl: string
  workerId: string
  workspaceId?: string | null
}): Promise<Response> | null {
  const url = new URL(request.url)
  const hostApi = options.hostApiBaseUrl.replace(/\/$/, '')
  const workerId = url.searchParams.get('workerId') ?? options.workerId
  const workspaceId = url.searchParams.get('workspaceId') ?? options.workspaceId ?? null

  if (url.pathname === '/api/templates' && request.method === 'GET')
    return proxyJsonRequest(request, `${hostApi}/api/local/workers/${workerId}/templates`)

  if (url.pathname === '/api/workspaces' && request.method === 'GET')
    return proxyJsonRequest(request, `${hostApi}/api/local/workers/${workerId}/workspaces`)

  if (url.pathname === '/api/workspaces' && request.method === 'POST')
    return proxyJsonRequest(request, `${hostApi}/api/local/workers/${workerId}/workspaces`)

  if (url.pathname === '/api/sessions' && request.method === 'GET') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ sessions: [] }))
    return proxyJsonRequest(request, `${hostApi}/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions`)
      .catch(() => Response.json({ sessions: [] }))
  }

  if (url.pathname === '/api/sessions' && request.method === 'POST') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ error: { code: 'WORKSPACE_REQUIRED', message: 'workspaceId is required.' } }, { status: 400 }))
    return proxyJsonRequest(request, `${hostApi}/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions`)
      .catch(() => new Response(null, { status: 502 }))
  }

  const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)
  if (sessionMatch && request.method === 'GET')
    return proxyJsonRequest(request, `${hostApi}/api/sessions/${sessionMatch[1]}`)

  const sessionEventsMatch = /^\/api\/sessions\/([^/]+)\/events$/.exec(url.pathname)
  if (sessionEventsMatch && request.method === 'GET') {
    const params = new URLSearchParams()
    const after = url.searchParams.get('after')
    if (after !== null)
      params.set('after', after)
    const query = params.size > 0 ? `?${params.toString()}` : ''
    return proxyJsonRequest(request, `${hostApi}/api/local/sessions/${sessionEventsMatch[1]}/events${query}`)
  }

  const sessionTurnsMatch = /^\/api\/sessions\/([^/]+)\/turns$/.exec(url.pathname)
  if (sessionTurnsMatch && request.method === 'GET')
    return proxyJsonRequest(request, `${hostApi}/api/local/sessions/${sessionTurnsMatch[1]}/turns`)

  const sessionInvocationsMatch = /^\/api\/sessions\/([^/]+)\/invocations$/.exec(url.pathname)
  if (sessionInvocationsMatch && request.method === 'POST') {
    return proxyJsonRequest(request, `${hostApi}/api/sessions/${sessionInvocationsMatch[1]}/invocations`)
      .catch(() => new Response(null, { status: 502 }))
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
  descriptor: SoulDescriptorV1,
  templates: readonly CapabilityTemplate[],
  capabilityTemplateId: string,
): Record<string, unknown> {
  const template = templates.find(item => item.id === capabilityTemplateId)
  const identity = descriptorIdentity(descriptor)
  return {
    capabilityTemplateId,
    inputHints: template?.inputHints ?? [],
    outputKind: template?.outputKind ?? 'session',
    reviewRubricRef: template?.reviewRubricRef ?? null,
    skillName: template?.name ?? capabilityTemplateId,
    soulAppId: identity.appId,
    soulName: identity.name,
  }
}
