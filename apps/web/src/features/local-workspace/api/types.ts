import type {
  CapabilityTemplate,
  HostedSoulApp,
  LocalArtifact,
  LocalFile,
  LocalLesson,
  LocalReview,
  LocalSession,
  LocalSessionEvent,
  LocalSettingsConfig,
  LocalTurn,
  LocalWorker,
  LocalWorkspace,
  VerticalSoul,
} from '@zonease/aiworker-shared'

export interface LocalSoulAppShellAction {
  id: string
  label: string
  protocolAction: string
  requiredPermissions?: string[]
  slot: 'primary' | 'action' | 'drawer-toggle' | 'refresh' | 'settings'
}

export interface LocalSoulAppShellSearch {
  id: string
  label: string
  placeholder: string
  protocolProvider: string
  requiredPermissions?: string[]
}

export interface LocalSoulAppShellDescriptor {
  actions?: LocalSoulAppShellAction[]
  primaryAction?: LocalSoulAppShellAction
  search?: LocalSoulAppShellSearch
  settings?: {
    id: string
    label: string
    protocolAction: string
    requiredPermissions?: string[]
  }
}

export type LocalHostedSoulApp = HostedSoulApp & {
  mountedContribution: HostedSoulApp['mountedContribution'] & {
    shell?: LocalSoulAppShellDescriptor | null
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
  files: LocalFile[]
  artifacts: LocalArtifact[]
  reviews: LocalReview[]
  lessons: LocalLesson[]
  events: LocalSessionEvent[]
  settings: LocalSettingsConfig
}
