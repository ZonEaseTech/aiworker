import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalLesson,
  LocalReview,
  LocalSession,
  LocalWorkspace,
  SoulWorkbenchAction,
  SoulWorkbenchDescriptor,
  VerticalSoul,
} from '@zonease/aiworker-shared'
import type { FormEvent, ReactNode } from 'react'
import type { displaySoul, messagesFor, normalizeLocale } from '../../features/i18n'
import type { LocalSoulAppActionResponse, LocalSoulAppWorkbenchAction } from '../../features/local-workspace/api/types'
import type { EngineReadiness } from '../../features/session/engine-readiness'

export type WorkerMessages = ReturnType<typeof messagesFor>
export type WorkerLocale = ReturnType<typeof normalizeLocale>
export type SoulDisplay = ReturnType<typeof displaySoul>

export interface SoulArtifactPreviewState {
  artifactId: string | null
  content: string
  error: string | null
  loading: boolean
}

export interface SoulProfilePreviewState {
  content: string
  error: string | null
  loading: boolean
  workspaceId: string | null
}

export type SoulSessionMaterialEncoding = 'base64' | 'utf8'

export interface SoulSessionMaterialInput {
  content: string
  encoding: SoulSessionMaterialEncoding
  mimeType: string
  name: string
  size: number
}

export interface SoulSessionMaterialDescriptor {
  encoding: SoulSessionMaterialEncoding
  mimeType: string
  name: string
  path: string
  size: number
}

export interface SoulSessionDraft {
  context?: string
  materials?: SoulSessionMaterialInput[]
}

export interface SoulWorkbenchContext {
  artifactPreview: SoulArtifactPreviewState
  artifacts: LocalArtifact[]
  copy: WorkerMessages
  engineReadiness: EngineReadiness
  lessons: LocalLesson[]
  locale: WorkerLocale
  onActionSelect: (action: SoulWorkbenchAction) => void
  onContextChange: (value: string) => void
  onCreateWorkspace: () => void
  onOpenConnectors: () => void
  onOpenSession: (session: LocalSession) => void
  onOpenSettings: () => void
  onOpenWorkspace: (workspace: LocalWorkspace) => void
  onPromoteProfileRevision: (profileMarkdown?: string) => Promise<void> | void
  onRefresh: () => void
  onSubmitSession: (event: FormEvent<HTMLFormElement>, draft?: SoulSessionDraft) => Promise<void> | void
  onTemplateChange: (templateId: string) => void
  profilePreview: SoulProfilePreviewState
  profileRevisionSubmitting: boolean
  reviews: LocalReview[]
  selectedArtifact: LocalArtifact | null
  selectedTemplate: CapabilityTemplate
  selectedWorkspace: LocalWorkspace | null
  workbenchBridge?: {
    actionDescriptors: readonly LocalSoulAppWorkbenchAction[]
    actionRoles: ReadonlySet<string>
    busyActionId: string | null
    onAction: (action: LocalSoulAppWorkbenchAction) => Promise<LocalSoulAppActionResponse['result'] | null>
    results: ReactNode
    search: ReactNode
    status: ReactNode
  } | null
  sessions: LocalSession[]
  soul: VerticalSoul
  soulCopy: SoulDisplay
  submitting: boolean
  templates: CapabilityTemplate[]
  value: string
  workbench: SoulWorkbenchDescriptor
  workerName: string
  workspaces: LocalWorkspace[]
}

export interface SoulWorkbenchRendererProps {
  context: SoulWorkbenchContext
}

export type SoulWorkbenchRendererComponent = (props: SoulWorkbenchRendererProps) => ReactNode
