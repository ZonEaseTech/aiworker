import type {
  HostedSoulApp,
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulDescriptorV1,
} from '@zonease/aiworker-soul-descriptor'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import type {
  LocalExecutor,
  LocalWorkerRuntime,
  SoulCatalog,
} from '@zonease/aiworker-worker-runtime'

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  closeWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import {
  createLocalWorkerRuntime,
  enableSoulApp,
  installSoulDescriptor,
  listSoulCatalog,
} from '@zonease/aiworker-worker-runtime'

export { renderUniversalWorkbenchHtml } from './universal-workbench-html'

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
  catalog: SoulCatalog
  descriptor: SoulDescriptorV1
  dispose: () => void
  hostedApp: HostedSoulApp
  runtime: LocalWorkerRuntime
  snapshot: LocalWorkerRuntime['snapshot']
  worker: SoulAppRuntimeWorkerSnapshot
}

export interface SoulAppRuntimeWorkerSnapshot {
  appId: string
  defaultEngineId: string | null
  id: string
  metadata: Record<string, unknown>
  name: string
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
    catalog: listSoulCatalog(),
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
  const worker = upsertWorker({
    id: input.workerId,
    appId: identity.appId,
    name: input.workerName,
    defaultEngineId: descriptorDefaultEngine(descriptor),
    metadataJson: {
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
      appId: worker.appId,
      defaultEngineId: worker.defaultEngineId,
      id: worker.id,
      metadata: worker.metadataJson,
      name: worker.name,
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

function requireDescriptorString(value: unknown, pathLabel: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`descriptor ${pathLabel} must be a non-empty string`)
  return value
}

function isSoulAppEngineTarget(value: string): value is SoulAppEngineTarget {
  return value === 'codex' || value === 'claude-code'
}

function harness(input: {
  catalog: SoulCatalog
  descriptor: SoulDescriptorV1
  hostedApp: HostedSoulApp
  runtime: LocalWorkerRuntime
  worker: SoulAppRuntimeWorkerSnapshot
}): SoulAppRuntimeHarness {
  return {
    ...input,
    dispose: closeWorkerDb,
    snapshot: () => input.runtime.snapshot(),
  }
}

function publicWorkerSnapshot(worker: WorkerRow): SoulAppRuntimeWorkerSnapshot {
  return {
    appId: worker.appId,
    defaultEngineId: worker.defaultEngineId,
    id: worker.id,
    metadata: worker.metadataJson,
    name: worker.name,
  }
}

function scopedCatalog(app: HostedSoulApp): SoulCatalog {
  return {
    apps: [app],
    souls: [app.projectedSoul],
  }
}

export type {
  LocalExecutor,
  LocalExecutorInput,
  LocalExecutorResult,
  LocalWorkerRuntime,
} from '@zonease/aiworker-worker-runtime'

export function mountSessionApiProxy(request: Request, options: {
  hostApiBaseUrl: string
  workerId: string
  workspaceId?: string | null
}): Promise<Response> | null {
  const url = new URL(request.url)
  const hostApi = options.hostApiBaseUrl.replace(/\/$/, '')
  const workerId = url.searchParams.get('workerId') ?? options.workerId
  const workspaceId = url.searchParams.get('workspaceId') ?? options.workspaceId ?? null

  if (url.pathname === '/api/workspaces' && request.method === 'GET')
    return proxyJsonRequest(request, `${hostApi}/api/workspace-locators?workerId=${encodeURIComponent(workerId)}`)

  if (url.pathname === '/api/workspaces' && request.method === 'POST')
    return proxyMountedWorkspaceCreateRequest(request, `${hostApi}/api/workspace-locators`, workerId)

  if (url.pathname === '/api/sessions' && request.method === 'GET') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ sessions: [] }))
    return proxyJsonRequest(request, `${hostApi}/api/sessions?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(workspaceId)}`)
      .catch(() => Response.json({ sessions: [] }))
  }

  if (url.pathname === '/api/sessions' && request.method === 'POST') {
    if (!workspaceId)
      return Promise.resolve(Response.json({ error: { code: 'WORKSPACE_REQUIRED', message: 'workspaceId is required.' } }, { status: 400 }))
    return proxyMountedSessionCreateRequest(request, `${hostApi}/api/sessions`, workerId, workspaceId)
      .catch(() => new Response(null, { status: 502 }))
  }

  const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)
  if (sessionMatch && request.method === 'GET')
    return proxyJsonRequest(request, `${hostApi}/api/sessions/${sessionMatch[1]}`)

  const sessionEventsMatch = /^\/api\/sessions\/([^/]+)\/events$/.exec(url.pathname)
  if (sessionEventsMatch && request.method === 'GET')
    return proxyMountedSessionEventsRequest(request, `${hostApi}/api/sessions/${sessionEventsMatch[1]}`)

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

async function proxyMountedSessionEventsRequest(request: Request, target: string): Promise<Response> {
  const sourceUrl = new URL(request.url)
  const parsedAfter = Number(sourceUrl.searchParams.get('after') ?? request.headers.get('last-event-id') ?? 0)
  const after = Number.isFinite(parsedAfter) ? parsedAfter : 0
  const response = await fetch(target, {
    headers: request.headers,
    method: 'GET',
  })
  if (!response.ok)
    return new Response(response.body, { status: response.status, headers: response.headers })

  const body = await response.json().catch(() => ({})) as { events?: unknown }
  const events = Array.isArray(body.events) ? body.events : []
  return Response.json({
    events: events.filter(event => sessionEventId(event) > after),
  }, { status: response.status })
}

function sessionEventId(event: unknown): number {
  if (!event || typeof event !== 'object')
    return Number.NaN
  return Number((event as { id?: unknown }).id)
}

async function proxyMountedWorkspaceCreateRequest(request: Request, target: string, workerId: string): Promise<Response> {
  return proxyJsonRequestWithBody(request, target, body => ({ ...body, workerId }))
}

async function proxyMountedSessionCreateRequest(request: Request, target: string, workerId: string, workspaceId: string): Promise<Response> {
  return proxyJsonRequestWithBody(request, target, body => ({ ...body, workerId, workspaceId }))
}

async function proxyJsonRequestWithBody(
  request: Request,
  target: string,
  mapBody: (body: Record<string, unknown>) => Record<string, unknown>,
): Promise<Response> {
  const text = await request.text()
  let parsed: unknown = {}
  if (text.trim().length > 0) {
    try {
      parsed = JSON.parse(text)
    }
    catch {
      parsed = {}
    }
  }
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
  return fetch(target, {
    body: JSON.stringify(mapBody(body)),
    headers: request.headers,
    method: request.method,
  }).then(r => new Response(r.body, { status: r.status, headers: r.headers }))
}

