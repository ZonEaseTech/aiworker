import type {
  HostedSoulApp,
  LocalSession,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorker,
  LocalWorkerOverlay,
  LocalWorkspace,
  SoulAppProjectionReceipt,
} from '@zonease/aiworker-soul-protocol'
import type { CapabilityTemplate, VerticalSoul } from '../types.compat'

export interface LocalSoulAppWorkspaceContext {
  terminal?: {
    cwd: {
      protocolProvider?: string
      source: 'host-workspace-root' | 'app-workspace-path' | 'protocol-resolver'
      subpath?: string
    }
    id: string
    label: string
    requiredPermissions?: readonly string[]
  }
}

export interface LocalSoulAppLifecycleResponse {
  app: LocalHostedSoulApp
  catalog?: unknown
}

export type LocalHostedSoulApp = HostedSoulApp & {
  mountedContribution: HostedSoulApp['mountedContribution'] & {
    workspaceContext?: LocalSoulAppWorkspaceContext | null
  }
}

export interface LocalInfoResponse {
  runtimeVersion: string
  startedAt: string
  workers: LocalWorker[]
}

export interface LocalWorkspaceData {
  info: LocalInfoResponse
  apps: LocalHostedSoulApp[]
  workers: LocalWorker[]
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
  workspaces: LocalWorkspace[]
  sessions: LocalSession[]
  turns: LocalTurn[]
  settings: LocalSettingsConfig
}

export interface WorkerOverlayResponse {
  overlay: LocalWorkerOverlay
}

export interface WorkerWorkspaceProjectionResponse {
  projection: {
    receipt: SoulAppProjectionReceipt | null
    workspace: LocalWorkspace
  }
}

export interface WorkerOverlaySaveBody {
  assets: Array<{
    checksum?: null | string
    enabled: boolean
    id: string
    kind: 'entry-file' | 'mcp-client' | 'skill'
    metadataJson?: Record<string, unknown>
    optionsJson?: Record<string, unknown>
    sourceRef: string
    target: string
  }>
}
