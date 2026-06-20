import type { ControlPlaneSnapshot } from '@zonease/aiworker-control/control-plane'
import type { ApprovalDecisionRecord, ApprovalStatus } from '@/lib/admin-data'
import type { AdminBootstrapStatus, AdminRemediation } from '@/lib/admin-remediation'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { CONTROL_PLANE_SCHEMA_VERSION, LocalFileControlPlaneStore, redactSecretLike } from '@zonease/aiworker-control'
import { adminAuthBootstrapStatus } from '@/lib/admin-auth'
import { adminRemediation, classifyApplyOutput } from '@/lib/admin-remediation'

export interface AdminDataApiPayload {
  approvals: ApprovalDecisionRecord[]
  bootstrap: AdminBootstrapStatus
  snapshot: ControlPlaneSnapshot | null
  source: 'control-plane' | 'fixture'
}

export interface ApplyJobResult {
  assignmentId: string
  remediation?: AdminRemediation
  status: 'completed' | 'failed'
  steps: Array<{
    id: 'approval' | 'target' | 'paseo' | 'workspace' | 'provider' | 'handoff'
    label: string
    status: 'done' | 'needs_attention' | 'failed'
  }>
}

export interface PairJobResult {
  assignmentId: string
  pairingOutput: string
  status: 'paired'
}

export interface ApprovalDecisionInput {
  note?: string
  reviewer?: string
  status?: ApprovalStatus
}

export interface CreateAssignmentInput {
  assignmentId?: string
  environment?: string
  provider?: string
  soulReleaseRef?: string
  user?: string
}

export interface CreateEnvironmentInput {
  environment?: string
  provider?: string
  target?: string
  user?: string
}

export interface CreateProviderInput {
  baseUrl?: string
  cliCommand?: string
  model?: string
  paseoProviderId?: string
  provider?: string
  providerKind?: string
  secretRef?: string
}

export interface RegisterSoulInput {
  soul?: string
}

export interface PreviewPlanInput {
  dedicatedTargetUser?: boolean
  environment?: string
  paseoEndpoint?: string
  paseoHost?: string
  paseoListen?: string
  provider?: string
  providerBaseUrl?: string
  providerCli?: string
  providerKind?: string
  providerModel?: string
  providerSecretRef?: string
  soul?: string
  target?: string
  targetOwner?: string
  user?: string
}

const approvalStatuses = ['pending', 'approved', 'changes_requested'] as const

export function controlPlaneDirFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.AIWORKER_CONTROL_PLANE_DIR
  return value && value.trim() !== '' ? resolve(value) : null
}

export function adminBootstrapStatus(source: AdminDataApiPayload['source'], env: NodeJS.ProcessEnv = process.env, request: Request | null = null): AdminBootstrapStatus {
  return {
    adminTokenRequired: Boolean(env.AIWORKER_WEB_ADMIN_TOKEN?.trim()),
    auth: adminAuthBootstrapStatus(request, env),
    controlPlaneDirConfigured: Boolean(controlPlaneDirFromEnv(env)),
    host: env.AIWORKER_WEB_HOST?.trim() || '127.0.0.1',
    remoteAccessEnabled: env.AIWORKER_WEB_ALLOW_REMOTE === '1',
    source,
  }
}

export async function loadAdminDataApiPayload(root: string | null | undefined = undefined, request: Request | null = null, env: NodeJS.ProcessEnv = process.env): Promise<AdminDataApiPayload> {
  const resolvedRoot = root ?? controlPlaneDirFromEnv(env)
  if (!resolvedRoot) {
    return {
      approvals: [],
      bootstrap: adminBootstrapStatus('fixture', env, request),
      snapshot: null,
      source: 'fixture',
    }
  }

  const store = new LocalFileControlPlaneStore(resolvedRoot)
  return {
    approvals: await readApprovalDecisionRecords(resolvedRoot),
    bootstrap: adminBootstrapStatus('control-plane', env, request),
    snapshot: await store.loadSnapshot(),
    source: 'control-plane',
  }
}

export async function appendApprovalDecision(root: string, assignmentId: string, input: ApprovalDecisionInput): Promise<ApprovalDecisionRecord> {
  const status = input.status
  if (!status || !approvalStatuses.includes(status))
    throw new Error('approval status must be pending, approved, or changes_requested')

  const payload = await loadAdminDataApiPayload(root)
  if (!payload.snapshot?.assignments.some(assignment => assignment.assignmentId === assignmentId))
    throw new Error(`unknown assignment ${assignmentId}`)

  const record: ApprovalDecisionRecord = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: `approval_${randomUUID()}`,
    kind: 'approval-decision',
    at: new Date().toISOString(),
    assignmentId,
    reviewer: redactSecretLike(input.reviewer?.trim() || 'admin-console'),
    status,
    ...(input.note?.trim() ? { note: redactSecretLike(input.note.trim()) } : {}),
  }
  assertApprovalDecisionRecordServerSafe(record)
  await mkdir(root, { recursive: true })
  await appendFile(approvalsPath(root), `${JSON.stringify(record)}\n`, 'utf8')
  return record
}

export async function runApprovedAssignmentApplyJob(root: string, assignmentId: string): Promise<ApplyJobResult> {
  const payload = await loadAdminDataApiPayload(root)
  if (!payload.snapshot)
    throw new Error('control plane snapshot is required')
  const assignment = payload.snapshot.assignments.find(item => item.assignmentId === assignmentId)
  if (!assignment)
    throw new Error(`unknown assignment ${assignmentId}`)
  const approval = latestApprovalForAssignment(payload.approvals, assignmentId)
  if (approval?.status !== 'approved')
    throw new Error(`assignment ${assignmentId} must be approved before apply`)
  const environment = payload.snapshot.environments.find(item => item.environmentId === assignment.environmentId)
  const provider = payload.snapshot.providerProfiles.find(item => item.id === assignment.providerProfileId)
  const soul = payload.snapshot.soulReleases.find(item => `${item.id}@${item.version}` === assignment.soulReleaseRef || item.id === assignment.soulReleaseRef)
  if (!environment || !provider || !soul)
    throw new Error(`assignment ${assignmentId} is missing environment, provider, or soul metadata`)
  const soulDescriptorPath = resolveSoulDescriptorPath(soul)
  if (!existsSync(soulDescriptorPath))
    throw new Error(`soul descriptor is missing: ${soulDescriptorPath}`)

  const result = await runAiworkerCli([
    'apply',
    '--yes',
    '--json',
    '--assignment-id',
    assignment.assignmentId,
    '--control-plane-dir',
    root,
    '--user',
    assignment.assignedEmail,
    '--target',
    environment.targetRef,
    '--target-owner',
    environment.ownerEmail,
    ...(environment.dedication ? ['--dedicated-target-user'] : []),
    '--environment',
    environment.environmentId,
    ...paseoEndpointCliArgs(environment),
    '--provider',
    provider.id,
    '--provider-kind',
    provider.provider,
    ...(provider.paseoProviderId ? ['--paseo-provider-id', provider.paseoProviderId] : []),
    ...(provider.cliCommand ? ['--provider-cli', provider.cliCommand] : []),
    ...(provider.secretRef ? ['--provider-secret-ref', provider.secretRef] : []),
    ...(provider.baseUrl ? ['--provider-base-url', provider.baseUrl] : []),
    ...(provider.model ? ['--provider-model', provider.model] : []),
    '--soul',
    soulDescriptorPath,
  ])
  return summarizeApplyJobResult(assignmentId, result.exitCode, result.stdout, result.stderr)
}

function paseoEndpointCliArgs(environment: ControlPlaneSnapshot['environments'][number]): string[] {
  if (environment.endpointKind === 'tcp' && environment.daemonListenRef && environment.daemonHostRef)
    return ['--paseo-listen', environment.daemonListenRef, '--paseo-host', environment.daemonHostRef]
  if (environment.endpointKind === 'relay-offer' || environment.endpointKind === 'local-home')
    return ['--paseo-endpoint', environment.daemonEndpoint]
  if (environment.endpointKind === 'unix' && environment.daemonEndpoint !== environment.daemonHostRef)
    return ['--paseo-endpoint', environment.daemonEndpoint]
  return []
}

export async function runAssignmentPairJob(root: string, assignmentId: string): Promise<PairJobResult> {
  const payload = await loadAdminDataApiPayload(root)
  if (!payload.snapshot)
    throw new Error('control plane snapshot is required')
  const assignment = payload.snapshot.assignments.find(item => item.assignmentId === assignmentId)
  if (!assignment)
    throw new Error(`unknown assignment ${assignmentId}`)
  const approval = latestApprovalForAssignment(payload.approvals, assignmentId)
  if (approval?.status !== 'approved')
    throw new Error(`assignment ${assignmentId} must be approved before pairing`)
  if (!isAssignmentReadyForPairing(payload.snapshot, assignment))
    throw new Error(`assignment ${assignmentId} must be applied and handoff-ready before pairing`)
  const environment = payload.snapshot.environments.find(item => item.environmentId === assignment.environmentId)
  const soul = payload.snapshot.soulReleases.find(item => `${item.id}@${item.version}` === assignment.soulReleaseRef || item.id === assignment.soulReleaseRef)
  if (!environment || !soul)
    throw new Error(`assignment ${assignmentId} is missing environment or soul metadata`)

  const result = await runAiworkerCli([
    'pair',
    '--json',
    '--user',
    assignment.assignedEmail,
    '--target',
    environment.targetRef,
    '--target-owner',
    environment.ownerEmail,
    ...(environment.dedication ? ['--dedicated-target-user'] : []),
    '--soul',
    resolveSoulDescriptorPath(soul),
  ])
  if (result.exitCode !== 0)
    throw new Error('pair command failed; run apply first and verify Paseo daemon status')
  const parsed = JSON.parse(result.stdout) as { stderr?: unknown, stdout?: unknown }
  const stdout = typeof parsed.stdout === 'string' ? parsed.stdout : ''
  const stderr = typeof parsed.stderr === 'string' ? parsed.stderr : ''
  return {
    assignmentId,
    pairingOutput: transientPairingOutput(stdout, stderr),
    status: 'paired',
  }
}

export function assertProviderSecretRefAllowed(secretRef: unknown): asserts secretRef is string {
  if (typeof secretRef !== 'string' || !secretRef.startsWith('secret://'))
    throw new Error('provider secret ref must start with secret://; AIWorker stores secret references only, never literal provider secrets.')
}

function appendOption(args: string[], flag: string, value: unknown): void {
  if (typeof value === 'string' && value.trim() !== '')
    args.push(flag, value)
}

async function runCliRecordJob<T>(args: string[]): Promise<T> {
  const result = await runAiworkerCli(args)
  if (result.exitCode !== 0)
    throw new Error(`aiworker ${args[0]} ${args[1] ?? ''} command failed`.trim())
  return JSON.parse(result.stdout) as T
}

export async function createAssignmentJob(root: string, input: CreateAssignmentInput): Promise<unknown> {
  const args = ['assignment', 'create', '--json', '--control-plane-dir', root]
  appendOption(args, '--user', input.user)
  appendOption(args, '--environment', input.environment)
  appendOption(args, '--provider', input.provider)
  appendOption(args, '--soul-release-ref', input.soulReleaseRef)
  appendOption(args, '--assignment-id', input.assignmentId)
  return runCliRecordJob(args)
}

export async function createEnvironmentJob(root: string, input: CreateEnvironmentInput): Promise<unknown> {
  const args = ['environment', 'create', '--json', '--control-plane-dir', root]
  appendOption(args, '--environment', input.environment)
  appendOption(args, '--user', input.user)
  appendOption(args, '--target', input.target)
  appendOption(args, '--provider', input.provider)
  return runCliRecordJob(args)
}

export async function createProviderJob(root: string, input: CreateProviderInput): Promise<unknown> {
  assertProviderSecretRefAllowed(input.secretRef)
  const args = ['provider', 'create', '--json', '--control-plane-dir', root]
  appendOption(args, '--provider', input.provider)
  appendOption(args, '--provider-kind', input.providerKind)
  appendOption(args, '--provider-secret-ref', input.secretRef)
  appendOption(args, '--provider-base-url', input.baseUrl)
  appendOption(args, '--provider-cli', input.cliCommand)
  appendOption(args, '--provider-model', input.model)
  appendOption(args, '--paseo-provider-id', input.paseoProviderId)
  return runCliRecordJob(args)
}

export async function registerSoulJob(root: string, input: RegisterSoulInput): Promise<unknown> {
  const args = ['soul', 'register', '--json', '--control-plane-dir', root]
  appendOption(args, '--soul', input.soul)
  return runCliRecordJob(args)
}

export async function previewPlanJob(input: PreviewPlanInput): Promise<unknown> {
  const args = ['plan', '--json']
  appendOption(args, '--user', input.user)
  appendOption(args, '--target', input.target)
  appendOption(args, '--target-owner', input.targetOwner)
  if (input.dedicatedTargetUser)
    args.push('--dedicated-target-user')
  appendOption(args, '--environment', input.environment)
  appendOption(args, '--paseo-endpoint', input.paseoEndpoint)
  appendOption(args, '--paseo-listen', input.paseoListen)
  appendOption(args, '--paseo-host', input.paseoHost)
  appendOption(args, '--provider', input.provider)
  appendOption(args, '--provider-kind', input.providerKind)
  appendOption(args, '--provider-base-url', input.providerBaseUrl)
  appendOption(args, '--provider-cli', input.providerCli)
  appendOption(args, '--provider-model', input.providerModel)
  appendOption(args, '--provider-secret-ref', input.providerSecretRef)
  appendOption(args, '--soul', input.soul)
  return runCliRecordJob(args)
}

async function readApprovalDecisionRecords(root: string): Promise<ApprovalDecisionRecord[]> {
  try {
    const raw = await readFile(approvalsPath(root), 'utf8')
    return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
      const record = JSON.parse(line) as ApprovalDecisionRecord
      assertApprovalDecisionRecordServerSafe(record, `approvals:${index + 1}`)
      return record
    })
  }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return []
    throw error
  }
}

function approvalsPath(root: string): string {
  return join(root, 'approvals.jsonl')
}

function assertApprovalDecisionRecordServerSafe(record: ApprovalDecisionRecord, label: string = record.id): void {
  const serialized = JSON.stringify(record)
  if (serialized.includes('offer=') || serialized.includes('paseo://pair') || serialized.includes('data:image') || serialized.includes('transcript') || serialized.includes('runtime log'))
    throw new Error(`approval decision ${label} must not contain runtime or raw pairing data`)
  if (serialized.includes(`${'sk'}-`) || serialized.includes('Bearer '))
    throw new Error(`approval decision ${label} must not contain literal secrets`)
}

function latestApprovalForAssignment(records: ApprovalDecisionRecord[], assignmentId: string): ApprovalDecisionRecord | undefined {
  return records
    .filter(record => record.assignmentId === assignmentId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1)
}

function resolveSoulDescriptorPath(soul: ControlPlaneSnapshot['soulReleases'][number]): string {
  if (soul.descriptorRef)
    return resolve(soul.descriptorRef)
  const packageId = soul.id.includes('@') ? soul.id.slice(0, soul.id.indexOf('@')) : soul.id
  return join(process.cwd(), 'souls', packageId, 'dist', 'soul.descriptor.json')
}

function isAssignmentReadyForPairing(snapshot: ControlPlaneSnapshot, assignment: ControlPlaneSnapshot['assignments'][number]): boolean {
  if (!['handoff_ready', 'needs_attention', 'ready'].includes(assignment.status))
    return false
  if (!assignment.handoff || assignment.handoff.workspaceRef !== assignment.workspaceRef)
    return false
  if (!['paseo-daemon', 'pairing-offer', 'manual-path'].includes(assignment.handoff.kind))
    return false
  return snapshot.receipts.some(receipt =>
    receipt.status === 'applied'
    && receipt.environmentId === assignment.environmentId
    && receipt.providerProfileId === assignment.providerProfileId
    && receipt.soulReleaseRef === assignment.soulReleaseRef
    && receipt.workspaceRef === assignment.workspaceRef,
  )
}

function transientPairingOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
}

async function runAiworkerCli(args: string[]): Promise<{ exitCode: number, stderr: string, stdout: string }> {
  const invocation = resolveAiworkerCliCommand(args)
  const proc = Bun.spawn(invocation.command, {
    cwd: invocation.cwd,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stderr, stdout }
}

export function resolveAiworkerCliCommand(args: string[], env: NodeJS.ProcessEnv = process.env): { command: string[], cwd: string } {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
  const configured = env.AIWORKER_CLI_BIN?.trim()
  return {
    command: configured ? [configured, ...args] : ['bun', join(repoRoot, 'apps/aiworker-cli/src/aiworker.ts'), ...args],
    cwd: repoRoot,
  }
}

export function summarizeApplyJobResult(assignmentId: string, exitCode: number, stdout: string, stderr: string): ApplyJobResult {
  const combined = applyExecutionOutput(exitCode, stdout, stderr)
  const completed = exitCode === 0
  const providerWarning = completed && combined.includes('AIWORKER_PROVIDER_WARNING')
  const handoffReady = completed && combined.includes('AIWORKER_HANDOFF_READY')
  const paseoReady = completed && /Local Daemon\s+running|Connected Daemon\s+reachable/.test(combined)
  const remediationCode = completed
    ? classifyApplyOutput(exitCode, combined, '')
    : classifyApplyOutput(exitCode, stdout, stderr)
  return {
    assignmentId,
    ...(remediationCode ? { remediation: adminRemediation(remediationCode) } : {}),
    status: completed ? 'completed' : 'failed',
    steps: [
      { id: 'approval', label: '管理员已确认', status: 'done' },
      { id: 'target', label: '员工设备已连接', status: completed ? 'done' : 'failed' },
      { id: 'paseo', label: '员工设备上的 Paseo 可用', status: paseoReady ? 'done' : completed ? 'needs_attention' : 'failed' },
      { id: 'workspace', label: '员工工作区已准备', status: completed ? 'done' : 'failed' },
      { id: 'provider', label: providerWarning ? '后台 AI 账号需要授权' : '后台 AI 账号未阻塞开通', status: providerWarning ? 'needs_attention' : completed ? 'done' : 'failed' },
      { id: 'handoff', label: '员工入口已准备', status: handoffReady ? 'done' : completed ? 'needs_attention' : 'failed' },
    ],
  }
}

function applyExecutionOutput(exitCode: number, stdout: string, stderr: string): string {
  if (exitCode !== 0)
    return `${stdout}\n${stderr}`
  try {
    const parsed = JSON.parse(stdout) as { stderr?: unknown, stdout?: unknown }
    return [
      typeof parsed.stdout === 'string' ? parsed.stdout : '',
      typeof parsed.stderr === 'string' ? parsed.stderr : '',
      stderr,
    ].filter(Boolean).join('\n')
  }
  catch {
    return `${stdout}\n${stderr}`
  }
}
