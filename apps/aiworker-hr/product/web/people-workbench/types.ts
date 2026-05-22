export type HrLocale = 'de' | 'en' | 'ja' | 'zh-CN'
export type HrWorkbenchTheme = 'dark' | 'light'
export type PersonLifecycle = 'alumni' | 'candidate' | 'employee'
export type LifecycleFilter = 'all' | PersonLifecycle | 'attention'
export type ProfileListSectionId = PersonLifecycle
export type ReviewDisplayState = 'accepted' | 'none' | 'ready' | 'risk'
export type StatusTone = 'good' | 'muted' | 'risk' | 'warn'
export type HrWorkbenchActionScope = 'alumni' | 'artifact' | 'candidate' | 'employee' | 'interview' | 'lifecycle' | 'person' | 'pool' | 'role'
export type ComposerMaterialEncoding = 'base64' | 'utf8'
export type HrProfileDraftType = string
export type HrWorkbenchFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface LocalWorkspace {
  createdAt: string
  id: string
  metadataJson: Record<string, unknown>
  name: string
  rootPath: string
  sourcePointersJson: Array<Record<string, unknown>>
  status: 'active' | 'archived'
  type: string
  updatedAt: string
  workerId: string
}

export interface LocalSession {
  capabilityTemplateId: string
  context: string
  createdAt: string
  endedAt: null | string
  id: string
  metadataJson: Record<string, unknown>
  startedAt: null | string
  status: 'active' | 'cancelled' | 'completed' | 'failed'
  title: string
  updatedAt: string
  workerId: string
  workspaceId: string
}

export interface LocalArtifact {
  createdAt: string
  id: string
  invocationId: null | string
  kind: string
  metadataJson: Record<string, unknown>
  path: string
  sessionId: null | string
  status: 'archived' | 'available' | 'missing'
  title: string
  turnId: null | string
  updatedAt: string
  workspaceId: string
}

export interface HrWorkbenchAction {
  description: string
  id: string
  label: string
  outputKind: string
  prompt: string
  scope: HrWorkbenchActionScope
  templateId: string
}

export interface PersonProfile {
  artifacts: LocalArtifact[]
  detail: string
  evidenceTone: StatusTone
  id: string
  initials: string
  latestSession: LocalSession | null
  lifecycle: PersonLifecycle
  moment: string
  name: string
  nextStep: string
  reviewState: ReviewDisplayState
  reviewStatus: string
  reviewTone: StatusTone
  sessions: LocalSession[]
  status: string
  statusTone: StatusTone
  workspace: LocalWorkspace
}

export interface ProfileListSection {
  id: ProfileListSectionId
  label: string
  profiles: PersonProfile[]
}

export interface HrWorkbenchHostData {
  appId: string
  routePrefix: string
  theme: HrWorkbenchTheme
  workerId: null | string
  workspaceId: null | string
}

export interface ComposerMaterial {
  content: string
  encoding: ComposerMaterialEncoding
  fileName: string
  mimeType: string
  path: string
  size: number
}

export interface AttachedMaterialMetadata {
  encoding: ComposerMaterialEncoding
  fileName: string
  mimeType: string
  path: string
  size: number
}

export interface ComposerTemplate {
  id: string
  label: string
  outputKind: string
  draftType: HrProfileDraftType | string
  templateId: string
}

export interface HrWorkbenchData {
  artifacts: LocalArtifact[]
  profileReadmes: Record<string, string>
  sessions: LocalSession[]
  workspaces: LocalWorkspace[]
}

export interface HrPeopleWorkbenchAppState extends HrWorkbenchData {
  attachedMaterials: ComposerMaterial[]
  composerTemplates: ComposerTemplate[]
  hostData: HrWorkbenchHostData
  selectedProfileId: null | string
}

export interface CreateProfileUpdateDraftSessionInput {
  appId?: string
  attachedMaterials: readonly ComposerMaterial[]
  profileName: string
  draftType?: HrProfileDraftType
  userInput: string
}

export interface ProfileUpdateDraftSessionMetadata {
  attachedMaterials: AttachedMaterialMetadata[]
  materialCount: number
  profileName: string
  draftType: HrProfileDraftType | string
  source: 'hr-profile-composer'
}

export interface ProfileUpdateDraftSessionPayload {
  capabilityTemplateId: string
  context: string
  input: string
  metadata: ProfileUpdateDraftSessionMetadata
  title: string
}

export interface HrPeopleWorkbenchApiOptions {
  appId?: string
  fetch?: HrWorkbenchFetch
  routePrefix?: string
}

export interface HrPeopleWorkbenchApi {
  createProfileUpdateDraftSession: (
    workerId: null | string | undefined,
    workspaceId: string,
    payload: ProfileUpdateDraftSessionPayload,
  ) => Promise<{ session: LocalSession }>
  loadWorkbenchData: (scope?: { workerId?: null | string, workspaceId?: null | string }) => Promise<HrWorkbenchData>
  readWorkspaceFile: (workspaceId: string, path: string) => Promise<string>
  readWorkspaceProfile: (workspaceId: string) => Promise<string>
  writeProfileReadme: (workspaceId: string, input: {
    artifactId: string
    profileMarkdown?: string
  }) => Promise<{ profileReadme: unknown }>
  writeCandidateMaterial: (workspaceId: string, material: ComposerMaterial) => Promise<{ file: LocalFile }>
}

export interface LocalFile {
  createdAt: string
  hash: null | string
  id: string
  kind: 'directory' | 'file' | 'generated' | 'uploaded'
  mtime: null | number
  path: string
  size: null | number
  source: 'session' | 'system' | 'user'
  updatedAt: string
  workspaceId: string
}
