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
export type PaseoEndpointKind = 'tcp' | 'unix' | 'windows-pipe' | 'relay-offer' | 'local-home'
export type WorkspacePathPolicyKind = 'project-workdir'
// US-001: topology is unconditionally owner-scoped. The abolished
// 'legacy-home-derived-paseo-home-v1' value may still appear in persisted snapshots, but it
// is migrated-on-read to this single legal value and is no longer assignable.
export type PaseoEnvironmentTopologyKind = 'owner-scoped-paseo-home-v1'
export type EndpointBindingKind = 'owner-scoped-local-daemon' | 'home-derived-local-daemon' | 'external-endpoint' | 'opaque-pairing-offer'
export type ProviderReadinessPolicyKind = 'paseo-provider-json-v1'

export interface VersionedControlPlaneRecord {
  schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
}

export interface PaseoEnvironment {
  environmentId: string
  ownerEmail: string
  dedication?: PaseoEnvironmentDedication
  topologyKind?: PaseoEnvironmentTopologyKind
  targetRef: string
  paseoHome: string
  daemonEndpoint: string
  daemonListenRef?: string
  daemonHostRef?: string
  endpointKind: PaseoEndpointKind
  isolation: 'os-user' | 'container' | 'vm' | 'single-user-dev'
  providerProfileIds: string[]
}

export interface PaseoEnvironmentDedication {
  kind: 'assigned-user-dedicated'
  assignedEmail: string
  assertedBy?: string
  reason?: string
}

export interface PaseoOwnershipAssertion {
  kind: 'target-owner-matches-assigned-user' | 'dedicated-target-asserted' | 'owner-scoped-shared-home'
  assignedEmail: string
  environmentOwnerEmail: string
  topologyKind: PaseoEnvironmentTopologyKind
  userSlug: string
  dedicatedTarget: boolean
}

export interface WorkspacePathPolicy {
  authority: 'aissh-execution-home'
  kind: WorkspacePathPolicyKind
  topologyKind: PaseoEnvironmentTopologyKind
  assignedEmail: string
  ownerEmail: string
  ownerRoot: `$HOME/.aiworker/${string}`
  paseoHome: `$HOME/.aiworker/${string}/.paseo`
  runDir: `$HOME/.aiworker/${string}/run`
  daemonEndpointRef: string
  daemonHostRef: string
  daemonListenRef: string
  projectName: string
  projectRef: `$HOME/.aiworker/${string}/projects/${string}` | `$HOME/.aiworker/${string}/${string}`
  projectRoot: `$HOME/.aiworker/${string}/projects` | `$HOME/.aiworker/${string}`
  userSlug: string
  workspaceName: string
  workspaceRef: `$HOME/.aiworker/${string}/projects/${string}` | `$HOME/.aiworker/${string}/${string}`
  workspaceRoot: '$HOME/.aiworker'
}

export interface PaseoEndpointBinding {
  endpointKind: PaseoEndpointKind
  bindingKind: EndpointBindingKind
  ref: string
  hostRef?: string
  listenRef?: string
  ownerRoot?: string
  topologyKind?: PaseoEnvironmentTopologyKind
}

export interface ProviderReadinessPolicy {
  commands: ['paseo provider ls --host "$AIWORKER_PASEO_HOST" --json']
  effect: 'non-blocking-warning'
  kind: ProviderReadinessPolicyKind
  modelListPolicy: 'not-collected-by-aiworker'
  providerId: string
  providerListPredicate: 'warn if provider != providerId || status != "available" || enabled != "Enabled"'
  rawOutputPolicy: 'redacted-warning-only'
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
  descriptorRef?: string
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
  projectRef?: string
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
  endpointBinding: PaseoEndpointBinding
  environment: PaseoEnvironment
  ownership: PaseoOwnershipAssertion
  providerReadiness: ProviderReadinessPolicy
  receipt: {
    adapterType: ProvisioningAdapterType
    targetRef: string
    environmentId: string
    endpointBinding: EndpointBindingKind
    endpointKind: PaseoEndpointKind
    environmentOwnerEmail: string
    topologyKind: PaseoEnvironmentTopologyKind
    targetOwnerEmail: string
    assignedEmail: string
    handoffKind: PaseoHandoff['kind']
    handoffState: 'instruction-only'
    ownershipKind: PaseoOwnershipAssertion['kind']
    paseoHome: WorkspacePathPolicy['paseoHome']
    ownerRoot: WorkspacePathPolicy['ownerRoot']
    runDir: WorkspacePathPolicy['runDir']
    projectRoot: WorkspacePathPolicy['projectRoot']
    daemonListenRef: string
    daemonHostRef: string
    projectRef: string
    workspaceRef: string
    workspaceName: string
    workspacePathPolicy: WorkspacePathPolicyKind
    providerReadinessEffect: ProviderReadinessPolicy['effect']
    providerReadinessPolicy: ProviderReadinessPolicyKind
    providerWarning?: string
    soulReleaseRef: string
    providerProfileId: string
    dedicatedTarget: boolean
    userSlug: string
    command: string
    aisshArgs: string[]
  }
  workspacePolicy: WorkspacePathPolicy
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
  endpointBinding: EndpointBindingKind
  endpointKind: PaseoEndpointKind
  environmentOwnerEmail?: string
  topologyKind?: PaseoEnvironmentTopologyKind
  targetOwnerEmail?: string
  assignedEmail?: string
  handoffKind: PaseoHandoff['kind']
  handoffState: 'instruction-only'
  ownershipKind?: PaseoOwnershipAssertion['kind']
  paseoHome: string
  ownerRoot?: WorkspacePathPolicy['ownerRoot']
  runDir?: WorkspacePathPolicy['runDir']
  projectRoot?: WorkspacePathPolicy['projectRoot']
  daemonListenRef?: string
  daemonHostRef?: string
  projectRef: string
  workspaceRef: string
  workspaceName: string
  workspacePathPolicy: WorkspacePathPolicyKind
  providerReadinessEffect: ProviderReadinessPolicy['effect']
  providerReadinessPolicy: ProviderReadinessPolicyKind
  providerWarning?: string
  soulReleaseRef: string
  providerProfileId: string
  dedicatedTarget?: boolean
  userSlug?: string
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
