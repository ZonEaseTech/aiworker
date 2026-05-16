import type {
  SoulAppEngineAssets,
  SoulAppManifest,
  SoulAppManifestValidationOptions,
  SoulAppProtocolHandlers,
} from '@zonease/aiworker-shared'

import {
  soulAppManifestSchema,
  validateSoulAppManifest,
} from '@zonease/aiworker-shared'

export {
  namespaceSoulAppCapabilityId,
  parseNamespacedSoulAppCapabilityId,
} from '@zonease/aiworker-shared'
export type {
  CapabilityTemplate,
  HostedSoulApp,
  SoulAppArtifactValidationResult,
  SoulAppCapability,
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulAppManifest,
  SoulAppMcpClientEngineAssets,
  SoulAppMcpServerEngineAssets,
  SoulAppProjectionReceipt,
  SoulAppProjectionReceiptEntry,
  SoulAppProtocolHandlers,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
  SoulAppSkillEngineAssets,
  SoulAppWorkspaceEngineAssets,
  VerticalSoul,
} from '@zonease/aiworker-shared'

export interface SoulAppDefinition extends SoulAppProtocolHandlers {
  manifest: SoulAppManifest
}

export interface SoulAppClientOptions {
  appId: string
  baseUrl?: string
  fetch?: SoulAppFetch
  mountToken?: string
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

export interface SoulAppWebStorageOptions {
  appId: string
  localStorage?: SoulAppStorageLike
  sessionId?: string
  sessionStorage?: SoulAppStorageLike
  workerId?: string
  workspaceId?: string
}

export interface SoulAppStorageLike {
  readonly length: number
  getItem: (key: string) => string | null
  key: (index: number) => string | null
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}

export interface SoulAppWebStorageFacade {
  clearScope: () => SoulAppWebStorageClearResult
  get: <T = unknown>(key: string) => SoulAppWebStorageReadResult<T>
  key: (key: string) => string
  remove: (key: string) => SoulAppWebStorageWriteResult
  set: (key: string, value: unknown) => SoulAppWebStorageWriteResult
}

export interface SoulAppWebStorage {
  local: SoulAppWebStorageFacade
  session: SoulAppWebStorageFacade
}

export type SoulAppWebStorageReadResult<T>
  = | { ok: true, value: T | null }
    | SoulAppWebStorageFailure

export type SoulAppWebStorageWriteResult
  = | { ok: true }
    | SoulAppWebStorageFailure

export type SoulAppWebStorageClearResult
  = | { ok: true, removed: number }
    | SoulAppWebStorageFailure

export type SoulAppWebStorageFailureCode
  = | 'invalid_key'
    | 'parse_error'
    | 'serialize_error'
    | 'storage_unavailable'

export interface SoulAppWebStorageFailure {
  code: SoulAppWebStorageFailureCode
  message: string
  ok: false
}

export function defineSoulApp(input: SoulAppProtocolHandlers): SoulAppDefinition {
  const manifest = soulAppManifestSchema.parse(input.manifest)
  return {
    ...input,
    manifest,
  }
}

export function defineSoulAppEngineAssets(input: SoulAppEngineAssets): SoulAppEngineAssets {
  return input
}

export function createSoulAppManifest(input: unknown, options: SoulAppManifestValidationOptions = {}): SoulAppManifest {
  const result = validateSoulAppManifest(input, options)
  if (result.status !== 'valid' || !result.manifest)
    throw new Error(result.issues.map(issue => `${issue.path ?? '<root>'}: ${issue.message}`).join('; ') || 'Invalid Soul App manifest.')
  return result.manifest
}

export function createSoulAppWebStorage(options: SoulAppWebStorageOptions): SoulAppWebStorage {
  const localPrefix = scopedBrowserStoragePrefix(options, 'local')
  const sessionPrefix = scopedBrowserStoragePrefix(options, 'session')
  return {
    local: createSoulAppWebStorageFacade(options.localStorage ?? globalStorage('localStorage'), localPrefix),
    session: createSoulAppWebStorageFacade(options.sessionStorage ?? globalStorage('sessionStorage'), sessionPrefix),
  }
}

export function createSoulAppClient(options: SoulAppClientOptions) {
  const fetcher = options.fetch ?? fetch
  const prefix = options.baseUrl?.replace(/\/$/, '') ?? ''
  const headers: Record<string, string> = {}
  if (options.token)
    headers.authorization = `Bearer ${options.token}`
  if (options.mountToken)
    headers['x-aiworker-mount-token'] = options.mountToken

  async function json<T>(route: string, init?: RequestInit): Promise<T> {
    const res = await fetcher(`${prefix}${route}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(Object.keys(headers).length ? headers : {}),
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
      providers: {
        list(context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/providers${queryString(context)}`)
        },
      },
      search: {
        query(query: string, context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/search${queryString(context, { query })}`)
        },
        upsert(id: string, input: {
          artifactId?: string | null
          kind: string
          reference?: { id: string, type: string, url?: string }
          reviewId?: string | null
          sessionId?: string | null
          summary?: string | null
          title: string
          workspaceId?: string | null
        }, context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/search/${encodeBrokerPath(id)}${queryString(context)}`, {
            body: JSON.stringify(input),
            method: 'PUT',
          })
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

function createSoulAppWebStorageFacade(storage: SoulAppStorageLike | undefined, prefix: string): SoulAppWebStorageFacade {
  function key(key: string): string {
    return `${prefix}:${key}`
  }

  function validKey(input: string): SoulAppWebStorageFailure | null {
    if (!input || input.startsWith('/') || input.startsWith('aiworker:') || input.includes('://')) {
      return {
        code: 'invalid_key',
        message: 'Soul App browser storage key must be a non-empty relative key.',
        ok: false,
      }
    }
    return null
  }

  function unavailable(): SoulAppWebStorageFailure {
    return {
      code: 'storage_unavailable',
      message: 'Browser storage is unavailable for this Soul App scope.',
      ok: false,
    }
  }

  return {
    clearScope(): SoulAppWebStorageClearResult {
      if (!storage)
        return unavailable()
      try {
        const keys: string[] = []
        for (let index = 0; index < storage.length; index++) {
          const item = storage.key(index)
          if (item?.startsWith(`${prefix}:`))
            keys.push(item)
        }
        for (const item of keys)
          storage.removeItem(item)
        return { ok: true, removed: keys.length }
      }
      catch {
        return unavailable()
      }
    },
    get<T = unknown>(input: string): SoulAppWebStorageReadResult<T> {
      const failure = validKey(input)
      if (failure)
        return failure
      if (!storage)
        return unavailable()
      try {
        const value = storage.getItem(key(input))
        if (value === null)
          return { ok: true, value: null }
        return { ok: true, value: JSON.parse(value) as T }
      }
      catch (error) {
        return error instanceof SyntaxError
          ? { code: 'parse_error', message: 'Browser storage value is not valid JSON.', ok: false }
          : unavailable()
      }
    },
    key,
    remove(input: string): SoulAppWebStorageWriteResult {
      const failure = validKey(input)
      if (failure)
        return failure
      if (!storage)
        return unavailable()
      try {
        storage.removeItem(key(input))
        return { ok: true }
      }
      catch {
        return unavailable()
      }
    },
    set(input: string, value: unknown): SoulAppWebStorageWriteResult {
      const failure = validKey(input)
      if (failure)
        return failure
      if (!storage)
        return unavailable()
      try {
        storage.setItem(key(input), JSON.stringify(value))
        return { ok: true }
      }
      catch (error) {
        return error instanceof TypeError
          ? { code: 'serialize_error', message: 'Browser storage value is not JSON serializable.', ok: false }
          : unavailable()
      }
    },
  }
}

function scopedBrowserStoragePrefix(options: SoulAppWebStorageOptions, kind: 'local' | 'session'): string {
  const workspaceScope = options.workerId && options.workspaceId
    ? `${options.workerId}:${options.workspaceId}`
    : 'app'
  if (kind === 'session')
    return `aiworker:app:${options.appId}:${workspaceScope}:session:${options.sessionId ?? 'app'}`
  return `aiworker:app:${options.appId}:${workspaceScope}:local`
}

function globalStorage(name: 'localStorage' | 'sessionStorage'): SoulAppStorageLike | undefined {
  const scope = globalThis as typeof globalThis & Partial<Record<'localStorage' | 'sessionStorage', SoulAppStorageLike>>
  return scope[name]
}

function encodeBrokerPath(value: string): string {
  return value.split('/').map(part => encodeURIComponent(part)).join('/')
}

function queryString(input?: SoulAppBrokerContextQuery, seed: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(seed))
    params.set(key, value)
  for (const [key, value] of Object.entries(input ?? {})) {
    if (typeof value === 'string' && value.length > 0)
      params.set(key, value)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
