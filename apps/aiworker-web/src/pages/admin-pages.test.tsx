import type { ReactElement } from 'react'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'

import { AssignmentDetailContent } from '@/components/assignment-detail-sheet'
import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { AuditCard } from '@/components/audit/audit-card'
import { BoundaryAlert } from '@/components/boundary-alert'
import { adminConsoleData, navigationItems } from '@/lib/admin-data'
import { AssignmentsPage } from './assignments-page'
import { AuditPage } from './audit-page'
import { DashboardPage } from './dashboard-page'
import { EnvironmentsPage } from './environments-page'
import {
  ProvisioningPage,
  resolveAssignmentIdentityForTuple,
  resolveAssignmentSelectionState,
  resolvePreviewApprovalStatus,
} from './provisioning-page'
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

describe('admin console page composition', () => {
  test('renders every admin route with its core heading', () => {
    const pages: Array<[string, ReactElement, string]> = [
      ['dashboard', <DashboardPage />, '先处理这一件事'],
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

    const dashboard = renderPage(<DashboardPage />)
    expect(dashboard).toContain('先处理这一件事')
    expect(dashboard).toContain('处理 cara@example.com 的入口问题')
    expect(dashboard).toContain('接下来处理')
    expect(dashboard).toContain('按顺序处理，不需要先看日志或技术配置')
    expect(dashboard).toContain('页面说明')
    expect(dashboard).toContain('技术支持和系统状态')
    expect(dashboard).toContain('AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane')
    expect(dashboard).toContain('给技术支持查看启动变量')
    expect(dashboard).toContain('bun run dev')
    expect(dashboard).not.toContain('bun run dev:aiworker-web')
    expect(dashboard).toContain('本次使用')
    expect(dashboard).toContain('记住这台设备')
    expect(dashboard).toContain('口令只保存在当前浏览器')
    expect(dashboard).toContain('当前为演示模式')
    expect(dashboard).toContain('处理员工入口')
    expect(dashboard).not.toContain('最近操作记录')
    expect(dashboard).not.toContain('技术设置')
    expect(dashboard).not.toContain('已开通员工')
    expectInOrder(dashboard, [
      '先处理这一件事',
      '处理 cara@example.com 的入口问题',
      '接下来处理',
      '页面说明',
      '技术支持和系统状态',
      'AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane',
    ])

    const provisioning = renderPage(<ProvisioningPage />)
    expect(provisioning).toContain('处理员工开通')
    expect(provisioning).toContain('当前员工')
    expect(provisioning).toContain('选择员工')
    expect(provisioning).toContain('确认内容')
    expect(provisioning).toContain('管理员确认')
    expect(provisioning).toContain('开始开通')
    expect(provisioning).toContain('发送入口')
    expect(provisioning).toContain('操作记录')
    expect(provisioning).toContain('演示模式')
    expect(provisioning).toContain('预览确认')
    expect(provisioning).toContain('预览退回')
    expect(provisioning).toContain('后台 AI 账号需要授权')
    expect(provisioning).toContain('入口只在当前页面临时显示')
    expect(provisioning).toContain('不会保存')
    expect(provisioning).toContain('aiworker plan')
    expect(provisioning).not.toContain('apply --yes')
    expectInOrder(provisioning, ['选择员工', '确认内容', '管理员确认', '开始开通', '发送入口'])
    expectInOrder(provisioning, ['确认内容', '给技术支持查看开通配置'])
    expect(navigationItems.map(item => item.path)).not.toContain('/provisioning')
    expect(navigationItems.map(item => item.title)).not.toContain('开通向导')

    const audit = renderPage(<AuditPage />)
    expect(audit).toContain('处理记录：')
    expect(audit).toContain('开通记录')
  })

  test('provisioning approval controls stay preview-only and redacted', () => {
    const markup = renderPage(<ProvisioningPage />)

    expect(markup).toContain('演示模式')
    expect(markup).toContain('不会保存，也不会连接员工设备')
    expect(markup).not.toContain('/api/sessions/')
    expect(markup).not.toContain('engine_invocation')
    expect(markup).not.toContain('offer=')
    expect(markup).not.toContain('sk-')
  })

  test('approval preview decisions are scoped by assignment id', () => {
    expect(resolvePreviewApprovalStatus('asn-1', { 'asn-1': 'approved', 'asn-2': 'changes_requested' }, 'pending')).toBe('approved')
    expect(resolvePreviewApprovalStatus('asn-2', { 'asn-1': 'approved', 'asn-2': 'changes_requested' }, 'pending')).toBe('changes_requested')
    expect(resolvePreviewApprovalStatus('asn-3', { 'asn-1': 'approved', 'asn-2': 'changes_requested' }, 'pending')).toBe('pending')
  })

  test('assignment identity selection is the source of truth for provisioning tuple selectors', () => {
    for (const assignment of adminConsoleData.assignments) {
      expect(resolveAssignmentSelectionState(assignment.id)).toEqual({
        assignmentId: assignment.id,
        environmentId: assignment.environmentId,
        providerProfileId: assignment.providerProfileId,
        soulReleaseId: assignment.soulReleaseId,
      })
    }

    const aliceAssignment = adminConsoleData.assignments.find(assignment => assignment.id === 'asn-alice-freeform')!

    expect(resolveAssignmentSelectionState('missing-assignment')).toBeUndefined()
    expect(resolveAssignmentIdentityForTuple(
      aliceAssignment.environmentId,
      aliceAssignment.soulReleaseId,
      aliceAssignment.providerProfileId,
    )).toBe(aliceAssignment.id)
    expect(resolveAssignmentIdentityForTuple(
      aliceAssignment.environmentId,
      aliceAssignment.soulReleaseId,
      'claude-ops',
    )).toBe('')
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

  test('shared cards preserve the runtime boundary and assignment detail affordance', () => {
    expect(renderToStaticMarkup(<BoundaryAlert />)).toContain('员工使用入口在 Paseo')
    expect(renderToStaticMarkup(<AuditCard />)).toContain('最近操作记录')
    const assignmentTable = renderToStaticMarkup(<AssignmentTableCard title="测试列表" assignments={adminConsoleData.assignments} />)
    expect(assignmentTable).toContain('先看员工、下一步和状态')
    expect(assignmentTable).toContain('下一步')
    expect(assignmentTable).not.toContain('>Environment</')
  })
})
