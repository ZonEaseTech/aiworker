import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AssignmentStatus = 'draft' | 'provisioning' | 'workspace_projected' | 'handoff_ready' | 'ready' | 'needs_attention' | 'revoked' | 'archived'
export type ProvisioningAdapterType = 'aissh' | 'local' | 'rootless-container'
export type PaseoEndpointKind = 'tcp' | 'unix' | 'windows-pipe' | 'relay-offer'

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

export interface SoulRelease {
  id: string
  version: string
  displayName: string
  files: ProjectedFile[]
}

export interface ProjectedFile {
  relativePath: string
  content: string
  mode?: 0o600 | 0o644 | 0o755
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

export interface PaseoHandoff {
  kind: 'paseo-daemon' | 'pairing-offer' | 'manual-path'
  daemonEndpoint: string
  workspaceRef: string
  instructions: string
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

const SECRET_VALUE_RE = /\b(?:sk-[\w-]{8,}|Bearer\s+[\w.~+/-]{12,}|gh[pousr]_[\w-]{20,}|github_pat_[\w-]{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{20,})\b/g
const SECRET_KEY_RE = /api[_-]?key|authorization|password|secret|token/i

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
  if (environment.daemonEndpoint.startsWith('https://app.paseo.sh/#offer=')) {
    return {
      kind: 'pairing-offer',
      daemonEndpoint: environment.daemonEndpoint,
      workspaceRef,
      instructions: `Open Paseo with the pairing offer, then open workspace ${workspaceRef}.`,
    }
  }
  return {
    kind: 'paseo-daemon',
    daemonEndpoint: environment.daemonEndpoint,
    workspaceRef,
    instructions: `cd ${shellQuote(workspaceRef)} && paseo --host ${shellQuote(environment.daemonEndpoint)} run <task>, or open ${workspaceRef} in a Paseo client connected to this daemon.`,
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

  const projectionCommands = projectionScriptCommands(input.assignment.workspaceRef, input.soul.files)
  const projectedFiles = input.soul.files.map(file => validateProjectedFilePath(file.relativePath)).sort().join(' ')
  const script = [
    'set -euo pipefail',
    `export PASEO_HOME=${shellQuote(input.environment.paseoHome)}`,
    'command -v paseo >/dev/null || npm install -g @getpaseo/cli',
    providerCliCheckCommand(input.providerProfile),
    `mkdir -p ${shellQuote(input.assignment.workspaceRef)}`,
    `paseo --host ${shellQuote(input.environment.daemonEndpoint)} daemon status >/dev/null || paseo daemon start --home ${shellQuote(input.environment.paseoHome)} >/dev/null`,
    ...projectionCommands,
    `printf '%s\n' ${shellQuote(`AIWorker projected ${input.soul.id}@${input.soul.version}: ${projectedFiles}`)} > ${shellQuote(path.posix.join(input.assignment.workspaceRef, '.aiworker-projection'))}`,
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
      handoff: createHandoff(input.environment, input.assignment.workspaceRef),
      status: 'handoff_ready',
    },
    command: redactedCommand,
    receipt: {
      adapterType: 'aissh',
      aisshArgs: redactedArgs,
      command: redactedCommand,
      environmentId: input.environment.environmentId,
      providerProfileId: input.providerProfile.id,
      soulReleaseRef: `${input.soul.id}@${input.soul.version}`,
      targetRef: redactSecretLike(input.environment.targetRef),
      workspaceRef: input.assignment.workspaceRef,
    },
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
  if (SECRET_VALUE_RE.test(value) || (SECRET_KEY_RE.test(field) && SECRET_VALUE_RE.test(value))) {
    SECRET_VALUE_RE.lastIndex = 0
    throw new Error(`${field} must use a secret reference, not a literal secret`)
  }
  SECRET_VALUE_RE.lastIndex = 0
}

export function redactSecretLike(value: string): string {
  return value.replace(SECRET_VALUE_RE, '[REDACTED]')
}

function providerCliCheckCommand(profile: ProviderProfile): string {
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

function assertProviderProfileReady(input: ProvisionPlanInput): void {
  if (input.assignment.providerProfileId !== input.providerProfile.id)
    throw new Error(`assignment provider ${input.assignment.providerProfileId} does not match profile ${input.providerProfile.id}`)
  if (!input.environment.providerProfileIds.includes(input.providerProfile.id))
    throw new Error(`provider profile ${input.providerProfile.id} is not attached to Paseo environment ${input.environment.environmentId}`)
  if (input.providerProfile.provider === 'acp' && !input.providerProfile.paseoProviderId && !input.providerProfile.cliCommand)
    throw new Error(`ACP provider profile ${input.providerProfile.id} must declare paseoProviderId or cliCommand`)
}

function projectionScriptCommands(workspaceRef: string, files: ProjectedFile[]): string[] {
  return files.map((file) => {
    const rel = validateProjectedFilePath(file.relativePath)
    assertNoLiteralSecretInProjectedFile(file.content, rel)
    const dest = path.posix.join(workspaceRef, rel)
    const dir = path.posix.dirname(dest)
    const encoded = Buffer.from(file.content, 'utf8').toString('base64')
    const chmod = file.mode ? ` && chmod ${file.mode.toString(8)} ${shellQuote(dest)}` : ''
    return `mkdir -p ${shellQuote(dir)} && printf '%s' ${shellQuote(encoded)} | base64 -d > ${shellQuote(dest)}${chmod}`
  })
}

function assertNoLiteralSecretInProjectedFile(content: string, rel: string): void {
  if (SECRET_VALUE_RE.test(content)) {
    SECRET_VALUE_RE.lastIndex = 0
    throw new Error(`projected workspace file must not contain literal provider secrets: ${rel}`)
  }
  SECRET_VALUE_RE.lastIndex = 0
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
