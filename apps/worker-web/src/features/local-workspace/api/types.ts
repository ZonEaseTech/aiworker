import type {
  HostedSoulApp,
  LocalSession,
  LocalSettingsConfig,
  LocalWorker,
  LocalWorkerConfigKind,
  LocalWorkerConfigTarget,
  LocalWorkerConfigUpdatedBy,
  LocalWorkerConfigValue,
  LocalWorkerOverlay,
  LocalWorkspace,
  SoulAppProjectionReceipt,
} from '@zonease/aiworker-soul-protocol'
import type { VerticalSoul, WorkspaceCapability } from '../model-types'

export interface LocalSoulAppLifecycleResponse {
  app: LocalHostedSoulApp
  catalog?: unknown
}

export type LocalHostedSoulApp = HostedSoulApp

export interface LocalInfoResponse {
  runtimeVersion: string
  startedAt: string
  workers: LocalWorker[]
}

export interface LocalWorkspaceData {
  info: LocalInfoResponse
  apps: LocalHostedSoulApp[]
  capabilities: WorkspaceCapability[]
  workers: LocalWorker[]
  souls: VerticalSoul[]
  workspaces: LocalWorkspace[]
  sessions: LocalSession[]
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

export type WorkerConfigSource = 'app-owned-api' | 'bootstrap' | 'cli' | 'descriptor' | 'migration' | 'web'

export interface WorkerConfigValueResponse {
  archived: boolean
  configKey: string
  source: WorkerConfigSource
  updatedAt: string
  value: LocalWorkerConfigValue | null
  workerId: string
}

export interface WorkerConfigResponse {
  config: {
    values: WorkerConfigValueResponse[]
  }
  workerId: string
}

export interface WorkerConfigMutationResponse {
  config: WorkerConfigValueResponse
}

export interface WorkerConfigSaveBody {
  checksum?: null | string
  enabled: boolean
  kind: LocalWorkerConfigKind
  options?: Record<string, unknown>
  sourceRef?: null | string
  target: LocalWorkerConfigTarget
  updatedAt?: string
  updatedBy?: LocalWorkerConfigUpdatedBy
}
