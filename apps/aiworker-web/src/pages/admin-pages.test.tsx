import type { ReactElement } from 'react'
import type { AdminConsoleData } from '@/lib/admin-data'
import type { AdminBootstrapStatus } from '@/lib/admin-remediation'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'

import { AssignmentDetailContent } from '@/components/assignment-detail-sheet'
import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { AuditCard } from '@/components/audit/audit-card'
import { BoundaryAlert } from '@/components/boundary-alert'
import { adminConsoleData, navigationItems } from '@/lib/admin-data'
import { AdminDataContext } from '@/lib/admin-data-context'
import { AssignmentsPage } from './assignments-page'
import { AuditPage } from './audit-page'
import { DashboardPage } from './dashboard-page'
import { EnvironmentsPage } from './environments-page'
import { ProvisioningPage } from './provisioning-page'
import { SoulsPage } from './souls-page'

function expectInOrder(markup: string, labels: string[]) {
  let cursor = -1
  for (const label of labels) {
    const index = markup.indexOf(label, cursor + 1)
    expect(index, label).toBeGreaterThan(cursor)
    cursor = index
  }
}

function renderPage(page: ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>)
}

function renderPageWithData(page: ReactElement, data: AdminConsoleData) {
  const bootstrap = {
    adminTokenRequired: false,
    auth: { authenticated: true, loginRequired: false, loginUrl: '/login', logoutUrl: '/logout', mode: 'local' },
    controlPlaneDirConfigured: true,
    host: '127.0.0.1',
    remoteAccessEnabled: false,
    source: 'control-plane',
  } as AdminBootstrapStatus
  const value = {
    bootstrap,
    async createMetadata<T>() {
      return undefined as T
    },
    data,
    async decideApproval() {},
    isLive: true,
    loadError: null,
    async loadSoulCatalog() {
      return []
    },
    async pairAssignment() {
      return undefined
    },
    async provisionAssignment() {
      return undefined
    },
    async reload() {},
  }
  return renderToStaticMarkup(
    <AdminDataContext.Provider value={value}>
      <MemoryRouter>{page}</MemoryRouter>
    </AdminDataContext.Provider>,
  )
}

// Build live-shaped admin data whose first assignment references a soul/environment/
// provider that no longer exist in the snapshot (the fixture→live switch window, or a
// dangling ref). The render path must degrade gracefully instead of throwing.
function adminDataWithDanglingRefs(): AdminConsoleData {
  const [first, ...rest] = adminConsoleData.assignments
  return {
    ...adminConsoleData,
    assignments: [
      {
        ...first,
        environmentId: 'env-missing',
        providerProfileId: 'provider-missing',
        soulReleaseId: 'soul-missing@9.9.9',
      },
      ...rest,
    ],
  }
}

// Build live admin data containing a single assignment whose soul/provider/environment
// reference real-but-not-in-the-bundled-fixture ids, each carrying a distinctive marker
// label. If a component looks these up against the module-level fixture instead of the
// live `data` passed through context, the markers won't resolve and the UI renders
// "缺失" — the data-pollution bug.
const liveSoulReleaseId = 'hr-manager@0.0.0'
const liveProviderProfileId = 'provider-live-marker'
const liveEnvironmentId = 'env-live-marker'
const liveSoulDisplayMarker = 'HR Live Marker'
const liveProviderLabelMarker = 'Live Provider Marker'
const liveEnvironmentOwnerMarker = 'live-owner@example.com'

// Audit-specific live markers — distinctly not present in the bundled fixture.
const liveAuditActor = 'live-admin@live-org.example.com'
const liveAuditAction = 'Live Audit Action Marker'
const liveAssignmentEmail = 'live-worker@live-org.example.com'

function adminDataWithLiveAuditRefs(): AdminConsoleData {
  const baseEvent = adminConsoleData.recentAuditEvents[0] ?? {
    id: 'evt-live-0',
    at: '2026-01-01',
    actor: liveAuditActor,
    action: liveAuditAction,
    target: 'ws-live-marker',
    tone: 'neutral' as const,
  }
  const baseAssignment = adminConsoleData.assignments[0]
  return {
    ...adminConsoleData,
    recentAuditEvents: [
      { ...baseEvent, id: 'evt-live-1', actor: liveAuditActor, action: liveAuditAction },
    ],
    assignments: [
      { ...baseAssignment, id: 'asn-live-1', assignedEmail: liveAssignmentEmail },
    ],
  }
}

function adminDataWithLiveOnlyRefs(): { data: AdminConsoleData, assignment: AdminConsoleData['assignments'][number] } {
  const baseSoul = adminConsoleData.soulReleases[0]
  const baseProvider = adminConsoleData.providerProfiles[0]
  const baseEnvironment = adminConsoleData.environments[0]
  const baseAssignment = adminConsoleData.assignments[0]

  const assignment = {
    ...baseAssignment,
    soulReleaseId: liveSoulReleaseId,
    providerProfileId: liveProviderProfileId,
    environmentId: liveEnvironmentId,
  }

  const data: AdminConsoleData = {
    ...adminConsoleData,
    soulReleases: [{ ...baseSoul, id: liveSoulReleaseId, displayName: liveSoulDisplayMarker }],
    providerProfiles: [{ ...baseProvider, id: liveProviderProfileId, label: liveProviderLabelMarker }],
    environments: [{ ...baseEnvironment, id: liveEnvironmentId, ownerEmail: liveEnvironmentOwnerMarker }],
    assignments: [assignment],
  }

  return { data, assignment }
}

function renderPageAt(page: ReactElement, path: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
}

describe('admin console page composition', () => {
  test('renders every admin route with its core heading', () => {
    const pages: Array<[string, ReactElement, string]> = [
      ['dashboard', <DashboardPage />, '员工开通操作台'],
      ['assignments', <AssignmentsPage />, '员工开通记录'],
      ['provisioning', <ProvisioningPage />, '处理员工开通'],
      ['souls', <SoulsPage />, '可分配的 AI 能力'],
      ['environments', <EnvironmentsPage />, '员工设备和后台 AI 账号'],
      ['audit', <AuditPage />, '管理员操作记录'],
    ]

    for (const [name, page, heading] of pages) {
      const markup = renderPage(page)
      expect(markup, name).toContain(heading)
    }

    // 操作台（cockpit）= 新首页：焦点条 + 搜索 + fleet 表 + 保留的技术支持折叠块。
    const dashboard = renderPage(<DashboardPage />)
    expect(dashboard).toContain('员工开通操作台')
    expect(dashboard).toContain('需我处理')
    expect(dashboard).toContain('员工开通列表')
    // fleet 表列（Provider 已降级，不作列）。
    expect(dashboard).toContain('能力 Soul')
    expect(dashboard).toContain('目标机 Environment')
    expect(dashboard).not.toContain('后台账号 Provider') // Provider 不作主表列
    // 失败置顶 + 行内可见员工（cara needs_attention 应出现在表里）。
    expect(dashboard).toContain('cara@example.com')
    // 承重接线保留：技术支持块 / token 管理 / 启动变量。
    expect(dashboard).toContain('技术支持和系统状态')
    expect(dashboard).toContain('AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane')
    expect(dashboard).toContain('给技术支持查看启动变量')
    expect(dashboard).toContain('bun run dev')
    expect(dashboard).not.toContain('bun run dev:aiworker-web')
    expect(dashboard).toContain('本次使用')
    expect(dashboard).toContain('记住这台设备')
    expect(dashboard).toContain('口令只保存在当前浏览器')
    // 绝不声称 liveness：ready 文案不得出现“已接入/在线/live”。
    expect(dashboard).not.toContain('已接入')
    expect(dashboard).not.toContain('在线')
    expectInOrder(dashboard, [
      '员工开通操作台',
      '需我处理',
      '员工开通列表',
      '技术支持和系统状态',
      'AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane',
    ])

    // /provisioning 现为兼容深链页（动作已行内化），仍不在导航，不再有独立审批步骤。
    const provisioning = renderPage(<ProvisioningPage />)
    expect(provisioning).toContain('处理员工开通')
    expect(provisioning).toContain('回操作台')
    // 独立“审批”步骤已下线（折叠进开通动作）。
    expect(provisioning).not.toContain('预览确认')
    expect(provisioning).not.toContain('预览退回')
    // 不代理 runtime。
    expect(provisioning).not.toContain('/api/sessions/')
    expect(provisioning).not.toContain('engine_invocation')
    expect(navigationItems.map(item => item.path)).not.toContain('/provisioning')
    expect(navigationItems.map(item => item.path)).not.toContain('/assignments')
    expect(navigationItems.map(item => item.path)).toContain('/')
    expect(navigationItems.map(item => item.title)).not.toContain('开通向导')

    const audit = renderPage(<AuditPage />)
    expect(audit).toContain('处理记录：')
    expect(audit).toContain('开通记录')
  })

  test('provisioning and assignments pages survive assignments with dangling metadata refs', () => {
    const data = adminDataWithDanglingRefs()
    expect(() => renderPageWithData(<ProvisioningPage />, data)).not.toThrow()
    expect(() => renderPageWithData(<AssignmentsPage />, data)).not.toThrow()
  })

  test('assignment table card resolves soul and environment from live data, not the bundled fixture', () => {
    const { data } = adminDataWithLiveOnlyRefs()
    const markup = renderPageWithData(<AssignmentsPage />, data)

    expect(markup).toContain(liveSoulDisplayMarker)
    expect(markup).toContain(liveEnvironmentOwnerMarker)
    expect(markup).not.toContain('能力模板缺失')
    expect(markup).not.toContain('设备配置缺失')
  })

  test('assignment detail content resolves soul, provider, environment, approval, and trace from live data, not the bundled fixture', () => {
    const { data, assignment } = adminDataWithLiveOnlyRefs()
    const value = {
      bootstrap: {} as AdminBootstrapStatus,
      async createMetadata<T>() {
        return undefined as T
      },
      data,
      async decideApproval() {},
      isLive: true,
      loadError: null,
      async loadSoulCatalog() {
        return []
      },
      async pairAssignment() {
        return undefined
      },
      async provisionAssignment() {
        return undefined
      },
      async reload() {},
    }
    const markup = renderToStaticMarkup(
      <AdminDataContext.Provider value={value}>
        <AssignmentDetailContent assignment={assignment} />
      </AdminDataContext.Provider>,
    )

    expect(markup).toContain(liveSoulDisplayMarker)
    expect(markup).toContain(liveProviderLabelMarker)
    expect(markup).toContain(liveEnvironmentOwnerMarker)
    expect(markup).not.toContain('能力模板缺失')
    expect(markup).not.toContain('后台账号缺失')
    expect(markup).not.toContain('设备配置缺失')
  })

  test('provisioning compat page stays a read-only detail shell and preserves the runtime boundary', () => {
    // 动作已折叠进操作台行内；兼容页只读，无独立审批步骤、不代理 runtime。
    const markup = renderPageAt(<ProvisioningPage />, '/provisioning?assignment=asn-cara-acp')

    expect(markup).toContain('回操作台')
    expect(markup).not.toContain('预览确认')
    expect(markup).not.toContain('预览退回')
    expect(markup).not.toContain('/api/sessions/')
    expect(markup).not.toContain('engine_invocation')
    expect(markup).not.toContain('offer=')
    expect(markup).not.toContain('sk-')
  })

  test('provisioning compat page shows the requested assignment detail and guides back when absent', () => {
    const withParam = renderPageAt(<ProvisioningPage />, '/provisioning?assignment=asn-cara-acp')
    expect(withParam).toContain('cara@example.com')
    expect(withParam).not.toContain('alice@example.com')

    // 无参数：不渲染任何具体员工，引导回操作台干活。
    const withoutParam = renderPage(<ProvisioningPage />)
    expect(withoutParam).toContain('去操作台开通')
    expect(withoutParam).not.toContain('alice@example.com')
  })

  test('assignment detail sheet exposes approval and trace evidence without runtime data', () => {
    const markup = renderToStaticMarkup(
      <AssignmentDetailContent assignment={adminConsoleData.assignments[0]} />,
    )

    expect(markup).toContain('管理员确认')
    expect(markup).toContain('处理记录')
    expect(markup).toContain('当前为预览记录')
    expect(markup).toContain(`receipt:${adminConsoleData.assignments[0].receiptId}`)
    expect(markup).not.toContain('/api/sessions/')
    expect(markup).not.toContain('engine_invocation')
  })

  test('audit page and audit card resolve events and assignments from live data, not the bundled fixture', () => {
    const data = adminDataWithLiveAuditRefs()
    const markup = renderPageWithData(<AuditPage />, data)

    // AuditCard must show the live actor/action, not the fixture actor
    expect(markup).toContain(liveAuditActor)
    expect(markup).toContain(liveAuditAction)
    expect(markup).not.toContain('admin@example.com')

    // Entry status card must show the live assignment email, not fixture emails
    expect(markup).toContain(liveAssignmentEmail)
    expect(markup).not.toContain('alice@example.com')
    expect(markup).not.toContain('cara@example.com')
  })

  test('shared cards preserve the runtime boundary and assignment detail affordance', () => {
    expect(renderToStaticMarkup(<BoundaryAlert />)).toContain('员工使用入口在 Paseo')
    expect(renderToStaticMarkup(<AuditCard />)).toContain('最近操作记录')
    const assignmentTable = renderToStaticMarkup(<AssignmentTableCard title="测试列表" assignments={adminConsoleData.assignments} />)
    expect(assignmentTable).toContain('先看员工、下一步和状态')
    expect(assignmentTable).toContain('下一步')
    expect(assignmentTable).not.toContain('>Environment</')
  })

  test('assignments, audit, environments and souls pages show demo notice in fixture mode and hide it in live mode', () => {
    // fixture 模式（默认 context）下应显示演示横幅
    const fixturePages: Array<[string, ReactElement]> = [
      ['assignments', <AssignmentsPage />],
      ['audit', <AuditPage />],
      ['environments', <EnvironmentsPage />],
      ['souls', <SoulsPage />],
    ]
    for (const [name, page] of fixturePages) {
      const markup = renderPage(page)
      expect(markup, `${name} fixture: 应显示演示横幅`).toContain('当前为演示模式')
    }

    // live 模式（source='control-plane'）下不应显示演示横幅
    for (const [name, page] of fixturePages) {
      const markup = renderPageWithData(page, adminConsoleData)
      expect(markup, `${name} live: 不应显示演示横幅`).not.toContain('当前为演示模式')
    }
  })
})
