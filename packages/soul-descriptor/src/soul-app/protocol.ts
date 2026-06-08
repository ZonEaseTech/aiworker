import type {
  SoulAppPermission,
} from './manifest'

export interface SoulAppScopedContext {
  appId: string
  operatorId?: string
  permissions: readonly SoulAppPermission[]
  sessionId?: string
  workerId?: string
  workspaceId?: string
}

export interface SoulAppProtocolResult {
  message?: string
  ok: boolean
}

export interface SoulAppLifecycleProtocol {
  archive: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  enable: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  healthcheck: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  install: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  upgrade: (context: SoulAppScopedContext, fromVersion: string) => Promise<SoulAppProtocolResult>
}

export interface SoulAppEventProtocol {
  onSessionCreated?: (context: SoulAppScopedContext, event: { sessionId: string }) => Promise<void>
  onInvocationCompleted?: (context: SoulAppScopedContext, event: { invocationId: string, sessionId: string }) => Promise<void>
}
