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

export interface LocalInfoResponse {
  runtimeVersion: string
  startedAt: string
  workers: LocalWorker[]
}

export interface LocalWorkspaceData {
  info: LocalInfoResponse
  apps: HostedSoulApp[]
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
