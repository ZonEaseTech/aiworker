export const CONTROL_PLANE_SCHEMA_VERSION = 1 as const

const LITERAL_PROVIDER_SECRET_PATTERN = String.raw`\b(?:sk-[\w-]{8,}|Bearer\s+[\w.~+/-]{12,}|gh[pousr]_[\w-]{20,}|github_pat_[\w-]{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{20,})\b`
const LITERAL_PROVIDER_SECRET_RE = new RegExp(LITERAL_PROVIDER_SECRET_PATTERN)
const LITERAL_PROVIDER_SECRET_GLOBAL_RE = new RegExp(LITERAL_PROVIDER_SECRET_PATTERN, 'g')

export function containsLiteralProviderSecret(value: string): boolean {
  return LITERAL_PROVIDER_SECRET_RE.test(value)
}

export function assertNoLiteralProviderSecret(value: string, field: string): void {
  if (containsLiteralProviderSecret(value))
    throw new Error(`${field} must use a secret reference, not a literal secret`)
}

export function redactLiteralProviderSecret(value: string): string {
  return value.replace(LITERAL_PROVIDER_SECRET_GLOBAL_RE, '[REDACTED]')
}

export type AssignmentStatus = 'draft' | 'provisioning' | 'workspace_projected' | 'handoff_ready' | 'ready' | 'needs_attention' | 'revoked' | 'archived'
export type ProvisioningAdapterType = 'aissh' | 'local' | 'rootless-container'
export type PaseoEndpointKind = 'tcp' | 'unix' | 'windows-pipe' | 'relay-offer'

export interface VersionedControlPlaneRecord {
  schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
}

export interface PaseoEnvironment {
  environmentId: string
  ownerEmail: string
  targetRef: string
  paseoHome: string
  daemonEndpoint: string
  endpointKind: PaseoEndpointKind
  isolation: 'os-user' | 'container' | 'vm' | 'single-user-dev'
  providerProfileIds: string[]
}

export interface ProviderProfile {
  id: string
  provider: 'claude' | 'codex' | 'opencode' | 'acp' | string
  label: string
  baseUrl?: string
  cliCommand?: string
  model?: string
  secretRef?: string
  paseoProviderId?: string
}

export interface ProjectedFile {
  relativePath: string
  content: string
  mode?: 0o600 | 0o644 | 0o755
}

export interface SoulRelease {
  id: string
  version: string
  displayName: string
  files: ProjectedFile[]
}

export interface PaseoHandoff {
  kind: 'paseo-daemon' | 'pairing-offer' | 'manual-path'
  daemonEndpoint: string
  workspaceRef: string
  instructions: string
}

export interface WorkspaceAssignment {
  assignmentId: string
  assignedEmail: string
  environmentId: string
  providerProfileId: string
  soulReleaseRef: string
  status: AssignmentStatus
  workspaceRef: string
  handoff?: PaseoHandoff
  revokedAt?: string | null
}

export interface AisshProvisionInvocation {
  adapterType: 'aissh'
  args: string[]
  command: string
  credentials: {
    optionalEnv: ('AISSH_BIN' | 'AISSH_SERVER')[]
    source: 'env'
    requiredEnv: 'AISSH_TOKEN'[]
  }
  cwdPolicy: 'neutral-tempdir'
  reason: string
  script: string
  serverRef: string
}

export interface ProvisionPlanInput {
  assignment: WorkspaceAssignment
  environment: PaseoEnvironment
  providerProfile: ProviderProfile
  soul: SoulRelease
}

export interface ProvisionPlan {
  aissh: AisshProvisionInvocation
  assignment: WorkspaceAssignment
  command: string
  receipt: {
    adapterType: ProvisioningAdapterType
    targetRef: string
    environmentId: string
    workspaceRef: string
    soulReleaseRef: string
    providerProfileId: string
    command: string
    aisshArgs: string[]
  }
}

export type ProvisionReceiptStatus = 'planned' | 'applied' | 'failed'

export interface ProvisionReceipt extends VersionedControlPlaneRecord {
  id: string
  kind: 'provision-receipt'
  at: string
  status: ProvisionReceiptStatus
  adapterType: ProvisioningAdapterType
  targetRef: string
  environmentId: string
  workspaceRef: string
  soulReleaseRef: string
  providerProfileId: string
  command: string
  aisshArgs: string[]
}

export interface AuditEvent extends VersionedControlPlaneRecord {
  id: string
  kind: 'audit-event'
  at: string
  actor: string
  action: string
  target: string
  details?: string
}

export interface WorkspaceProjectionManifestFile {
  relativePath: string
  sha256: string
  mode?: ProjectedFile['mode']
}

export interface WorkspaceProjectionManifest extends VersionedControlPlaneRecord {
  id: string
  kind: 'workspace-projection-manifest'
  at: string
  workspaceRef: string
  soulReleaseRef: string
  files: WorkspaceProjectionManifestFile[]
}

export interface ControlPlaneSnapshot extends VersionedControlPlaneRecord {
  assignments: WorkspaceAssignment[]
  auditEvents: AuditEvent[]
  environments: PaseoEnvironment[]
  projectionManifests: WorkspaceProjectionManifest[]
  providerProfiles: ProviderProfile[]
  receipts: ProvisionReceipt[]
  soulReleases: SoulRelease[]
}

export interface ControlPlaneStore {
  appendAuditEvent: (event: AuditEvent) => Promise<void>
  appendProjectionManifest: (manifest: WorkspaceProjectionManifest) => Promise<void>
  appendReceipt: (receipt: ProvisionReceipt) => Promise<void>
  loadSnapshot: () => Promise<ControlPlaneSnapshot>
  saveSnapshot: (snapshot: ControlPlaneSnapshot) => Promise<void>
}
