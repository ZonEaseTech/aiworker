import type {
  AssignmentStatus,
  AuditEvent,
  ControlPlaneSnapshot,
  ControlPlaneStore,
  EndpointBindingKind,
  PaseoEndpointBinding,
  PaseoEnvironment,
  PaseoEnvironmentDedication,
  PaseoEnvironmentTopologyKind,
  PaseoHandoff,
  PaseoOwnershipAssertion,
  ProjectedFile,
  ProviderProfile,
  ProviderReadinessPolicy,
  ProvisionPlan,
  ProvisionPlanInput,
  ProvisionReceipt,
  ProvisionReceiptStatus,
  SoulRelease,
  VersionedControlPlaneRecord,
  WorkspaceAssignment,
  WorkspacePathPolicy,
  WorkspaceProjectionManifest,
} from './control-plane'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import process from 'node:process'
import { assertNoLiteralProviderSecret, containsLiteralProviderSecret, CONTROL_PLANE_SCHEMA_VERSION, redactLiteralProviderSecret } from './control-plane'

export { CONTROL_PLANE_SCHEMA_VERSION } from './control-plane'
export { containsLiteralProviderSecret, redactLiteralProviderSecret } from './control-plane'
export type {
  AisshProvisionInvocation,
  AssignmentStatus,
  AuditEvent,
  ControlPlaneSnapshot,
  ControlPlaneStore,
  EndpointBindingKind,
  PaseoEndpointBinding,
  PaseoEndpointKind,
  PaseoEnvironment,
  PaseoEnvironmentDedication,
  PaseoEnvironmentTopologyKind,
  PaseoHandoff,
  PaseoOwnershipAssertion,
  ProjectedFile,
  ProviderProfile,
  ProviderReadinessPolicy,
  ProviderReadinessPolicyKind,
  ProvisioningAdapterType,
  ProvisionPlan,
  ProvisionPlanInput,
  ProvisionReceipt,
  ProvisionReceiptStatus,
  SoulRelease,
  VersionedControlPlaneRecord,
  WorkspaceAssignment,
  WorkspacePathPolicy,
  WorkspacePathPolicyKind,
  WorkspaceProjectionManifest,
  WorkspaceProjectionManifestFile,
} from './control-plane'

const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  archived: [],
  draft: ['provisioning', 'archived'],
  handoff_ready: ['ready', 'needs_attention', 'revoked', 'archived'],
  needs_attention: ['provisioning', 'revoked', 'archived'],
  provisioning: ['workspace_projected', 'needs_attention', 'revoked', 'archived'],
  ready: ['needs_attention', 'revoked', 'archived'],
  revoked: ['archived'],
  workspace_projected: ['handoff_ready', 'ready', 'needs_attention', 'revoked', 'archived'],
}
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>`]+/g
// US-001: AIWorker-derived PASEO_HOME is ALWAYS owner-scoped under
// $HOME/.aiworker/<userSlug>/.paseo. The bare $HOME/.paseo form is recognized only so
// that stale persisted refs can be detected and rejected/migrated; it is never emitted.
const HOME_DERIVED_BARE_PASEO_HOME = '$HOME/.paseo' as const
const HOME_DERIVED_AIWORKER_ROOT = '$HOME/.aiworker' as const
const LEGACY_PROJECT_ROOT = '$HOME/aiworker-projects'
const LEGACY_WORKSPACE_ROOT = '$HOME/aiworker-workspaces'
// Recognition-only: old snapshots may carry this daemon endpoint string. AIWorker never
// emits it any more, but normalizeEnvironmentForWorkspace still maps it to the owner-scoped
// TCP ref so legacy records migrate-on-read instead of crashing.
const HOME_DERIVED_DAEMON_ENDPOINT = 'paseo-daemon:remote-home'
const PASEO_PROVIDER_READINESS_POLICY_KIND = 'paseo-provider-json-v1' as const
const OWNER_SCOPED_TOPOLOGY_KIND = 'owner-scoped-paseo-home-v1' as const

// US-001 migrate-on-read: any topologyKind input (missing, owner-scoped, or an abolished
// legacy string from a persisted snapshot) collapses to the single legal owner-scoped value.
// Never branch on or echo caller-provided topologyKind; always derive this literal.
function normalizeTopologyKind(_input?: PaseoEnvironmentTopologyKind): PaseoEnvironmentTopologyKind {
  return OWNER_SCOPED_TOPOLOGY_KIND
}

export function normalizeAssignedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function deriveAssignedUserSlug(email: string): string {
  const normalized = normalizeAssignedEmail(email)
  const slug = normalized
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  const fallback = `user-${createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`
  return validateSafeProjectSegment(slug || fallback, 'assigned user')
}

export function deriveOwnerScopedPaseoPort(userSlug: string): number {
  const safeSlug = validateSafeProjectSegment(userSlug, 'assigned user')
  const bucket = createHash('sha256').update(safeSlug).digest().readUInt16BE(0) % 2000
  return 41000 + bucket
}

export function createDefaultPaseoDaemonEndpointRef(userSlug: string): string {
  return `127.0.0.1:${deriveOwnerScopedPaseoPort(userSlug)}`
}

export function createDefaultProjectRef(assignedEmail: string, projectName: string): WorkspacePathPolicy['projectRef'] {
  const userSlug = deriveAssignedUserSlug(assignedEmail)
  const safeProjectName = validateSafeProjectName(projectName, projectName)
  return `${HOME_DERIVED_AIWORKER_ROOT}/${userSlug}/projects/${safeProjectName}`
}

export function canAdvanceAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to)
}

export function userCanOpenWorkspace(user: { email: string }, assignment: WorkspaceAssignment): boolean {
  if (assignment.revokedAt || assignment.status === 'revoked' || assignment.status === 'archived')
    return false
  return normalizeAssignedEmail(user.email) === normalizeAssignedEmail(assignment.assignedEmail)
}

export function createAssignment(input: Omit<WorkspaceAssignment, 'assignedEmail' | 'assignmentId' | 'status'> & { assignedEmail: string, assignmentId?: string, status?: AssignmentStatus }): WorkspaceAssignment {
  const assignedEmail = normalizeAssignedEmail(input.assignedEmail)
  return {
    ...input,
    assignedEmail,
    assignmentId: input.assignmentId ?? createStableId('asn', `${assignedEmail}:${input.environmentId}:${input.soulReleaseRef}:${input.workspaceRef}`),
    status: input.status ?? 'draft',
  }
}

export function createEnvironment(input: {
  environmentId: string
  ownerEmail: string
  targetRef: string
  paseoHome: string
  daemonEndpoint: string
  endpointKind: PaseoEnvironment['endpointKind']
  isolation: PaseoEnvironment['isolation']
  providerProfileIds: string[]
  daemonListenRef?: string
  daemonHostRef?: string
  dedication?: PaseoEnvironment['dedication']
  topologyKind?: PaseoEnvironmentTopologyKind
}): PaseoEnvironment {
  return {
    environmentId: input.environmentId,
    ownerEmail: input.ownerEmail,
    ...(input.dedication ? { dedication: input.dedication } : {}),
    ...(input.topologyKind ? { topologyKind: input.topologyKind } : {}),
    targetRef: input.targetRef,
    paseoHome: input.paseoHome,
    daemonEndpoint: input.daemonEndpoint,
    ...(input.daemonListenRef ? { daemonListenRef: input.daemonListenRef } : {}),
    ...(input.daemonHostRef ? { daemonHostRef: input.daemonHostRef } : {}),
    endpointKind: input.endpointKind,
    isolation: input.isolation,
    providerProfileIds: input.providerProfileIds,
  }
}

export function createProviderProfile(input: {
  id: string
  provider: ProviderProfile['provider']
  label: string
  secretRef?: string
  baseUrl?: string
  cliCommand?: string
  model?: string
  paseoProviderId?: string
}): ProviderProfile {
  return {
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    ...(input.cliCommand !== undefined ? { cliCommand: input.cliCommand } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.paseoProviderId !== undefined ? { paseoProviderId: input.paseoProviderId } : {}),
    id: input.id,
    label: input.label,
    provider: input.provider,
    ...(input.secretRef !== undefined ? { secretRef: input.secretRef } : {}),
  }
}

export function createSoulRelease(input: {
  id: string
  version: string
  displayName: string
  files: ProjectedFile[]
  descriptorRef?: string
}): SoulRelease {
  return {
    ...(input.descriptorRef !== undefined ? { descriptorRef: input.descriptorRef } : {}),
    displayName: input.displayName,
    files: input.files,
    id: input.id,
    version: input.version,
  }
}

export function createHandoff(environment: PaseoEnvironment, workspaceRef: string): PaseoHandoff {
  if (isPaseoPairingOffer(environment.daemonEndpoint)) {
    return {
      kind: 'pairing-offer',
      daemonEndpoint: redactPaseoPairingMaterial(environment.daemonEndpoint),
      workspaceRef,
      instructions: `Open Paseo with the pairing offer provided out-of-band, then open project workdir ${workspaceRef}. AIWorker does not store the raw pairing URL or QR.`,
    }
  }
  return {
    kind: 'paseo-daemon',
    daemonEndpoint: environment.daemonEndpoint,
    workspaceRef,
    instructions: `AIWorker derives owner-scoped PASEO_HOME and the Project workdir from the aissh user's HOME. After apply succeeds, run paseo daemon pair --home "$PASEO_HOME", then open the Project with paseo --host ${shellQuote(environment.daemonEndpoint)} ${handoffWorkspacePath(workspaceRef)} or start an agent with paseo run --host ${shellQuote(environment.daemonEndpoint)} --cwd ${handoffWorkspacePath(workspaceRef)}. AIWorker does not store the pairing URL or QR.`,
  }
}

export function normalizeAisshServerRef(targetRef: string): string {
  const trimmed = targetRef.trim()
  if (!trimmed)
    throw new Error('aissh target ref is required')
  return trimmed.startsWith('aissh:') ? trimmed.slice('aissh:'.length) : trimmed
}

export function createProvisionPlan(input: ProvisionPlanInput): ProvisionPlan {
  assertProviderProfileReady(input)
  const ownership = createPaseoOwnershipAssertion(input.assignment, input.environment)
  assertNoLiteralSecret(input.providerProfile.secretRef ?? '', 'providerProfile.secretRef')
  assertNoLiteralSecret(input.environment.daemonEndpoint, 'environment.daemonEndpoint')
  assertNoLiteralSecret(input.environment.daemonListenRef ?? '', 'environment.daemonListenRef')
  assertNoLiteralSecret(input.environment.daemonHostRef ?? '', 'environment.daemonHostRef')
  assertNoLiteralSecret(input.assignment.projectRef ?? '', 'assignment.projectRef')
  assertNoLiteralSecret(input.assignment.workspaceRef, 'assignment.workspaceRef')

  const userSlug = deriveAssignedUserSlug(input.assignment.assignedEmail)
  const projectName = deriveProjectName(input.assignment.projectRef ?? input.assignment.workspaceRef, input.soul.id)
  const workspacePolicy = createWorkspacePathPolicy({
    assignedEmail: ownership.assignedEmail,
    ownerEmail: ownership.environmentOwnerEmail,
    projectName,
    topologyKind: ownership.topologyKind,
    userSlug,
  })
  assertWorkspaceRefMatchesTopology(input.assignment.projectRef ?? input.assignment.workspaceRef)
  const workspaceRef = workspacePolicy.workspaceRef
  const paseoHome = workspacePolicy.paseoHome
  const normalizedEnvironment = normalizeEnvironmentForWorkspace(input.environment, workspacePolicy)
  const endpointBinding = createEndpointBinding(normalizedEnvironment, workspacePolicy)
  const providerReadiness = createProviderReadinessPolicy(input.providerProfile)
  const projectionCommands = projectionScriptCommands(input.soul.files)
  const projectedFiles = input.soul.files.map(file => validateProjectedFilePath(file.relativePath)).sort().join(' ')
  const script = [
    'set -euo pipefail',
    ...remoteIdentityPreludeCommands(workspacePolicy, normalizedEnvironment),
    '(command -v paseo >/dev/null || npm install -g @getpaseo/cli)',
    `(${providerCliBinaryCheckCommand(input.providerProfile)})`,
    ...paseoDaemonReadinessCommands(),
    ...providerReadinessCommands(input.providerProfile),
    'mkdir -p "$AIWORKER_WORKSPACE_REF"',
    'cd "$AIWORKER_WORKSPACE_REF"',
    ...projectionCommands,
    `printf '%s\n' ${shellQuote(`AIWorker projected ${input.soul.id}@${input.soul.version} into Project workdir: ${projectedFiles}`)} > ${workspaceShellPath('.aiworker-projection')}`,
    'printf \'%s\\n\' "AIWORKER_HANDOFF_READY: run paseo daemon pair --home \\"$PASEO_HOME\\", then open Project workdir with paseo --host \\"$AIWORKER_PASEO_HOST\\" \\"$AIWORKER_WORKSPACE_REF\\" or run paseo run --host \\"$AIWORKER_PASEO_HOST\\" --cwd \\"$AIWORKER_WORKSPACE_REF\\"."',
  ].join(' && ')
  const serverRef = normalizeAisshServerRef(input.environment.targetRef)
  const reason = `Provision AIWorker Project workdir for ${input.assignment.assignedEmail}`
  const args = ['exec', serverRef, script, `--reason=${reason}`]
  const command = `aissh ${args.map(shellQuote).join(' ')}`
  const redactedCommand = redactSecretLike(command)
  const redactedArgs = args.map(redactSecretLike)
  return {
    aissh: {
      adapterType: 'aissh',
      args: redactedArgs,
      command: redactedCommand,
      credentials: {
        optionalEnv: ['AISSH_BIN', 'AISSH_SERVER'],
        requiredEnv: ['AISSH_TOKEN'],
        source: 'env',
      },
      cwdPolicy: 'neutral-tempdir',
      reason,
      script: redactSecretLike(script),
      serverRef: redactSecretLike(serverRef),
    },
    assignment: {
      ...input.assignment,
      handoff: createHandoff({ ...normalizedEnvironment, paseoHome }, workspaceRef),
      projectRef: workspacePolicy.projectRef,
      status: 'handoff_ready',
      workspaceRef,
    },
    command: redactedCommand,
    endpointBinding,
    environment: {
      ...normalizedEnvironment,
      daemonEndpoint: endpointBinding.ref,
      ownerEmail: ownership.environmentOwnerEmail,
      targetRef: redactSecretLike(input.environment.targetRef),
    },
    ownership,
    providerReadiness,
    receipt: {
      adapterType: 'aissh',
      aisshArgs: redactedArgs,
      command: redactedCommand,
      endpointBinding: endpointBinding.bindingKind,
      endpointKind: endpointBinding.endpointKind,
      environmentId: input.environment.environmentId,
      environmentOwnerEmail: ownership.environmentOwnerEmail,
      topologyKind: workspacePolicy.topologyKind,
      targetOwnerEmail: ownership.environmentOwnerEmail,
      assignedEmail: ownership.assignedEmail,
      handoffKind: createHandoff({ ...normalizedEnvironment, paseoHome }, workspaceRef).kind,
      handoffState: 'instruction-only',
      ownershipKind: ownership.kind,
      paseoHome,
      ownerRoot: workspacePolicy.ownerRoot,
      runDir: workspacePolicy.runDir,
      projectRoot: workspacePolicy.projectRoot,
      daemonListenRef: endpointBinding.listenRef ?? workspacePolicy.daemonListenRef,
      daemonHostRef: endpointBinding.hostRef ?? workspacePolicy.daemonHostRef,
      projectRef: workspacePolicy.projectRef,
      providerProfileId: input.providerProfile.id,
      providerReadinessEffect: providerReadiness.effect,
      providerReadinessPolicy: providerReadiness.kind,
      soulReleaseRef: `${input.soul.id}@${input.soul.version}`,
      targetRef: redactSecretLike(input.environment.targetRef),
      dedicatedTarget: ownership.dedicatedTarget,
      userSlug: ownership.userSlug,
      workspaceRef,
      workspaceName: workspacePolicy.workspaceName,
      workspacePathPolicy: workspacePolicy.kind,
    },
    workspacePolicy,
  }
}

export function createPaseoOwnershipAssertion(
  assignment: Pick<WorkspaceAssignment, 'assignedEmail'>,
  environment: Pick<PaseoEnvironment, 'ownerEmail' | 'dedication' | 'topologyKind'>,
): PaseoOwnershipAssertion {
  const assignedEmail = normalizeAssignedEmail(assignment.assignedEmail)
  const environmentOwnerEmail = normalizeAssignedEmail(environment.ownerEmail)
  // US-001: topology is unconditionally owner-scoped. owner!=assigned is always the
  // owner-scoped shared-home case; the derived PASEO_HOME is still assigned-user-scoped
  // under $HOME/.aiworker/<assigned-slug>/.paseo, so there is no cross-user bleed.
  const topologyKind = normalizeTopologyKind(environment.topologyKind)
  const dedication = environment.dedication ? normalizeEnvironmentDedication(environment.dedication) : undefined
  if (dedication && dedication.assignedEmail !== assignedEmail) {
    throw new Error(`Paseo environment dedication ${dedication.assignedEmail} must match assigned user ${assignedEmail}`)
  }

  return {
    assignedEmail,
    dedicatedTarget: Boolean(dedication),
    environmentOwnerEmail,
    kind: dedication
      ? 'dedicated-target-asserted'
      : environmentOwnerEmail === assignedEmail
        ? 'target-owner-matches-assigned-user'
        : 'owner-scoped-shared-home',
    topologyKind,
    userSlug: deriveAssignedUserSlug(assignedEmail),
  }
}

function normalizeEnvironmentDedication(dedication: PaseoEnvironmentDedication): PaseoEnvironmentDedication {
  if (dedication.kind !== 'assigned-user-dedicated')
    throw new Error(`Paseo environment dedication kind ${String(dedication.kind)} is not supported`)
  const assignedEmail = normalizeAssignedEmail(dedication.assignedEmail)
  if (!assignedEmail)
    throw new Error('Paseo environment dedication assignedEmail is required')
  return {
    ...dedication,
    assignedEmail,
  }
}

function paseoDaemonReadinessCommands(): string[] {
  const runningPattern = 'Local Daemon[[:space:]]+running|Connected Daemon[[:space:]]+reachable'
  return [
    'AIWORKER_PASEO_STATUS="$(paseo daemon status --home "$PASEO_HOME" 2>&1 || true)"',
    'printf \'%s\\n\' "$AIWORKER_PASEO_STATUS"',
    'case "$AIWORKER_PASEO_LISTEN" in */*) test -S "$AIWORKER_PASEO_LISTEN" || paseo daemon start --home "$PASEO_HOME" --listen "$AIWORKER_PASEO_LISTEN" ;; *) printf \'%s\\n\' "$AIWORKER_PASEO_STATUS" | grep -F "$AIWORKER_PASEO_LISTEN" >/dev/null || paseo daemon restart --home "$PASEO_HOME" --listen "$AIWORKER_PASEO_LISTEN" --force || paseo daemon start --home "$PASEO_HOME" --listen "$AIWORKER_PASEO_LISTEN" ;; esac',
    'case "$AIWORKER_PASEO_LISTEN" in */*) AIWORKER_PASEO_SOCKET_READY=0; for AIWORKER_PASEO_SOCKET_ATTEMPT in 1 2 3 4 5 6 7 8 9 10; do test -S "$AIWORKER_PASEO_LISTEN" && { AIWORKER_PASEO_SOCKET_READY=1; break; }; sleep 0.5; done; test "$AIWORKER_PASEO_SOCKET_READY" = 1 || { printf \'%s\\n\' "Paseo owner-scoped daemon socket was not created at $AIWORKER_PASEO_LISTEN. Run paseo daemon start --home \\"$PASEO_HOME\\" --listen \\"$AIWORKER_PASEO_LISTEN\\" under this aissh user, then retry." >&2; exit 127; } ;; esac',
    'AIWORKER_PASEO_STATUS="$(paseo daemon status --home "$PASEO_HOME" 2>&1 || true)"',
    `case "$AIWORKER_PASEO_LISTEN" in */*) test -S "$AIWORKER_PASEO_LISTEN" ;; *) printf '%s\\n' "$AIWORKER_PASEO_STATUS" | grep -F "$AIWORKER_PASEO_LISTEN" >/dev/null && printf '%s\\n' "$AIWORKER_PASEO_STATUS" | grep -Eq ${shellQuote(runningPattern)} ;; esac || { printf '%s\\n' "Paseo daemon readiness failed after start for $PASEO_HOME. Run paseo daemon status/start under this aissh user, then retry." >&2; exit 127; }`,
  ]
}

export function createEmptyControlPlaneSnapshot(): ControlPlaneSnapshot {
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    assignments: [],
    auditEvents: [],
    environments: [],
    projectionManifests: [],
    providerProfiles: [],
    receipts: [],
    soulReleases: [],
  }
}

export function createProvisionReceipt(plan: ProvisionPlan, input: { at?: string, id?: string, providerWarning?: string, status?: ProvisionReceiptStatus } = {}): ProvisionReceipt {
  const aisshArgs = redactReceiptAisshArgs(plan)
  const receipt: ProvisionReceipt = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: input.id ?? createStableId('rcpt', `${plan.receipt.environmentId}:${plan.receipt.workspaceRef}:${plan.receipt.soulReleaseRef}:${input.at ?? ''}`),
    kind: 'provision-receipt',
    at: input.at ?? new Date().toISOString(),
    status: input.status ?? 'planned',
    ...plan.receipt,
    aisshArgs,
    command: `aissh ${aisshArgs.map(shellQuote).join(' ')}`,
    ...(input.providerWarning ? { providerWarning: redactSecretLike(input.providerWarning) } : {}),
  }
  assertControlPlaneRecordSafe(receipt, `receipt:${receipt.id}`)
  return receipt
}

function redactReceiptAisshArgs(plan: ProvisionPlan): string[] {
  return plan.receipt.aisshArgs.map(arg =>
    arg === plan.aissh.script || arg.includes('set -euo pipefail') || arg.includes('base64 -d')
      ? '[omitted: generated provisioning script]'
      : arg,
  )
}

export function createAuditEvent(input: Omit<AuditEvent, 'schemaVersion' | 'kind' | 'id' | 'at'> & { at?: string, id?: string }): AuditEvent {
  const event: AuditEvent = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: input.id ?? createStableId('audit', `${input.actor}:${input.action}:${input.target}:${input.at ?? ''}`),
    kind: 'audit-event',
    at: input.at ?? new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    target: input.target,
    details: input.details,
  }
  assertControlPlaneRecordSafe(event, `audit:${event.id}`)
  return event
}

export function createWorkspaceProjectionManifest(input: {
  at?: string
  files: ProjectedFile[]
  id?: string
  soulReleaseRef: string
  workspaceRef: string
}): WorkspaceProjectionManifest {
  const files = input.files.map((file) => {
    const relativePath = validateProjectedFilePath(file.relativePath)
    assertNoLiteralSecretInProjectedFile(file.content, relativePath)
    return {
      relativePath,
      sha256: createHash('sha256').update(file.content).digest('hex'),
      mode: file.mode,
    }
  }).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  const manifest: WorkspaceProjectionManifest = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: input.id ?? createStableId('proj', `${input.workspaceRef}:${input.soulReleaseRef}:${files.map(file => file.sha256).join(':')}`),
    kind: 'workspace-projection-manifest',
    at: input.at ?? new Date().toISOString(),
    workspaceRef: input.workspaceRef,
    soulReleaseRef: input.soulReleaseRef,
    files,
  }
  assertControlPlaneRecordSafe(manifest, `projection:${manifest.id}`)
  return manifest
}

export class LocalFileControlPlaneStore implements ControlPlaneStore {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    assertControlPlaneRecordSafe(event, `audit:${event.id}`)
    await appendJsonl(this.auditEventsPath, event)
  }

  async appendProjectionManifest(manifest: WorkspaceProjectionManifest): Promise<void> {
    assertControlPlaneRecordSafe(manifest, `projection:${manifest.id}`)
    await appendJsonl(this.projectionManifestsPath, manifest)
  }

  async appendReceipt(receipt: ProvisionReceipt): Promise<void> {
    assertControlPlaneRecordSafe(receipt, `receipt:${receipt.id}`)
    await appendJsonl(this.receiptsPath, receipt)
  }

  async loadSnapshot(): Promise<ControlPlaneSnapshot> {
    const snapshot = await readJsonFile<ControlPlaneSnapshot>(this.snapshotPath) ?? createEmptyControlPlaneSnapshot()
    assertControlPlaneSnapshotSafe(snapshot)
    const merged = {
      ...snapshot,
      auditEvents: mergeUniqueById([
        ...snapshot.auditEvents,
        ...await readJsonl<AuditEvent>(this.auditEventsPath, 'audit-events'),
      ]),
      projectionManifests: mergeUniqueById([
        ...snapshot.projectionManifests,
        ...await readJsonl<WorkspaceProjectionManifest>(this.projectionManifestsPath, 'projection-manifests'),
      ]),
      receipts: mergeUniqueById([
        ...snapshot.receipts,
        ...await readJsonl<ProvisionReceipt>(this.receiptsPath, 'receipts'),
      ]),
    }
    assertControlPlaneSnapshotSafe(merged)
    return merged
  }

  async saveSnapshot(snapshot: ControlPlaneSnapshot): Promise<void> {
    assertControlPlaneSnapshotSafe(snapshot)
    await writeJsonFile(this.snapshotPath, snapshot)
  }

  private get auditEventsPath(): string {
    return path.join(this.root, 'audit-events.jsonl')
  }

  private get projectionManifestsPath(): string {
    return path.join(this.root, 'projection-manifests.jsonl')
  }

  private get receiptsPath(): string {
    return path.join(this.root, 'receipts.jsonl')
  }

  private get snapshotPath(): string {
    return path.join(this.root, 'snapshot.json')
  }
}

export function validateProjectedFilePath(relativePath: string): string {
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.includes('\0'))
    throw new Error(`invalid projected file path: ${relativePath}`)
  const normalized = path.posix.normalize(relativePath)
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../'))
    throw new Error(`projected file path escapes workspace: ${relativePath}`)
  return normalized
}

export async function writeProjectedFiles(workspaceRoot: string, files: ProjectedFile[]): Promise<string[]> {
  const written: string[] = []
  for (const file of files) {
    const rel = validateProjectedFilePath(file.relativePath)
    assertNoLiteralSecretInProjectedFile(file.content, rel)
    const dest = path.join(workspaceRoot, rel)
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, file.content, { mode: file.mode ?? 0o644 })
    written.push(rel)
  }
  return written.sort()
}

export function assertNoLiteralSecret(value: string, field: string): void {
  assertNoLiteralProviderSecret(value, field)
  if (isPaseoPairingOffer(value))
    throw new Error(`${field} must not contain raw Paseo pairing material`)
}

export function redactSecretLike(value: string): string {
  return redactPaseoPairingMaterial(redactLiteralProviderSecret(value))
}

export function isPaseoPairingOffer(value: string): boolean {
  return Array.from(value.matchAll(URL_PATTERN)).some(match => isPaseoPairingOfferUrl(match[0]))
}

export function redactPaseoPairingMaterial(value: string): string {
  return value.replace(URL_PATTERN, url => isPaseoPairingOfferUrl(url) ? '[REDACTED_PAIRING_URL]' : url)
}

function isPaseoPairingOfferUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.searchParams.has('offer') || /(?:^|[?#&])(?:[^#?&]*&)*offer=/.test(url.hash) || /(?:^|[?#&])(?:[^#?&]*&)*offer=/.test(url.search)
  }
  catch {
    return /[#?&]offer=/.test(value)
  }
}

export function assertControlPlaneSnapshotSafe(snapshot: ControlPlaneSnapshot): void {
  assertSupportedSchemaVersion(snapshot, 'control-plane snapshot')
  for (const environment of snapshot.environments) {
    assertNoLiteralSecret(environment.daemonEndpoint, `environment:${environment.environmentId}:daemonEndpoint`)
    assertNoLiteralSecret(environment.targetRef, `environment:${environment.environmentId}:targetRef`)
  }
  for (const providerProfile of snapshot.providerProfiles) {
    if (providerProfile.secretRef) {
      if (!providerProfile.secretRef.startsWith('secret://'))
        throw new Error(`provider profile ${providerProfile.id} must use a secret reference`)
      assertNoLiteralSecret(providerProfile.secretRef, `provider:${providerProfile.id}:secretRef`)
    }
  }
  for (const assignment of snapshot.assignments) {
    assertNoLiteralSecret(assignment.workspaceRef, `assignment:${assignment.assignmentId}:workspaceRef`)
    if (assignment.handoff) {
      assertNoLiteralSecret(assignment.handoff.daemonEndpoint, `assignment:${assignment.assignmentId}:handoff:daemonEndpoint`)
      assertNoLiteralSecret(assignment.handoff.workspaceRef, `assignment:${assignment.assignmentId}:handoff:workspaceRef`)
      assertNoLiteralSecret(assignment.handoff.instructions, `assignment:${assignment.assignmentId}:handoff:instructions`)
    }
  }
  for (const release of snapshot.soulReleases) {
    for (const file of release.files) {
      const rel = validateProjectedFilePath(file.relativePath)
      assertNoLiteralSecretInProjectedFile(file.content, rel)
    }
  }
  for (const receipt of snapshot.receipts)
    assertControlPlaneRecordSafe(receipt, `receipt:${receipt.id}`)
  for (const event of snapshot.auditEvents)
    assertControlPlaneRecordSafe(event, `audit:${event.id}`)
  for (const manifest of snapshot.projectionManifests)
    assertControlPlaneRecordSafe(manifest, `projection:${manifest.id}`)
  assertNoLiteralSecretsInValue('control-plane snapshot', snapshot)
}

function assertNoLiteralSecretsInValue(label: string, value: unknown): void {
  if (typeof value === 'string') {
    assertNoLiteralSecret(value, label)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLiteralSecretsInValue(`${label}[${index}]`, item))
    return
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      assertNoLiteralSecretsInValue(`${label}.${key}`, child)
  }
}

function deriveProjectName(projectRef: string, fallback: string): string {
  const projectPrefix = `${HOME_DERIVED_AIWORKER_ROOT}/`
  const legacyProjectPrefix = `${LEGACY_PROJECT_ROOT}/`
  const legacyWorkspacePrefix = `${LEGACY_WORKSPACE_ROOT}/`
  const candidate = projectRef.startsWith(projectPrefix)
    ? parseAiworkerProjectRef(projectRef).projectName
    : projectRef.startsWith(legacyProjectPrefix)
      ? projectRef.slice(legacyProjectPrefix.length)
      : projectRef.startsWith(legacyWorkspacePrefix)
        ? projectRef.slice(legacyWorkspacePrefix.length)
        : projectRef || fallback
  return validateSafeProjectName(candidate, fallback)
}

function parseAiworkerProjectRef(projectRef: string): { projectName: string, userSlug: string } {
  const prefix = `${HOME_DERIVED_AIWORKER_ROOT}/`
  const rest = projectRef.slice(prefix.length)
  const parts = rest.split('/')
  if (parts.length === 3 && parts[1] === 'projects') {
    return {
      projectName: validateSafeProjectName(parts[2] ?? '', ''),
      userSlug: validateSafeProjectSegment(parts[0] ?? '', 'project user'),
    }
  }
  if (parts.length !== 2)
    throw new Error('project ref must be $HOME/.aiworker/<user>/projects/<project> or legacy $HOME/.aiworker/<user>/<project>')
  return {
    projectName: validateSafeProjectName(parts[1] ?? '', ''),
    userSlug: validateSafeProjectSegment(parts[0] ?? '', 'project user'),
  }
}

// US-001: topology is unconditionally owner-scoped. Any ref already under
// $HOME/.aiworker/ must be the owner-scoped three-segment form; legacy two-segment refs
// (and non-prefixed refs) only survive as display-only input parsed by deriveProjectName.
function assertWorkspaceRefMatchesTopology(projectRef: string): void {
  const prefix = `${HOME_DERIVED_AIWORKER_ROOT}/`
  if (!projectRef.startsWith(prefix))
    return
  const rest = projectRef.slice(prefix.length)
  const parts = rest.split('/')
  if (!(parts.length === 3 && parts[1] === 'projects'))
    throw new Error('owner-scoped Project refs must use $HOME/.aiworker/<user>/projects/<project>; legacy two-segment refs are display-only')
}

function createWorkspacePathPolicy(input: {
  assignedEmail: string
  ownerEmail: string
  projectName: string
  topologyKind: PaseoEnvironmentTopologyKind
  userSlug: string
}): WorkspacePathPolicy {
  // US-001: unconditionally owner-scoped. PASEO_HOME, projects, and the daemon ref are
  // always derived under $HOME/.aiworker/<userSlug>/, never the bare $HOME/.paseo install.
  const topologyKind = normalizeTopologyKind(input.topologyKind)
  const ownerRoot = `${HOME_DERIVED_AIWORKER_ROOT}/${input.userSlug}` as const
  const runDir = `${ownerRoot}/run` as const
  const projectRoot = `${ownerRoot}/projects` as const
  const paseoHome = `${ownerRoot}/.paseo` as const
  const projectRef = `${projectRoot}/${input.projectName}` as WorkspacePathPolicy['projectRef']
  const daemonRef = createDefaultPaseoDaemonEndpointRef(input.userSlug)
  return {
    authority: 'aissh-execution-home',
    assignedEmail: input.assignedEmail,
    daemonEndpointRef: daemonRef,
    daemonHostRef: daemonRef,
    daemonListenRef: daemonRef,
    kind: 'project-workdir',
    ownerEmail: input.ownerEmail,
    ownerRoot,
    paseoHome,
    projectName: input.projectName,
    projectRef,
    projectRoot,
    runDir,
    topologyKind,
    userSlug: input.userSlug,
    workspaceName: input.projectName,
    workspaceRef: projectRef,
    workspaceRoot: HOME_DERIVED_AIWORKER_ROOT,
  }
}

function normalizeEnvironmentForWorkspace(environment: PaseoEnvironment, policy: WorkspacePathPolicy): PaseoEnvironment {
  if (environment.endpointKind === 'tcp' && Boolean(environment.daemonListenRef) !== Boolean(environment.daemonHostRef))
    throw new Error('explicit TCP Paseo endpoint requires both daemonListenRef and daemonHostRef')

  const normalized: PaseoEnvironment = {
    ...environment,
    ...(environment.dedication ? { dedication: normalizeEnvironmentDedication(environment.dedication) } : {}),
    // US-001: topology is always owner-scoped. A stale bare $HOME/.paseo in the input
    // (or a legacy paseo-daemon:remote-home endpoint) is migrated-on-read here by being
    // overridden with the owner-scoped policy refs, never echoed back.
    endpointKind: environment.endpointKind !== 'relay-offer'
      ? 'tcp'
      : environment.endpointKind,
    topologyKind: policy.topologyKind,
    paseoHome: policy.paseoHome,
    daemonEndpoint: environment.endpointKind === 'tcp'
      ? environment.daemonHostRef ?? environment.daemonEndpoint
      : (environment.endpointKind === 'unix' || environment.daemonEndpoint === HOME_DERIVED_DAEMON_ENDPOINT)
          ? policy.daemonEndpointRef
          : environment.daemonEndpoint,
    daemonListenRef: environment.endpointKind === 'tcp'
      ? environment.daemonListenRef
      : policy.daemonListenRef,
    daemonHostRef: environment.endpointKind === 'tcp'
      ? environment.daemonHostRef
      : policy.daemonHostRef,
  }

  // US-001 hard invariant: the derived PASEO_HOME must ALWAYS be owner-scoped under
  // $HOME/.aiworker/<slug>/.paseo and must NEVER be the bare $HOME/.paseo install that
  // another tool may own on the target machine. Unconditional, on the emitted value.
  if (
    normalized.paseoHome === HOME_DERIVED_BARE_PASEO_HOME
    || !normalized.paseoHome.startsWith(`${HOME_DERIVED_AIWORKER_ROOT}/`)
    || !normalized.paseoHome.endsWith('/.paseo')
  ) {
    throw new Error(`derived PASEO_HOME must be owner-scoped $HOME/.aiworker/<slug>/.paseo, never bare $HOME/.paseo; got ${normalized.paseoHome}`)
  }

  if (normalized.endpointKind === 'tcp' && (!normalized.daemonListenRef || !normalized.daemonHostRef))
    throw new Error('explicit TCP Paseo endpoint requires both daemonListenRef and daemonHostRef')
  return normalized
}

function createEndpointBinding(environment: PaseoEnvironment, policy: WorkspacePathPolicy): PaseoEndpointBinding {
  const ref = isPaseoPairingOffer(environment.daemonEndpoint)
    ? redactPaseoPairingMaterial(environment.daemonEndpoint)
    : redactSecretLike(environment.daemonEndpoint)
  return {
    bindingKind: endpointBindingKind(environment, policy),
    endpointKind: environment.endpointKind,
    ref,
    ...(environment.daemonHostRef ? { hostRef: redactSecretLike(environment.daemonHostRef) } : {}),
    ...(environment.daemonListenRef ? { listenRef: redactSecretLike(environment.daemonListenRef) } : {}),
    ...(policy.topologyKind === OWNER_SCOPED_TOPOLOGY_KIND ? { ownerRoot: policy.ownerRoot, topologyKind: policy.topologyKind } : {}),
  }
}

function endpointBindingKind(environment: PaseoEnvironment, policy: WorkspacePathPolicy): EndpointBindingKind {
  if (
    policy.topologyKind === OWNER_SCOPED_TOPOLOGY_KIND
    && environment.endpointKind === 'tcp'
    && environment.daemonEndpoint === policy.daemonEndpointRef
  ) {
    return 'owner-scoped-local-daemon'
  }
  if (environment.endpointKind === 'local-home' || environment.daemonEndpoint === HOME_DERIVED_DAEMON_ENDPOINT)
    return 'home-derived-local-daemon'
  if (environment.endpointKind === 'relay-offer' || isPaseoPairingOffer(environment.daemonEndpoint))
    return 'opaque-pairing-offer'
  return 'external-endpoint'
}

function handoffWorkspacePath(workspaceRef: string): string {
  const homePrefix = `${HOME_DERIVED_AIWORKER_ROOT}/`
  if (workspaceRef.startsWith(homePrefix)) {
    const parsed = parseAiworkerProjectRef(workspaceRef)
    return `"$HOME/.aiworker/${parsed.userSlug}/projects/${parsed.projectName}"`
  }
  return shellQuote(workspaceRef)
}

function createProviderReadinessPolicy(profile: ProviderProfile): ProviderReadinessPolicy {
  return {
    commands: ['paseo provider ls --host "$AIWORKER_PASEO_HOST" --json'],
    effect: 'non-blocking-warning',
    kind: PASEO_PROVIDER_READINESS_POLICY_KIND,
    modelListPolicy: 'not-collected-by-aiworker',
    providerId: profile.paseoProviderId ?? profile.provider,
    providerListPredicate: 'warn if provider != providerId || status != "available" || enabled != "Enabled"',
    rawOutputPolicy: 'redacted-warning-only',
  }
}

function validateSafeProjectName(candidate: string, fallback: string): string {
  return validateSafeProjectSegment(candidate || fallback, 'project')
}

function validateSafeProjectSegment(candidate: string, label: string): string {
  const value = candidate.trim()
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('..') || hasControlCharacter(value))
    throw new Error(`${label} name must be a safe relative segment`)
  if (!/^[\w.-]+$/.test(value))
    throw new Error(`${label} name must contain only letters, numbers, dot, underscore, or dash`)
  return value
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function remoteIdentityPreludeCommands(policy: WorkspacePathPolicy, environment: PaseoEnvironment): string[] {
  const listenRef = environment.daemonListenRef ?? policy.daemonListenRef
  const hostRef = environment.daemonHostRef ?? environment.daemonEndpoint
  const defaultEndpointExpression = policy.daemonListenRef.includes('/')
    ? '"$AIWORKER_PASEO_RUN_DIR/paseo.sock"'
    : shellQuote(policy.daemonListenRef)
  return [
    'unset PASEO_HOST',
    'AIWORKER_REMOTE_USER="$(whoami)"',
    'AIWORKER_REMOTE_UID="$(id -u)"',
    'AIWORKER_REMOTE_PWD="$(pwd -P)"',
    'AIWORKER_REMOTE_PATH="$PATH"',
    ': "$' + '{HOME:?AIWorker requires HOME for aissh execution identity}"',
    'case "$HOME" in /*) ;; *) printf \'%s\\n\' "AIWorker requires absolute HOME for aissh execution identity." >&2; exit 64 ;; esac',
    'AIWORKER_REMOTE_HOME="$(cd "$HOME" && pwd -P)" || { printf \'%s\\n\' "AIWorker could not canonicalize HOME for aissh execution identity." >&2; exit 64; }',
    `AIWORKER_USER_SLUG=${shellQuote(policy.userSlug)}`,
    `AIWORKER_PROJECT_NAME=${shellQuote(policy.projectName)}`,
    'case "$AIWORKER_USER_SLUG" in ""|.|..|*/*|*\\\\*|*".."*) printf \'%s\\n\' "AIWorker assigned user slug is not a safe HOME-relative segment." >&2; exit 64 ;; esac',
    'case "$AIWORKER_PROJECT_NAME" in ""|.|..|*/*|*\\\\*|*".."*) printf \'%s\\n\' "AIWorker Project name is not a safe HOME-relative segment." >&2; exit 64 ;; esac',
    'AIWORKER_ROOT="$AIWORKER_REMOTE_HOME/.aiworker"',
    'AIWORKER_OWNER_ROOT="$AIWORKER_ROOT/$AIWORKER_USER_SLUG"',
    'AIWORKER_PASEO_HOME="$AIWORKER_OWNER_ROOT/.paseo"',
    'AIWORKER_PASEO_RUN_DIR="$AIWORKER_OWNER_ROOT/run"',
    remoteRefAssignment('AIWORKER_PASEO_LISTEN', listenRef, policy.daemonListenRef, defaultEndpointExpression),
    remoteRefAssignment('AIWORKER_PASEO_HOST', hostRef, policy.daemonHostRef, defaultEndpointExpression),
    'PASEO_HOME="$AIWORKER_PASEO_HOME"',
    'PASEO_LISTEN="$AIWORKER_PASEO_LISTEN"',
    'export PASEO_HOME PASEO_LISTEN',
    'mkdir -p "$AIWORKER_PASEO_RUN_DIR"',
    'AIWORKER_PROJECT_ROOT="$AIWORKER_OWNER_ROOT/projects"',
    'AIWORKER_PROJECT_REF="$AIWORKER_PROJECT_ROOT/$AIWORKER_PROJECT_NAME"',
    'AIWORKER_WORKSPACE_REF="$AIWORKER_PROJECT_REF"',
    'printf \'%s\\n\' "AIWorker target identity discovered: user=$AIWORKER_REMOTE_USER uid=$AIWORKER_REMOTE_UID home=$AIWORKER_REMOTE_HOME pwd=$AIWORKER_REMOTE_PWD"',
  ]
}

function remoteRefAssignment(name: string, ref: string, defaultRef: string, defaultExpression: string): string {
  if (ref === defaultRef)
    return `${name}=${defaultExpression}`
  if (ref.startsWith('$HOME/'))
    return `${name}="$AIWORKER_REMOTE_HOME/${ref.slice('$HOME/'.length)}"`
  return `${name}=${shellQuote(ref)}`
}

function providerCliBinaryCheckCommand(profile: ProviderProfile): string {
  if (profile.cliCommand)
    return `command -v ${shellQuote(profile.cliCommand)} >/dev/null || printf '%s\\n' ${shellQuote(`AIWORKER_PROVIDER_NOTE: Provider CLI ${profile.cliCommand} was not found in the non-interactive shell PATH; Paseo provider readiness is checked through the owner-scoped daemon.`)}`

  const commandByProvider: Record<string, string> = {
    claude: 'claude',
    codex: 'codex',
    opencode: 'opencode',
  }
  const command = commandByProvider[profile.provider]
  if (profile.provider === 'acp' || profile.paseoProviderId)
    return `printf '%s\\n' ${shellQuote(`AIWorker will use Paseo provider profile ${profile.paseoProviderId ?? profile.id} for ${profile.provider}.`)}`
  if (!command)
    throw new Error(`provider ${profile.provider} must declare cliCommand or paseoProviderId`)
  return `command -v ${shellQuote(command)} >/dev/null || printf '%s\\n' ${shellQuote(`AIWORKER_PROVIDER_NOTE: Provider CLI ${command} was not found in the non-interactive shell PATH; Paseo provider readiness is checked through the owner-scoped daemon.`)}`
}

function providerReadinessCommands(profile: ProviderProfile): string[] {
  const providerId = profile.paseoProviderId ?? profile.provider
  const providerLsCheck = 'const fs=require("node:fs");const providerId=process.argv[1];const file=process.argv[2];let parsed;try{parsed=JSON.parse(fs.readFileSync(file,"utf8"))}catch{console.log("AIWORKER_PROVIDER_WARNING: Paseo provider list output was not readable for "+providerId+"; workspace projection will continue.");process.exit(0)}const providers=Array.isArray(parsed)?parsed:[];const provider=providers.find(item=>item&&item.provider===providerId);if(!provider||provider.status!=="available"||provider.enabled!=="Enabled"){console.log("AIWORKER_PROVIDER_WARNING: Paseo provider "+providerId+" is not available/enabled for this aissh user; workspace projection will continue, complete provider install/login in Paseo before use.")}'
  return [
    `AIWORKER_PASEO_PROVIDER_ID=${shellQuote(providerId)}`,
    'AIWORKER_PROVIDER_LS_JSON="$(mktemp)"',
    'trap \'rm -f "$AIWORKER_PROVIDER_LS_JSON"\' EXIT',
    `if paseo provider ls --host "$AIWORKER_PASEO_HOST" --json >"$AIWORKER_PROVIDER_LS_JSON" 2>/dev/null; then node -e ${shellQuote(providerLsCheck)} "$AIWORKER_PASEO_PROVIDER_ID" "$AIWORKER_PROVIDER_LS_JSON"; else printf '%s\\n' "AIWORKER_PROVIDER_WARNING: Paseo provider list failed for $AIWORKER_PASEO_PROVIDER_ID; workspace projection will continue, complete provider install/login in Paseo before use."; fi`,
  ]
}

function assertProviderProfileReady(input: ProvisionPlanInput): void {
  if (input.assignment.providerProfileId !== input.providerProfile.id)
    throw new Error(`assignment provider ${input.assignment.providerProfileId} does not match profile ${input.providerProfile.id}`)
  if (!input.environment.providerProfileIds.includes(input.providerProfile.id))
    throw new Error(`provider profile ${input.providerProfile.id} is not attached to Paseo environment ${input.environment.environmentId}`)
  if (input.providerProfile.provider === 'acp' && !input.providerProfile.paseoProviderId && !input.providerProfile.cliCommand)
    throw new Error(`ACP provider profile ${input.providerProfile.id} must declare paseoProviderId or cliCommand`)
}

function projectionScriptCommands(files: ProjectedFile[]): string[] {
  return files.map((file) => {
    const rel = validateProjectedFilePath(file.relativePath)
    assertNoLiteralSecretInProjectedFile(file.content, rel)
    const dest = workspaceShellPath(rel)
    const dir = workspaceShellPath(path.posix.dirname(rel))
    const encoded = Buffer.from(file.content, 'utf8').toString('base64')
    const chmod = file.mode ? ` && chmod ${file.mode.toString(8)} ${dest}` : ''
    return `mkdir -p ${dir} && printf '%s' ${shellQuote(encoded)} | base64 -d > ${dest}${chmod}`
  })
}

function workspaceShellPath(relativePath: string): string {
  const rel = relativePath === '.' ? '' : validateProjectedFilePath(relativePath)
  return rel ? `"$AIWORKER_WORKSPACE_REF"/${shellQuote(rel)}` : '"$AIWORKER_WORKSPACE_REF"'
}

function assertNoLiteralSecretInProjectedFile(content: string, rel: string): void {
  if (containsLiteralProviderSecret(content))
    throw new Error(`projected workspace file must not contain literal provider secrets: ${rel}`)
}

function assertControlPlaneRecordSafe(record: ProvisionReceipt | AuditEvent | WorkspaceProjectionManifest, label: string): void {
  assertSupportedSchemaVersion(record, label)
  if (record.kind === 'provision-receipt') {
    assertNoLiteralSecret(record.command, `${label}:command`)
    assertNoLiteralSecret(record.targetRef, `${label}:targetRef`)
    assertNoLiteralSecret(record.workspaceRef, `${label}:workspaceRef`)
    for (const arg of record.aisshArgs)
      assertNoLiteralSecret(arg, `${label}:aisshArg`)
  }
  if (record.kind === 'audit-event') {
    assertNoLiteralSecret(record.actor, `${label}:actor`)
    assertNoLiteralSecret(record.action, `${label}:action`)
    assertNoLiteralSecret(record.target, `${label}:target`)
    if (record.details)
      assertNoLiteralSecret(record.details, `${label}:details`)
  }
  if (record.kind === 'workspace-projection-manifest') {
    assertNoLiteralSecret(record.workspaceRef, `${label}:workspaceRef`)
    for (const file of record.files) {
      validateProjectedFilePath(file.relativePath)
      assertNoLiteralSecret(file.sha256, `${label}:${file.relativePath}:sha256`)
    }
  }
  assertNoLiteralSecretsInValue(label, record)
}

function assertSupportedSchemaVersion(record: VersionedControlPlaneRecord, label: string): void {
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION)
    throw new Error(`${label} uses unsupported schemaVersion ${String(record.schemaVersion)}`)
}

function createStableId(prefix: string, seed: string): string {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 12)
  const entropy = randomBytes(2).toString('hex')
  return `${prefix}_${digest}${entropy}`
}

function shellQuote(value: string): string {
  if (/^[\w/:=.,@%+-]+$/.test(value))
    return value
  return `'${value.replaceAll('\'', String.raw`'\''`)}'`
}

async function appendJsonl(filePath: string, record: VersionedControlPlaneRecord): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')
}

async function readJsonFile<T extends VersionedControlPlaneRecord>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  }
  catch (error) {
    if (isNotFound(error))
      return null
    throw error
  }
}

async function readJsonl<T extends VersionedControlPlaneRecord>(filePath: string, label: string): Promise<T[]> {
  let raw = ''
  try {
    raw = await readFile(filePath, 'utf8')
  }
  catch (error) {
    if (isNotFound(error))
      return []
    throw error
  }
  return raw.split('\n').filter(Boolean).map((line, index) => {
    const record = JSON.parse(line) as T
    assertSupportedSchemaVersion(record, `${label}:${index + 1}`)
    return record
  })
}

async function writeJsonFile(filePath: string, value: VersionedControlPlaneRecord): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function mergeUniqueById<T extends { id: string }>(records: T[]): T[] {
  const byId = new Map<string, T>()
  for (const record of records)
    byId.set(record.id, record)
  return Array.from(byId.values())
}
