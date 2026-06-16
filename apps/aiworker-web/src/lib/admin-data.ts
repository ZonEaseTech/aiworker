import type { Icon } from '@phosphor-icons/react'
import type {
  AssignmentStatus,
  AuditEvent,
  ControlPlaneSnapshot,
  PaseoEndpointKind,
  PaseoEnvironment,
  PaseoHandoff,
  ProjectedFile,
  ProviderProfile,
  ProvisionReceipt,
  SoulRelease,
  WorkspaceAssignment,
} from '@zonease/aiworker-control/control-plane'
import {
  ArchiveIcon,
  CheckCircleIcon,
  ClockClockwiseIcon,
  DesktopTowerIcon,
  FileTextIcon,
  HandshakeIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { assertNoLiteralProviderSecret, CONTROL_PLANE_SCHEMA_VERSION } from '@zonease/aiworker-control/control-plane'

export type { AssignmentStatus }

export type ProviderKind = 'codex' | 'claude' | 'opencode' | 'acp' | (string & {})

export type HandoffKind = 'paseo-daemon' | 'pairing-offer' | 'manual-path'

export type SecretReference = `secret://${string}`

export type RedactedEndpointReference = string

export type RedactedHandoffReference = string

export type Tone = 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' | 'outline'

export interface ProviderProfileSummary {
  id: string
  label: string
  provider: ProviderKind
  secretRef: SecretReference
  paseoProviderId?: string
  cliCommand?: string
  status: 'ready' | 'needs_auth' | 'reference_only'
}

export interface PaseoEnvironmentSummary {
  id: string
  ownerEmail: string
  targetRef: string
  paseoHome: string
  daemonEndpoint: RedactedEndpointReference
  endpointKind: PaseoEndpointKind
  isolation: 'os-user' | 'rootless-container' | 'container' | 'vm' | 'single-user-dev'
  providerProfileIds: string[]
  status: 'ready' | 'needs_attention' | 'provisioning'
}

export interface SoulReleaseSummary {
  id: string
  displayName: string
  version: string
  descriptorRef: string
  workspaceTemplateRoot: string
  fileCount: number
  updatedAt: string
  status: 'published' | 'draft' | 'retired'
  summary: string
}

export interface AuditEventSummary {
  id: string
  at: string
  actor: string
  action: string
  target: string
  tone: Tone
}

export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested'

export type ApprovalCheckStatus = 'pass' | 'warning' | 'blocked'

export interface ProvisioningApprovalCheckSummary {
  id: string
  label: string
  status: ApprovalCheckStatus
  detail: string
}

export interface ProvisioningApprovalSummary {
  id: string
  assignmentId: string
  title: string
  status: ApprovalStatus
  requestedBy: string
  reviewer: string
  submittedAt: string
  decidedAt?: string
  riskSummary: string
  previewCommand: string
  controlApiState: 'not_implemented' | 'persisted'
  checks: ProvisioningApprovalCheckSummary[]
}

export interface ApprovalDecisionRecord {
  schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  id: string
  kind: 'approval-decision'
  at: string
  assignmentId: string
  status: ApprovalStatus
  reviewer: string
  note?: string
}

export interface ProvisioningTraceEventSummary {
  id: string
  assignmentId: string
  at: string
  actor: string
  title: string
  detail: string
  evidenceRef: string
  tone: Tone
}

export interface AssignmentSummary {
  id: string
  assignedEmail: string
  team: string
  status: AssignmentStatus
  environmentId: string
  soulReleaseId: string
  providerProfileId: string
  workspaceRef: string
  receiptId: string
  handoffKind: HandoffKind
  handoffLabel: RedactedHandoffReference
  updatedAt: string
  nextStep: string
  audit: AuditEventSummary[]
}

export interface MetricSummary {
  label: string
  value: string
  helper: string
  tone: Tone
  icon: Icon
}

export interface AdminConsoleData {
  assignments: AssignmentSummary[]
  approvals: ProvisioningApprovalSummary[]
  environments: PaseoEnvironmentSummary[]
  metrics: MetricSummary[]
  providerProfiles: ProviderProfileSummary[]
  recentAuditEvents: AuditEventSummary[]
  soulReleases: SoulReleaseSummary[]
  traceEvents: ProvisioningTraceEventSummary[]
}

export interface AdminDataSource {
  loadAdminConsoleData: () => AdminConsoleData
}

const SECRET_REFERENCE_PREFIX = 'secret://'
const REDACTED_PAIRING_ENDPOINT = '[REDACTED_PAIRING_URL]'

const approvalStatuses: readonly ApprovalStatus[] = ['pending', 'approved', 'changes_requested'] as const
const approvalCheckStatuses: readonly ApprovalCheckStatus[] = ['pass', 'warning', 'blocked'] as const
const traceEvidencePrefixes = ['assignment', 'approval', 'receipt', 'audit', 'handoff'] as const

const forbiddenRuntimeDataFragments = [
  '/api/sessions/',
  'engine_invocation',
  'engine invocation',
  'provider process',
  'provider json',
  'provider models',
  'raw pairing',
  'paseo://pair',
  'offer=',
  'qr:',
  'base64:',
  'data:image',
  'shell script body',
  'runtime log',
  'runtime event',
  'transcript',
  'token=',
] as const

function assertNoRuntimeData(label: string, value: string) {
  const normalized = value.toLowerCase()
  const forbidden = forbiddenRuntimeDataFragments.find(fragment => normalized.includes(fragment))

  if (forbidden) {
    throw new Error(`admin console data must stay redacted: ${label} contains ${forbidden}`)
  }
}

function assertNoSensitiveAdminString(label: string, value: string) {
  assertNoRuntimeData(label, value)
  assertNoLiteralProviderSecret(value, label)
}

function assertNoSensitiveAdminValue(label: string, value: unknown): void {
  if (typeof value === 'string') {
    assertNoSensitiveAdminString(label, value)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveAdminValue(`${label}[${index}]`, item))
    return
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      assertNoSensitiveAdminValue(`${label}.${key}`, child)
  }
}

function assertNoSnapshotLiteralSecrets(label: string, value: unknown): void {
  if (typeof value === 'string') {
    assertNoLiteralProviderSecret(value, label)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSnapshotLiteralSecrets(`${label}[${index}]`, item))
    return
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      assertNoSnapshotLiteralSecrets(`${label}.${key}`, child)
  }
}

export function assertRedactedAdminConsoleData(data: AdminConsoleData): AdminConsoleData {
  const assignmentsById = new Map<string, AssignmentSummary>()
  const assignmentTupleOwners = new Map<string, string>()
  for (const assignment of data.assignments) {
    if (assignmentsById.has(assignment.id)) {
      throw new Error(`assignment ${assignment.id} must be unique`)
    }

    const tupleKey = assignmentTupleKey(assignment.environmentId, assignment.soulReleaseId, assignment.providerProfileId)
    const existingAssignmentId = assignmentTupleOwners.get(tupleKey)
    if (existingAssignmentId) {
      throw new Error(`assignment tuple must be unique: ${assignment.environmentId}/${assignment.soulReleaseId}/${assignment.providerProfileId} is shared by ${existingAssignmentId} and ${assignment.id}`)
    }

    assignmentsById.set(assignment.id, assignment)
    assignmentTupleOwners.set(tupleKey, assignment.id)
  }

  for (const profile of data.providerProfiles) {
    if (!profile.secretRef.startsWith(SECRET_REFERENCE_PREFIX)) {
      throw new Error(`provider profile ${profile.id} must use a secret reference`)
    }
  }

  for (const environment of data.environments) {
    if (environment.endpointKind === 'relay-offer' && environment.daemonEndpoint !== REDACTED_PAIRING_ENDPOINT) {
      throw new Error(`environment ${environment.id} relay endpoint must be a redacted pairing reference`)
    }
  }

  const assignmentIds = new Set(assignmentsById.keys())
  const approvalsById = new Map<string, ProvisioningApprovalSummary>()
  const approvalByAssignment = new Map<string, string>()
  for (const approval of data.approvals) {
    if (!assignmentIds.has(approval.assignmentId)) {
      throw new Error(`approval ${approval.id} must reference a known assignment`)
    }

    const assignment = assignmentsById.get(approval.assignmentId)
    if (!assignment) {
      throw new Error(`approval ${approval.id} must reference a known assignment`)
    }

    if (approvalsById.has(approval.id)) {
      throw new Error(`approval ${approval.id} must be unique`)
    }

    const existingApprovalId = approvalByAssignment.get(approval.assignmentId)
    if (existingApprovalId) {
      throw new Error(`assignment ${approval.assignmentId} must have a single approval preview, found ${existingApprovalId} and ${approval.id}`)
    }

    if (!approvalStatuses.includes(approval.status)) {
      throw new Error(`approval ${approval.id} has unsupported status ${approval.status}`)
    }

    if (approval.controlApiState !== 'not_implemented' && approval.controlApiState !== 'persisted') {
      throw new Error(`approval ${approval.id} has unsupported control API state`)
    }

    if (!approval.previewCommand.startsWith('aiworker plan ')) {
      throw new Error(`approval ${approval.id} preview command must use aiworker plan`)
    }

    if (
      !approval.previewCommand.includes(`--user ${assignment.assignedEmail}`)
      || !approval.previewCommand.includes(`--environment ${assignment.environmentId}`)
      || !approval.previewCommand.includes(`--provider ${assignment.providerProfileId}`)
      || !approval.previewCommand.includes(`--soul ${assignment.soulReleaseId}`)
    ) {
      throw new Error(`approval ${approval.id} preview command must stay scoped to its assignment`)
    }

    for (const check of approval.checks) {
      if (!approvalCheckStatuses.includes(check.status)) {
        throw new Error(`approval check ${check.id} has unsupported status ${check.status}`)
      }
    }

    approvalsById.set(approval.id, approval)
    approvalByAssignment.set(approval.assignmentId, approval.id)
  }

  for (const traceEvent of data.traceEvents) {
    if (!assignmentIds.has(traceEvent.assignmentId)) {
      throw new Error(`trace event ${traceEvent.id} must reference a known assignment`)
    }

    const assignment = assignmentsById.get(traceEvent.assignmentId)
    if (!assignment) {
      throw new Error(`trace event ${traceEvent.id} must reference a known assignment`)
    }

    assertTraceEvidenceRef(traceEvent, assignment, approvalsById)
  }

  assertNoSensitiveAdminValue('adminConsoleData', data)

  return data
}

export const statusMeta: Record<AssignmentStatus, { label: string, tone: Tone }> = {
  draft: { label: '草稿', tone: 'secondary' },
  provisioning: { label: '配置中', tone: 'info' },
  workspace_projected: { label: '已投影', tone: 'info' },
  handoff_ready: { label: '可交接', tone: 'warning' },
  ready: { label: '就绪', tone: 'success' },
  needs_attention: { label: '需处理', tone: 'destructive' },
  revoked: { label: '已撤销', tone: 'outline' },
  archived: { label: '已归档', tone: 'secondary' },
}

export const approvalStatusMeta: Record<ApprovalStatus, { label: string, tone: Tone }> = {
  pending: { label: '待审批', tone: 'warning' },
  approved: { label: '已批准', tone: 'success' },
  changes_requested: { label: '退回修改', tone: 'destructive' },
}

export const approvalCheckStatusMeta: Record<ApprovalCheckStatus, { label: string, tone: Tone }> = {
  pass: { label: '通过', tone: 'success' },
  warning: { label: '需确认', tone: 'warning' },
  blocked: { label: '阻塞', tone: 'destructive' },
}

export const providerStatusMeta: Record<ProviderProfileSummary['status'], { label: string, tone: Tone }> = {
  ready: { label: '可用', tone: 'success' },
  needs_auth: { label: '需授权', tone: 'warning' },
  reference_only: { label: '仅引用', tone: 'info' },
}

export const environmentStatusMeta: Record<PaseoEnvironmentSummary['status'], { label: string, tone: Tone }> = {
  ready: { label: '就绪', tone: 'success' },
  needs_attention: { label: '需处理', tone: 'destructive' },
  provisioning: { label: '配置中', tone: 'info' },
}

export const releaseStatusMeta: Record<SoulReleaseSummary['status'], { label: string, tone: Tone }> = {
  published: { label: '已发布', tone: 'success' },
  draft: { label: '草稿', tone: 'warning' },
  retired: { label: '已退役', tone: 'secondary' },
}

export function mapControlPlaneSnapshotToAdminConsoleData(snapshot: ControlPlaneSnapshot): AdminConsoleData {
  assertNoSnapshotLiteralSecrets('controlPlaneSnapshot', snapshot)

  const providerProfiles = snapshot.providerProfiles.map(mapProviderProfile)
  const environments = snapshot.environments.map(environment => ({
    id: environment.environmentId,
    ownerEmail: environment.ownerEmail,
    targetRef: environment.targetRef,
    paseoHome: environment.paseoHome,
    daemonEndpoint: redactedEndpointReference(environment.daemonEndpoint, environment.endpointKind),
    endpointKind: environment.endpointKind,
    isolation: environment.isolation,
    providerProfileIds: environment.providerProfileIds,
    status: 'ready' as const,
  }))
  const soulReleases = snapshot.soulReleases.map(mapSoulRelease)
  const auditEvents = snapshot.auditEvents.map(event => ({
    id: event.id,
    action: event.action,
    actor: event.actor,
    at: formatAdminTimestamp(event.at),
    target: event.target,
    tone: toneForAuditAction(event.action),
  }))
  const assignments = snapshot.assignments.map(assignment =>
    mapAssignment(assignment, snapshot.receipts, auditEvents, snapshot.environments),
  )
  const approvals = buildProvisioningApprovals(assignments, environments, providerProfiles, soulReleases)
  const traceEvents = buildProvisioningTraceEvents(assignments, approvals)

  return assertRedactedAdminConsoleData({
    assignments,
    approvals,
    environments,
    metrics: buildMetrics({ assignments, approvals, providerProfiles, soulReleases }),
    providerProfiles,
    recentAuditEvents: auditEvents,
    soulReleases,
    traceEvents,
  })
}

export function createAdminDataSourceFromControlPlaneSnapshot(snapshot: ControlPlaneSnapshot): AdminDataSource {
  return {
    loadAdminConsoleData() {
      return mapControlPlaneSnapshotToAdminConsoleData(snapshot)
    },
  }
}

export function applyApprovalDecisionRecords(data: AdminConsoleData, records: ApprovalDecisionRecord[]): AdminConsoleData {
  const assignmentIds = new Set(data.assignments.map(assignment => assignment.id))
  const latestByAssignment = new Map<string, ApprovalDecisionRecord>()

  for (const record of records) {
    assertApprovalDecisionRecordSafe(record, assignmentIds)
    const previous = latestByAssignment.get(record.assignmentId)
    if (!previous || previous.at <= record.at)
      latestByAssignment.set(record.assignmentId, record)
  }

  if (latestByAssignment.size === 0)
    return data

  const approvals = data.approvals.map((approval) => {
    const decision = latestByAssignment.get(approval.assignmentId)
    if (!decision)
      return approval

    return {
      ...approval,
      controlApiState: 'persisted' as const,
      decidedAt: decision.status === 'pending' ? undefined : formatAdminTimestamp(decision.at),
      reviewer: decision.reviewer,
      riskSummary: decision.note ? `${approval.riskSummary} 审批备注：${decision.note}` : approval.riskSummary,
      status: decision.status,
    }
  })

  return assertRedactedAdminConsoleData({
    ...data,
    approvals,
    metrics: buildMetrics({
      approvals,
      assignments: data.assignments,
      providerProfiles: data.providerProfiles,
      soulReleases: data.soulReleases,
    }),
    traceEvents: buildProvisioningTraceEvents(data.assignments, approvals),
  })
}

function assertApprovalDecisionRecordSafe(record: ApprovalDecisionRecord, assignmentIds: ReadonlySet<string>): void {
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION)
    throw new Error(`approval decision ${record.id} uses unsupported schemaVersion`)
  if (record.kind !== 'approval-decision')
    throw new Error(`approval decision ${record.id} has unsupported kind`)
  if (!assignmentIds.has(record.assignmentId))
    throw new Error(`approval decision ${record.id} must reference a known assignment`)
  if (!approvalStatuses.includes(record.status))
    throw new Error(`approval decision ${record.id} has unsupported status ${record.status}`)
  assertNoSensitiveAdminValue(`approvalDecision:${record.id}`, record)
}

const fixtureProviderProfiles: ProviderProfileSummary[] = [
  {
    id: 'codex-default',
    label: 'Codex 默认配置',
    provider: 'codex',
    secretRef: 'secret://providers/codex/default',
    paseoProviderId: 'paseo-codex-default',
    status: 'ready',
  },
  {
    id: 'claude-ops',
    label: 'Claude 运维配置',
    provider: 'claude',
    secretRef: 'secret://providers/claude/ops',
    cliCommand: 'claude',
    status: 'ready',
  },
  {
    id: 'acp-secure',
    label: 'ACP 安全隔离配置',
    provider: 'acp',
    secretRef: 'secret://providers/acp/secure',
    paseoProviderId: 'paseo-acp-secure',
    status: 'reference_only',
  },
]

const fixtureEnvironments: PaseoEnvironmentSummary[] = [
  {
    id: 'env-alice-prod-1',
    ownerEmail: 'alice@example.com',
    targetRef: 'aissh:prod-ops-1',
    paseoHome: '$HOME/.paseo',
    daemonEndpoint: 'unix:/run/paseo/alice.sock',
    endpointKind: 'unix',
    isolation: 'os-user',
    providerProfileIds: ['codex-default', 'claude-ops'],
    status: 'ready',
  },
  {
    id: 'env-bob-container-2',
    ownerEmail: 'bob@example.com',
    targetRef: 'container:finance-bob',
    paseoHome: '/workspace/.paseo',
    daemonEndpoint: '127.0.0.1:6767',
    endpointKind: 'tcp',
    isolation: 'rootless-container',
    providerProfileIds: ['codex-default'],
    status: 'provisioning',
  },
  {
    id: 'env-cara-relay',
    ownerEmail: 'cara@example.com',
    targetRef: 'aissh:remote-sales-7',
    paseoHome: '$HOME/.paseo',
    daemonEndpoint: '[REDACTED_PAIRING_URL]',
    endpointKind: 'relay-offer',
    isolation: 'vm',
    providerProfileIds: ['acp-secure'],
    status: 'needs_attention',
  },
]

const fixtureSoulReleases: SoulReleaseSummary[] = [
  {
    id: 'soul-freeform-2026-06-14',
    displayName: 'AIWorker Freeform',
    version: '2026.06.14',
    descriptorRef: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    workspaceTemplateRoot: 'souls/aiworker-freeform/dist/workspace-template',
    fileCount: 9,
    updatedAt: '2026-06-14 07:10 UTC',
    status: 'published',
    summary: '通用企业 AI 工作者，投影 AGENTS、CLAUDE、skills 与业务上下文。',
  },
  {
    id: 'soul-support-2026-06-12',
    displayName: 'Software Support',
    version: '2026.06.12',
    descriptorRef: 'souls/software-support/dist/soul.descriptor.json',
    workspaceTemplateRoot: 'souls/software-support/dist/workspace-template',
    fileCount: 13,
    updatedAt: '2026-06-12 18:45 UTC',
    status: 'published',
    summary: '支持团队排障和知识库检索模板，不包含 UI 或运行时 API。',
  },
  {
    id: 'soul-hr-draft',
    displayName: 'HR Manager',
    version: 'draft',
    descriptorRef: 'souls/hr-manager/dist/soul.descriptor.json',
    workspaceTemplateRoot: 'souls/hr-manager/dist/workspace-template',
    fileCount: 7,
    updatedAt: '2026-06-13 11:20 UTC',
    status: 'draft',
    summary: '候选人筛选与员工政策问答模板，等待发布审批。',
  },
]

const fixtureAssignments: AssignmentSummary[] = [
  {
    id: 'asn-alice-freeform',
    assignedEmail: 'alice@example.com',
    team: '运营效率组',
    status: 'ready',
    environmentId: 'env-alice-prod-1',
    soulReleaseId: 'soul-freeform-2026-06-14',
    providerProfileId: 'codex-default',
    workspaceRef: '$HOME/aiworker-workspaces/freeform',
    receiptId: 'rcpt-20260614-001',
    handoffKind: 'paseo-daemon',
    handoffLabel: 'run paseo daemon pair --home "$PASEO_HOME" from $HOME/aiworker-workspaces/freeform; open the printed link in the Paseo frontend',
    updatedAt: '2026-06-14 07:34 UTC',
    nextStep: '员工可在 Paseo 客户端打开 workspace；AIWorker 不读取 session。',
    audit: [
      {
        id: 'evt-001',
        at: '07:34',
        actor: 'admin@example.com',
        action: 'handoff_ready -> ready',
        target: 'asn-alice-freeform',
        tone: 'success',
      },
      {
        id: 'evt-002',
        at: '07:31',
        actor: 'aiworker apply',
        action: 'projected workspace files',
        target: '$HOME/aiworker-workspaces/freeform',
        tone: 'info',
      },
    ],
  },
  {
    id: 'asn-bob-support',
    assignedEmail: 'bob@example.com',
    team: '财务共享服务',
    status: 'workspace_projected',
    environmentId: 'env-bob-container-2',
    soulReleaseId: 'soul-support-2026-06-12',
    providerProfileId: 'codex-default',
    workspaceRef: '/workspace/paseo/workspaces/support',
    receiptId: 'rcpt-20260614-002',
    handoffKind: 'manual-path',
    handoffLabel: '等待容器内 Paseo daemon endpoint 确认',
    updatedAt: '2026-06-14 06:55 UTC',
    nextStep: '确认 daemon endpoint 后生成 handoff；AIWorker 不读取 session。',
    audit: [
      {
        id: 'evt-003',
        at: '06:55',
        actor: 'aiworker apply',
        action: 'workspace_projected',
        target: 'asn-bob-support',
        tone: 'info',
      },
    ],
  },
  {
    id: 'asn-cara-acp',
    assignedEmail: 'cara@example.com',
    team: '销售 Enablement',
    status: 'needs_attention',
    environmentId: 'env-cara-relay',
    soulReleaseId: 'soul-freeform-2026-06-14',
    providerProfileId: 'acp-secure',
    workspaceRef: '$HOME/aiworker-workspaces/sales-enable',
    receiptId: 'rcpt-20260613-014',
    handoffKind: 'pairing-offer',
    handoffLabel: 'relay offer 已脱敏，等待员工重新配对',
    updatedAt: '2026-06-14 05:42 UTC',
    nextStep: '重新生成 pairing offer；AIWorker 不读取 session，也不显示 relay token。',
    audit: [
      {
        id: 'evt-004',
        at: '05:42',
        actor: 'aiworker doctor',
        action: 'relay offer expired',
        target: 'env-cara-relay',
        tone: 'destructive',
      },
    ],
  },
]

function buildFixtureControlPlaneSnapshot(): ControlPlaneSnapshot {
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    assignments: fixtureAssignments.map(mapFixtureAssignment),
    auditEvents: fixtureAssignments.flatMap(assignment => assignment.audit.map(mapFixtureAuditEvent)),
    environments: fixtureEnvironments.map(environment => ({
      environmentId: environment.id,
      daemonEndpoint: environment.daemonEndpoint,
      endpointKind: environment.endpointKind,
      isolation: environment.isolation === 'rootless-container' ? 'container' : environment.isolation,
      ownerEmail: environment.ownerEmail,
      paseoHome: environment.paseoHome,
      providerProfileIds: environment.providerProfileIds,
      targetRef: environment.targetRef,
    })),
    projectionManifests: [],
    providerProfiles: fixtureProviderProfiles.map(profile => ({
      id: profile.id,
      cliCommand: profile.cliCommand,
      label: profile.label,
      paseoProviderId: profile.paseoProviderId,
      provider: profile.provider,
      secretRef: profile.secretRef,
    })),
    receipts: fixtureAssignments.map(mapFixtureReceipt),
    soulReleases: fixtureSoulReleases.map(mapFixtureSoulRelease),
  }
}

function mapFixtureAssignment(assignment: AssignmentSummary): WorkspaceAssignment {
  return {
    assignmentId: assignment.id,
    assignedEmail: assignment.assignedEmail,
    environmentId: assignment.environmentId,
    handoff: mapFixtureHandoff(assignment),
    providerProfileId: assignment.providerProfileId,
    soulReleaseRef: fixtureSoulReleaseRef(assignment.soulReleaseId),
    status: assignment.status,
    workspaceRef: assignment.workspaceRef,
  }
}

function mapFixtureHandoff(assignment: AssignmentSummary): PaseoHandoff {
  const endpoint = fixtureEnvironments.find(environment => environment.id === assignment.environmentId)?.daemonEndpoint ?? 'manual'
  return {
    kind: assignment.handoffKind,
    daemonEndpoint: endpoint,
    workspaceRef: assignment.workspaceRef,
    instructions: assignment.handoffLabel,
  }
}

function mapFixtureAuditEvent(event: AuditEventSummary): AuditEvent {
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: event.id,
    kind: 'audit-event',
    at: event.at,
    actor: event.actor,
    action: event.action,
    target: event.target,
  }
}

function mapFixtureReceipt(assignment: AssignmentSummary): ProvisionReceipt {
  const environment = fixtureEnvironments.find(item => item.id === assignment.environmentId)
  const workspaceName = assignment.workspaceRef.split('/').filter(Boolean).at(-1) ?? assignment.workspaceRef
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    id: assignment.receiptId,
    kind: 'provision-receipt',
    adapterType: assignment.environmentId.includes('container') ? 'rootless-container' : 'aissh',
    aisshArgs: ['exec', assignment.environmentId, '[redacted]'],
    at: assignment.updatedAt,
    command: 'aissh exec [redacted]',
    endpointBinding: environment?.endpointKind === 'relay-offer'
      ? 'opaque-pairing-offer'
      : environment?.endpointKind === 'local-home'
        ? 'home-derived-local-daemon'
        : 'external-endpoint',
    endpointKind: environment?.endpointKind ?? 'local-home',
    environmentId: assignment.environmentId,
    handoffKind: assignment.handoffKind,
    handoffState: 'instruction-only',
    paseoHome: '$HOME/.paseo',
    providerProfileId: assignment.providerProfileId,
    providerReadinessEffect: 'non-blocking-warning',
    providerReadinessPolicy: 'paseo-provider-json-v1',
    ...(assignment.status === 'needs_attention' ? { providerWarning: 'AIWORKER_PROVIDER_WARNING: provider needs admin attention before employee use.' } : {}),
    soulReleaseRef: fixtureSoulReleaseRef(assignment.soulReleaseId),
    status: assignment.status === 'needs_attention' ? 'failed' : 'applied',
    targetRef: assignment.environmentId,
    workspaceName,
    workspacePathPolicy: 'home-derived',
    workspaceRef: assignment.workspaceRef,
  }
}

function fixtureSoulReleaseRef(id: string): string {
  const release = fixtureSoulReleases.find(item => item.id === id)
  return release ? `${release.id}@${release.version}` : id
}

function mapFixtureSoulRelease(release: SoulReleaseSummary): SoulRelease {
  return {
    id: release.id,
    displayName: release.displayName,
    files: fixtureProjectedFiles(release.fileCount),
    version: release.version,
  }
}

function fixtureProjectedFiles(fileCount: number): ProjectedFile[] {
  return Array.from({ length: fileCount }, (_, index) => ({
    relativePath: `fixture-file-${index + 1}.md`,
    content: `# Fixture file ${index + 1}\n`,
  }))
}

function buildMetrics(data: {
  assignments: AssignmentSummary[]
  approvals: ProvisioningApprovalSummary[]
  providerProfiles: ProviderProfileSummary[]
  soulReleases: SoulReleaseSummary[]
}): MetricSummary[] {
  return [
    {
      label: '就绪 assignments',
      value: String(data.assignments.filter(assignment => assignment.status === 'ready').length),
      helper: '只表示 workspace + handoff 已准备，不代表可观察 Paseo session。',
      tone: 'success',
      icon: CheckCircleIcon,
    },
    {
      label: '待处理事项',
      value: String(data.assignments.filter(assignment => assignment.status === 'needs_attention').length),
      helper: '需要管理员处理的 provisioning/handoff 元数据。',
      tone: 'warning',
      icon: WarningCircleIcon,
    },
    {
      label: '待审批',
      value: String(data.approvals.filter(approval => approval.status === 'pending').length),
      helper: '审批仅覆盖 AIWorker provisioning/receipt/handoff 元数据。',
      tone: 'warning',
      icon: ClockClockwiseIcon,
    },
    {
      label: 'Soul releases',
      value: String(data.soulReleases.filter(release => release.status === 'published').length),
      helper: '已发布的 Paseo workspace templates。',
      tone: 'info',
      icon: ArchiveIcon,
    },
    {
      label: 'Provider profiles',
      value: String(data.providerProfiles.length),
      helper: '仅保存 secret reference，不保存 literal key。',
      tone: 'secondary',
      icon: ShieldCheckIcon,
    },
  ]
}

function buildProvisioningApprovals(
  assignments: AssignmentSummary[],
  environments: PaseoEnvironmentSummary[],
  providerProfiles: ProviderProfileSummary[],
  soulReleases: SoulReleaseSummary[],
): ProvisioningApprovalSummary[] {
  return assignments.map((assignment) => {
    const environment = environments.find(item => item.id === assignment.environmentId)
    const provider = providerProfiles.find(item => item.id === assignment.providerProfileId)
    const soul = soulReleases.find(item => item.id === assignment.soulReleaseId)
    const status = approvalStatusForAssignment(assignment)

    return {
      id: `appr-${assignment.id}`,
      assignmentId: assignment.id,
      title: `${assignment.assignedEmail} · ${soul?.displayName ?? assignment.soulReleaseId}`,
      status,
      requestedBy: 'admin@example.com',
      reviewer: reviewerForApprovalStatus(status),
      submittedAt: assignment.updatedAt,
      ...(status !== 'pending' ? { decidedAt: assignment.updatedAt } : {}),
      riskSummary: approvalRiskSummary(assignment, environment, provider),
      previewCommand: buildPlanPreviewCommand(assignment, environment, provider, soul),
      controlApiState: 'not_implemented',
      checks: [
        {
          id: `${assignment.id}-scope`,
          label: 'Workspace scope',
          status: assignment.status === 'needs_attention' ? 'warning' : 'pass',
          detail: `仅审批 ${assignment.workspaceRef} 的 Soul projection、receipt 与 handoff 元数据。`,
        },
        {
          id: `${assignment.id}-provider`,
          label: 'Provider reference',
          status: provider?.status === 'needs_auth' ? 'blocked' : provider?.status === 'reference_only' ? 'warning' : 'pass',
          detail: provider ? `${provider.label} 使用 ${provider.secretRef}，不展示 literal secret。` : 'provider profile 待补齐。',
        },
        {
          id: `${assignment.id}-handoff`,
          label: 'Handoff boundary',
          status: assignment.handoffKind === 'pairing-offer' && assignment.status === 'needs_attention' ? 'warning' : 'pass',
          detail: 'Handoff 只展示 redacted instruction；真实 pairing link 由 Paseo CLI 输出后交给前端配对。',
        },
      ],
    }
  })
}

function buildProvisioningTraceEvents(
  assignments: AssignmentSummary[],
  approvals: ProvisioningApprovalSummary[],
): ProvisioningTraceEventSummary[] {
  return assignments.flatMap((assignment) => {
    const approval = approvals.find(item => item.assignmentId === assignment.id)
    const events: ProvisioningTraceEventSummary[] = [
      {
        id: `trace-${assignment.id}-request`,
        assignmentId: assignment.id,
        at: assignment.updatedAt,
        actor: approval?.requestedBy ?? 'admin@example.com',
        title: 'Assignment request captured',
        detail: `管理员为 ${assignment.assignedEmail} 准备 ${assignment.workspaceRef} 的 provisioning metadata。`,
        evidenceRef: `assignment:${assignment.id}`,
        tone: 'info',
      },
    ]

    if (approval) {
      events.push({
        id: `trace-${assignment.id}-approval`,
        assignmentId: assignment.id,
        at: approval.decidedAt ?? approval.submittedAt,
        actor: approval.reviewer,
        title: `Approval ${approval.status}`,
        detail: '审批范围限定为 AIWorker plan、Soul projection、receipt 与 handoff metadata。',
        evidenceRef: `approval:${approval.id}`,
        tone: approvalStatusMeta[approval.status].tone,
      })
    }

    events.push({
      id: `trace-${assignment.id}-receipt`,
      assignmentId: assignment.id,
      at: assignment.updatedAt,
      actor: 'aiworker control',
      title: 'Receipt linked',
      detail: `Redacted receipt ${assignment.receiptId} 记录 assignment 状态与 workspace path policy。`,
      evidenceRef: `receipt:${assignment.receiptId}`,
      tone: assignment.status === 'needs_attention' ? 'warning' : 'success',
    })

    for (const auditEvent of assignment.audit) {
      events.push({
        id: `trace-${assignment.id}-${auditEvent.id}`,
        assignmentId: assignment.id,
        at: auditEvent.at,
        actor: auditEvent.actor,
        title: auditEvent.action,
        detail: `审计目标 ${auditEvent.target}，只保留 AIWorker control-plane metadata。`,
        evidenceRef: `audit:${auditEvent.id}`,
        tone: auditEvent.tone,
      })
    }

    events.push({
      id: `trace-${assignment.id}-handoff`,
      assignmentId: assignment.id,
      at: assignment.updatedAt,
      actor: 'aiworker handoff',
      title: `${assignment.handoffKind} handoff`,
      detail: assignment.nextStep,
      evidenceRef: `handoff:${assignment.handoffKind}`,
      tone: statusMeta[assignment.status].tone,
    })

    return events
  })
}

function approvalStatusForAssignment(assignment: AssignmentSummary): ApprovalStatus {
  if (assignment.status === 'ready')
    return 'approved'
  if (assignment.status === 'needs_attention')
    return 'changes_requested'
  return 'pending'
}

function reviewerForApprovalStatus(status: ApprovalStatus): string {
  if (status === 'pending')
    return 'security-review@example.com'
  if (status === 'changes_requested')
    return 'ops-review@example.com'
  return 'approver@example.com'
}

function approvalRiskSummary(
  assignment: AssignmentSummary,
  environment?: PaseoEnvironmentSummary,
  provider?: ProviderProfileSummary,
): string {
  const providerLabel = provider ? `${provider.provider} provider reference` : 'missing provider reference'
  const target = environment?.targetRef ?? assignment.environmentId
  if (assignment.status === 'needs_attention')
    return `${target} 需要重新确认 handoff metadata；${providerLabel} 不包含 literal secret。`
  if (assignment.status === 'ready')
    return `${target} 已完成审批与 handoff；${providerLabel} 仅作为 secret reference 展示。`
  return `${target} 等待管理员批准后才能执行 apply；${providerLabel} 仅用于 readiness check。`
}

function buildPlanPreviewCommand(
  assignment: AssignmentSummary,
  environment?: PaseoEnvironmentSummary,
  provider?: ProviderProfileSummary,
  soul?: SoulReleaseSummary,
): string {
  return `aiworker plan \\\n  --user ${assignment.assignedEmail} \\\n  --target ${environment?.targetRef ?? assignment.environmentId} \\\n  --environment ${assignment.environmentId} \\\n  --provider ${provider?.id ?? assignment.providerProfileId} \\\n  --soul ${soul?.descriptorRef ?? assignment.soulReleaseId}`
}

function mapProviderProfile(profile: ProviderProfile): ProviderProfileSummary {
  if (profile.secretRef && !profile.secretRef.startsWith('secret://'))
    throw new Error(`provider profile ${profile.id} must use a secret reference`)

  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    secretRef: (profile.secretRef ?? `secret://providers/${profile.provider}/${profile.id}`) as SecretReference,
    paseoProviderId: profile.paseoProviderId,
    cliCommand: profile.cliCommand,
    status: profile.paseoProviderId ? 'reference_only' : 'ready',
  }
}

function mapSoulRelease(release: SoulRelease): SoulReleaseSummary {
  return {
    id: `${release.id}@${release.version}`,
    displayName: release.displayName,
    version: release.version,
    descriptorRef: release.descriptorRef ?? `${release.id}@${release.version}`,
    workspaceTemplateRoot: `workspace-template:${release.id}@${release.version}`,
    fileCount: release.files.length,
    updatedAt: 'from control-plane snapshot',
    status: 'published',
    summary: `${release.displayName} workspace template projected by AIWorker.`,
  }
}

function mapAssignment(
  assignment: WorkspaceAssignment,
  receipts: ProvisionReceipt[],
  auditEvents: AuditEventSummary[],
  environments: PaseoEnvironment[],
): AssignmentSummary {
  const matchingReceipt = receipts.find(receipt =>
    receipt.workspaceRef === assignment.workspaceRef
    && receipt.environmentId === assignment.environmentId
    && receipt.providerProfileId === assignment.providerProfileId,
  )
  const environment = environments.find(candidate => candidate.environmentId === assignment.environmentId)
  const assignmentAudit = auditEvents.filter(event => event.target === assignment.assignmentId || event.target === assignment.workspaceRef)
  const handoffKind = assignment.handoff?.kind ?? 'manual-path'

  return {
    id: assignment.assignmentId,
    assignedEmail: assignment.assignedEmail,
    team: teamLabelFromEmail(assignment.assignedEmail),
    status: assignment.status,
    environmentId: assignment.environmentId,
    soulReleaseId: assignment.soulReleaseRef,
    providerProfileId: assignment.providerProfileId,
    workspaceRef: assignment.workspaceRef,
    receiptId: matchingReceipt?.id ?? 'pending-receipt',
    handoffKind,
    handoffLabel: assignment.handoff
      ? handoffLabel(assignment.handoff.kind, assignment.handoff.daemonEndpoint, assignment.workspaceRef, environment?.paseoHome)
      : 'manual workspace path pending',
    updatedAt: formatAdminTimestamp(matchingReceipt?.at),
    nextStep: nextStepForAssignment(assignment.status),
    audit: assignmentAudit,
  }
}

function handoffLabel(kind: HandoffKind, _endpoint: string, workspaceRef: string, _paseoHome?: string): RedactedHandoffReference {
  if (kind === 'pairing-offer')
    return `pairing offer redacted for ${workspaceRef}`
  if (kind === 'manual-path')
    return `open workspace path ${workspaceRef}`
  return `run paseo daemon pair --home "$PASEO_HOME" from ${workspaceRef}; open the printed link in the Paseo frontend`
}

function nextStepForAssignment(status: AssignmentStatus): string {
  if (status === 'ready')
    return '员工可在 Paseo 客户端打开 workspace；AIWorker 不读取 session。'
  if (status === 'handoff_ready')
    return '交接 Paseo-native handoff；AIWorker 不代理 runtime。'
  if (status === 'workspace_projected')
    return '确认 handoff metadata；AIWorker 不读取 session。'
  if (status === 'needs_attention')
    return '处理 AIWorker provisioning metadata；AIWorker 不读取 session，也不要采集 Paseo 运行时日志。'
  return '等待下一步 AIWorker control-plane 操作；不触碰 Paseo session。'
}

function redactedEndpointReference(endpoint: string, endpointKind: PaseoEndpointKind): string {
  if (endpointKind === 'relay-offer')
    return REDACTED_PAIRING_ENDPOINT

  return endpoint.replace(/([?#&]offer=)[^&#]+/i, '$1redacted')
}

function assignmentTupleKey(environmentId: string, soulReleaseId: string, providerProfileId: string): string {
  return `${environmentId}\u0000${soulReleaseId}\u0000${providerProfileId}`
}

function assertTraceEvidenceRef(
  traceEvent: ProvisioningTraceEventSummary,
  assignment: AssignmentSummary,
  approvalsById: ReadonlyMap<string, ProvisioningApprovalSummary>,
) {
  const [prefix, value] = traceEvent.evidenceRef.split(':', 2)

  if (!prefix || !value || !traceEvidencePrefixes.includes(prefix as (typeof traceEvidencePrefixes)[number])) {
    throw new Error(`trace evidence ${traceEvent.id} must use an allowed control-plane evidence prefix`)
  }

  if (prefix === 'assignment' && value !== assignment.id) {
    throw new Error(`trace evidence ${traceEvent.id} must reference its assignment`)
  }

  if (prefix === 'approval') {
    const approval = approvalsById.get(value)
    if (!approval || approval.assignmentId !== assignment.id) {
      throw new Error(`trace evidence ${traceEvent.id} must reference an approval for its assignment`)
    }
  }

  if (prefix === 'receipt' && value !== assignment.receiptId) {
    throw new Error(`trace evidence ${traceEvent.id} must reference its assignment receipt`)
  }

  if (prefix === 'audit' && !assignment.audit.some(event => event.id === value)) {
    throw new Error(`trace evidence ${traceEvent.id} must reference an audit event attached to its assignment`)
  }

  if (prefix === 'handoff' && value !== assignment.handoffKind) {
    throw new Error(`trace evidence ${traceEvent.id} must reference its assignment handoff kind`)
  }
}

function formatAdminTimestamp(value?: string): string {
  if (!value)
    return 'pending'
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

function teamLabelFromEmail(email: string): string {
  return email.split('@')[1] ?? 'unassigned'
}

function toneForAuditAction(action: string): Tone {
  const normalized = action.toLowerCase()
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('expired'))
    return 'destructive'
  if (normalized.includes('ready') || normalized.includes('applied'))
    return 'success'
  return 'info'
}

export const fixtureAdminDataSource: AdminDataSource = {
  loadAdminConsoleData() {
    return mapControlPlaneSnapshotToAdminConsoleData(buildFixtureControlPlaneSnapshot())
  },
}

export function loadAdminConsoleData(
  source: AdminDataSource = fixtureAdminDataSource,
): AdminConsoleData {
  return assertRedactedAdminConsoleData(source.loadAdminConsoleData())
}

export const adminConsoleData = loadAdminConsoleData()

export const navigationItems = [
  { title: '总览', path: '/', icon: DesktopTowerIcon },
  { title: 'Assignments', path: '/assignments', icon: HandshakeIcon },
  { title: 'Provisioning', path: '/provisioning', icon: ClockClockwiseIcon },
  { title: 'Soul releases', path: '/souls', icon: ArchiveIcon },
  { title: 'Environments', path: '/environments', icon: ShieldCheckIcon },
  { title: 'Audit / Handoff', path: '/audit', icon: FileTextIcon },
] as const

export function getApprovalForAssignment(id: string, data: AdminConsoleData = adminConsoleData): ProvisioningApprovalSummary | undefined {
  return data.approvals.find(item => item.assignmentId === id)
}

export function getTraceEventsForAssignment(id: string, data: AdminConsoleData = adminConsoleData): ProvisioningTraceEventSummary[] {
  return data.traceEvents.filter(item => item.assignmentId === id)
}

export function getAssignmentForPlan(
  environmentId: string,
  soulReleaseId: string,
  providerProfileId: string,
  data: AdminConsoleData = adminConsoleData,
): AssignmentSummary | undefined {
  const matches = data.assignments.filter(assignment =>
    assignment.environmentId === environmentId
    && assignment.soulReleaseId === soulReleaseId
    && assignment.providerProfileId === providerProfileId,
  )

  if (matches.length > 1) {
    throw new Error(`assignment tuple must be unique: ${environmentId}/${soulReleaseId}/${providerProfileId}`)
  }

  return matches[0]
}

export function getProviderProfile(id: string, data: AdminConsoleData = adminConsoleData): ProviderProfileSummary {
  const profile = data.providerProfiles.find(item => item.id === id)
  if (!profile) {
    throw new Error(`unknown provider profile ${id}`)
  }

  return profile
}

export function getEnvironment(id: string, data: AdminConsoleData = adminConsoleData): PaseoEnvironmentSummary {
  const environment = data.environments.find(item => item.id === id)
  if (!environment) {
    throw new Error(`unknown Paseo environment ${id}`)
  }

  return environment
}

export function getSoulRelease(id: string, data: AdminConsoleData = adminConsoleData): SoulReleaseSummary {
  const release = data.soulReleases.find(item => item.id === id)
  if (!release) {
    throw new Error(`unknown Soul release ${id}`)
  }

  return release
}
