import type {
  AssignmentStatus,
  AuditEvent,
  ControlPlaneSnapshot,
  ControlPlaneStore,
  EndpointBindingKind,
  PaseoEndpointBinding,
  PaseoEnvironment,
  PaseoHandoff,
  ProjectedFile,
  ProviderProfile,
  ProviderReadinessPolicy,
  ProvisionPlan,
  ProvisionPlanInput,
  ProvisionReceipt,
  ProvisionReceiptStatus,
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
  PaseoHandoff,
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
const HOME_DERIVED_PASEO_HOME = '$HOME/.paseo' as const
const HOME_DERIVED_WORKSPACE_ROOT = '$HOME/aiworker-workspaces' as const
const HOME_DERIVED_DAEMON_ENDPOINT = 'paseo-daemon:remote-home'
const PASEO_PROVIDER_READINESS_POLICY_KIND = 'paseo-provider-json-v1' as const

export function normalizeAssignedEmail(email: string): string {
  return email.trim().toLowerCase()
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
  return {
    ...input,
    assignedEmail: normalizeAssignedEmail(input.assignedEmail),
    assignmentId: input.assignmentId ?? createStableId('asn', `${input.assignedEmail}:${input.environmentId}:${input.soulReleaseRef}:${input.workspaceRef}`),
    status: input.status ?? 'draft',
  }
}

export function createHandoff(environment: PaseoEnvironment, workspaceRef: string): PaseoHandoff {
  if (isPaseoPairingOffer(environment.daemonEndpoint)) {
    return {
      kind: 'pairing-offer',
      daemonEndpoint: redactPaseoPairingMaterial(environment.daemonEndpoint),
      workspaceRef,
      instructions: `Open Paseo with the pairing offer provided out-of-band, then open workspace ${workspaceRef}. AIWorker does not store the raw pairing URL or QR.`,
    }
  }
  return {
    kind: 'paseo-daemon',
    daemonEndpoint: environment.daemonEndpoint,
    workspaceRef,
    instructions: `AIWorker derives PASEO_HOME from the aissh user's HOME. After apply succeeds, cd ${handoffWorkspacePath(workspaceRef)} on that target, run paseo daemon pair --home "$PASEO_HOME", and open the printed pairing link in the Paseo frontend. AIWorker does not store the pairing URL or QR.`,
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
  assertNoLiteralSecret(input.providerProfile.secretRef ?? '', 'providerProfile.secretRef')
  assertNoLiteralSecret(input.environment.daemonEndpoint, 'environment.daemonEndpoint')
  assertNoLiteralSecret(input.assignment.workspaceRef, 'assignment.workspaceRef')

  const workspaceName = deriveWorkspaceName(input.assignment.workspaceRef, input.soul.id)
  const workspacePolicy = createWorkspacePathPolicy(workspaceName)
  const workspaceRef = workspacePolicy.workspaceRef
  const paseoHome = workspacePolicy.paseoHome
  const endpointBinding = createEndpointBinding(input.environment)
  const providerReadiness = createProviderReadinessPolicy(input.providerProfile)
  const projectionCommands = projectionScriptCommands(input.soul.files)
  const projectedFiles = input.soul.files.map(file => validateProjectedFilePath(file.relativePath)).sort().join(' ')
  const script = [
    'set -euo pipefail',
    ...remoteIdentityPreludeCommands(workspaceName),
    '(command -v paseo >/dev/null || npm install -g @getpaseo/cli)',
    `(${providerCliBinaryCheckCommand(input.providerProfile)})`,
    ...paseoDaemonReadinessCommands(),
    ...providerReadinessCommands(input.providerProfile),
    'mkdir -p "$AIWORKER_WORKSPACE_REF"',
    'cd "$AIWORKER_WORKSPACE_REF"',
    ...projectionCommands,
    `printf '%s\n' ${shellQuote(`AIWorker projected ${input.soul.id}@${input.soul.version}: ${projectedFiles}`)} > ${workspaceShellPath('.aiworker-projection')}`,
    'printf \'%s\\n\' "AIWORKER_HANDOFF_READY: run paseo daemon pair --home \\"$PASEO_HOME\\" from \\"$AIWORKER_WORKSPACE_REF\\" and open the printed link in the Paseo frontend."',
  ].join(' && ')
  const serverRef = normalizeAisshServerRef(input.environment.targetRef)
  const reason = `Provision AIWorker Paseo workspace for ${input.assignment.assignedEmail}`
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
      handoff: createHandoff({ ...input.environment, paseoHome }, workspaceRef),
      status: 'handoff_ready',
      workspaceRef,
    },
    command: redactedCommand,
    endpointBinding,
    providerReadiness,
    receipt: {
      adapterType: 'aissh',
      aisshArgs: redactedArgs,
      command: redactedCommand,
      endpointBinding: endpointBinding.bindingKind,
      endpointKind: endpointBinding.endpointKind,
      environmentId: input.environment.environmentId,
      providerProfileId: input.providerProfile.id,
      providerReadinessPolicy: providerReadiness.kind,
      soulReleaseRef: `${input.soul.id}@${input.soul.version}`,
      targetRef: redactSecretLike(input.environment.targetRef),
      workspaceRef,
      workspaceName: workspacePolicy.workspaceName,
      workspacePathPolicy: workspacePolicy.kind,
    },
    workspacePolicy,
  }
}

function paseoDaemonReadinessCommands(): string[] {
  const runningPattern = 'Local Daemon[[:space:]]+running|Connected Daemon[[:space:]]+reachable'
  return [
    'AIWORKER_PASEO_STATUS="$(paseo daemon status --home "$PASEO_HOME" 2>&1 || true)"',
    'printf \'%s\\n\' "$AIWORKER_PASEO_STATUS"',
    `printf '%s\\n' "$AIWORKER_PASEO_STATUS" | grep -Eq ${shellQuote(runningPattern)} || paseo daemon start --home "$PASEO_HOME"`,
    'AIWORKER_PASEO_STATUS="$(paseo daemon status --home "$PASEO_HOME" 2>&1 || true)"',
    `printf '%s\\n' "$AIWORKER_PASEO_STATUS" | grep -Eq ${shellQuote(runningPattern)} || { printf '%s\\n' "Paseo daemon readiness failed after start for $PASEO_HOME. Run paseo daemon status/start under this aissh user, then retry." >&2; exit 127; }`,
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

export function createProvisionReceipt(plan: ProvisionPlan, input: { at?: string, id?: string, status?: ProvisionReceiptStatus } = {}): ProvisionReceipt {
  const receipt: ProvisionReceipt = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: input.id ?? createStableId('rcpt', `${plan.receipt.environmentId}:${plan.receipt.workspaceRef}:${plan.receipt.soulReleaseRef}:${input.at ?? ''}`),
    kind: 'provision-receipt',
    at: input.at ?? new Date().toISOString(),
    status: input.status ?? 'planned',
    ...plan.receipt,
  }
  assertControlPlaneRecordSafe(receipt, `receipt:${receipt.id}`)
  return receipt
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

function deriveWorkspaceName(workspaceRef: string, fallback: string): string {
  const symbolicPrefix = `${HOME_DERIVED_WORKSPACE_ROOT}/`
  const candidate = workspaceRef.startsWith(symbolicPrefix) ? workspaceRef.slice(symbolicPrefix.length) : workspaceRef || fallback
  return validateSafeWorkspaceName(candidate, fallback)
}

function createWorkspacePathPolicy(workspaceName: string): WorkspacePathPolicy {
  return {
    authority: 'aissh-execution-home',
    kind: 'home-derived',
    paseoHome: HOME_DERIVED_PASEO_HOME,
    workspaceName,
    workspaceRef: `${HOME_DERIVED_WORKSPACE_ROOT}/${workspaceName}`,
    workspaceRoot: HOME_DERIVED_WORKSPACE_ROOT,
  }
}

function createEndpointBinding(environment: PaseoEnvironment): PaseoEndpointBinding {
  return {
    bindingKind: endpointBindingKind(environment),
    endpointKind: environment.endpointKind,
    ref: isPaseoPairingOffer(environment.daemonEndpoint)
      ? redactPaseoPairingMaterial(environment.daemonEndpoint)
      : redactSecretLike(environment.daemonEndpoint),
  }
}

function endpointBindingKind(environment: PaseoEnvironment): EndpointBindingKind {
  if (environment.endpointKind === 'local-home' || environment.daemonEndpoint === HOME_DERIVED_DAEMON_ENDPOINT)
    return 'home-derived-local-daemon'
  if (environment.endpointKind === 'relay-offer' || isPaseoPairingOffer(environment.daemonEndpoint))
    return 'opaque-pairing-offer'
  return 'external-endpoint'
}

function handoffWorkspacePath(workspaceRef: string): string {
  const homePrefix = `${HOME_DERIVED_WORKSPACE_ROOT}/`
  if (workspaceRef.startsWith(homePrefix)) {
    const workspaceName = validateSafeWorkspaceName(workspaceRef.slice(homePrefix.length), workspaceRef)
    return `"$HOME/aiworker-workspaces/${workspaceName}"`
  }
  return shellQuote(workspaceRef)
}

function createProviderReadinessPolicy(profile: ProviderProfile): ProviderReadinessPolicy {
  return {
    commands: ['paseo provider ls --json', 'paseo provider models <provider> --json'],
    kind: PASEO_PROVIDER_READINESS_POLICY_KIND,
    modelListPredicate: 'non-empty array',
    providerId: profile.paseoProviderId ?? profile.provider,
    providerListPredicate: 'provider == providerId && status == "available" && enabled == "Enabled"',
    rawOutputPolicy: 'redacted-pass-fail-only',
  }
}

function validateSafeWorkspaceName(candidate: string, fallback: string): string {
  const value = (candidate || fallback).trim()
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('..') || hasControlCharacter(value))
    throw new Error('workspace name must be a safe relative segment')
  if (!/^[\w.-]+$/.test(value))
    throw new Error('workspace name must contain only letters, numbers, dot, underscore, or dash')
  return value
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function remoteIdentityPreludeCommands(workspaceName: string): string[] {
  return [
    'unset PASEO_HOST',
    'AIWORKER_REMOTE_USER="$(whoami)"',
    'AIWORKER_REMOTE_UID="$(id -u)"',
    'AIWORKER_REMOTE_PWD="$(pwd -P)"',
    'AIWORKER_REMOTE_PATH="$PATH"',
    ': "$' + '{HOME:?AIWorker requires HOME for aissh execution identity}"',
    'case "$HOME" in /*) ;; *) printf \'%s\\n\' "AIWorker requires absolute HOME for aissh execution identity." >&2; exit 64 ;; esac',
    'AIWORKER_REMOTE_HOME="$(cd "$HOME" && pwd -P)" || { printf \'%s\\n\' "AIWorker could not canonicalize HOME for aissh execution identity." >&2; exit 64; }',
    'PASEO_HOME="$AIWORKER_REMOTE_HOME/.paseo"',
    'export PASEO_HOME',
    `AIWORKER_WORKSPACE_NAME=${shellQuote(workspaceName)}`,
    'case "$AIWORKER_WORKSPACE_NAME" in ""|.|..|*/*|*\\\\*|*".."*) printf \'%s\\n\' "AIWorker workspace name is not a safe HOME-relative segment." >&2; exit 64 ;; esac',
    'AIWORKER_WORKSPACE_ROOT="$AIWORKER_REMOTE_HOME/aiworker-workspaces"',
    'AIWORKER_WORKSPACE_REF="$AIWORKER_WORKSPACE_ROOT/$AIWORKER_WORKSPACE_NAME"',
    'printf \'%s\\n\' "AIWorker target identity discovered: user=$AIWORKER_REMOTE_USER uid=$AIWORKER_REMOTE_UID home=$AIWORKER_REMOTE_HOME pwd=$AIWORKER_REMOTE_PWD"',
  ]
}

function providerCliBinaryCheckCommand(profile: ProviderProfile): string {
  if (profile.cliCommand)
    return `command -v ${shellQuote(profile.cliCommand)} >/dev/null || { printf '%s\\n' ${shellQuote(`Missing provider CLI: ${profile.cliCommand}. Install/authenticate it before using this workspace in Paseo.`)} >&2; exit 127; }`

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
  return `command -v ${shellQuote(command)} >/dev/null || { printf '%s\\n' ${shellQuote(`Missing provider CLI: ${command}. Install/authenticate it before using this workspace in Paseo.`)} >&2; exit 127; }`
}

function providerReadinessCommands(profile: ProviderProfile): string[] {
  const providerId = profile.paseoProviderId ?? profile.provider
  const providerLsCheck = 'const fs=require("node:fs");const providerId=process.argv[1];const file=process.argv[2];let parsed;try{parsed=JSON.parse(fs.readFileSync(file,"utf8"))}catch{process.exit(2)}const providers=Array.isArray(parsed)?parsed:[];const provider=providers.find(item=>item&&item.provider===providerId);if(!provider||provider.status!=="available"||provider.enabled!=="Enabled")process.exit(1)'
  const providerModelsCheck = 'const fs=require("node:fs");const file=process.argv[2];let parsed;try{parsed=JSON.parse(fs.readFileSync(file,"utf8"))}catch{process.exit(2)}if(!Array.isArray(parsed)||parsed.length===0)process.exit(1)'
  return [
    `AIWORKER_PASEO_PROVIDER_ID=${shellQuote(providerId)}`,
    'AIWORKER_PROVIDER_LS_JSON="$(mktemp)"',
    'AIWORKER_PROVIDER_MODELS_JSON="$(mktemp)"',
    'trap \'rm -f "$AIWORKER_PROVIDER_LS_JSON" "$AIWORKER_PROVIDER_MODELS_JSON"\' EXIT',
    'paseo provider ls --json >"$AIWORKER_PROVIDER_LS_JSON" 2>/dev/null || { printf \'%s\\n\' "Paseo provider readiness failed at provider-list stage for $AIWORKER_PASEO_PROVIDER_ID. Run provider install/login under this aissh user, then retry." >&2; exit 127; }',
    `node -e ${shellQuote(providerLsCheck)} "$AIWORKER_PASEO_PROVIDER_ID" "$AIWORKER_PROVIDER_LS_JSON" 2>/dev/null || { printf '%s\\n' "Paseo provider readiness failed at provider-available stage for $AIWORKER_PASEO_PROVIDER_ID. Run provider install/login under this aissh user, then retry." >&2; exit 127; }`,
    'paseo provider models "$AIWORKER_PASEO_PROVIDER_ID" --json >"$AIWORKER_PROVIDER_MODELS_JSON" 2>/dev/null || { printf \'%s\\n\' "Paseo provider readiness failed at model-list stage for $AIWORKER_PASEO_PROVIDER_ID. Run provider install/login under this aissh user, then retry." >&2; exit 127; }',
    `node -e ${shellQuote(providerModelsCheck)} "$AIWORKER_PASEO_PROVIDER_ID" "$AIWORKER_PROVIDER_MODELS_JSON" 2>/dev/null || { printf '%s\\n' "Paseo provider readiness failed at models-available stage for $AIWORKER_PASEO_PROVIDER_ID. Run provider install/login under this aissh user, then retry." >&2; exit 127; }`,
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
