import type {
  SoulAppArtifactType,
  SoulAppCapability,
  SoulAppConnectorNeed,
  SoulAppManifest,
  SoulAppPermission,
  SoulAppUi,
  SoulAppWorkspaceType,
} from './manifest'

export interface SoulAppScopedContext {
  appId: string
  capabilityId?: string
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
  disable: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  enable: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  healthcheck: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  install: (context: SoulAppScopedContext) => Promise<SoulAppProtocolResult>
  upgrade: (context: SoulAppScopedContext, fromVersion: string) => Promise<SoulAppProtocolResult>
}

export interface SoulAppIntentClassification {
  capabilityId: string
  confidence: number
  reason: string
}

export interface SoulAppSessionContext {
  artifactTypes: readonly string[]
  capabilityId: string
  contextMarkdown: string
  promptFragments: readonly string[]
  reviewRubric: readonly string[]
}

export interface SoulAppRuntimeProtocol {
  classifyIntent?: (context: SoulAppScopedContext, input: { message: string }) => Promise<SoulAppIntentClassification | null>
  enrichTurnContext?: (context: SoulAppScopedContext, input: { message: string, sessionContext: SoulAppSessionContext }) => Promise<SoulAppSessionContext>
  prepareSessionContext: (context: SoulAppScopedContext, input: { capabilityId: string, workspaceType: string }) => Promise<SoulAppSessionContext>
  resolveCapability: (context: SoulAppScopedContext, input: { capabilityId?: string, intent?: string }) => Promise<SoulAppCapability>
}

export interface SoulAppArtifactValidationResult {
  issues: readonly { message: string, path?: string, severity: 'error' | 'warning' }[]
  ok: boolean
}

export interface SoulAppArtifactProtocol {
  artifactSchemas: (context: SoulAppScopedContext) => Promise<readonly SoulAppArtifactType[]>
  extractMetadata?: (context: SoulAppScopedContext, artifact: { contentRef: string, type: string }) => Promise<Record<string, unknown>>
  renderPreview?: (context: SoulAppScopedContext, artifact: { artifactId: string, type: string }) => Promise<{ previewRef: string }>
  validateArtifact: (context: SoulAppScopedContext, artifact: { contentRef: string, type: string }) => Promise<SoulAppArtifactValidationResult>
}

export interface SoulAppReviewRubric {
  checks: readonly string[]
  policyRef?: string
}

export interface SoulAppReviewProtocol {
  createReviewRubric: (context: SoulAppScopedContext, artifactType: string) => Promise<SoulAppReviewRubric>
  evaluateArtifact?: (context: SoulAppScopedContext, artifact: { artifactId: string, type: string }) => Promise<SoulAppArtifactValidationResult>
  proposeMemoryCandidate?: (context: SoulAppScopedContext, review: { artifactId: string, reviewId: string }) => Promise<{ evidence: readonly Record<string, unknown>[], statement: string }>
}

export interface SoulAppEventProtocol {
  onArtifactCreated?: (context: SoulAppScopedContext, event: { artifactId: string, type: string }) => Promise<void>
  onReviewAccepted?: (context: SoulAppScopedContext, event: { artifactId: string, reviewId: string }) => Promise<void>
  onSessionCreated?: (context: SoulAppScopedContext, event: { sessionId: string }) => Promise<void>
  onTurnCompleted?: (context: SoulAppScopedContext, event: { sessionId: string, turnId: string }) => Promise<void>
}

export interface SoulAppConnectorProtocol {
  declareConnectorNeeds: (context: SoulAppScopedContext) => Promise<readonly SoulAppConnectorNeed[]>
  readEvidence?: (context: SoulAppScopedContext, request: { connectorId: string, query: Record<string, unknown> }) => Promise<readonly Record<string, unknown>[]>
  requestScopedAccess?: (context: SoulAppScopedContext, connectorId: string) => Promise<SoulAppProtocolResult>
}

export interface SoulAppUiContributionProtocol {
  artifactTypes: (context: SoulAppScopedContext) => Promise<readonly SoulAppArtifactType[]>
  capabilities: (context: SoulAppScopedContext) => Promise<readonly SoulAppCapability[]>
  ui: (context: SoulAppScopedContext) => Promise<SoulAppUi>
  workspaceTypes: (context: SoulAppScopedContext) => Promise<readonly SoulAppWorkspaceType[]>
}

export interface SoulAppProtocolHandlers {
  artifact?: SoulAppArtifactProtocol
  connector?: SoulAppConnectorProtocol
  event?: SoulAppEventProtocol
  lifecycle?: SoulAppLifecycleProtocol
  manifest: SoulAppManifest
  review?: SoulAppReviewProtocol
  runtime?: SoulAppRuntimeProtocol
  ui?: SoulAppUiContributionProtocol
}
