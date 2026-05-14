import type {
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
      providers: {
        list(context?: SoulAppBrokerContextQuery) {
          return json(`/api/local/apps/${options.appId}/broker/providers${queryString(context)}`)
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
