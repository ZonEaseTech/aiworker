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
