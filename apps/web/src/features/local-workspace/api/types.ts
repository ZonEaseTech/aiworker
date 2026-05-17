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

export interface LocalSoulAppWorkbenchAction {
  id: string
  label: string
  protocolAction: string
  requiredPermissions?: readonly string[]
  role: 'primary' | 'action' | 'panel-toggle' | 'refresh' | 'settings'
}

export interface LocalSoulAppWorkbenchSearch {
  id: string
  label: string
  placeholder: string
  protocolProvider: string
  requiredPermissions?: readonly string[]
}

export interface LocalSoulAppWorkbenchDescriptor {
  actions?: LocalSoulAppWorkbenchAction[]
  primaryAction?: LocalSoulAppWorkbenchAction
  search?: LocalSoulAppWorkbenchSearch
  settings?: {
    id: string
    label: string
    protocolAction: string
    requiredPermissions?: readonly string[]
  }
}

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

export interface LocalSoulAppSecurityReview {
  appId: string
  connectors: {
    optional: Array<{
      access: readonly string[]
      available: boolean
      enabled: boolean
      id: string
      reason: string
      required: boolean
      scopes: readonly string[]
    }>
    required: Array<{
      access: readonly string[]
      available: boolean
      enabled: boolean
      id: string
      reason: string
      required: boolean
      scopes: readonly string[]
    }>
  }
  descriptorPermissions: Array<{
    id: string
    label: string
    requiredPermissions: readonly string[]
    surface: string
  }>
  manifestPermissions: readonly unknown[]
  status: string
  summary: {
    canEnable: boolean
    descriptorPermissionCount: number
    disabledRequiredConnectorIds: string[]
    manifestPermissionCount: number
    missingRequiredConnectorIds: string[]
    warnings: string[]
  }
}

export interface LocalSoulAppLifecycleResponse {
  app: LocalHostedSoulApp
  catalog?: unknown
  review?: LocalSoulAppSecurityReview
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
    workbench?: LocalSoulAppWorkbenchDescriptor | null
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
  files: LocalFile[]
  artifacts: LocalArtifact[]
  reviews: LocalReview[]
  lessons: LocalLesson[]
  events: LocalSessionEvent[]
  settings: LocalSettingsConfig
}
