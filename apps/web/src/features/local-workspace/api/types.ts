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
  requiredPermissions?: readonly string[]
  slot: 'primary' | 'action' | 'drawer-toggle' | 'refresh' | 'settings'
}

export interface LocalSoulAppShellSearch {
  id: string
  label: string
  placeholder: string
  protocolProvider: string
  requiredPermissions?: readonly string[]
}

export interface LocalSoulAppShellDescriptor {
  actions?: LocalSoulAppShellAction[]
  primaryAction?: LocalSoulAppShellAction
  search?: LocalSoulAppShellSearch
  settings?: {
    id: string
    label: string
    protocolAction: string
    requiredPermissions?: readonly string[]
  }
}

export interface LocalSoulAppActionResponse {
  action: {
    id: string
    protocolAction: string
  }
  result: {
    message?: string
    ok: boolean
    redirectTo?: string
    refresh?: boolean
  }
}

export interface LocalSoulAppActionScope {
  operatorId?: string | null
  sessionId?: string | null
  workerId?: string | null
  workspaceId?: string | null
}

export interface LocalSoulAppSearchResult {
  appId: string
  authority: 'soul-app'
  id: string
  kind: string
  openAction?: {
    id: string
    input?: Record<string, unknown>
  }
  status?: string
  summary?: string
  title: string
}

export interface LocalSoulAppSearchResponse {
  items: LocalSoulAppSearchResult[]
  providerId: string
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
