import type { Icon } from '@phosphor-icons/react'
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

export type AssignmentStatus
  = | 'draft'
    | 'provisioning'
    | 'workspace_projected'
    | 'handoff_ready'
    | 'ready'
    | 'needs_attention'
    | 'revoked'
    | 'archived'

export type ProviderKind = 'codex' | 'claude' | 'opencode' | 'acp'

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
  endpointKind: 'tcp' | 'unix' | 'windows-pipe' | 'relay-offer'
  isolation: 'os-user' | 'rootless-container' | 'vm'
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
  environments: PaseoEnvironmentSummary[]
  metrics: MetricSummary[]
  providerProfiles: ProviderProfileSummary[]
  recentAuditEvents: AuditEventSummary[]
  soulReleases: SoulReleaseSummary[]
}

export interface AdminDataSource {
  loadAdminConsoleData: () => AdminConsoleData
}

const SECRET_REFERENCE_PREFIX = 'secret://'
const forbiddenRuntimeDataFragments = [
  '/api/sessions/',
  'engine_invocation',
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

export function assertRedactedAdminConsoleData(data: AdminConsoleData): AdminConsoleData {
  for (const profile of data.providerProfiles) {
    if (!profile.secretRef.startsWith(SECRET_REFERENCE_PREFIX)) {
      throw new Error(`provider profile ${profile.id} must use a secret reference`)
    }

    assertNoRuntimeData(`provider:${profile.id}:secretRef`, profile.secretRef)
  }

  for (const environment of data.environments) {
    assertNoRuntimeData(`environment:${environment.id}:daemonEndpoint`, environment.daemonEndpoint)
    assertNoRuntimeData(`environment:${environment.id}:targetRef`, environment.targetRef)
  }

  for (const assignment of data.assignments) {
    assertNoRuntimeData(`assignment:${assignment.id}:workspaceRef`, assignment.workspaceRef)
    assertNoRuntimeData(`assignment:${assignment.id}:handoffLabel`, assignment.handoffLabel)
    assertNoRuntimeData(`assignment:${assignment.id}:nextStep`, assignment.nextStep)

    for (const event of assignment.audit) {
      assertNoRuntimeData(`assignment:${assignment.id}:audit:${event.id}:target`, event.target)
      assertNoRuntimeData(`assignment:${assignment.id}:audit:${event.id}:action`, event.action)
    }
  }

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
    paseoHome: '/home/alice/.paseo',
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
    paseoHome: '/home/cara/.paseo',
    daemonEndpoint: 'https://relay.paseo.example/#offer=redacted',
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
    workspaceRef: '/home/alice/workspaces/freeform',
    receiptId: 'rcpt-20260614-001',
    handoffKind: 'paseo-daemon',
    handoffLabel: 'paseo --host unix:/run/paseo/alice.sock open /home/alice/workspaces/freeform',
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
        target: '/home/alice/workspaces/freeform',
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
    workspaceRef: '/home/cara/workspaces/sales-enable',
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

function buildMetrics(data: {
  assignments: AssignmentSummary[]
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

export const fixtureAdminDataSource: AdminDataSource = {
  loadAdminConsoleData() {
    const recentAuditEvents = fixtureAssignments.flatMap(assignment => assignment.audit)

    return {
      assignments: fixtureAssignments,
      environments: fixtureEnvironments,
      metrics: buildMetrics({
        assignments: fixtureAssignments,
        providerProfiles: fixtureProviderProfiles,
        soulReleases: fixtureSoulReleases,
      }),
      providerProfiles: fixtureProviderProfiles,
      recentAuditEvents,
      soulReleases: fixtureSoulReleases,
    }
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

export function getProviderProfile(id: string): ProviderProfileSummary {
  const profile = adminConsoleData.providerProfiles.find(item => item.id === id)
  if (!profile) {
    throw new Error(`unknown provider profile ${id}`)
  }

  return profile
}

export function getEnvironment(id: string): PaseoEnvironmentSummary {
  const environment = adminConsoleData.environments.find(item => item.id === id)
  if (!environment) {
    throw new Error(`unknown Paseo environment ${id}`)
  }

  return environment
}

export function getSoulRelease(id: string): SoulReleaseSummary {
  const release = adminConsoleData.soulReleases.find(item => item.id === id)
  if (!release) {
    throw new Error(`unknown Soul release ${id}`)
  }

  return release
}
