import type { ControlPlaneSnapshot } from '@zonease/aiworker-control/control-plane'
import type { ApprovalDecisionRecord, ApprovalStatus } from '@/lib/admin-data'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { CONTROL_PLANE_SCHEMA_VERSION, LocalFileControlPlaneStore, redactSecretLike } from '@zonease/aiworker-control'

export interface AdminDataApiPayload {
  approvals: ApprovalDecisionRecord[]
  snapshot: ControlPlaneSnapshot | null
  source: 'control-plane' | 'fixture'
}

export interface ApplyJobResult {
  assignmentId: string
  status: 'completed' | 'failed'
  steps: Array<{
    id: 'approval' | 'target' | 'paseo' | 'workspace' | 'provider' | 'handoff'
    label: string
    status: 'done' | 'needs_attention' | 'failed'
  }>
}

export interface ApprovalDecisionInput {
  note?: string
  reviewer?: string
  status?: ApprovalStatus
}

const approvalStatuses = ['pending', 'approved', 'changes_requested'] as const

export function controlPlaneDirFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.AIWORKER_CONTROL_PLANE_DIR
  return value && value.trim() !== '' ? resolve(value) : null
}

export async function loadAdminDataApiPayload(root: string | null = controlPlaneDirFromEnv()): Promise<AdminDataApiPayload> {
  if (!root) {
    return {
      approvals: [],
      snapshot: null,
      source: 'fixture',
    }
  }

  const store = new LocalFileControlPlaneStore(root)
  return {
    approvals: await readApprovalDecisionRecords(root),
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

  const result = await runAiworkerCli([
    'apply',
    '--yes',
    '--json',
    '--control-plane-dir',
    root,
    '--user',
    assignment.assignedEmail,
    '--target',
    environment.targetRef,
    '--environment',
    environment.environmentId,
    '--provider',
    provider.id,
    '--provider-kind',
    provider.provider,
    ...(provider.paseoProviderId ? ['--paseo-provider-id', provider.paseoProviderId] : []),
    ...(provider.cliCommand ? ['--provider-cli', provider.cliCommand] : []),
    '--soul',
    resolveSoulDescriptorPath(soul.id),
  ])
  return summarizeApplyJobResult(assignmentId, result.exitCode, result.stdout, result.stderr)
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

function resolveSoulDescriptorPath(soulId: string): string {
  const packageId = soulId.includes('@') ? soulId.slice(0, soulId.indexOf('@')) : soulId
  return join(process.cwd(), 'souls', packageId, 'dist', 'soul.descriptor.json')
}

async function runAiworkerCli(args: string[]): Promise<{ exitCode: number, stderr: string, stdout: string }> {
  const configured = process.env.AIWORKER_CLI_BIN
  const command = configured ? [configured, ...args] : ['bun', 'apps/aiworker-cli/src/aiworker.ts', ...args]
  const proc = Bun.spawn(command, {
    cwd: process.cwd(),
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

function summarizeApplyJobResult(assignmentId: string, exitCode: number, stdout: string, stderr: string): ApplyJobResult {
  const combined = `${stdout}\n${stderr}`
  const providerWarning = combined.includes('AIWORKER_PROVIDER_WARNING')
  const handoffReady = combined.includes('AIWORKER_HANDOFF_READY')
  const paseoReady = /Local Daemon\s+running|Connected Daemon\s+reachable/.test(combined)
  const completed = exitCode === 0
  return {
    assignmentId,
    status: completed ? 'completed' : 'failed',
    steps: [
      { id: 'approval', label: '审批已通过', status: 'done' },
      { id: 'target', label: '目标机器已通过 aissh 返回', status: completed ? 'done' : 'failed' },
      { id: 'paseo', label: 'Paseo daemon 可用', status: paseoReady ? 'done' : completed ? 'needs_attention' : 'failed' },
      { id: 'workspace', label: 'Workspace 文件已投影', status: completed ? 'done' : 'failed' },
      { id: 'provider', label: providerWarning ? 'Provider 需要登录/安装后再使用' : 'Provider 未阻塞投影', status: providerWarning ? 'needs_attention' : completed ? 'done' : 'failed' },
      { id: 'handoff', label: 'Handoff 已准备，可请求配对', status: handoffReady ? 'done' : completed ? 'needs_attention' : 'failed' },
    ],
  }
}
